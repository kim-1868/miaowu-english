import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStagingNovelMatch,handleOpsImportPreflight} from '../src/ops-import-preflight.js';

const manuscript={
 version:1,book:{id:'cat-story-six',category:'cet6',title:'六级新小说'},
 chapters:[{id:'part-1',number:1,paragraphs:[
  {segments:[{text:'在路上，She saw something.'},
   {wordId:'legacy-lead',surface:'lead',gloss:'带领'},
   {text:' Then they record the result.'}]}
 ]}]
};
const queryDb=(records)=>{
 const calls=[];
 return {calls,prepare(sql){
   if(!sql.startsWith('SELECT '))throw Error('NON_READ_ONLY_SQL_ATTEMPT');
   calls.push(sql);
   return {bind(...values){
     return {async all(){
       return {results:records.filter(r=>values.includes(r.headword.toLowerCase()))};
     }};
   }};
 }};
};

test('staging inspector returns existing legacy vocab without touching manuscript or SQLite',async()=>{
 const db=queryDb([
  {entry_id:'old-lead-one',headword:'lead'},
  {entry_id:'old-lead-two',headword:'lead'},
  {entry_id:'old-record',headword:'record'},
  {entry_id:'old-result',headword:'result'}
 ]);
 const initial=structuredClone(manuscript);
 const result=await inspectStagingNovelMatch({DB:db},manuscript);
 assert.equal(result.category,'cet6');
 assert.equal(result.dictionary_index_ready,false);
 assert.equal(result.ready_to_publish,false);
 assert.equal(result.release_blocked,true);
 assert.equal(result.summary.target_unique,1);
 assert.equal(result.targets[0].status,'needs_review');
 assert.equal(result.targets[0].reason,'AMBIGUOUS_HEADWORD_OR_INFLECTION');
 assert.deepEqual(result.targets[0].legacy_word_ids,['legacy-lead']);
 assert.ok(result.discovered.some(x=>x.normalized_surface==='record'&&
    x.status==='dictionary_only'));
 assert.deepEqual(manuscript,initial);
 assert.ok(db.calls.length>=1);
 assert.ok(db.calls.every(sql=>sql.startsWith('SELECT ')));
});

test('even a unique old word with complete fields is not falsely marked teaching-approved',async()=>{
 const doc=structuredClone(manuscript);
 doc.chapters[0].paragraphs[0].segments=[{
  wordId:'old-record',surface:'record',gloss:'录制'
 }];
 const db=queryDb([{entry_id:'old-record',headword:'record',
  phonetic_uk:'/re-kord/',phonetic_us:'/ri-kord/',
  meaning_zh:'记录',part_of_speech:'n./v.',
  example_en:'The teacher recorded her lesson.',
  example_zh:'老师录下了课堂。'}]);
 const r=await inspectStagingNovelMatch({DB:db},doc);
 assert.equal(r.targets[0].status,'dictionary_only');
 assert.equal(r.targets[0].entry_id,'old-record');
 assert.equal(r.release_blocked,true);
});

test('existing production and other environments never expose the preflight endpoint',async()=>{
 const req=new Request('https://example.com/api/ops/import/preflight',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify(manuscript)});
 for(const app of ['production','test','development']){
   const r=await handleOpsImportPreflight(req,{APP_ENV:app},'/api/ops/import/preflight');
   assert.equal(r.status,404);
 }
});

test('staging preflight requires independent operator token even if novel is valid',async()=>{
 const req=new Request('https://example.com/api/ops/import/preflight',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify(manuscript)});
 const r=await handleOpsImportPreflight(req,{
  APP_ENV:'staging',OPS_TOKEN_PEPPER:'a'.repeat(64),DB:queryDb([])
 },'/api/ops/import/preflight');
 assert.equal(r.status,401);
 assert.equal((await r.json()).error,'OPS_AUTH_REQUIRED');
});

test('staging preflight rejects unsupported method or route',async()=>{
 const req=new Request('https://example.com/api/ops/import/preflight',{method:'GET'});
 const r=await handleOpsImportPreflight(req,{APP_ENV:'staging'},
  '/api/ops/import/preflight');
 assert.equal(r.status,404);
});

test('first scan is bounded: oversized and malformed inputs fail before any D1 lookups',async()=>{
 const db=queryDb([]);
 await assert.rejects(()=>inspectStagingNovelMatch({DB:db},{
  book:{id:'bad',category:'cet4'},chapters:[{number:0,paragraphs:[]}]
 }),/INVALID_NOVEL_CHAPTER/);
 assert.equal(db.calls.length,0);
});
