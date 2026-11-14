import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGlobalDictionaryIndex} from '../src/global-dictionary-matcher.js';
import {planNovelDictionaryBindings} from '../src/global-dictionary-bindings.js';

const index=()=>buildGlobalDictionaryIndex({
 entries:[
  {entry_id:'gdict_record',headword:'record',teaching_ready:true},
  {entry_id:'gdict_develop',headword:'develop',teaching_ready:true},
  {entry_id:'gdict_see',headword:'see',teaching_ready:true},
  {entry_id:'gdict_saw',headword:'saw',teaching_ready:true},
  {entry_id:'gdict_rare',headword:'sophisticated',teaching_ready:false},
  {entry_id:'gdict_make',headword:'make',teaching_ready:true}
 ],
 forms:[
  {form:'developed',headword:'develop',reviewed:true},
  {form:'saw',headword:'see',reviewed:true},
  {form:'made',headword:'make',reviewed:false}
 ]
});
const novel=()=>({
 version:1,book:{id:'story-cet6',category:'cet6'},
 chapters:[{
  number:1,paragraphs:[{segments:[
   {text:'她准备 '},
   {wordId:'legacy-record',surface:'record',gloss:'记录'},
   {text:' a short video. '}
  ]},{
   segments:[
    {wordId:'legacy-develop',surface:'developed',gloss:'开发'},
    {text:' a new design. '}
   ]
  },{
   segments:[
    {wordId:'legacy-saw',surface:'saw',gloss:'看见'},
    {text:' a sign '}
   ]
  },{
   segments:[
    {wordId:'legacy-rare',surface:'sophisticated',gloss:'复杂的'},
    {text:' device '}
   ]
  },{
   segments:[
    {wordId:'legacy-absent',surface:'quixotic',gloss:'不切实际'}
   ]
  },{
   segments:[
    {wordId:'legacy-made',surface:'made',gloss:'制作'}
   ]
  }]
 }]
});
test('CET6 novel binding candidate gives exact verified and reviewed inflection targets, no manuscript writes',()=>{
 const input=novel(),copy=structuredClone(input);
 const r=planNovelDictionaryBindings(input,index());
 assert.equal(r.status,'READ_ONLY_BINDING_PROPOSAL_NOT_IMPORTED');
 assert.equal(r.total_target_occurrences,6);
 assert.equal(r.confirmed_occurrences,2);
 assert.equal(r.review_required_occurrences,4);
 assert.equal(r.safe_to_autopublish,false);
 assert.equal(r.users_migrated,false);
 assert.equal(r.novel_mutated,false);
 assert.deepEqual(input,copy);
 assert.deepEqual(r.resolved.map(x=>x.entry_id),['gdict_record','gdict_develop']);
 assert.deepEqual(r.resolved.map(x=>x.resolution),['unique_verified_match','unique_verified_match']);
 assert.deepEqual(r.review_queue.map(x=>x.reason),[
  'AMBIGUOUS_HEADWORD_OR_INFLECTION',
  'TEACHING_CARD_NEEDS_REVIEW',
  'DICTIONARY_HEADWORD_NOT_FOUND',
  'INFLECTION_NOT_VERIFIED'
 ]);
 assert.equal(r.review_queue[0].chapter_number,1);
 assert.equal(r.review_queue[0].paragraph_index,2);
 assert.equal(r.review_queue[0].segment_index,0);
 assert.ok(r.review_queue[0].context.includes('sign'));
 assert.equal(r.review_queue[0].legacy_word_id,'legacy-saw');
});
test('manual selection resolves ambiguity per specific occurrence only when chosen card is approved',()=>{
 const input=novel();
 const r=planNovelDictionaryBindings(input,index(),{decisions:[{
  chapter_number:1,paragraph_index:2,segment_index:0,
  entry_id:'gdict_see',confirmed:true
 }]});
 assert.equal(r.confirmed_occurrences,3);
 assert.equal(r.review_required_occurrences,3);
 assert.equal(r.resolved.find(x=>x.entry_id==='gdict_see').resolution,'reviewed_selection');
 assert.equal(r.review_queue.some(x=>x.surface==='saw'),false);
});
test('review choice cannot spoof source signoff, select a noncandidate or be duplicated',()=>{
 const input=novel(),idx=index();
 const choose=(paragraph_index,entry_id)=>({
  chapter_number:1,paragraph_index,segment_index:0,
  entry_id,confirmed:true});
 assert.throws(()=>planNovelDictionaryBindings(input,idx,{
   decisions:[choose(3,'gdict_rare')]
 }),/DECISION_CANNOT_OVERRIDE_SOURCE_REVIEW/);
 assert.throws(()=>planNovelDictionaryBindings(input,idx,{
   decisions:[choose(5,'gdict_make')]
 }),/DECISION_CANNOT_OVERRIDE_SOURCE_REVIEW/);
 assert.throws(()=>planNovelDictionaryBindings(input,idx,{
   decisions:[choose(2,'gdict_record')]
 }),/DECISION_NOT_IN_CANDIDATES/);
 assert.throws(()=>planNovelDictionaryBindings(input,idx,{
   decisions:[choose(2,'gdict_see'),choose(2,'gdict_see')]
 }),/DUPLICATE_MATCH_DECISION/);
 assert.throws(()=>planNovelDictionaryBindings(input,idx,{
   decisions:[{...choose(2,'gdict_see'),paragraph_index:88}]
 }),/DECISION_TARGET_NOT_FOUND/);
 assert.throws(()=>planNovelDictionaryBindings(input,idx,{
   decisions:[{...choose(2,'gdict_see'),confirmed:false}]
 }),/INVALID_MATCH_DECISION/);
});
test('two distinct canonical lemmas attached to one historical wordId are quarantined',()=>{
 const input=novel();
 input.chapters[0].paragraphs[1].segments[0].wordId='legacy-record';
 const r=planNovelDictionaryBindings(input,index());
 assert.equal(r.conflicting_legacy_ids.length,1);
 assert.deepEqual(r.conflicting_legacy_ids[0].entry_ids,['gdict_develop','gdict_record']);
 assert.equal(r.confirmed_occurrences,0);
 assert.equal(r.review_required_occurrences,6);
 assert.equal(r.review_queue.filter(x=>x.reason==='LEGACY_ID_MULTIPLE_CANONICAL_LEMMAS').length,2);
});
test('different historical IDs can propose one same main dictionary card; no canonical link is committed',()=>{
 const input=novel();
 input.chapters[0].paragraphs.push({segments:[{
  wordId:'legacy-record-alt',surface:'record',gloss:'录制'
 }]});
 const r=planNovelDictionaryBindings(input,index());
 assert.deepEqual(r.legacy_binding_candidates
  .filter(x=>x.entry_id==='gdict_record').map(x=>x.legacy_word_id).sort(),
  ['legacy-record','legacy-record-alt']);
 assert.equal(r.legacy_binding_candidates.every(x=>x.status==='UNCOMMITTED_CANDIDATE'),true);
});
test('invalid old word IDs, bad surfaces, unbounded chapters fail closed without partial output',()=>{
 const input=novel();
 input.chapters[0].paragraphs[0].segments[1].wordId='../../wrong';
 assert.throws(()=>planNovelDictionaryBindings(input,index()),/INVALID_STUDY_TARGET/);
 input.chapters[0].paragraphs[0].segments[1].wordId='legacy-record';
 input.chapters[0].paragraphs[0].segments[1].surface='a big phrase';
 assert.throws(()=>planNovelDictionaryBindings(input,index()),/INVALID_STUDY_TARGET/);
});
