import test from 'node:test';
import assert from 'node:assert/strict';
import {triagePrivateSenseReviewComplexity}
 from '../src/global-dictionary-fast-review-triage.js';
const sample=(n)=>({candidate_hash_sha256:n.toString(16).padStart(64,'0'),
 headword:'record',entry_id:'gdict_'+ 'a'.repeat(24),
 old_word_ids:['old'+n],review_batch:1,
 phonetic_uk_variants:['/a/'],phonetic_us_variants:['/a/'],
 part_of_speech:'n.',example_candidates:[{example_en:'Record the test.',example_zh:'记录测试。'}],
 editorial_flags:[],qa_source_form_found:true,
 approved_sense_id:null,lesson_approved:false});
test('unique source forms and IPA are prioritised but NOT approved or licensed',()=>{
 const a=sample(1),b=sample(2);b.editorial_flags=['HEADWORD_HAS_MULTIPLE_SENSES'];
 const result=triagePrivateSenseReviewComplexity([a,b]);
 assert.equal(result.summary.total,2);
 assert.equal(result.summary.faster_editorial_review,1);
 assert.equal(result.summary.focused_editorial_review,1);
 assert.equal(result.summary.approved_senses,0);
 assert.equal(result.faster_review[0].teaching_ready,false);
 assert.equal(result.faster_review[0].licensed_for_commercial_use,false);
 assert.equal(result.focused_review[0].approved_sense_id,null);
});
test('source inflection mismatch or combined POS require focused editorial review',()=>{
 const a=sample(1),b=sample(2),c=sample(3);
 a.qa_source_form_found=false;b.part_of_speech='n./v.';c.phonetic_us_variants=['/a/','/b/'];
 const x=triagePrivateSenseReviewComplexity([a,b,c]);
 assert.equal(x.summary.focused_editorial_review,3);
 assert.ok(x.focused_review.every(r=>r.risk_reasons.length>0));
});
test('duplicates and source attempts to mark approved are refused',()=>{
 const a=sample(1);assert.throws(()=>triagePrivateSenseReviewComplexity([a,a]),/DUPLICATE/);
 a.lesson_approved=true;
 assert.throws(()=>triagePrivateSenseReviewComplexity([a]),/ALREADY_APPROVED/);
});
