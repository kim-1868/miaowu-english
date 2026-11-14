// Safe offline audit for owner-controlled historical published-wordcard snapshots.
// Never uploads story contexts, account data, or old wordcards to GitHub.
// This groups textually identical senses as *review* candidates, never auto-merges.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const norm=s=>String(s??'').normalize('NFKC').trim().replaceAll('’',"'").toLowerCase();
const cn=s=>String(s??'').normalize('NFKC').replace(/\s+/gu,'').trim();
export function auditLegacyPublishedCardSnapshot(snapshot){
 if(!snapshot||snapshot.audit!=='wordletter-p5-content-review-offline'||
   !Array.isArray(snapshot.cards)||!Array.isArray(snapshot.books)||
   snapshot.cards.length===0)throw Error('INVALID_PRIVATE_PUBLISHED_CARD_SNAPSHOT');
 const uniqueIds=new Set(),groups=new Map(),headwords=new Map();
 let gapIPA=0,gapExample=0,cardContextCount=0,unclearContextReferences=0;
 const validBooks=new Set(snapshot.books.map(x=>x.book_id));
 for(const w of snapshot.cards){
  if(!w||typeof w.word_id!=='string'||!w.word_id||
   uniqueIds.has(w.word_id)||!norm(w.headword)||!cn(w.meaning_zh)||
   !norm(w.part_of_speech))throw Error('INVALID_LEGACY_CARD_ID_OR_IDENTITY');
  uniqueIds.add(w.word_id);
  const headword=norm(w.headword),pos=norm(w.part_of_speech),meaning=cn(w.meaning_zh);
  const senseKey=headword+'|'+pos+'|'+meaning;
  if(!groups.has(senseKey))groups.set(senseKey,[]);
  const ctx=Array.isArray(w.contexts)?w.contexts:[];
  const books=new Set();
  for(const c of ctx){
   if(typeof c?.book_id==='string'){
    books.add(c.book_id);
    if(!validBooks.has(c.book_id))unclearContextReferences++;
   }
  }
  cardContextCount+=ctx.length;
  groups.get(senseKey).push({legacy_word_id:w.word_id,books:[...books]});
  if(!headwords.has(headword))headwords.set(headword,new Set());
  headwords.get(headword).add(senseKey);
  if(!w.phonetic_uk||!w.phonetic_us)gapIPA++;
  if(!w.example_en||!w.example_zh)gapExample++;
 }
 const repeated=[...groups].filter(([,items])=>items.length>1);
 const sameAcrossBooks=repeated.filter(([,items])=>{
  const across=new Set(items.flatMap(x=>x.books));
  return across.size>1;
 });
 const homograph=[...headwords].filter(([,s])=>s.size>1);
 const sum={
  status:'READ_ONLY_HISTORICAL_CARD_IDENTITY_QA_NOT_APPLIED',
  snapshot_created_at:snapshot.created_utc??null,
  scope:'owner-provided offline snapshot; NOT current production D1',
  published_books_in_snapshot:snapshot.books.length,
  card_rows:snapshot.cards.length,distinct_old_word_ids:uniqueIds.size,
  distinct_english_headwords:headwords.size,
  strictly_identical_text_sense_keys:groups.size,
  duplicate_text_sense_groups:repeated.length,
  extra_cards_with_duplicate_text_senses:repeated.reduce((n,[,items])=>n+items.length-1,0),
  repeated_text_senses_spanning_books:sameAcrossBooks.length,
  headwords_with_multiple_text_senses:homograph.length,
  cards_missing_ipa:gapIPA,cards_missing_bilingual_example:gapExample,
  context_rows:cardContextCount,
  unknown_book_context_references:unclearContextReferences,
  suggested_editorial_queue_size:repeated.length+homograph.length,
  store_sensitive_card_text:false,
  source_wordcards_modified:false,user_learning_rows_accessed:false,
  automatic_card_merge_allowed:false,approved_sense_ids_created:0,
  notes:[
   'Identical headword/POS/Chinese text is an editorial duplicate candidate, not proof of equivalent teaching contexts.',
   'Homographs and distinct Chinese senses may not have their mastery merged. Stable human-reviewed sense identity is required.',
   'No current-live coverage or active user study state is inferred from an older offline snapshot.'
  ]
 };
 return sum;
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const argv=process.argv.slice(2),f=k=>{const i=argv.indexOf(k);return i<0?null:argv[i+1]};
 const source=f('--snapshot'),out=f('--out');
 if(!source||!out){console.error('Usage: node scripts/audit-legacy-published-cards-offline.mjs --snapshot <private-cards.json> --out <private-aggregate-report.json>');process.exitCode=2;}
 else try{
  if(existsSync(resolve(out)))throw Error('REFUSE_TO_OVERWRITE_EXISTING_AUDIT');
  const audit=auditLegacyPublishedCardSnapshot(JSON.parse(readFileSync(resolve(source),'utf8')));
  writeFileSync(resolve(out),JSON.stringify(audit,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:audit.status,cards:audit.card_rows,bookCount:audit.published_books_in_snapshot,
   duplicateTextGroups:audit.duplicate_text_sense_groups,noMutation:true}));
 }catch(e){console.error('SAFE_SNAPSHOT_AUDIT_REJECTED',e.message);process.exitCode=1;}
}
