import test from 'node:test';
import assert from 'node:assert/strict';
import {planApprovedNovelSenseAnchors}
 from '../src/global-dictionary-sense-anchor.js';
const id=h=>'gds_'+h.repeat(24);
const lesson={senses_json:JSON.stringify([
 {pos:'n.',meaningZh:'记录',exampleEn:'Keep a record.',exampleZh:'保存记录。'},
 {pos:'v.',meaningZh:'录制',exampleEn:'Record the concert.',exampleZh:'录制演唱会。'}
])};
const rows=()=>[
 {sense_id:id('a'),entry_id:'gdict_record',pos:'n.',meaning_zh:'记录',
  approved:1,active:1,reviewed_by:'editor',reviewed_at:'2026-11-10'},
 {sense_id:id('b'),entry_id:'gdict_record',pos:'v.',meaning_zh:'录制',
  approved:1,active:1,reviewed_by:'editor',reviewed_at:'2026-11-10'}
];
const occurrences=()=>[
 {chapter_number:1,paragraph_index:0,segment_index:1,
  entry_id:'gdict_record',headword:'record',gloss:'记录'},
 {chapter_number:1,paragraph_index:1,segment_index:1,
  entry_id:'gdict_record',headword:'record',gloss:'录制'}
];
test('one display card holds two independently reviewed learning sense IDs',()=>{
 const r=planApprovedNovelSenseAnchors(occurrences(),{
  lessons:new Map([['gdict_record',lesson]]),senses:rows()});
 assert.equal(r.ready_for_sense_study,true);
 assert.equal(r.approved_sense_occurrences,2);
 assert.deepEqual(r.reviewed_anchor_candidates.map(x=>x.sense_id),[id('a'),id('b')]);
 assert.equal(r.old_learning_states_migrated,false);
 assert.equal(r.user_data_accessed,false);
});
test('missing explicit sense cannot masquerade as entry-level mastered',()=>{
 const r=planApprovedNovelSenseAnchors(occurrences(),{
  lessons:new Map([['gdict_record',lesson]]),senses:[rows()[0]]});
 assert.equal(r.ready_for_sense_study,false);
 assert.equal(r.approved_sense_occurrences,1);
 assert.equal(r.review_queue[0].reason,'STABLE_APPROVED_SENSE_ID_MISSING');
});
test('unreviewed or duplicate approved senses cannot resolve silently',()=>{
 const unpublished=rows();unpublished[1].active=0;
 const x=planApprovedNovelSenseAnchors(occurrences(),{
  lessons:{gdict_record:lesson},senses:unpublished});
 assert.equal(x.ready_for_sense_study,false);
 const redundant=rows();redundant.push({...rows()[0],sense_id:id('c')});
 const y=planApprovedNovelSenseAnchors(occurrences(),{
  lessons:{gdict_record:lesson},senses:redundant});
 assert.equal(y.ready_for_sense_study,false);
 assert.equal(y.review_queue[0].reason,'AMBIGUOUS_APPROVED_SENSE_ID');
 assert.throws(()=>planApprovedNovelSenseAnchors(occurrences(),{
  lessons:{gdict_record:lesson},senses:[rows()[0],rows()[0]]}),/DUPLICATE_SENSE_ROW/);
});
test('source lesson mismatch cannot attach the right headword to wrong gloss',()=>{
 const r=planApprovedNovelSenseAnchors(occurrences(),{
  lessons:{gdict_record:{senses_json:JSON.stringify([{pos:'v.',meaningZh:'记录',
   exampleEn:'A.',exampleZh:'甲。'}])}},senses:rows()});
 assert.equal(r.ready_for_sense_study,false);
 assert.equal(r.manual_review_occurrences,1);
 assert.equal(r.review_queue[0].reason,'STABLE_APPROVED_SENSE_ID_MISSING');
});
