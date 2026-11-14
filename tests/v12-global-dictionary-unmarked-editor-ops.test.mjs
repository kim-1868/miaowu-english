import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import {inspectStagingUnmarkedEditorWorkflow} from '../src/global-dictionary-unmarked-editor-ops.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const R='gdict_'+'a'.repeat(24),N='gds_'+'a'.repeat(24),V='gds_'+'b'.repeat(24);
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`
 CREATE TABLE global_dictionary_sources(source_key TEXT PRIMARY KEY,enabled INTEGER,license_reviewed INTEGER);
 CREATE TABLE global_dictionary_entries(entry_id TEXT PRIMARY KEY,headword TEXT,teaching_ready INTEGER,reviewed_at TEXT,source_name TEXT);
 CREATE TABLE global_dictionary_forms(form TEXT,entry_id TEXT,source_name TEXT,reviewed INTEGER);
 CREATE TABLE global_dictionary_lessons(entry_id TEXT PRIMARY KEY,headword TEXT,senses_json TEXT,phonetic_uk TEXT,phonetic_us TEXT,part_of_speech TEXT,meaning_zh TEXT,example_en TEXT,example_zh TEXT,collocations_json TEXT,reviewed_by TEXT,reviewed_at TEXT);
 CREATE TABLE global_dictionary_senses(sense_id TEXT PRIMARY KEY,entry_id TEXT,pos TEXT,meaning_zh TEXT,reviewed_by TEXT,reviewed_at TEXT,approved INTEGER,active INTEGER);
 INSERT INTO global_dictionary_sources VALUES ('synthetic-mit',1,1);
 `);
 const dates='2026-11-11T00:00:00Z';
 sql.prepare('INSERT INTO global_dictionary_entries VALUES(?,?,?,?,?)').run(R,'record',1,dates,'synthetic-mit');
 const senses=[{pos:'n.',meaningZh:'记录',exampleEn:'Keep a record.',exampleZh:'保留记录。'},
  {pos:'v.',meaningZh:'录制',exampleEn:'They record a video.',exampleZh:'他们录制视频。'}];
 sql.prepare('INSERT INTO global_dictionary_lessons VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
  R,'record',JSON.stringify(senses),'/test/','/test/','n./v.','记录；录制',
  'Keep a record.','保留记录。','[]','editor',dates);
 sql.prepare('INSERT INTO global_dictionary_senses VALUES(?,?,?,?,?,?,?,?)').run(N,R,'n.','记录','editor',dates,1,1);
 sql.prepare('INSERT INTO global_dictionary_senses VALUES(?,?,?,?,?,?,?,?)').run(V,R,'v.','录制','editor',dates,1,1);
 const db={prepare(query){const p=sql.prepare(query);return {
    all:async()=>({results:p.all()}),
    bind(...vals){return {all:async()=>({results:p.all(...vals)}),first:async()=>p.get(...vals)}}
 }}};
 const env={APP_ENV:'staging',GLOBAL_DICTIONARY_LOOKUP_ENABLED:'true',DB:db};
 const source={version:2,book:{id:'novel-test',title:'测试故事',category:'cet4'},chapters:[
 {id:'chapter-test',number:1,title:'第一章',preview:true,paragraphs:[
  {segments:[{text:'她将 record 保存在文件夹。然后 record 一段视频。'}]}
 ]}]};
 return {sql,env,source,close:()=>sql.close()};
}
const options=p=>p.anchors.map((a,i)=>({chapter_number:a.chapter_number,
 paragraph_index:a.paragraph_index,segment_index:a.segment_index,
 start_offset:a.start_offset,entry_id:a.entry_id,sense_id:i?V:N,confirmed:true}));

test('actual DB-backed OPS helper prepares editor-review token choices, without changing records',async()=>{
 const f=fixture();try{
  const before=f.sql.prepare('SELECT total_changes() n').get().n;
  const p=await inspectStagingUnmarkedEditorWorkflow(f.env,{package:f.source});
  assert.equal(p.approved_word_candidates,2);
  assert.equal(p.total_detected,2);
  assert.equal(p.publication_allowed,false);
  assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);
  assert.equal(p.anchors[0].approved_sense_options.length,2);
 }finally{f.close()}
});
test('approved actual D1 identities and editor choices can produce V2+V1 compatible drafts',async()=>{
 const f=fixture();try{
  const p=await inspectStagingUnmarkedEditorWorkflow(f.env,{package:f.source});
  const before=f.sql.prepare('SELECT total_changes() n').get().n;
  const r=await inspectStagingUnmarkedEditorWorkflow(f.env,{
   package:f.source,source_sha256:p.source_sha256,plan_sha256:p.plan_sha256,
   decisions:options(p)}, {confirm:true});
  assert.equal(r.status,'EDITOR_CONFIRMED_V2_DRAFT_NOT_PUBLISHED');
  assert.equal(r.selected_occurrences,2);
  assert.equal(r.verified_v1_package.words.length,1);
  assert.deepEqual(r.marked_v2_package.chapters[0].paragraphs[0].segments
   .filter(s=>s.surface).map(s=>s.gloss),['记录','录制']);
  assert.equal(r.d1_writes,0);
  assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);
 }finally{f.close()}
});
test('disabled source or unapproved teaching sense cannot generate bound learning targets',async()=>{
 const f=fixture();try{
  f.sql.exec('UPDATE global_dictionary_sources SET license_reviewed=0');
  const p=await inspectStagingUnmarkedEditorWorkflow(f.env,{package:f.source});
  assert.equal(p.approved_word_candidates,0);
  f.sql.exec('UPDATE global_dictionary_sources SET license_reviewed=1');
  f.sql.exec('UPDATE global_dictionary_senses SET approved=0');
  const q=await inspectStagingUnmarkedEditorWorkflow(f.env,{package:f.source});
  assert.equal(q.approved_word_candidates,0);
 }finally{f.close()}
});
test('staging gate and reviewed sense schema are mandatory',async()=>{
 const f=fixture();try{
  await assert.rejects(()=>inspectStagingUnmarkedEditorWorkflow({...f.env,APP_ENV:'production'},
    {package:f.source}),/DICTIONARY_V2_NOT_ENABLED/);
  await assert.rejects(()=>inspectStagingUnmarkedEditorWorkflow({...f.env,GLOBAL_DICTIONARY_LOOKUP_ENABLED:'false'},
    {package:f.source}),/DICTIONARY_V2_NOT_ENABLED/);
  f.sql.exec('DROP TABLE global_dictionary_senses');
  await assert.rejects(()=>inspectStagingUnmarkedEditorWorkflow(f.env,
    {package:f.source}),/REVIEWED_SENSE_SCHEMA_REQUIRED/);
 }finally{f.close()}
});
test('client-injected cards and false Publisher approval cannot affect DB-recomputed review',async()=>{
 const f=fixture();try{
  const p=await inspectStagingUnmarkedEditorWorkflow(f.env,{package:f.source});
  const tampered={package:f.source,source_sha256:p.source_sha256,plan_sha256:p.plan_sha256,
   decisions:[{...options(p)[0],publisher_approved:true}],
   index:{byWord:[{headword:'record',teaching_ready:true}]},
   senses:[{approved:1,entry_id:R}],lessons:[{reviewed_by:'client'}]};
  await assert.rejects(()=>inspectStagingUnmarkedEditorWorkflow(f.env,tampered,{confirm:true}),
   /INVALID_EDITOR_CONTEXT_DECISION/);
 }finally{f.close()}
});