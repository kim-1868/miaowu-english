import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPrivateReviewerDecisionJsonl}
 from '../scripts/check-private-reviewer-decisions.mjs';
import {createSenseReviewDecisionTemplate}
 from '../src/global-dictionary-editorial-signoff-gate.js';
const candidate={candidate_hash_sha256:'c'.repeat(64),entry_id:'gdict_'+'e'.repeat(24),
 headword:'record',part_of_speech:'n.',meaning_zh:'记录',
 old_word_ids:['old-noun-record'],approved_sense_id:null,lesson_approved:false};
test('local tool receives hold decisions, never labels them signed',()=>{
 const decision=createSenseReviewDecisionTemplate(candidate);
 const result=checkPrivateReviewerDecisionJsonl({
  candidateJsonl:JSON.stringify(candidate),decisionJsonl:JSON.stringify(decision)});
 assert.equal(result.total_source_candidates,1);
 assert.equal(result.received_decisions,1);
 assert.equal(result.status_counts.BLOCKED_FOR_EDITORIAL_REVIEW,1);
 assert.equal(result.final_approved_senses_created,0);
 assert.equal(result.cloudflare_database_writes,0);
});
test('blank decisions list does not automatically approve historical lesson cards',()=>{
 const result=checkPrivateReviewerDecisionJsonl({
  candidateJsonl:JSON.stringify(candidate),decisionJsonl:''});
 assert.equal(result.received_decisions,0);
 assert.deepEqual(result.proposals[0].blockers,['REVIEW_DECISION_MISSING']);
});
test('unknown and duplicated reviewer identity fail closed',()=>{
 const d=createSenseReviewDecisionTemplate(candidate);
 const x=JSON.stringify(d);
 assert.throws(()=>checkPrivateReviewerDecisionJsonl({
  candidateJsonl:JSON.stringify(candidate),decisionJsonl:x+'\n'+x}),/DUPLICATE/);
 const bad={...d,source_candidate_sha256:'f'.repeat(64)};
 assert.throws(()=>checkPrivateReviewerDecisionJsonl({
  candidateJsonl:JSON.stringify(candidate),decisionJsonl:JSON.stringify(bad)}),/UNKNOWN/);
});
