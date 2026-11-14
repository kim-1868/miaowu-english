import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceForms,inferredForms,auditPrivateTeachingSense,
 auditPrivateTeachingSenses} from '../src/global-dictionary-private-qa.js';
const row=(id,head,en)=>({
 candidate_hash_sha256:id.toString(16).padStart(64,'0'),
 headword:head,meaning_zh:'中文',part_of_speech:'v.',
 example_candidates:[{example_en:en,example_zh:'中文例句'}],
 phonetic_uk_variants:['/x/'],phonetic_us_variants:['/x/'],
 editorial_flags:[],lesson_approved:false,approved_sense_id:null
});
test('Ecdict morphological source matches examples but never approves a card',()=>{
 const x=auditPrivateTeachingSense(row(1,'approve','The committee approved it.'),'d:approved/i:approving');
 assert.equal(x.source_form_found,true);
 assert.equal(x.exact_headword_found,false);
 assert.equal(x.qa_flags.length,0);
 assert.equal(x.lesson_approved,false);
 assert.deepEqual(sourceForms('d:approved','approve'),['approve','approved']);
});
test('inferred regular past tense flagged for future confirmation',()=>{
 const x=auditPrivateTeachingSense(row(1,'reshape','She reshaped her goals.'));
 assert.ok(x.qa_flags.includes('EXAMPLE_ONLY_INFERRED_INFLECTION_NOT_SOURCE_VERIFIED'));
 assert.ok(inferredForms('reunite').includes('reunited'));
 const y=auditPrivateTeachingSense(row(1,'decision','A choice was made.'));
 assert.ok(y.qa_flags.includes('EXAMPLE_WORD_NOT_FOUND_AMONG_LEMMA_OR_LISTED_FORMS'));
});
test('all source candidates remain review-only and unknown POS/IPA are flagged',()=>{
 const x=row(1,'record','They recorded a voice.');x.part_of_speech='v./n.';x.phonetic_us_variants=[];
 const r=auditPrivateTeachingSenses([x],new Map([['record','d:recorded']]));
 assert.equal(r.summary.sense_candidates,1);
 assert.equal(r.summary.owner_source_form_match,1);
 assert.equal(r.summary.flag_counts.NON_STANDARD_OR_COMBINED_PART_OF_SPEECH,1);
 assert.equal(r.summary.flag_counts.MISSING_IPA_VARIANTS,1);
 assert.equal(r.summary.commercial_senses_approved,0);
 assert.throws(()=>auditPrivateTeachingSenses([x,x]),/ID_OR_APPROVAL/);
});
