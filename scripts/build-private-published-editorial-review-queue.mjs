// Private reviewer queue: real published-only wordcard candidates.
// Raw lexical data must be encrypted by runner BEFORE any upload; console is aggregate-only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const FIELDS=['book_id','category_id','old_word_id','headword','pos','gloss_zh',
 'phonetic_uk','phonetic_us','example_en','example_zh','occurrences'];
const asciiLower=x=>String(x??'').replace(/[A-Z]/g,s=>s.toLowerCase());
const text=x=>String(x??'').trim();
const head=x=>asciiLower(text(x));
const pos=x=>asciiLower(text(x));
const senseKey=r=>JSON.stringify([head(r.headword),pos(r.pos),text(r.gloss_zh)]);
const noEmpty=x=>typeof x==='string'&&x.length>0;
const MAX_ROWS=15000;
function decode(data){
 let raw;try{raw=typeof data==='string'?JSON.parse(data):data}
 catch{throw Error('EDITOR_QUEUE_INVALID_JSON')}
 const packets=Array.isArray(raw)?raw:[raw];
 assert.ok(packets.length&&packets.every(p=>p?.success!==false),
  'EDITOR_QUEUE_QUERY_FAILED');
 return packets.flatMap(p=>p?.results??p?.result?.results??[]);
}
export function buildPublishedPrivateEditorialQueue(payload,{expected={books:32,anchors:8444,oldCards:3433,headwords:1585,textualGroups:1981,duplicateGroups:532,excessDuplicateIds:1452}}={}){
 const rows=decode(payload);
 assert.ok(rows.length>0&&rows.length<=MAX_ROWS,'EDITOR_QUEUE_INVALID_ROW_COUNT');
 const unique=new Set(),books=new Set(),wordIds=new Set(),headwordIds=new Set();
 const groups=new Map(),occurrencesByHeadword=new Map();
 let anchorOccurrences=0,missingIpa=0,missingExamples=0,missingPOS=0,missingGloss=0;
 const originalByWordId=new Map();
 for(const row of rows){
  assert.ok(row&&typeof row==='object'&&!Array.isArray(row)&&
   FIELDS.every(f=>Object.hasOwn(row,f))&&Object.keys(row).every(f=>FIELDS.includes(f)),
   'EDITOR_QUEUE_UNEXPECTED_SCHEMA_OR_SENSITIVE_FIELDS');
  for(const f of ['book_id','category_id','old_word_id','headword'])
   assert.ok(noEmpty(row[f])&&row[f].length<=300,'EDITOR_QUEUE_INVALID_IDENTITY');
  for(const f of ['pos','gloss_zh','phonetic_uk','phonetic_us','example_en','example_zh'])
   assert.ok(row[f]===null||typeof row[f]==='string','EDITOR_QUEUE_INVALID_LEXICAL_DATA');
  assert.ok(Number.isSafeInteger(row.occurrences)&&row.occurrences>0,
   'EDITOR_QUEUE_INVALID_OCCURRENCES');
  const bookCardKey=JSON.stringify([row.book_id,row.old_word_id]);
  assert.ok(!unique.has(bookCardKey),'EDITOR_QUEUE_DUPLICATE_BOOK_CARD');
  unique.add(bookCardKey);
  const prior=originalByWordId.get(row.old_word_id);
  if(prior)assert.deepEqual(
   [prior.headword,prior.pos,prior.gloss_zh,prior.phonetic_uk,prior.phonetic_us,
    prior.example_en,prior.example_zh],
   [row.headword,row.pos,row.gloss_zh,row.phonetic_uk,row.phonetic_us,
    row.example_en,row.example_zh],
   'EDITOR_QUEUE_OLD_CARD_INCONSISTENT_BETWEEN_BOOKS');
  else originalByWordId.set(row.old_word_id,row);
  books.add(row.book_id);wordIds.add(row.old_word_id);headwordIds.add(head(row.headword));
  anchorOccurrences+=row.occurrences;
  const key=senseKey(row),g=groups.get(key)??{
    headword:row.headword,pos:row.pos,meaning_zh:row.gloss_zh,
    bookIds:new Set(),wordIds:new Set(),cardRows:[],occurrences:0,
    missing_ipa:false,missing_examples:false};
  g.bookIds.add(row.book_id);g.wordIds.add(row.old_word_id);g.occurrences+=row.occurrences;
  g.cardRows.push(row);
  const badIpa=!text(row.phonetic_uk)||!text(row.phonetic_us);
  const badEx=!text(row.example_en)||!text(row.example_zh);
  g.missing_ipa||=badIpa;g.missing_examples||=badEx;
  groups.set(key,g);
  if(badIpa)missingIpa++;
  if(badEx)missingExamples++;
  if(!text(row.pos))missingPOS++;
  if(!text(row.gloss_zh))missingGloss++;
  const h=head(row.headword),v=occurrencesByHeadword.get(h)??{books:new Set(),wordIds:new Set()};
  v.books.add(row.book_id);v.wordIds.add(row.old_word_id);occurrencesByHeadword.set(h,v);
 }
 // Compare source counts to the latest protected production SELECT; stop
 // completely on snapshot drift instead of mixing different book editions.
 assert.equal(books.size,expected.books,'EDITOR_QUEUE_PUBLISHED_SCOPE_DRIFT');
 assert.equal(anchorOccurrences,expected.anchors,'EDITOR_QUEUE_ANCHOR_SNAPSHOT_DRIFT');
 assert.equal(wordIds.size,expected.oldCards,'EDITOR_QUEUE_OLD_CARD_SNAPSHOT_DRIFT');
 assert.equal(headwordIds.size,expected.headwords,'EDITOR_QUEUE_HEADWORD_SNAPSHOT_DRIFT');
 const groupRecords=[...groups.values()].map(g=>{
  const duplicate=g.wordIds.size>1;
  const ambiguous=!text(g.pos)||!text(g.meaning_zh);
  const riskFlags=[
   ...(g.missing_ipa?['IPA_MISSING']:[]),
   ...(g.missing_examples?['BILINGUAL_EXAMPLE_MISSING']:[]),
   ...(ambiguous?['SENSE_TEXT_INCOMPLETE']:[]),
   ...(duplicate?['OLD_CARD_IDS_DUPLICATED_FOR_TEXTUAL_SENSE']:[]),
   ...(g.bookIds.size>1?['TEXTUAL_SENSE_CROSS_BOOKS']:[])
  ];
  const score=Number(duplicate)*300+Number(g.bookIds.size>1)*180+
   Math.min(100,g.bookIds.size)*20+Math.min(120,g.occurrences)+
   Number(g.missing_ipa||g.missing_examples)*200;
  return {headword:g.headword,pos:g.pos,meaning_zh:g.meaning_zh,
   legacy_word_ids:[...g.wordIds].sort(),book_ids:[...g.bookIds].sort(),
   occurrences:g.occurrences,priority_score:score,risk_flags:riskFlags,
   card_evidence:g.cardRows.map(r=>({
    book_id:r.book_id,old_word_id:r.old_word_id,
    phonetic_uk:r.phonetic_uk,phonetic_us:r.phonetic_us,
    example_en:r.example_en,example_zh:r.example_zh,
    occurrences:r.occurrences})),
   editor_decision:'HOLD',approved_sense_id:null,
   commercial_license_approved:false,translation_verified:false,
   pronunciation_verified:false,auto_merge_allowed:false,
   production_writes_allowed:false};
 }).sort((a,b)=>b.priority_score-a.priority_score||
  b.occurrences-a.occurrences||head(a.headword).localeCompare(head(b.headword),'en'));
 const duplicates=groupRecords.filter(x=>x.legacy_word_ids.length>1);
 const repeatedHeadwords=[...occurrencesByHeadword.values()].filter(x=>x.books.size>1);
 const counts={
  published_books:books.size,published_anchor_occurrences:anchorOccurrences,
  distinct_old_word_ids:wordIds.size,distinct_headwords:headwordIds.size,
  textual_sense_candidates:groupRecords.length,
  repeated_headwords_across_books:repeatedHeadwords.length,
  duplicate_textual_sense_groups:duplicates.length,
  duplicate_excess_old_ids:duplicates.reduce((a,g)=>a+g.legacy_word_ids.length-1,0),
  missing_ipa_book_card_rows:missingIpa,
  missing_example_book_card_rows:missingExamples,
  missing_pos_book_card_rows:missingPOS,missing_gloss_book_card_rows:missingGloss
 };
 assert.equal(counts.textual_sense_candidates,expected.textualGroups,'EDITOR_QUEUE_TEXTUAL_SENSE_DRIFT');
 assert.equal(counts.duplicate_textual_sense_groups,expected.duplicateGroups,'EDITOR_QUEUE_DUPLICATE_GROUP_DRIFT');
 assert.equal(counts.duplicate_excess_old_ids,expected.excessDuplicateIds,'EDITOR_QUEUE_DUPLICATE_ID_DRIFT');
 return {
  status:'PRIVATE_PUBLISHED_EDITORIAL_CANDIDATES_UNAPPROVED',
  source:'production published 32 novels only',
  created_approvals:0,production_writes:0,
  all_records_private:true,counts,
  duplicate_review_queue:duplicates,
  other_candidate_groups:groupRecords.filter(x=>x.legacy_word_ids.length<=1),
  caution:'Identical spelling, part of speech and Chinese gloss are textual candidates, never automatic sense-level approvals.'
 };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,4,'EDITOR_QUEUE_PRIVATE_INPUT_OUTPUT_REQUIRED');
  const [source,output]=process.argv.slice(2);
  const result=buildPublishedPrivateEditorialQueue(readFileSync(source,'utf8'));
  writeFileSync(output,JSON.stringify(result),{mode:0o600,flag:'wx'});
  console.log('EDITOR_QUEUE_PRIVATE_PUBLISHED_ONLY_VERIFIED');
  console.log('EDITOR_QUEUE_AGGREGATE_COUNTS='+JSON.stringify(result.counts));
  console.log('EDITOR_QUEUE_OUTPUT_ENCRYPT_BEFORE_UPLOAD__ZERO_APPROVED_SENSES');
 }catch(e){
  // Strict error strings are fixed and contain no sensitive source fields.
  console.error('EDITOR_QUEUE_REVIEW_BLOCKED',e.message);
  process.exitCode=1;
 }
}
