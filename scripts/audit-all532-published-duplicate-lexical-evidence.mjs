// Evaluate ALL 532 original encrypted published-book textual-sense candidates.
// Deterministic evidence-only checks; never impersonate an authenticated editor
// or assert semantic/commercial approval from legacy cards lacking story context.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const H=x=>createHash('sha256').update(x).digest('hex');
const N=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
const ZH=/[\u3400-\u9fff]/u;
const MAX=532;
const keys=['headword','pos','meaning_zh','legacy_word_ids','book_ids','occurrences',
 'card_evidence','editor_decision','approved_sense_id','auto_merge_allowed',
 'production_writes_allowed'];
const inflected=head=>{
 const out=new Set([head,head+'s',head+'es',head+'ed',head+'ing']);
 if(head.endsWith('e')){out.add(head+'d');out.add(head.slice(0,-1)+'ing')}
 if(head.endsWith('y')){out.add(head.slice(0,-1)+'ies');out.add(head.slice(0,-1)+'ied')}
 return out;
};
function checks(g,allGlosses){
 const issues=[],warnings=[];
 const add=(k,cond,arr=issues)=>{if(cond)arr.push(k)};
 const ev=g.card_evidence;
 const ipaUK=new Set(ev.map(x=>N(x.phonetic_uk)));
 const ipaUS=new Set(ev.map(x=>N(x.phonetic_us)));
 const enExamples=new Set(ev.map(x=>N(x.example_en)));
 const zhExamples=new Set(ev.map(x=>N(x.example_zh)));
 add('MISSING_ENGLISH_HEADWORD',!N(g.headword));
 add('MISSING_PART_OF_SPEECH',!N(g.pos));
 add('MISSING_CHINESE_SENSE',!N(g.meaning_zh));
 add('BAD_CHINESE_GLOSS_FORMAT',!ZH.test(g.meaning_zh??''),warnings);
 add('UK_IPA_MISSING',ipaUK.has(''));
 add('US_IPA_MISSING',ipaUS.has(''));
 add('ENGLISH_EXAMPLE_MISSING',enExamples.has(''));
 add('CHINESE_EXAMPLE_MISSING',zhExamples.has(''));
 add('CHINESE_EXAMPLE_NOT_CHINESE',ev.some(x=>!ZH.test(x.example_zh??'')));
 add('UK_IPA_VERSION_DIFFERENCE',ipaUK.size>1,warnings);
 add('US_IPA_VERSION_DIFFERENCE',ipaUS.size>1,warnings);
 add('EN_EXAMPLE_VERSION_DIFFERENCE',enExamples.size>1,warnings);
 add('ZH_EXAMPLE_VERSION_DIFFERENCE',zhExamples.size>1,warnings);
 const word=N(g.headword);
 const forms=inflected(word);
 const missingLemma=ev.some(x=>{
  const tokens=N(x.example_en).match(/[a-z]+(?:['’][a-z]+)?/gu)??[];
  return !tokens.some(t=>forms.has(t))&& !N(x.example_en).includes(word);
 });
 add('EXAMPLE_LEMMA_NOT_VISIBLE_OR_IRREGULAR_FORM',missingLemma,warnings);
 add('EN_EXAMPLE_LENGTH_OUTLIER',ev.some(x=>{
  const l=String(x.example_en??'').trim().length;return l<12||l>250;
 }),warnings);
 add('ZH_EXAMPLE_LENGTH_OUTLIER',ev.some(x=>{
  const l=String(x.example_zh??'').trim().length;return l<5||l>150;
 }),warnings);
 add('OTHER_TEXTUAL_SENSES_SHARE_HEADWORD',(allGlosses.get(word)?.size??0)>1,warnings);
 add('SOURCE_CONTEXT_NOT_EXPORTED',true,warnings);
 add('COMMERCIAL_RIGHTS_EVIDENCE_NOT_EXPORTED',true,warnings);
 const score=100+(g.legacy_word_ids.length-1)*15+g.book_ids.length*20+
  Math.min(g.occurrences,150)+issues.length*50+
  Number(ipaUK.size>1||ipaUS.size>1)*70+
  Number(enExamples.size>1||zhExamples.size>1)*25+
  Number((allGlosses.get(word)?.size??0)>1)*60;
 return {issues,warnings,score,
  uk_ipa_versions:ipaUK.size,us_ipa_versions:ipaUS.size,
  en_example_versions:enExamples.size,zh_example_versions:zhExamples.size,
  structural_status:issues.length?'BLOCKED_INCOMPLETE_CARD_EVIDENCE':
   'STRUCTURALLY_COMPLETE_CONTEXT_AND_RIGHTS_UNVERIFIED'};
}
export function analyzeAllPublishedDuplicateSenses(source){
 assert.equal(source?.status,'PRIVATE_PUBLISHED_EDITORIAL_CANDIDATES_UNAPPROVED');
 assert.equal(source?.all_records_private,true);
 assert.equal(source?.created_approvals,0);
 assert.equal(source?.production_writes,0);
 const expected={published_books:32,published_anchor_occurrences:8444,
  distinct_old_word_ids:3433,distinct_headwords:1585,
  textual_sense_candidates:1981,duplicate_textual_sense_groups:532,
  duplicate_excess_old_ids:1452};
 for(const [k,v] of Object.entries(expected))
  assert.equal(source?.counts?.[k],v,'AUTONOMOUS_REVIEW_SOURCE_DRIFT_'+k);
 const groups=source?.duplicate_review_queue,other=source?.other_candidate_groups;
 assert.ok(Array.isArray(groups)&&groups.length===MAX&&Array.isArray(other)&&other.length===1449,
  'AUTONOMOUS_REVIEW_GROUP_COUNT_INVALID');
 const allGlosses=new Map();
 for(const g of [...groups,...other]){
  assert.ok(typeof g.headword==='string'&&g.headword);
  const key=N(g.headword),v=allGlosses.get(key)??new Set();
  v.add(JSON.stringify([N(g.pos),N(g.meaning_zh)]));
  allGlosses.set(key,v);
 }
 const keysSeen=new Set(),oldIds=new Set(),results=[];
 for(const g of groups){
  assert.ok(g&&keys.every(k=>Object.hasOwn(g,k)),
   'AUTONOMOUS_REVIEW_INCOMPLETE_SOURCE');
  assert.equal(g.editor_decision,'HOLD');
  assert.equal(g.approved_sense_id,null);
  assert.equal(g.auto_merge_allowed,false);
  assert.equal(g.production_writes_allowed,false);
  assert.ok(Array.isArray(g.book_ids)&&g.book_ids.length>=1&&
   Array.isArray(g.legacy_word_ids)&&g.legacy_word_ids.length>=2&&
   Array.isArray(g.card_evidence)&&g.card_evidence.length>=g.legacy_word_ids.length&&
   Number.isSafeInteger(g.occurrences)&&g.occurrences>0,
   'AUTONOMOUS_REVIEW_INVALID_EVIDENCE');
  const key=JSON.stringify([N(g.headword),N(g.pos),N(g.meaning_zh)]);
  assert.ok(!keysSeen.has(key),'AUTONOMOUS_REVIEW_DUPLICATE_TEXTUAL_KEY');
  keysSeen.add(key);
  const evOld=new Set(),evBooks=new Set(),evCardKeys=new Set();
  let evidenceOccurrences=0;
  for(const e of g.card_evidence){
   assert.ok(typeof e?.book_id==='string'&&e.book_id&&
    typeof e?.old_word_id==='string'&&e.old_word_id&&
    Number.isSafeInteger(e.occurrences)&&e.occurrences>0,
    'AUTONOMOUS_REVIEW_INVALID_OCCURRENCE');
   const ek=JSON.stringify([e.book_id,e.old_word_id]);
   assert.ok(!evCardKeys.has(ek),'AUTONOMOUS_REVIEW_DUPLICATE_BOOK_CARD');
   evCardKeys.add(ek);
   evOld.add(e.old_word_id);evBooks.add(e.book_id);
   evidenceOccurrences+=e.occurrences;
  }
  assert.equal(evidenceOccurrences,g.occurrences,'AUTONOMOUS_REVIEW_OCCURRENCE_MISMATCH');
  assert.deepEqual([...evOld].sort(),[...g.legacy_word_ids].sort(),
   'AUTONOMOUS_REVIEW_LEGACY_CARD_EVIDENCE_MISMATCH');
  assert.deepEqual([...evBooks].sort(),[...g.book_ids].sort(),
   'AUTONOMOUS_REVIEW_BOOK_EVIDENCE_MISMATCH');
  for(const id of g.legacy_word_ids){
   assert.ok(!oldIds.has(id),'AUTONOMOUS_REVIEW_OLD_CARD_CROSSES_SENSES');
   oldIds.add(id);
  }
  const stats=checks(g,allGlosses);
  results.push({
   review_sha256:H(JSON.stringify([key,[...g.legacy_word_ids].sort(),
    [...g.book_ids].sort(),g.card_evidence])),
   headword:g.headword,pos:g.pos,meaning_zh:g.meaning_zh,
   book_ids:[...g.book_ids],legacy_word_ids:[...g.legacy_word_ids],
   card_evidence:g.card_evidence,occurrences:g.occurrences,
   ...stats,legacy_extra_id_count:g.legacy_word_ids.length-1,
   reviewer_action:'HOLD',approved_sense_id:null,
   content_proof_adequate:false,authenticated_editor_signoff:false,
   license_approved:false,production_binding_allowed:false,
   user_study_state_change_allowed:false
  });
 }
 assert.equal(results.reduce((s,r)=>s+r.legacy_extra_id_count,0),1452);
 results.sort((a,b)=>b.score-a.score||b.occurrences-a.occurrences||
  a.review_sha256.localeCompare(b.review_sha256));
 const sumFlag=name=>results.filter(r=>r.issues.includes(name)||r.warnings.includes(name)).length;
 const summary={
  duplicate_textual_groups_checked:results.length,
  old_card_ids_in_duplicate_groups:oldIds.size,
  extra_old_card_ids_in_duplicate_groups:1452,
  occurrences_in_duplicate_groups:results.reduce((s,r)=>s+r.occurrences,0),
  groups_structurally_complete:results.filter(x=>!x.issues.length).length,
  groups_structurally_blocked:results.filter(x=>x.issues.length).length,
  groups_with_any_ipa_version_difference:results.filter(x=>
   x.uk_ipa_versions>1||x.us_ipa_versions>1).length,
  groups_with_any_bilingual_example_difference:results.filter(x=>
   x.en_example_versions>1||x.zh_example_versions>1).length,
  groups_with_other_textual_senses:sumFlag('OTHER_TEXTUAL_SENSES_SHARE_HEADWORD'),
  examples_without_visible_lemma_hint:sumFlag('EXAMPLE_LEMMA_NOT_VISIBLE_OR_IRREGULAR_FORM'),
  groups_missing_ipa:results.filter(x=>x.issues.some(y=>y.includes('IPA_MISSING'))).length,
  groups_missing_examples:results.filter(x=>x.issues.some(y=>y.includes('EXAMPLE_MISSING'))).length,
  context_semantic_approvals:0,commercial_license_approvals:0,
  customer_state_migrations:0,production_writes:0
 };
 return {status:'ALL_532_AUTOMATED_EVIDENCE_REVIEW_DONE_NOT_SEMANTICALLY_APPROVED',
  source_artifact_id:13911979176,counts:summary,
  per_group_private_review:results,
  binding_proposal_status:'BLOCKED_UNTIL_VERIFIED_CONTEXT_AND_COMMERCIAL_LICENSE',
  all_records_remain_hold:true,
  warning:'All 532 groups evaluated for supplied lexical consistency, but contextual sense equivalence and commercial rights CANNOT be validated from this metadata-only evidence. No automatic sense merge is authorized.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,4);
  const report=analyzeAllPublishedDuplicateSenses(
   JSON.parse(readFileSync(process.argv[2],'utf8')));
  writeFileSync(process.argv[3],JSON.stringify(report),{flag:'wx',mode:0o600});
  console.log('ALL532_PUBLISHED_LEXICAL_QA_COUNTS='+JSON.stringify(report.counts));
  console.log('ALL532_HOLD_ONLY_NO_DB_WRITES_NO_PRIVATE_LEXICAL_DATA_LOGGED');
 }catch(e){
  console.error('ALL532_PRIVATE_REVIEW_BLOCKED',e.message);
  process.exitCode=1;
 }
}
