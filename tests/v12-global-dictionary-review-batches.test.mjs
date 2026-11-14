import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerExamTierIndex,selectPrivateEditorialBatch}
 from '../src/global-dictionary-review-batches.js';
import {buildPrivateReviewBatch} from '../scripts/build-private-dictionary-review-batch.mjs';
const hash=n=>String(n).padStart(64,'0');
const row=(n,headword,old=1)=>({
 candidate_hash_sha256:hash(n),headword,meaning_zh:'含义'+n,part_of_speech:'n.',
 old_word_id_count:old,books_count:old,candidate_priority_score:old*11,
 old_word_ids:Array.from({length:old},(_,i)=>'legacy'+n+'-'+i),
 example_candidates:[{example_en:'Example.',example_zh:'示例。'}],
 phonetic_uk_variants:['/example/'],phonetic_us_variants:['/example/'],
 editorial_flags:old>1?['CANDIDATE_DUPLICATE_OLD_IDS_REQUIRES_SENSE_CONFIRMATION']:[],
 approved_sense_id:null,lesson_approved:false,auto_publish_allowed:false});
const exam=()=>ownerExamTierIndex([
 {'单词':'repeat','首现层级':'高考','涉及考试':'四级,六级','全局排名':'10'},
 {'单词':'cetfour','首现层级':'四级','涉及考试':'四级','全局排名':'20'},
 {'单词':'cetsix','首现层级':'六级','涉及考试':'六级','全局排名':'30'},
 {'单词':'ieltsword','首现层级':'雅思','涉及考试':'雅思','全局排名':'40'}]);
test('balanced cohort review keeps historical reuse + tier-four + tier-six with every approval blocked',()=>{
 const records=[row(1,'repeat',4),row(2,'cetfour'),row(3,'cetsix'),row(4,'ieltsword'),row(5,'unlisted')];
 const original=JSON.stringify(records);
 const out=selectPrivateEditorialBatch(records,{examIndex:exam(),batchSize:4,
  quotas:[{quota:1},{quota:1},{quota:1},{quota:1}]});
 assert.deepEqual(out.candidates.map(x=>x.headword),['repeat','cetfour','cetsix','ieltsword']);
 assert.equal(out.summary.selected,4);
 assert.equal(out.summary.selected_old_word_id_occurrences,7);
 assert.ok(out.candidates.every(x=>x.approved_sense_id===null&&x.lesson_approved===false));
 assert.ok(out.candidates.every(x=>x.review_status==='待审核'));
 assert.equal(out.summary.learning_states_merged,false);
 assert.equal(JSON.stringify(records),original);
});
test('batch two excludes previous hashes and never duplicates canonical review candidate',()=>{
 const records=[row(1,'repeat',4),row(2,'cetfour'),row(3,'cetsix'),row(4,'ieltsword'),row(5,'unlisted')];
 const x=selectPrivateEditorialBatch(records,{examIndex:exam(),batchSize:3,excludeHashes:[hash(1),hash(2)]});
 assert.equal(x.summary.selected,3);
 assert.ok(x.candidates.every(y=>![hash(1),hash(2)].includes(y.candidate_hash_sha256)));
 const bad=[...records,{...records[1]}];
 assert.throws(()=>selectPrivateEditorialBatch(bad,{examIndex:exam()}),/DUPLICATE/);
});
test('private CSV source is used only for curriculum tier evidence, not lesson approval',()=>{
 const records=[row(1,'repeat',4),row(2,'cetfour')];
 const csv='全局排名,单词,首现层级,涉及考试\r\n10,repeat,高考,"四级,六级"\r\n20,cetfour,四级,四级\r\n';
 const got=buildPrivateReviewBatch({sourceJsonl:records.map(x=>JSON.stringify(x)).join('\n'),examCsv:csv,batchSize:2});
 assert.equal(got.summary.selected,2);
 assert.equal(got.summary.approved_lessons_created,0);
 assert.match(got.csv,/四级/);
 assert.match(got.jsonl,/"review_status":"待审核"/);
});
test('false approvals and invalid owner tiers cannot silently reach lesson batch',()=>{
 const item=row(1,'repeat');item.approved_sense_id='gds_'.padEnd(28,'a');
 assert.throws(()=>selectPrivateEditorialBatch([item],{examIndex:exam()}),/APPROVED_SENSE/);
 assert.throws(()=>ownerExamTierIndex([{'单词':'same','首现层级':'六级'},{'单词':'same','首现层级':'四级'}]),/DUPLICATE/);
});
