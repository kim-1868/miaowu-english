// Reuse the owner's private historical, already-published cards to create
// reviewable multi-sense lesson DRAFTS. No automatic teaching signoff or import.
import {createHash} from 'node:crypto';
import {prepareHistoricalSenseReview} from '../src/global-dictionary-historical-sense-worklist.js';
const normalize=x=>String(x??'').normalize('NFKC').trim().toLowerCase();
const normZh=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const pos=x=>normalize(x).replace(/[.。]/gu,'');
const unique=xs=>[...new Set(xs.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'en'));
const idFor=headword=>'gdict_'+createHash('sha256').update(headword).digest('hex').slice(0,24);
export function buildPrivateHistoricalLessonDrafts(snapshot){
 const reviewed=prepareHistoricalSenseReview(snapshot);
 const groups=new Map(),keys=new Set();
 const snapshotBookIds=new Set(snapshot.books.map(x=>x.book_id));
 for(const w of snapshot.cards){
  const headword=normalize(w.headword),senseKey=[headword,pos(w.part_of_speech),normZh(w.meaning_zh)].join('\0');
  if(!groups.has(headword))groups.set(headword,new Map());
  const senses=groups.get(headword);
  if(!senses.has(senseKey))senses.set(senseKey,{
   part_of_speech:String(w.part_of_speech),meaning_zh:normZh(w.meaning_zh),
   old_word_ids:[],examples:[],uk_ipa:new Set(),us_ipa:new Set(),book_ids:new Set(),
   old_card_qa_flags:[],candidate_sense_hash:createHash('sha256').update(senseKey).digest('hex'),
   approved_sense_id:null,reviewed:false
  });
  const s=senses.get(senseKey);
  s.old_word_ids.push(w.word_id);
  if(w.phonetic_uk)s.uk_ipa.add(w.phonetic_uk.trim());
  if(w.phonetic_us)s.us_ipa.add(w.phonetic_us.trim());
  if(w.example_en&&w.example_zh)s.examples.push({
   origin_word_id:w.word_id,example_en:w.example_en,example_zh:w.example_zh
  });
  else s.old_card_qa_flags.push({id:w.word_id,reason:'BILINGUAL_EXAMPLE_MISSING'});
  for(const c of w.contexts||[])if(snapshotBookIds.has(c.book_id))s.book_ids.add(c.book_id);
 }
 const lessons=[],summary={source_card_ids:snapshot.cards.length,headwords:0,
  sense_candidates:0,legacy_word_ids:0,ipa_conflicting_senses:0,
  incomplete_example_senses:0,lesson_drafts_with_multiple_senses:0,
  can_import_as_reviewed_lessons:false,source_license_approved:false};
 for(const [headword,senses] of groups){
  const senseRows=[...senses.values()].map(s=>{
   const ipaUk=unique([...s.uk_ipa]),ipaUs=unique([...s.us_ipa]);
   if(ipaUk.length>1||ipaUs.length>1)summary.ipa_conflicting_senses++;
   if(!s.examples.length||s.old_card_qa_flags.length)summary.incomplete_example_senses++;
   return {part_of_speech:s.part_of_speech,meaning_zh:s.meaning_zh,
    old_word_ids:s.old_word_ids.sort(),book_ids:unique([...s.book_ids]),
    phonetic_uk_candidates:ipaUk,phonetic_us_candidates:ipaUs,
    source_examples:s.examples,
    qa_flags:s.old_card_qa_flags,
    candidate_sense_hash:s.candidate_sense_hash,
    approved_sense_id:null,reviewed:false,lesson_approved:false};
  }).sort((a,b)=>b.old_word_ids.length-a.old_word_ids.length||
   a.meaning_zh.localeCompare(b.meaning_zh,'zh'));
  const uk=unique(senseRows.flatMap(s=>s.phonetic_uk_candidates));
  const us=unique(senseRows.flatMap(s=>s.phonetic_us_candidates));
  const single=senseRows.length===1;
  if(!single)summary.lesson_drafts_with_multiple_senses++;
  const lesson={entry_id:idFor(headword),headword,
   phonetic_uk:uk.length===1?uk[0]:null,phonetic_us:us.length===1?us[0]:null,
   uk_ipa_variants:uk,us_ipa_variants:us,senses:senseRows,
   legacy_card_count:senseRows.reduce((n,x)=>n+x.old_word_ids.length,0),
   lesson_status:'DRAFT_FROM_OWNER_HISTORICAL_CARDS_NOT_APPROVED',
   reviewed_by:null,reviewed_at:null,source_license_approved:false,
   lesson_approved:false,teaching_ready:false,
   stable_sense_ids_approved:false,auto_publish_allowed:false};
  lessons.push(lesson);
  summary.sense_candidates+=senseRows.length;
  summary.legacy_word_ids+=lesson.legacy_card_count;
 }
 summary.headwords=lessons.length;
 if(summary.legacy_word_ids!==reviewed.summary.old_word_id_count||
   summary.sense_candidates!==reviewed.summary.sense_text_candidate_groups||
   summary.headwords!==reviewed.summary.headwords)
  throw Error('HISTORICAL_LESSON_GROUPING_INVARIANT_FAILED');
 lessons.sort((a,b)=>b.legacy_card_count-a.legacy_card_count||
  a.headword.localeCompare(b.headword,'en'));
 return {status:'PRIVATE_DRAFT_LESSONS_FROM_HISTORICAL_CARDS',
  summary,lessons,
  historical_source_created_at:snapshot.created_utc??null,
  cloudflare_written:false,old_word_ids_replaced:false,
  customer_data_read:false};
}

// Local-only CLI: private teaching drafts must never enter public GitHub.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const args=process.argv.slice(2),p=k=>{
  const i=args.indexOf(k);return i<0?null:args[i+1];
 },input=p('--snapshot'),output=p('--out');
 if(!input||!output){
  console.error('Usage: node scripts/build-private-historical-lesson-drafts.mjs --snapshot /private/p5.json --out /private/lessons.jsonl');
  process.exitCode=2;
 }else try{
  if(existsSync(resolve(output)))throw Error('PRIVATE_DRAFT_OVERWRITE_REJECTED');
  const data=buildPrivateHistoricalLessonDrafts(JSON.parse(readFileSync(resolve(input),'utf8')));
  writeFileSync(resolve(output),data.lessons.map(x=>JSON.stringify(x)).join('\n')+'\n',
   {mode:0o600,flag:'wx'});
  console.log(JSON.stringify({status:data.status,summary:data.summary,
   local_private_file_written:true,public_repo_upload:false}));
 }catch(e){console.error('HISTORICAL_LESSON_BUILD_BLOCKED',e?.message||e);process.exitCode=1}
}
