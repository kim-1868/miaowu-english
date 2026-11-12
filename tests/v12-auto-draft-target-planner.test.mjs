import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGlobalDictionaryIndex} from '../src/global-dictionary-matcher.js';
import {planDraftNovelAutomaticTargets as plan} from '../src/global-dictionary-auto-draft-target-planner.js';
const E='gdict_'+'a'.repeat(24),S='gds_'+'b'.repeat(24);
const index=()=>buildGlobalDictionaryIndex({entries:[
 {entry_id:E,headword:'record',teaching_ready:true}]});
const lesson=()=>({entry_id:E,headword:'record',
 reviewed_by:'editor',reviewed_at:'2026-11-12T12:00:00Z',
 phonetic_uk:'/rek/',phonetic_us:'/rek/',
 part_of_speech:'n.',meaning_zh:'记录',
 example_en:'Please keep a record.',example_zh:'请保留记录。',
 collocations_json:'[]',senses_json:JSON.stringify([{pos:'n.',meaningZh:'记录',
  exampleEn:'Please keep a record.',exampleZh:'请保留记录。'}])});
const approved=()=>[{
 entry_id:E,sense_id:S,approved:1,active:1,
 reviewed_by:'editor',reviewed_at:'2026-11-12T12:00:00Z',
 source_license_reviewed:true,
 pos:'n.',meaning_zh:'记录',
 example_en:'Please keep a record.',example_zh:'请保留记录。'
}];
const novel=()=>({version:2,book:{id:'test-book',category:'cet4'},
 chapters:[{number:1,paragraphs:[{segments:[
 {text:'她记下了一条 Record。发送到 https://record.example/path 和 help@record.org 不算。'},
 {text:'第二次出现 record 和 recording。'}]}]}]});
test('auto discovers exact approved card while preserving manuscript, masking URLs and ambiguous inflections',()=>{
 const source=novel(),before=JSON.stringify(source);
 const r=plan(source,index(),{[E]:lesson()},{approvedSenses:approved()});
 assert.equal(r.proposals.length,2);
 assert.deepEqual(r.proposals.map(x=>x.surface),['Record','record']);
 assert.equal(r.proposals[0].sense_id,S);
 assert.ok(r.proposals.every(x=>x.patch_applied===false&&
   x.status==='PROVISIONAL_UNVERIFIED_CONTEXT'));
 assert.ok(r.pending.some(x=>x.headword==='recording'));
 assert.equal(r.source_manuscript_modified,false);
 assert.equal(r.publisher_release_allowed,false);
 assert.equal(JSON.stringify(source),before);
});
test('multiple approved meanings fail closed, no unjustified sense chosen',()=>{
 const senses=approved();
 senses.push({...senses[0],sense_id:'gds_'+'c'.repeat(24),
  pos:'v.',meaning_zh:'录制',example_en:'Record the meeting.',
  example_zh:'录制会议。'});
 const r=plan(novel(),index(),{[E]:lesson()},{approvedSenses:senses});
 assert.equal(r.proposals.length,0);
 assert.ok(r.pending.some(x=>x.reason==='UNIQUE_APPROVED_LICENSED_SENSE_NOT_PROVEN'));
});
test('unlicensed or unreviewed dictionary evidence never becomes study target',()=>{
 const unlicensed=approved().map(x=>({...x,source_license_reviewed:false}));
 const r=plan(novel(),index(),{[E]:lesson()},{approvedSenses:unlicensed});
 assert.equal(r.proposals.length,0);
 assert.equal(r.approved_context_bindings_created,0);
 const noReview=plan(novel(),index(),{},{approvedSenses:approved()});
 assert.equal(noReview.proposals.length,0);
});
test('bounded result count never auto modifies or auto publishes',()=>{
 const r=plan(novel(),index(),{[E]:lesson()},
  {approvedSenses:approved(),maxSuggestions:1});
 assert.equal(r.proposals.length,1);
 assert.equal(r.summary.auto_limit_reached,true);
 assert.equal(r.novel_upload_committed,false);
 assert.equal(r.converted_package_generated,false);
});
test('invalid packages and unsupported category refuse',()=>{
 const broken=novel();broken.book.category='invalid category';
 assert.throws(()=>plan(broken,index(),{[E]:lesson()},{approvedSenses:approved()}));
});
