import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {listReviewedReaderSenseAnchors} from '../src/global-dictionary-reader-sense-anchors.js';
import {handleSenseStudyApi} from '../src/global-dictionary-sense-study-api.js';
import {readFileSync} from 'node:fs';
const ENTRY='gdict_'+'a'.repeat(24),SENSE='gds_'+'b'.repeat(24);
const lesson=[{pos:'n.',meaningZh:'记录',exampleEn:'Keep a record.',exampleZh:'保留记录。'}];
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE users(id TEXT PRIMARY KEY);
 CREATE TABLE books(id TEXT PRIMARY KEY,status TEXT,category_id TEXT);
 CREATE TABLE categories(id TEXT PRIMARY KEY,is_visible INTEGER);
 CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,is_preview INTEGER,published_at TEXT);
 CREATE TABLE activation_codes(id TEXT PRIMARY KEY,status TEXT);
 CREATE TABLE entitlements(user_id TEXT,category_id TEXT,revoked_at TEXT,source_code_id TEXT);
 CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT,context_anchor TEXT);
 CREATE TABLE global_dictionary_entries(entry_id TEXT PRIMARY KEY,source_name TEXT,teaching_ready INTEGER,reviewed_at TEXT);
 CREATE TABLE global_dictionary_sources(source_key TEXT PRIMARY KEY,enabled INTEGER,license_reviewed INTEGER);
 CREATE TABLE global_dictionary_lessons(entry_id TEXT PRIMARY KEY,reviewed_by TEXT,reviewed_at TEXT,phonetic_uk TEXT,phonetic_us TEXT,senses_json TEXT);
 CREATE TABLE global_dictionary_senses(sense_id TEXT PRIMARY KEY,entry_id TEXT,approved INTEGER,active INTEGER,reviewed_by TEXT,reviewed_at TEXT,
 pos TEXT,meaning_zh TEXT,example_en TEXT,example_zh TEXT);
 CREATE TABLE global_dictionary_book_bindings(book_id TEXT,chapter_id TEXT,context_anchor TEXT,legacy_word_id TEXT,entry_id TEXT);
 CREATE TABLE global_dictionary_book_sense_bindings(book_id TEXT,chapter_id TEXT,context_anchor TEXT,sense_id TEXT,entry_id TEXT);`);
 sql.prepare("INSERT INTO users VALUES('alice'),('bob')").run();
 sql.prepare("INSERT INTO categories VALUES('cet4',1)").run();
 sql.prepare("INSERT INTO books VALUES('book-a','published','cet4')").run();
 sql.prepare("INSERT INTO chapters VALUES('c1','book-a',0,'2025-01-01')").run();
 sql.prepare("INSERT INTO activation_codes VALUES('order','redeemed')").run();
 sql.prepare("INSERT INTO entitlements VALUES('alice','cet4',NULL,'order')").run();
 sql.prepare("INSERT INTO chapter_words VALUES('c1','old','p0:s1')").run();
 sql.prepare("INSERT INTO global_dictionary_sources VALUES('licensed',1,1)").run();
 sql.prepare('INSERT INTO global_dictionary_entries VALUES(?,?,1,?)').run(ENTRY,'licensed','2026-11-01');
 sql.prepare('INSERT INTO global_dictionary_lessons VALUES(?,?,?,?,?,?)').run(ENTRY,'editor','2026-11-01','/r/','/r/',JSON.stringify(lesson));
 sql.prepare('INSERT INTO global_dictionary_senses VALUES(?,?,?,?,?,?,?,?,?,?)').run(
  SENSE,ENTRY,1,1,'editor','2026-11-01','n.','记录','Keep a record.','保留记录。');
 sql.prepare('INSERT INTO global_dictionary_book_bindings VALUES(?,?,?,?,?)').run('book-a','c1','p0:s1','old',ENTRY);
 sql.prepare('INSERT INTO global_dictionary_book_sense_bindings VALUES(?,?,?,?,?)').run('book-a','c1','p0:s1',SENSE,ENTRY);
 const db={prepare(text){return {bind(...params){return {all:async()=>({results:sql.prepare(text).all(...params)})}}}}};
 return {sql,db,close:()=>sql.close()};
}
test('one verified sense anchor serves authorized user and no customer state write',async()=>{
 const f=fixture();try{
  const r=await listReviewedReaderSenseAnchors(f.db,{chapterId:'c1',userId:'alice'});
  assert.deepEqual(r.anchors,[{anchor:'p0:s1',entry_id:ENTRY,sense_id:SENSE}]);
  assert.equal(r.study_identity,'sense_id');assert.equal(r.d1_writes,0);
  assert.equal((await listReviewedReaderSenseAnchors(f.db,{chapterId:'c1',userId:'bob'})).anchors.length,0);
 }finally{f.close()}
});
test('revoked entitlement and unapproved or incomplete lesson never yield anchor',async()=>{
 const sqls=[
  "UPDATE activation_codes SET status='revoked'",
  "UPDATE global_dictionary_sources SET license_reviewed=0",
  "UPDATE global_dictionary_senses SET approved=0",
  "UPDATE global_dictionary_lessons SET senses_json='[]'",
  "UPDATE global_dictionary_lessons SET phonetic_us=''",
  "DELETE FROM chapter_words",
  "UPDATE books SET status='draft'",
  "UPDATE chapters SET published_at=NULL"
 ];
 for(const statement of sqls){
  const f=fixture();try{
   f.sql.exec(statement);
   const blocked=statement.includes('senses_json');
   if(blocked)await assert.rejects(
    ()=>listReviewedReaderSenseAnchors(f.db,{chapterId:'c1',userId:'alice'}),
    /SENSE_READER_INVALID_OR_AMBIGUOUS_APPROVED_ANCHOR/);
   else assert.equal((await listReviewedReaderSenseAnchors(f.db,{
    chapterId:'c1',userId:'alice'})).anchors.length,0,statement);
  }finally{f.close()}
 }
});
test('duplicate sense binding in same context must not invent a unique sense',async()=>{
 const f=fixture();try{
  f.sql.prepare('INSERT INTO global_dictionary_book_sense_bindings VALUES(?,?,?,?,?)').run(
   'book-a','c1','p0:s1',SENSE,ENTRY);
  await assert.rejects(()=>listReviewedReaderSenseAnchors(f.db,{
   chapterId:'c1',userId:'alice'}),/SENSE_READER_INVALID_OR_AMBIGUOUS_APPROVED_ANCHOR/);
 }finally{f.close()}
});
test('reader endpoint remains inaccessible in production and with missing feature flag',async()=>{
 const f=fixture();try{
  const path='/api/me/dictionary/chapters/c1/sense-anchors';
  const req=new Request('https://staging.example.test'+path);
  const baseline={DB:f.db,APP_ENV:'staging',GLOBAL_DICTIONARY_SENSE_SRS_ENABLED:'true'};
  const invoke=async env=>{
   const res=await handleSenseStudyApi(req,env,path,{id:'alice'});
   return {status:res.status,body:await res.json()};
  };
  const r=await invoke(baseline);
  assert.equal(r.status,200);assert.equal(r.body.anchors[0].sense_id,SENSE);
  assert.equal((await invoke({...baseline,APP_ENV:'production'})).status,404);
  assert.equal((await invoke({...baseline,GLOBAL_DICTIONARY_SENSE_SRS_ENABLED:'false'})).status,503);
  assert.equal((await invoke({...baseline,GLOBAL_DICTIONARY_SENSE_SRS_ENABLED:undefined})).status,503);
 }finally{f.close()}
});
test('new routes do not silently replace old headword reader endpoints',()=>{
 const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
 assert.ok(worker.includes('sense-anchors'));
 assert.match(worker,/handleHeadwordStudyApi\(req,env,path,user\)/);
 assert.match(worker,/handleSenseStudyApi\(req,env,path,user\)/);
});
