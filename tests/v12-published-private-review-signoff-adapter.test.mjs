import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePublishedDuplicateSenseSignoff as prepare}
 from '../src/global-dictionary-published-private-review-signoff-adapter.js';
const entry='gdict_'+'a'.repeat(24);
function fixture(){
 const groups=Array.from({length:532},(_,i)=>({
   headword:'word'+i,pos:'n.',meaning_zh:'词义'+i,
   legacy_word_ids:['old-'+i+'-a','old-'+i+'-b'],
   book_ids:['book-a','book-b'],occurrences:10+i,
   priority_score:1000-i,editor_decision:'HOLD',approved_sense_id:null,
   auto_merge_allowed:false,production_writes_allowed:false
 }));
 return {status:'PRIVATE_PUBLISHED_EDITORIAL_CANDIDATES_UNAPPROVED',
  all_records_private:true,created_approvals:0,production_writes:0,
  counts:{published_books:32,published_anchor_occurrences:8444,
   duplicate_textual_sense_groups:532},duplicate_review_queue:groups};
}
test('only verified entry lookup enables editorial templates, never preapproves',()=>{
 const q=fixture();
 const result=prepare({queue:q,matchedEntries:[
  {entry_id:entry,headword:'word0',publisher_approved:true,
   commercial_source_verified:true}],maxBatch:80});
 assert.equal(result.mapped_groups,1);
 assert.equal(result.unmapped_groups,531);
 assert.equal(result.selection_count,1);
 assert.equal(result.unresolved_due_to_missing_decisions,1);
 assert.equal(result.initial_decisions[0].action,'hold');
 assert.equal(result.initial_decisions[0].approved_sense_id,null);
 assert.equal(result.review_candidates[0].approved_sense_id,null);
 assert.equal(result.publisher_approved_senses_created,0);
 assert.equal(result.legacy_study_states_merged,0);
 assert.equal(result.production_writes,0);
 assert.equal(result.unlinked_hold_reasons[0].editor_action,'HOLD');
});
test('no approved dictionary links means all 532 groups remain on hold',()=>{
 const r=prepare({queue:fixture()});
 assert.equal(r.mapped_groups,0);
 assert.equal(r.unmapped_groups,532);
 assert.equal(r.initial_decisions.length,0);
});
test('forged approval, duplicate old IDs, and stale published count are rejected',()=>{
 for(const modify of [
  q=>{q.duplicate_review_queue[0].editor_decision='APPROVED'},
  q=>{q.duplicate_review_queue[1].legacy_word_ids[0]='old-0-a'},
  q=>{q.counts.published_books=46},
  q=>{q.duplicate_review_queue.pop()},
  q=>{q.duplicate_review_queue[3].production_writes_allowed=true}
 ]){
  const q=fixture();modify(q);
  assert.throws(()=>prepare({queue:q}));
 }
 assert.throws(()=>prepare({queue:fixture(),matchedEntries:[{
  entry_id:entry,headword:'word0',publisher_approved:false,
  commercial_source_verified:true}]}),/UNVERIFIED/);
});
