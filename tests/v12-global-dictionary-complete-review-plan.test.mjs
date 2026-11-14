import test from 'node:test';
import assert from 'node:assert/strict';
import {planAllPrivateEditorialBatches} from '../src/global-dictionary-complete-review-plan.js';
import {ownerExamTierIndex} from '../src/global-dictionary-review-batches.js';
const id=n=>n.toString(16).padStart(64,'0');
const card=n=>({candidate_hash_sha256:id(n),headword:'lesson'+n,
 meaning_zh:'意思'+n,part_of_speech:'n.',old_word_id_count:n%3+1,
 books_count:n%3+1,candidate_priority_score:n,
 old_word_ids:Array.from({length:n%3+1},(_,i)=>'old-'+n+'-'+i),
 example_candidates:[{example_en:'Example.',example_zh:'例句。'}],
 phonetic_uk_variants:['/a/'],phonetic_us_variants:['/a/'],
 approved_sense_id:null,lesson_approved:false,auto_publish_allowed:false});
const records=()=>Array.from({length:11},(_,i)=>card(i+1));
const exams=()=>ownerExamTierIndex(Array.from({length:11},(_,i)=>({
 单词:'lesson'+(i+1),首现层级:i%2?'四级':'六级',
 涉及考试:'四级,六级',全局排名:String(i+1)})));
test('complete 11-sense plan preserves first three and exhausts exactly once',()=>{
 const input=records(),before=JSON.stringify(input);
 const first=[input[4],input[1],input[0]];
 const x=planAllPrivateEditorialBatches(input,{
  examIndex:exams(),firstBatch:first,batchSize:4});
 assert.equal(x.summary.scheduled_sense_candidates,11);
 assert.deepEqual(x.batches.map(b=>b.length),[3,4,4]);
 assert.deepEqual(x.batches[0].map(r=>r.candidate_hash_sha256),
  first.map(r=>r.candidate_hash_sha256));
 assert.equal(new Set(x.batches.flat().map(r=>r.candidate_hash_sha256)).size,11);
 assert.ok(x.batches.flat().every(r=>r.approved_sense_id===null&&
  !r.lesson_approved&&!r.auto_publish_allowed));
 assert.equal(x.summary.production_d1_writes,0);
 assert.equal(JSON.stringify(input),before);
});
test('without a seed, independent reviewer cohorts still cover all candidates',()=>{
 const x=planAllPrivateEditorialBatches(records(),{examIndex:exams(),batchSize:4});
 assert.deepEqual(x.batches.map(b=>b.length),[4,4,3]);
 assert.equal(x.summary.total_legacy_card_references,
  records().reduce((n,r)=>n+r.old_word_id_count,0));
});
test('reject duplicate, unknown, and already-approved identities',()=>{
 const source=records(),args={examIndex:exams(),batchSize:4};
 assert.throws(()=>planAllPrivateEditorialBatches(source,{
  ...args,firstBatch:[source[0],source[0]]}),/FIRST_BATCH/);
 assert.throws(()=>planAllPrivateEditorialBatches(source,{
  ...args,firstBatch:[{candidate_hash_sha256:id(98)}]}),/FIRST_BATCH/);
 assert.throws(()=>planAllPrivateEditorialBatches(source,{
  ...args,firstBatch:source.slice(0,5)}),/OVER_CAPACITY/);
 assert.throws(()=>planAllPrivateEditorialBatches([...source,source[1]],args),/SOURCE_HASH_DUPLICATE/);
 const signed=records();signed[0].lesson_approved=true;
 assert.throws(()=>planAllPrivateEditorialBatches(signed,args),/SOURCE_HASH_DUPLICATE_OR_REVIEWED/);
});
