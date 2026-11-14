import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prioritizePublishedDuplicateEditorialQueue as triage}
 from '../scripts/triage-private-published-duplicate-senses-top80.mjs';

const group=(i,dupe=true)=>({
 headword:'lemma'+i,pos:'n.',meaning_zh:'含义'+i,
 legacy_word_ids:dupe?['old-a-'+i,'old-b-'+i]:['old-a-'+i],
 book_ids:i===0?['book-A','book-B']:['book-A'],occurrences:i===0?100:5,
 card_evidence:dupe?[
  {old_word_id:'old-a-'+i,book_id:'book-A',phonetic_uk:'/a/',
   phonetic_us:'/a/',example_en:'A brief example.',example_zh:'例句。'},
  {old_word_id:'old-b-'+i,book_id:i===0?'book-B':'book-A',
   phonetic_uk:i===0?'/b/':'/a/',phonetic_us:'/a/',
   example_en:'A different example.',example_zh:'另外的例句。'}
 ]:[{old_word_id:'old-a-'+i,book_id:'book-A',phonetic_uk:'/a/',
   phonetic_us:'/a/',example_en:'A brief example.',example_zh:'例句。'}],
 risk_flags:['OLD_CARD_IDS_DUPLICATED_FOR_TEXTUAL_SENSE'],
 editor_decision:'HOLD',approved_sense_id:null,
 auto_merge_allowed:false,production_writes_allowed:false
});
const fixture=()=>({
 status:'PRIVATE_PUBLISHED_EDITORIAL_CANDIDATES_UNAPPROVED',
 all_records_private:true,created_approvals:0,production_writes:0,
 counts:{
  published_books:32,published_anchor_occurrences:8444,
  distinct_old_word_ids:3433,distinct_headwords:1585,
  textual_sense_candidates:1981,duplicate_textual_sense_groups:532,
  duplicate_excess_old_ids:1452
 },
 duplicate_review_queue:Array.from({length:532},(_,i)=>group(i)),
 other_candidate_groups:Array.from({length:1449},(_,i)=>group(i+532,false))
});
test('real-shaped 532 duplicate queue gives protected top80 review only',()=>{
 const result=triage(fixture());
 assert.equal(result.status,'PUBLISHED_32_PRIVATE_TOP80_EDITORIAL_REVIEW_ONLY');
 assert.equal(result.source_artifact_id,13911979176);
 assert.equal(result.safe_aggregate.candidate_groups,532);
 assert.equal(result.top_editorial_queue.length,80);
 assert.equal(result.top_editorial_queue[0].headword,'lemma0');
 assert.equal(result.top_editorial_queue[0].flags.includes('IPA_VARIANT_REQUIRES_EXPERT_CHECK'),true);
 assert.equal(result.top_editorial_queue[0].flags.includes('OTHER_POS_OR_GLOSS_CANDIDATES_FOR_HEADWORD'),false);
 assert.ok(result.top_editorial_queue.every(x=>
  x.reviewer_action==='HOLD'&&x.confirmed_sense_id===null&&
  !x.authenticated_publisher_signoff&&!x.merge_legacy_user_study_allowed));
 assert.equal(result.approved_sense_ids_created,0);
 assert.equal(result.production_writes,0);
 assert.equal(result.user_learning_state_changed,false);
});
test('other meaning for same headword escalates review caution',()=>{
 const q=fixture();
 q.other_candidate_groups[0].headword='lemma0';
 q.other_candidate_groups[0].pos='v.';
 const a=triage(q);
 assert.ok(a.top_editorial_queue[0].flags.includes('OTHER_POS_OR_GLOSS_CANDIDATES_FOR_HEADWORD'));
});
test('forged approvals, overlap, stale counters, and invalid rows fail closed',()=>{
 for(const mutate of [
  q=>q.duplicate_review_queue[0].editor_decision='APPROVED',
  q=>q.duplicate_review_queue[1].legacy_word_ids[0]='old-a-0',
  q=>q.duplicate_review_queue[2].card_evidence=[],
  q=>q.counts.published_anchor_occurrences=8443,
  q=>q.duplicate_review_queue.pop(),
  q=>q.created_approvals=1
 ]){
  const q=fixture();mutate(q);assert.throws(()=>triage(q));
 }
});
test('workflow only downloads original encrypted artifact, never calls production D1',()=>{
 const s=readFileSync('.github/workflows/v12-published-duplicate-top80-artifact.yml','utf8');
 for(const literal of ['production-d1-readonly-approval','13911979176',
  'PRODUCTION_D1_METADATA_PASSPHRASE','gpg --batch',
  'actions/upload-artifact@v4','retention-days: 7',
  'triage-private-published-duplicate-senses-top80.mjs'])
  assert.ok(s.includes(literal),'missing '+literal);
 assert.doesNotMatch(s,/wrangler d1|CLOUDFLARE_API_TOKEN|d1 execute|wrangler deploy/);
});
