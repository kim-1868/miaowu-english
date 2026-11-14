import test from 'node:test';
import assert from 'node:assert/strict';
import {auditOwnerOriginalExamples as audit}
 from '../src/global-dictionary-owner-original-example-audit.js';
const t=(headword,tier='四级新增')=>({headword,target_tier:tier,entry_id:'gdict_'+'a'.repeat(24)});
const d=(headword,ex='She kept a record of every meeting.')=>({
 headword,target_tier:'四级新增',entry_id:t(headword).entry_id,
 batch:'FIRST_100',pos_draft:'n.',meaning_zh_draft:'记录',
 example_en_draft:ex,example_zh_draft:'她记录了每次会议。',
 publisher_approved:false,teaching_ready:false,approved_sense_id:null,
 commercial_release_allowed:false
});
test('real draft triage is stable and never considers machine QA an editorial signoff',()=>{
 const input={drafts:[d('record'),d('contract','The team discussed the draft carefully.')],
  targets:[t('record'),t('contract')],
  history:[{headword:'record',old_id_count:12,book_count:6,
   qa_flags:['INCONSISTENT_IPA_ACROSS_HISTORICAL_CARDS']}],
  semanticAttention:[{word:'record',risk_code:'TEXTUAL_SOURCE_GLOSS_DIFFERENCE'}]};
 const before=JSON.stringify(input),res=audit(input);
 assert.equal(JSON.stringify(input),before);
 assert.equal(res.summary.drafts,2);
 assert.equal(res.summary.with_flags,2);
 assert.equal(res.rows[0].headword,'record');
 assert.equal(res.rows[0].flags.includes('HISTORICAL_IPA_CONFLICT_REVIEW'),true);
 assert.equal(res.rows[1].flags.includes('TARGET_LEMMA_NOT_VISIBLE_OR_IRREGULAR_INFLECTION'),true);
 assert.ok(res.rows.every(x=>x.editor_decision==='HOLD'&&
  x.approved_sense_id===null&&!x.publish_allowed&&!x.study_writes_allowed));
 assert.deepEqual(audit(input),res);
});
test('morphology proposal is only a heuristic, irregular and derivational words stay reviewable',()=>{
 const res=audit({drafts:[d('go','She went home after the meeting.')],
  targets:[t('go')]});
 assert.equal(res.summary.without_rule_flags,1);
 assert.equal(res.summary.approved_senses,0);
});
test('forged approvals, bad entry links and duplicate headwords fail closed',()=>{
 const source={drafts:[d('record')],targets:[t('record')]};
 assert.throws(()=>audit({...source,drafts:[{...d('record'),publisher_approved:true}]}),
  /IDENTITY_OR_APPROVAL_INVALID/);
 assert.throws(()=>audit({...source,drafts:[{...d('record'),entry_id:'gdict_'+'b'.repeat(24)}]}),
  /IDENTITY_OR_APPROVAL_INVALID/);
 assert.throws(()=>audit({...source,drafts:[d('record'),d('record')]}),
  /IDENTITY_OR_APPROVAL_INVALID/);
 assert.throws(()=>audit({...source,targets:[t('record'),t('record')]}),
  /TARGET_DUPLICATE/);
});
