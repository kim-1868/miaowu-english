import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewSenseEditorialDecisionTemplate} from '../src/global-dictionary-new-sense-editorial-gate.js';
import {readSafeNewSenseJsonl,prepareOfflineNewSenseInitialReview,
 validateOfflineNewSenseEditorial} from '../scripts/check-private-new-sense-editorial.mjs';
const source={schema:'wordletter-exam-first-original-bilingual-review-v1',
 batch:'LOW_CONFLICT',entry_id:'gdict_'+'a'.repeat(24),headword:'message',
 target_tier:'四级新增',pos_draft:'n.',meaning_zh_draft:'消息',
 example_en_draft:'The message arrived at noon.',example_zh_draft:'这条消息中午到了。',
 lexical_attention_reason:'',candidate_hash_sha256:null,old_word_id_count:0,
 human_editorial_check_required:true,publisher_approved:false,teaching_ready:false,
 approved_sense_id:null,commercial_release_allowed:false};
const review={schema:'wordletter-exam-565-initial-review-v1',entry_id:source.entry_id,
 headword:source.headword,target_tier:source.target_tier,source_pos:source.pos_draft,
 source_meanings:['消息'],initial_reviewer_checked:false,
 edited_pos:'',edited_meaning:'',example_en_draft:source.example_en_draft,
 example_zh_draft:source.example_zh_draft,review_notes:'',
 publisher_approved:false,teaching_ready:false,approved_sense_id:null,
 signoff_pending:true,production_publish_allowed:false};
const encode=x=>JSON.stringify(x)+'\n';

test('CLI bridge converts a private initial review into HOLD only',()=>{
 const r=prepareOfflineNewSenseInitialReview({sourceJsonl:encode(source),
 initialReviewJsonl:encode(review)});
 assert.equal(r.source_senses,1);assert.equal(r.request_signoff_actions,0);
 assert.equal(r.templates[0].action,'hold');
 assert.equal(r.templates[0].selected_example_en,source.example_en_draft);
 assert.equal(r.templates[0].publisher_approved,false);
 const result=validateOfflineNewSenseEditorial({sourceJsonl:encode(source),
  decisionJsonl:encode(r.templates[0])});
 assert.equal(result.blocked,1);assert.equal(result.publisher_approved_senses_created,0);
 assert.equal(result.d1_writes,0);
});

test('645-style historical records are filtered only from source, never approved',()=>{
 const history={...source,batch:'HISTORICAL_SENSE_80',headword:'old',entry_id:'gdict_'+'b'.repeat(24)};
 const r=prepareOfflineNewSenseInitialReview({sourceJsonl:encode(history)+encode(source),
  initialReviewJsonl:encode(review)});
 assert.equal(r.source_senses,1);
 assert.throws(()=>prepareOfflineNewSenseInitialReview({
  sourceJsonl:encode(history),initialReviewJsonl:encode(review)}),/ONLY_HISTORICAL/);
 assert.throws(()=>readSafeNewSenseJsonl(encode(history)),/HISTORICAL_SENSES_REQUIRE_LEGACY_GATE/);
});

test('fake approval, wrong file count, and duplicated/unknown input cannot convert',()=>{
 const fake={...review,publisher_approved:true};
 const wrong={...review,entry_id:'gdict_'+'c'.repeat(24)};
 for(const data of [encode(fake),encode(wrong),encode(review)+encode(review)]){
  assert.throws(()=>prepareOfflineNewSenseInitialReview({sourceJsonl:encode(source),
  initialReviewJsonl:data}));
 }
 const d=createNewSenseEditorialDecisionTemplate(source);
 d.action='request_signoff';d.publisher_approved=true;
 const result=validateOfflineNewSenseEditorial({sourceJsonl:encode(source),
  decisionJsonl:encode(d)});
 assert.equal(result.blocked,1);assert.equal(result.publisher_approved_senses_created,0);
});

test('reject malformed JSONL and all-source historic word ID attempts',()=>{
 assert.throws(()=>readSafeNewSenseJsonl('{not-json'),/SYNTAX/);
 const bad={...source,old_word_id_count:1,old_word_ids:['old-id']};
 assert.throws(()=>prepareOfflineNewSenseInitialReview({sourceJsonl:encode(bad),
  initialReviewJsonl:encode(review)}),/UNLINKED_UNAPPROVED/);
});