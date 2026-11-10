// Read-only CET4 archive match audit. Never connects to Cloudflare or writes user data.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {compileDictionaryDraftIndex} from './build-global-dictionary-index.mjs';
import {buildGlobalDictionaryIndex,preflightNovelDictionaryMatches} from '../src/global-dictionary-matcher.js';
const str=x=>String(x??'').normalize('NFKC').trim();
const lemma=x=>str(x).toLowerCase();
const zh=x=>str(x).replace(/\s+/gu,'');
const cardMeaning=w=>zh(w?.meaningZh??w?.meaning_zh);
const cardPos=w=>lemma(w?.partOfSpeech??w?.part_of_speech).replace(/[.。]/gu,'');
const cards=d=>Array.isArray(d?.words)?d.words:d?.package?.words??[];
const chapters=d=>d?.chapters??d?.package?.chapters??[];
const book=d=>d?.book??d?.package?.book;
const states=['matched','dictionary_only','needs_review','missing'];
// Accept only an explicitly read-only, locally verified publisher export.
export function unpackAndVerifyCET4LiveBatch(bundle){
 if(bundle?.format!=='miaowu-cet4-published-batch-v1'||
   bundle.atomicSnapshot!==false||bundle.containsUserData!==false||
   !Array.isArray(bundle.books)||bundle.books.length<1||bundle.books.length>50||
   bundle.bookCount!==bundle.books.length)
  throw Error('INVALID_PRIVATE_CET4_EXPORT_FORMAT');
 const ids=new Set(),docs=[];
 for(const b of bundle.books){
  if(!b||typeof b.bookId!=='string'||!Number.isSafeInteger(b.version)||b.version<1||
    !/^[a-f0-9]{64}$/.test(b.sha256||'')||
    !Number.isSafeInteger(b.chapterCount)||b.chapterCount<1||
    b.package?.book?.id!==b.bookId||b.package?.book?.title!==b.title||
    b.package?.book?.category!=='cet4'||!Array.isArray(b.package.chapters)||
    b.package.chapters.length!==b.chapterCount||ids.has(b.bookId))
   throw Error('INVALID_PRIVATE_CET4_EXPORT_BOOK');
  ids.add(b.bookId);
  if(createHash('sha256').update(JSON.stringify(b.package)).digest('hex')!==b.sha256)
   throw Error('PRIVATE_CET4_EXPORT_CHECKSUM_MISMATCH');
  docs.push(b.package);
 }
 return docs;
}
export function auditCET4ArchivedBooks(documents,index,{catalog=null}={}){
 if(!Array.isArray(documents)||!documents.length)throw Error('EMPTY_ARCHIVED_CET4_BATCH');
 const bookIds=new Set(), seenHeads=new Map(), report=[];
 const catalogIds=catalog==null?null:new Set((Array.isArray(catalog)?catalog:catalog?.books??[]).map(x=>x.id));
 for(const d of documents){
  const meta=book(d);
  if(meta?.category!=='cet4'||!str(meta?.id)||!Array.isArray(chapters(d)))
   throw Error('NOT_A_CET4_ARCHIVED_BOOK');
  if(bookIds.has(meta.id))throw Error('DUPLICATE_ARCHIVED_BOOK_ID');
  bookIds.add(meta.id);
  const wordCards=cards(d), byId=new Map();
  for(const w of wordCards){
   if(!w||!str(w.id)||!lemma(w.headword)||byId.has(w.id))
    throw Error('INVALID_OR_DUPLICATE_ARCHIVED_WORDCARD');
   byId.set(w.id,w);
  }
  let paragraphs=0,emptyParagraphs=0;
  const used=new Set(),missingRefs=new Set(),glossMismatch=new Set();
  for(const ch of chapters(d))for(const p of ch.paragraphs??[]){
   paragraphs++;
   let targets=0;
   for(const s of p.segments??[]){
    if(typeof s?.wordId!=='string')continue;
    targets++;
    used.add(s.wordId);
    const w=byId.get(s.wordId);
    if(!w){missingRefs.add(s.wordId);continue;}
    if(zh(s.gloss)!==cardMeaning(w))glossMismatch.add(s.wordId);
    const head=lemma(w.headword);
    if(!seenHeads.has(head))seenHeads.set(head,new Map());
    if(!seenHeads.get(head).has(meta.id))seenHeads.get(head).set(meta.id,new Set());
    seenHeads.get(head).get(meta.id).add(cardPos(w)+'|'+cardMeaning(w));
   }
   if(!targets)emptyParagraphs++;
  }
  const lookup=preflightNovelDictionaryMatches(d,index);
  report.push({
   id:meta.id,title:meta.title??null,
   public_catalog_id_found:catalogIds==null?null:catalogIds.has(meta.id),
   chapters:chapters(d).length,paragraphs,paragraphs_without_targets:emptyParagraphs,
   annotated_occurrences:lookup.summary.target_occurrences,
   referenced_headwords:lookup.summary.target_unique,
   packaged_wordcards:wordCards.length,used_wordcards:used.size,
   unused_wordcards:wordCards.filter(w=>!used.has(w.id)).length,
   missing_card_references:missingRefs.size,gloss_mismatched_cards:glossMismatch.size,
   cards_missing_ipa:wordCards.filter(w=>![w.phoneticUs,w.phonetic_us,w.phoneticUk,w.phonetic_uk].some(x=>str(x))).length,
   cards_missing_example:wordCards.filter(w=>!str(w.exampleEn??w.example_en)||!str(w.exampleZh??w.example_zh)).length,
   matches:lookup.summary.target,
   exceptions:lookup.targets.filter(x=>['needs_review','missing'].includes(x.status))
    .map(x=>({word:x.normalized_surface,status:x.status,reason:x.reason}))
  });
 }
 const overlaps=[...seenHeads].filter(([,entries])=>entries.size>1).map(([head,entries])=>{
  const senses=[...new Set([...entries.values()].flatMap(s=>[...s]))].sort();
  return {word:head,books:[...entries.keys()].sort(),sense_candidates:senses,
   exact_sense_key_shared:senses.length===1};
 }).sort((a,b)=>a.word.localeCompare(b.word,'en'));
 return {
  status:'ARCHIVED_JSON_ONLY_NO_LIVE_D1_MATCH',
  book_count:report.length,unique_referenced_headwords:seenHeads.size,
  repeated_headwords:overlaps.length,
  identical_sense_key_candidate_count:overlaps.filter(x=>x.exact_sense_key_shared).length,
  sense_difference_review:overlaps.filter(x=>!x.exact_sense_key_shared),
  target_occurrences:report.reduce((n,x)=>n+x.annotated_occurrences,0),
  per_book_match_counts:Object.fromEntries(states.map(k=>[k,report.reduce((n,x)=>n+(x.matches[k]||0),0)])),
  source_headword_count:index.headwordCount,
  books:report,release_blocked:true,
  modified_user_data:false,modified_entitlements:false,modified_books:false,
  accessed_cloudflare:false,approved_lessons_asserted:0,
  warning:'Archived manuscript candidate matching against unreviewed dictionary source. Not live 23-book verification and not teaching-card approval.'
 };
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const args=process.argv.slice(2);
 const option=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
 const source=option('--lexicon'),folder=option('--novels'),batchFile=option('--batch'),catalogPath=option('--catalog'),out=option('--out');
 if(!source||Boolean(folder)===Boolean(batchFile)){console.error('Usage: node scripts/audit-cet4-published-archive-offline.mjs --lexicon owner.csv (--novels private-json-dir | --batch private-live-export.json) [--out private-report.json]');process.exitCode=2;}
 else try{
  const compiled=compileDictionaryDraftIndex(readFileSync(resolve(source),'utf8'));
  const index=buildGlobalDictionaryIndex({entries:compiled.entries,forms:compiled.forms});
  const docs=batchFile?unpackAndVerifyCET4LiveBatch(JSON.parse(readFileSync(resolve(batchFile),'utf8'))):
   readdirSync(resolve(folder)).filter(x=>x.toLowerCase().endsWith('.json')).sort()
    .map(name=>JSON.parse(readFileSync(join(resolve(folder),name),'utf8')));
  const catalog=catalogPath?JSON.parse(readFileSync(resolve(catalogPath),'utf8')):null;
  const result=auditCET4ArchivedBooks(docs,index,{catalog});
  result.source_kind=batchFile?'publisher-exported-read-only-manuscripts':'historical-candidate-archives';
  result.live_export_sha_verified=Boolean(batchFile);
  result.production_d1_realtime_verified=false;
  const summary=JSON.stringify(result,null,2)+'\n';
  if(out)writeFileSync(resolve(out),summary,'utf8');
  else process.stdout.write(summary);
 }catch(e){console.error('ARCHIVE_MATCH_AUDIT_BLOCKED:',e?.message||e);process.exitCode=1;}
}
