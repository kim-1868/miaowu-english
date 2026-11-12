import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleSenseStudyApi} from '../src/global-dictionary-sense-study-api.js';
import {fingerprintLegacyWordCard} from '../src/global-dictionary-published-approved-legacy-overlay.js';
const ENTRY='gdict_'+'a'.repeat(24),SENSE='gds_'+'b'.repeat(24);
const clock='2026-11-12T12:00:00.000Z';
const uid=n=>String(n).padStart(8,'0')+'-1234-4234-8234-123456789abc';
class D1{
 constructor(raw){this.raw=raw}
 prepare(q){const db=this.raw;return {bind(...v){return {
  first:async()=>db.prepare(q).get(...v)??null,
  all:async()=>({results:db.prepare(q).all(...v)}),
  _run:()=>({meta:{changes:Number(db.prepare(q).run(...v).changes)}})
 }}}}
 async batch(statements){
  this.raw.exec('BEGIN IMMEDIATE');
  try{const out=statements.map(s=>s._run());this.raw.exec('COMMIT');return out}
  catch(e){this.raw.exec('ROLLBACK');throw e}
 }
}
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE users(id TEXT PRIMARY KEY);
 CREATE TABLE categories(id TEXT PRIMARY KEY,is_visible INTEGER NOT NULL);
 CREATE TABLE books(id TEXT PRIMARY KEY,category_id TEXT,status TEXT NOT NULL);
 CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,published_at TEXT,is_preview INTEGER NOT NULL);
 CREATE TABLE words(id TEXT PRIMARY KEY,headword TEXT,phonetic_uk TEXT,phonetic_us TEXT,
  part_of_speech TEXT,meaning_zh TEXT,example_en TEXT,example_zh TEXT,collocations_json TEXT);
 CREATE TABLE chapter_words(chapter_id TEXT,context_anchor TEXT,word_id TEXT);
 CREATE TABLE entitlements(user_id TEXT,category_id TEXT,revoked_at TEXT,source_code_id TEXT);
 CREATE TABLE activation_codes(id TEXT PRIMARY KEY,status TEXT);
 CREATE TABLE global_dictionary_sources(source_key TEXT PRIMARY KEY,enabled INTEGER,license_reviewed INTEGER);
 CREATE TABLE global_dictionary_entries(entry_id TEXT PRIMARY KEY,headword TEXT,source_name TEXT,
  teaching_ready INTEGER,reviewed_at TEXT);
 CREATE TABLE global_dictionary_lessons(entry_id TEXT PRIMARY KEY,senses_json TEXT,phonetic_uk TEXT,
  phonetic_us TEXT,reviewed_by TEXT,reviewed_at TEXT);
 CREATE TABLE global_dictionary_senses(sense_id TEXT PRIMARY KEY,entry_id TEXT,pos TEXT,
  meaning_zh TEXT,example_en TEXT,example_zh TEXT,reviewed_by TEXT,reviewed_at TEXT,
  approved INTEGER,active INTEGER,UNIQUE(sense_id,entry_id));
 CREATE TABLE global_dictionary_legacy_sense_links(legacy_word_id TEXT PRIMARY KEY,
  sense_id TEXT,old_card_sha256 TEXT,reviewed_by TEXT,reviewed_at TEXT);
 CREATE TABLE global_dictionary_book_bindings(book_id TEXT,chapter_id TEXT,context_anchor TEXT,
  legacy_word_id TEXT,entry_id TEXT);
 CREATE TABLE global_dictionary_book_sense_bindings(book_id TEXT,chapter_id TEXT,
  context_anchor TEXT,sense_id TEXT,entry_id TEXT);
 `);
 sql.prepare("INSERT INTO categories VALUES ('cet4',1)").run();
 sql.prepare("INSERT INTO users VALUES('reader')").run();
 for(const [b,ch,w] of [['book-a','ch-a','old-a'],['book-b','ch-b','old-b']]){
  sql.prepare("INSERT INTO books VALUES (?,'cet4','published')").run(b);
  sql.prepare("INSERT INTO chapters VALUES (?,?,?,0)").run(ch,b,'2026-11-01 00:00:00');
  sql.prepare("INSERT INTO words VALUES (?,?,?,?,?,?,?,?,?)")
   .run(w,'record','/r/','/r/','n.','记录',
    'I kept a record.','我保留了记录。','[]');
  sql.prepare("INSERT INTO chapter_words VALUES (?,'p0:s0',?)").run(ch,w);
 }
 sql.prepare("INSERT INTO activation_codes VALUES('sale','redeemed')").run();
 sql.prepare("INSERT INTO entitlements VALUES('reader','cet4',NULL,'sale')").run();
 sql.prepare("INSERT INTO global_dictionary_sources VALUES('owned',1,1)").run();
 sql.prepare("INSERT INTO global_dictionary_entries VALUES(?,?,?,1,?)")
  .run(ENTRY,'record','owned','2026-11-11');
 const lesson={pos:'n.',meaningZh:'记录',exampleEn:'Keep a record.',
  exampleZh:'保留记录。'};
 sql.prepare("INSERT INTO global_dictionary_lessons VALUES(?,?,?,?,?,?)")
  .run(ENTRY,JSON.stringify([lesson]),'/r/','/r/','editor','2026-11-11');
 sql.prepare("INSERT INTO global_dictionary_senses VALUES(?,?,?,?,?,?,?,?,?,?)")
  .run(SENSE,ENTRY,'n.','记录',lesson.exampleEn,lesson.exampleZh,
   'editor','2026-11-11',1,1);
 sql.exec(readFileSync(new URL('../db/020_global_dictionary_sense_study.sql',import.meta.url),'utf8'));
 return {sql,env:{
  APP_ENV:'staging',GLOBAL_DICTIONARY_SENSE_SRS_ENABLED:'true',
  GLOBAL_DICTIONARY_SENSE_SRS_WRITE_ENABLED:'true',
  GLOBAL_DICTIONARY_PUBLISHED_LEGACY_PREVIEW_ENABLED:'true',
  DB:new D1(sql)}};
}
async function link(sql){
 for(const id of ['old-a','old-b']){
  const w=sql.prepare('SELECT * FROM words WHERE id=?').get(id);
  const sha=await fingerprintLegacyWordCard({
   legacy_word_id:w.id,old_headword:w.headword,old_uk:w.phonetic_uk,
   old_us:w.phonetic_us,old_pos:w.part_of_speech,old_meaning:w.meaning_zh,
   old_en:w.example_en,old_zh:w.example_zh,old_collocations:w.collocations_json
  });
  sql.prepare('INSERT INTO global_dictionary_legacy_sense_links VALUES(?,?,?,?,?)')
   .run(id,SENSE,sha,'authenticated-editor','2026-11-12');
 }
}
async function call(env,chapter,{feedback=false,event=1,user='reader',anchor='p0:s0'}={}){
 const path='/api/me/dictionary/senses/'+SENSE+(feedback?'/feedback':'');
 const url='https://staging.test'+path+(feedback?'':('?chapterId='+chapter+'&anchor='+anchor));
 const req=new Request(url,feedback?{
  method:'POST',headers:{origin:'https://staging.test','content-type':'application/json'},
  body:JSON.stringify({chapterId:chapter,anchor,eventId:uid(event),
   kind:'remembered',expectedRevision:0})
 }:{method:'GET'});
 const r=await handleSenseStudyApi(req,env,path,{id:user},{clock:()=>clock});
 return {status:r.status,data:await r.json()};
}
test('published old book A -> B shares approved sense_id and learning schedule',async()=>{
 const {sql,env}=setup();try{
  await link(sql);
  const first=await call(env,'ch-a');
  assert.equal(first.status,200);
  assert.equal(first.data.card.sense_id,SENSE);
  const one=await call(env,'ch-a',{feedback:true,event:1});
  assert.equal(one.status,200);
  assert.equal(one.data.revision,1);
  const two=await call(env,'ch-b');
  assert.equal(two.status,200);
  assert.equal(two.data.revision,1);
  assert.equal(two.data.study.due_at,one.data.study.due_at);
  assert.equal(sql.prepare('SELECT count(*) n FROM user_dictionary_sense_study').get().n,1);
  assert.equal(sql.prepare('SELECT count(*) n FROM user_dictionary_sense_review_events').get().n,1);
  const path='/api/me/dictionary/chapters/ch-b/sense-anchors';
  const req=new Request('https://staging.test'+path);
  const list=await handleSenseStudyApi(req,env,path,{id:'reader'});
  assert.equal(list.status,200);
  assert.deepEqual((await list.json()).anchors,[{
   anchor:'p0:s0',entry_id:ENTRY,sense_id:SENSE}]);
  assert.equal(sql.prepare('SELECT count(*) n FROM chapter_words').get().n,2);
 }finally{sql.close()}
});
test('unauthorized, revoked, unlicensed, tampered or disabled overlay never reads/writes',async()=>{
 const {sql,env}=setup();try{
  await link(sql);
  assert.equal((await call(env,'ch-a',{user:'intruder'})).status,403);
  assert.equal((await call({...env,GLOBAL_DICTIONARY_PUBLISHED_LEGACY_PREVIEW_ENABLED:'false'},'ch-a')).status,403);
  assert.equal((await call({...env,APP_ENV:'production'},'ch-a')).status,404);
  sql.prepare("UPDATE global_dictionary_sources SET license_reviewed=0").run();
  assert.equal((await call(env,'ch-a')).status,403);
  sql.prepare("UPDATE global_dictionary_sources SET license_reviewed=1").run();
  sql.prepare("UPDATE words SET example_en='Different example.' WHERE id='old-a'").run();
  assert.equal((await call(env,'ch-a')).status,403);
  const fail=await call(env,'ch-a',{feedback:true,event:2});
  assert.equal(fail.status,403);
  sql.prepare("UPDATE activation_codes SET status='revoked'").run();
  assert.equal((await call(env,'ch-b')).status,403);
  assert.equal(sql.prepare('SELECT count(*) n FROM user_dictionary_sense_study').get().n,0);
 }finally{sql.close()}
});
test('original SRS routes remain staging-only with explicit two write gates',()=>{
 const api=readFileSync('src/global-dictionary-sense-study-api.js','utf8');
 assert.match(api,/GLOBAL_DICTIONARY_PUBLISHED_LEGACY_PREVIEW_ENABLED/);
 assert.match(api,/GLOBAL_DICTIONARY_SENSE_SRS_WRITE_ENABLED/);
 assert.match(api,/if\(env\?\.APP_ENV!=='staging'\)/);
 const overlay=readFileSync('src/global-dictionary-published-approved-legacy-overlay.js','utf8');
 assert.match(overlay,/old_card_sha256/);
 assert.ok(overlay.includes('src.license_reviewed=1'));
});
