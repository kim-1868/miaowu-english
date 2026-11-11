import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileOwnerExamCardDrafts as reconcile}
 from '../src/global-dictionary-owner-exam-content-reconciliation.js';
const row=(headword,target_tier,entry_id='gdict_'+ 'a'.repeat(24))=>({
 headword,target_tier,entry_id,teaching_sense_approved:false,publication_ready:false
});
const hist=headword=>({headword,candidate_hash_sha256:'b'.repeat(64),
 approved_sense_id:null,auto_publish_allowed:false});
const example=(headword,entry_id='gdict_'+'a'.repeat(24))=>({
 headword,entry_id,batch:'EXAM_NEXT_165',example_en_draft:'Example '+headword+'.',
 example_zh_draft:'示例。',publisher_approved:false,teaching_ready:false,
 approved_sense_id:null,commercial_release_allowed:false
});
test('four-tier real draft categories are deterministic and never count as publisher approved',()=>{
 const input={targetHeadwords:[row('time','基础'),row('record','四级新增'),
   row('priority','六级新增'),row('doctoral','考研新增'),row('Mr.','基础',null)],
  historySenses:[hist('time'),hist('time'),hist('record')],
  originalExamples:[example('time'),example('priority')]};
 const before=JSON.stringify(input);
 const x=reconcile(input),y=reconcile(input);
 assert.deepEqual(x,y);
 assert.equal(JSON.stringify(input),before);
 assert.equal(x.summary.total_target_headwords,5);
 assert.equal(x.summary.distinct_historical_candidate_senses,3);
 assert.equal(x.summary.original_example_drafts,2);
 assert.equal(x.summary.by_tier['基础'].total,2);
 assert.equal(x.summary.by_tier['基础'].original_example_drafts,1);
 assert.equal(x.summary.by_tier['基础'].abbreviation_or_missing_source,1);
 assert.equal(x.summary.by_tier['四级新增'].historical_sense_without_new_draft,1);
 assert.equal(x.summary.by_tier['六级新增'].original_example_drafts,1);
 assert.equal(x.summary.by_tier['考研新增'].new_sense_without_draft,1);
 assert.equal(x.summary.publisher_approved,0);
 assert.ok(x.rows.every(r=>!r.publish_allowed&&r.approved_sense_id===null));
});
test('never accept duplicates, changed entry IDs or forged publisher approval',()=>{
 const normal=[row('record','四级新增')];
 assert.throws(()=>reconcile({targetHeadwords:[...normal,...normal],
   historySenses:[],originalExamples:[]}),/DUPLICATE_OR_ALREADY_APPROVED/);
 assert.throws(()=>reconcile({targetHeadwords:normal,historySenses:[],
   originalExamples:[example('record'),example('record')]}),/DRAFT_IDENTITY_OR_APPROVAL/);
 assert.throws(()=>reconcile({targetHeadwords:normal,historySenses:[],
   originalExamples:[example('record','gdict_'+'c'.repeat(24))]}),/DRAFT_IDENTITY_OR_APPROVAL/);
 assert.throws(()=>reconcile({targetHeadwords:normal,historySenses:[],
   originalExamples:[{...example('record'),publisher_approved:true}]}),/DRAFT_IDENTITY_OR_APPROVAL/);
 assert.throws(()=>reconcile({targetHeadwords:normal,historySenses:[
   {...hist('record'),approved_sense_id:'sense_1'}],originalExamples:[]}),/HISTORY_INVALID_OR_APPROVED/);
});
