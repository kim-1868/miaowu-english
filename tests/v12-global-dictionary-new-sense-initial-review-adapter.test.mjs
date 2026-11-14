import test from 'node:test';
import assert from 'node:assert/strict';
import {hydrateNewSenseInitialReviewTemplates}
 from '../src/global-dictionary-new-sense-initial-review-adapter.js';
import {validateNewSenseEditorialDecisions}
 from '../src/global-dictionary-new-sense-editorial-gate.js';
const s=(word)=>({schema:'wordletter-exam-first-original-bilingual-review-v1',
 batch:'BASIC_LAST_300',headword:word,entry_id:'gdict_'+(word==='garden'?'a':'b').repeat(24),
 target_tier:'基础',candidate_hash_sha256:null,old_word_id_count:0,
 pos_draft:'n.',meaning_zh_draft:'花园',
 example_en_draft:`The ${word} looked beautiful after the rain stopped.`,
 example_zh_draft:'雨停后，花园看起来很漂亮。',
 lexical_attention_reason:'',human_editorial_check_required:true,
 publisher_approved:false,teaching_ready:false,approved_sense_id:null,
 commercial_release_allowed:false});
const r=(x,checked=false)=>({schema:'wordletter-exam-565-initial-review-v1',
 entry_id:x.entry_id,headword:x.headword,target_tier:x.target_tier,
 source_pos:x.pos_draft,source_meanings:['花园'],edited_pos:checked?'n.':null,
 edited_meaning:checked?'花园':null,
 example_en_draft:x.example_en_draft,example_zh_draft:x.example_zh_draft,
 review_notes:checked?'初审记录':null,initial_reviewer_checked:checked,
 signoff_pending:true,publisher_approved:false,approved_sense_id:null,
 teaching_ready:false,production_publish_allowed:false});
test('565-style initial export can fill source text but cannot sign off or bind a legacy user',()=>{
 const a=s('garden'),b=s('meadow');
 const x=hydrateNewSenseInitialReviewTemplates([a,b],[r(a,true),r(b)]);
 assert.equal(x.source_senses,2);assert.equal(x.initially_checked,1);
 assert.equal(x.request_signoff_actions,0);assert.equal(x.cloudflare_d1_writes,0);
 assert.ok(x.templates.every(t=>t.action==='hold'&&t.reviewer.identity===''&&t.old_word_ids.length===0));
 assert.ok(x.templates.every(t=>Object.values(t.checks).every(v=>v.value===false)));
 const proposal=validateNewSenseEditorialDecisions([a,b],x.templates);
 assert.equal(proposal.blocked,2);assert.equal(proposal.publisher_approved_senses_created,0);
});
test('fake approval, wrong tier, duplicate source, missing row all fail closed',()=>{
 const a=s('garden'),b=s('meadow');
 for(const change of [
  x=>{x[0].publisher_approved=true},x=>{x[0].approved_sense_id='gds_'+'a'.repeat(24)},
  x=>{x[0].target_tier='考研新增'},x=>{x[0].source_pos='vt.'},
  x=>{x[0].headword='different'},x=>{x[0].automatic_learning_merge=true},
 ]){
  const input=[r(a),r(b)];change(input);
  assert.throws(()=>hydrateNewSenseInitialReviewTemplates([a,b],input));
 }
 assert.throws(()=>hydrateNewSenseInitialReviewTemplates([a,b],[r(a)]),/COMPLETE_SOURCE/);
 assert.throws(()=>hydrateNewSenseInitialReviewTemplates([a,b],[r(a),r(a)]));
 assert.throws(()=>hydrateNewSenseInitialReviewTemplates([a,a],[r(a),r(a)]));
});
test('initially checked entry without meaning or note is rejected, unchecked editable remains hold',()=>{
 const a=s('garden'),good=r(a,true);good.review_notes='';
 assert.throws(()=>hydrateNewSenseInitialReviewTemplates([a],[good]),/CHECKED_WITH_MISSING_CONTENT/);
 const unchecked=r(a);unchecked.edited_meaning='新拟中文';
 const x=hydrateNewSenseInitialReviewTemplates([a],[unchecked]);
 assert.equal(x.templates[0].selected_meaning_zh,'新拟中文');
 assert.equal(x.templates[0].action,'hold');
});