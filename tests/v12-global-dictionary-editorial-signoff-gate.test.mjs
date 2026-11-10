import test from 'node:test';
import assert from 'node:assert/strict';
import {createSenseReviewDecisionTemplate,validatePrivateSenseReviewDecisions}
 from '../src/global-dictionary-editorial-signoff-gate.js';
const key=n=>n.toString(16).padStart(64,'0');
const row=(n,head='record',m='记录')=>({
 candidate_hash_sha256:key(n),entry_id:'gdict_'+'a'.repeat(24),
 headword:head,part_of_speech:'n.',meaning_zh:m,old_word_ids:['old-'+n],
 approved_sense_id:null,lesson_approved:false});
const signedInput=r=>{
 const d=createSenseReviewDecisionTemplate(r);
 d.action='request_signoff';
 d.selected_pos=r.part_of_speech;
 d.selected_meaning_zh=r.meaning_zh;
 d.phonetic_uk='/ˈrekɔːd/';d.phonetic_us='/ˈrekərd/';
 d.example_en='Keep a record.';d.example_zh='保存记录。';
 d.reviewer={identity:'private-editor',reviewed_at:'2026-11-10T11:00:00Z',note:'Reviewed content'};
 for(const name of Object.keys(d.checks))d.checks[name]={value:true,evidence:'editorial report 42'};
 d.license={allows_commercial_use:true,basis:'independently authored',
  reference:'owner-rights-attestation-42',
  english_example_rights:'original wording independently confirmed',
  chinese_example_rights:'original translation independently confirmed'};
 return d;
};
test('blank review template cannot be mistaken for a real approved lesson',()=>{
 const r=row(1),d=createSenseReviewDecisionTemplate(r);
 assert.equal(d.action,'hold');
 assert.equal(d.editorial_signoff_pending,true);
 assert.equal(d.approved_sense_id,null);
 const result=validatePrivateSenseReviewDecisions([r],[d]);
 assert.equal(result.status_counts.BLOCKED_FOR_EDITORIAL_REVIEW,1);
 assert.equal(result.final_approved_senses_created,0);
});
test('all review evidence only permits authenticated future signoff, never approval',()=>{
 const a=row(1),b=row(2,'record','录制'),d=signedInput(a),e=signedInput(b);
 const before=JSON.stringify([a,b,d,e]);
 const r=validatePrivateSenseReviewDecisions([a,b],[d,e]);
 assert.equal(r.status_counts.READY_FOR_AUTHENTICATED_OPS_FINAL_SIGNOFF,2);
 assert.notEqual(r.proposals[0].provisional_sense_id,r.proposals[1].provisional_sense_id);
 assert.ok(r.proposals.every(x=>!x.approved&&!x.active&&!x.publisher_authenticated));
 assert.equal(r.user_study_state_writes,0);
 assert.equal(JSON.stringify([a,b,d,e]),before);
});
test('missing commercial rights, missing IPA evidence, changed sense text block review',()=>{
 const r=row(1);
 for(const mutate of [
 d=>{d.license.allows_commercial_use=false},
 d=>{d.checks.uk_ipa.evidence=''},
 d=>{d.selected_meaning_zh='录制'},
 d=>{d.editorial_signoff_pending=false;d.approved_sense_id='gds_'+'b'.repeat(24)},
 d=>{d.original_old_word_ids=['changed-old-id']}
 ]){
  const d=signedInput(r);mutate(d);
  const result=validatePrivateSenseReviewDecisions([r],[d]);
  assert.equal(result.status_counts.BLOCKED_FOR_EDITORIAL_REVIEW,1);
 }
});
test('unknown decisions, duplicate old IDs and unreviewed source mutation are rejected',()=>{
 const a=row(1),b=row(2);b.old_word_ids=[...a.old_word_ids];
 assert.throws(()=>validatePrivateSenseReviewDecisions([a,b],[]),/LEGACY_WORD_ID_COLLISION/);
 const d=signedInput(row(3));
 assert.throws(()=>validatePrivateSenseReviewDecisions([a],[d]),/DECISION_UNKNOWN/);
 assert.throws(()=>validatePrivateSenseReviewDecisions([a],[signedInput(a),signedInput(a)]),/DECISION_UNKNOWN/);
 const source=row(1);source.lesson_approved=true;
 assert.throws(()=>validatePrivateSenseReviewDecisions([source],[]),/CANDIDATE_IDENTITY/);
});
