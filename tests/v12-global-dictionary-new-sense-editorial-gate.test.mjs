import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewSenseEditorialDecisionTemplate,validateNewSenseEditorialDecisions}
  from '../src/global-dictionary-new-sense-editorial-gate.js';
const entry='gdict_'+'a'.repeat(24);
const source=(word='garden',gloss='花园',risk='')=>({
 schema:'wordletter-exam-first-original-bilingual-review-v1',
 batch:'BASIC_LAST_300',headword:word,entry_id:entry,
 target_tier:'基础',candidate_hash_sha256:null,old_word_id_count:0,
 pos_draft:'n.',meaning_zh_draft:gloss,
 example_en_draft:
  word==='garden'?'The garden was quiet after the rain stopped.':
   `The ${word} looked beautiful after the rain stopped.`,
 example_zh_draft:'雨停后，这个地方非常安静。',
 lexical_attention_reason:risk,human_editorial_check_required:true,
 publisher_approved:false,teaching_ready:false,approved_sense_id:null,
 commercial_release_allowed:false});
function reviewed(s){
 const d=createNewSenseEditorialDecisionTemplate(s);
 d.action='request_signoff';d.selected_pos=s.pos_draft;
 d.selected_meaning_zh=s.meaning_zh_draft;
 d.selected_example_en=s.example_en_draft;
 d.selected_example_zh=s.example_zh_draft;
 d.phonetic_us='/x/';d.phonetic_uk='/x/';
 d.reviewer={identity:'editorial-qa-fixture',reviewed_at:'2026-11-11T12:00:00Z',note:'Synthetic evidence only'};
 for(const k of Object.keys(d.checks))d.checks[k]={value:true,evidence:'Synthetic example only, never a real rights attestation'};
 d.license={basis:'synthetic fixture',reference:'test-only',allows_commercial_use:true,
  english_example_rights:'synthetic test fixture',chinese_example_rights:'synthetic test fixture'};
 return d;
}
test('blank new-sense template has no publishing or legacy permissions',()=>{
 const s=source(),d=createNewSenseEditorialDecisionTemplate(s);
 assert.equal(d.action,'hold');assert.equal(d.old_word_ids.length,0);
 assert.equal(d.approved_sense_id,null);assert.equal(d.publisher_approved,false);
 const r=validateNewSenseEditorialDecisions([s],[d]);
 assert.equal(r.blocked,1);assert.equal(r.publisher_approved_senses_created,0);
 assert.equal(r.legacy_word_ids_linked,0);assert.equal(r.d1_writes,0);
});
test('all evidence only creates an authenticated-OPS proposal, never a teaching sense',()=>{
 const s=source(),d=reviewed(s),before=JSON.stringify({s,d});
 const r=validateNewSenseEditorialDecisions([s],[d]);
 assert.equal(r.pending_authenticated_publisher_signoff,1);
 assert.match(r.proposals[0].provisional_sense_id,/^gds_[a-f0-9]{24}$/u);
 assert.equal(r.proposals[0].approved_sense_id,null);
 assert.equal(r.proposals[0].publisher_authenticated,false);
 assert.equal(r.user_study_state_writes,0);
 assert.equal(JSON.stringify({s,d}),before);
});
test('new source cannot carry old ids or fake publisher approval',()=>{
 for(const mutate of [
  s=>{s.old_word_id_count=1},s=>{s.legacy_word_ids=['old']},
  s=>{s.publisher_approved=true},s=>{s.teaching_ready=true},
  s=>{s.approved_sense_id='gds_'+'a'.repeat(24)},
  s=>{s.batch='HISTORICAL_SENSE_80'},
 ]){const s=source();mutate(s);
  assert.throws(()=>createNewSenseEditorialDecisionTemplate(s),/NEW_SENSE_SOURCE/)}
});
test('only the source headword and actual authored example can match',()=>{
 const s=source();s.example_en_draft='This room was quiet after the rain stopped.';
 assert.throws(()=>createNewSenseEditorialDecisionTemplate(s),/HEADWORD/);
});
test('missing rights, UK IPA, reviewer note or lexical evidence blocks proposal',()=>{
 const s=source('meadow','草地','SOURCE_MEANING_MISMATCH');
 for(const mutate of [
  d=>{d.license.allows_commercial_use=false},
  d=>{d.phonetic_uk=''},
  d=>{d.reviewer.note=''},
  d=>{d.checks.lexical_risk_and_context.evidence=''},
  d=>{d.checks.existing_sense_overlap.value=false},
 ]){
  const d=reviewed(s);mutate(d);
  assert.equal(validateNewSenseEditorialDecisions([s],[d]).blocked,1);
 }
});
test('changes to teaching sense or examples require an explicit editorial revision reason',()=>{
 const s=source(),d=reviewed(s);d.selected_meaning_zh='庭园';
 assert.equal(validateNewSenseEditorialDecisions([s],[d]).blocked,1);
 d.revision_reason='Synthetic editorial meaning revision for a new unlinked sense';
 const r=validateNewSenseEditorialDecisions([s],[d]);
 assert.equal(r.blocked,0);assert.equal(r.publisher_approved_senses_created,0);
});
test('forged approvals and fake old links in a local decision are blocked',()=>{
 const s=source();
 for(const change of [
  d=>{d.old_word_ids=['old-1']},d=>{d.linked_old_word_id='old-1'},
  d=>{d.publisher_approved=true},d=>{d.approved_sense_id='gds_'+'a'.repeat(24)},
  d=>{d.commercial_release_allowed=true},d=>{d.automatic_learning_merge=true},
 ]){const d=reviewed(s);change(d);assert.equal(validateNewSenseEditorialDecisions([s],[d]).blocked,1)}
});
test('unknown decisions and duplicate sources reject the entire batch',()=>{
 const a=source(),b=source('meadow','草地');
 assert.throws(()=>validateNewSenseEditorialDecisions([a,a],[]),/DUPLICATE_NEW_SENSE_SOURCE/);
 assert.throws(()=>validateNewSenseEditorialDecisions([a],[reviewed(b)]),/UNKNOWN_OR_DUPLICATED_DECISION/);
 assert.throws(()=>validateNewSenseEditorialDecisions([a],[reviewed(a),reviewed(a)]),/UNKNOWN_OR_DUPLICATED_DECISION/);
});
test('different meanings get separate provisional identities, and identical ones are blocked',()=>{
 const a=source('garden','花园'),b=source('garden','庭园');
 const different=validateNewSenseEditorialDecisions([a,b],[reviewed(a),reviewed(b)]);
 assert.equal(different.pending_authenticated_publisher_signoff,2);
 assert.notEqual(different.proposals[0].provisional_sense_id,different.proposals[1].provisional_sense_id);
 const d=reviewed(b);d.selected_meaning_zh='花园';d.revision_reason='Synthetic unification of meanings';
 const same=validateNewSenseEditorialDecisions([a,b],[reviewed(a),d]);
 assert.equal(same.blocked,2);assert.equal(same.pending_authenticated_publisher_signoff,0);
});