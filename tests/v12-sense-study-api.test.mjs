import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleSenseStudyApi} from '../src/global-dictionary-sense-study-api.js';
const ENTRY='gdict_'+'a'.repeat(24),N='gds_'+'b'.repeat(24),V='gds_'+'c'.repeat(24);
const UTC='2026-11-12T00:00:00.000Z';
const later=days=>new Date(Date.parse(UTC)+days*86400000).toISOString();
const uid=n=>`${String(n).padStart(8,'0')}-1234-4234-8234-123456789abc`;
class D1{
 constructor(raw){this.raw=raw}
 prepare(sql){const db=this.raw;return {bind(...values){return {
  first:async()=>db.prepare(sql).get(...values)??null,
  all:async()=>({results:db.prepare(sql).all(...values)}),
  _run:()=>({meta:{changes:Number(db.prepare(sql).run(...values).changes)}})
 }}}}
 async batch(statements){
  this.raw.exec('BEGIN IMMEDIATE');
  try{const values=statements.map(s=>s._run());this.raw.exec('COMMIT');return values}
  catch(e){this.raw.exec('ROLLBACK');throw e}
 }
}
const schema=`PRAGMA foreign_keys=ON;
CREATE TABLE users(id TEXT PRIMARY KEY);
CREATE TABLE categories(id TEXT PRIMARY KEY,is_visible INTEGER NOT NULL);
CREATE TABLE books(id TEXT PRIMARY KEY,category_id TEXT,status TEXT NOT NULL);
CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,published_at TEXT,is_preview INTEGER NOT NULL);
CREATE TABLE entitlements(user_id TEXT,category_id TEXT,revoked_at TEXT,source_code_id TEXT);
CREATE TABLE activation_codes(id TEXT PRIMARY KEY,status TEXT);
CREATE TABLE global_dictionary_entries(entry_id TEXT PRIMARY KEY,headword TEXT,source_name TEXT,teaching_ready INTEGER,reviewed_at TEXT);
CREATE TABLE global_dictionary_sources(source_key TEXT PRIMARY KEY,enabled INTEGER,license_reviewed INTEGER);
CREATE TABLE global_dictionary_lessons(entry_id TEXT PRIMARY KEY,senses_json TEXT,phonetic_uk TEXT,
 phonetic_us TEXT,reviewed_by TEXT,reviewed_at TEXT);
CREATE TABLE global_dictionary_senses(sense_id TEXT PRIMARY KEY,entry_id TEXT,pos TEXT,meaning_zh TEXT,
 example_en TEXT,example_zh TEXT,reviewed_by TEXT,reviewed_at TEXT,approved INTEGER,active INTEGER,
 UNIQUE(sense_id,entry_id));
CREATE TABLE global_dictionary_book_sense_bindings(book_id TEXT,chapter_id TEXT,context_anchor TEXT,
 sense_id TEXT,entry_id TEXT);
`;
function fixture({approved=true,sourceEnabled=true}={}){
 const sql=new DatabaseSync(':memory:');sql.exec(schema);
 for(const name of ['alice','bob'])sql.prepare('INSERT INTO users VALUES(?)').run(name);
 sql.prepare('INSERT INTO categories VALUES(?,1)').run('cet4');
 for(const [book,chapter] of [['a','ch-a'],['b','ch-b'],['c','ch-c']]){
  sql.prepare("INSERT INTO books VALUES(?,'cet4','published')").run('book-'+book);
  sql.prepare("INSERT INTO chapters VALUES(?,?,'2026-11-01 00:00:00',0)").run(chapter,'book-'+book);
 }
 sql.prepare("INSERT INTO activation_codes VALUES('purchase','redeemed')").run();
 sql.prepare("INSERT INTO entitlements VALUES('alice','cet4',NULL,'purchase')").run();
 sql.prepare("INSERT INTO global_dictionary_sources VALUES('source',?,1)").run(sourceEnabled?1:0);
 sql.prepare('INSERT INTO global_dictionary_entries VALUES(?,?,?,1,?)').run(
  ENTRY,'record','source','2026-11-11');
 const senses=[
  {pos:'n.',meaningZh:'记录',exampleEn:'Keep a record.',exampleZh:'保留记录。'},
  {pos:'v.',meaningZh:'录制',exampleEn:'Record a video.',exampleZh:'录制视频。'}
 ];
 sql.prepare('INSERT INTO global_dictionary_lessons VALUES(?,?,?,?,?,?)').run(
  ENTRY,JSON.stringify(senses),'/rekɔːd/','/rɛkərd/','editor','2026-11-11');
 for(const [sid,item] of [[N,senses[0]],[V,senses[1]]]){
  sql.prepare('INSERT INTO global_dictionary_senses VALUES(?,?,?,?,?,?,?,?,?,?)')
   .run(sid,ENTRY,item.pos,item.meaningZh,item.exampleEn,item.exampleZh,
    'editor','2026-11-11',approved?1:0,approved?1:0);
 }
 for(const [chapter,anchor,sid] of [['ch-a','a:record:n',N],
  ['ch-b','b:record:n',N],['ch-c','c:record:v',V]]){
  sql.prepare('INSERT INTO global_dictionary_book_sense_bindings VALUES(?,?,?,?,?)')
   .run('book-'+chapter.slice(-1),chapter,anchor,sid,ENTRY);
 }
 sql.exec(readFileSync(new URL('../db/020_global_dictionary_sense_study.sql',import.meta.url),'utf8'));
 return {sql,env:{APP_ENV:'staging',GLOBAL_DICTIONARY_SENSE_SRS_ENABLED:'true',
  GLOBAL_DICTIONARY_SENSE_SRS_WRITE_ENABLED:'true',DB:new D1(sql)}};
}
function params({sense=N,chapter='ch-a',anchor,event=1,revision=0,kind='remembered',
 feedback=false,origin=true,user='alice'}={}){
 const a=anchor??(chapter==='ch-a'?'a:record:n':chapter==='ch-b'?'b:record:n':'c:record:v');
 const path=`/api/me/dictionary/senses/${sense}${feedback?'/feedback':''}`;
 const url='https://staging.test'+path+(feedback?'':`?chapterId=${chapter}&anchor=${encodeURIComponent(a)}`);
 const req=new Request(url,{method:feedback?'POST':'GET',
  headers:feedback?{'content-type':'application/json',...(origin?{origin:'https://staging.test'}:{})}:{},
  ...(feedback?{body:JSON.stringify({chapterId:chapter,anchor:a,kind,eventId:uid(event),
    expectedRevision:revision})}:{})});
 return {req,path,user:{id:user}};
}
async function invoke(env,opts={},clock=UTC){
 const p=params(opts);const res=await handleSenseStudyApi(p.req,env,p.path,p.user,{clock:()=>clock});
 return {code:res.status,body:await res.json()};
}
test('GET reviewed sense read only; noun and verb are distinct cards',async()=>{
 const {env,sql}=fixture();try{
  const noun=await invoke(env),verb=await invoke(env,{sense:V,chapter:'ch-c'});
  assert.equal(noun.code,200);assert.equal(verb.code,200);
  assert.equal(noun.body.card.sense_id,N);assert.equal(verb.body.card.sense_id,V);
  assert.equal(noun.body.card.headword,'record');
  assert.equal(noun.body.study.status,'new');
  assert.equal(sql.prepare('SELECT count(*) n FROM user_dictionary_sense_study').get().n,0);
 }finally{sql.close()}
});
test('noun across A and B shares schedule, verb in C stays independent',async()=>{
 const {env,sql}=fixture();try{
  const first=await invoke(env,{feedback:true,event:1});
  assert.equal(first.code,200);assert.equal(first.body.revision,1);
  assert.equal(first.body.study.due_at,later(1));
  const another=await invoke(env,{chapter:'ch-b'});
  assert.equal(another.code,200);assert.equal(another.body.revision,1);
  assert.equal(another.body.study.due_at,later(1));
  const verb=await invoke(env,{sense:V,chapter:'ch-c',feedback:true,kind:'mark_mastered',event:2});
  assert.equal(verb.code,200);assert.equal(verb.body.study.mastered,true);
  assert.equal((await invoke(env)).body.study.mastered,false);
  assert.equal(sql.prepare('SELECT count(*) n FROM user_dictionary_sense_study').get().n,2);
  assert.equal(sql.prepare('SELECT count(*) n FROM user_dictionary_sense_review_events').get().n,2);
 }finally{sql.close()}
});
test('duplicate event replay safe; stale revision and changed context rejected',async()=>{
 const {env,sql}=fixture();try{
  assert.equal((await invoke(env,{feedback:true,event:3})).code,200);
  const replay=await invoke(env,{feedback:true,event:3});
  assert.equal(replay.code,200);assert.equal(replay.body.idempotent_replay,true);
  assert.equal((await invoke(env,{feedback:true,event:4,revision:0})).code,409);
  assert.equal((await invoke(env,{feedback:true,event:3,chapter:'ch-b'})).code,409);
  assert.equal(sql.prepare('SELECT count(*) n FROM user_dictionary_sense_review_events').get().n,1);
 }finally{sql.close()}
});
test('paid access revoked, different user, unapproved and disabled-source blocked',async()=>{
 const {env,sql}=fixture();try{
  assert.equal((await invoke(env,{user:'bob'})).code,403);
  sql.prepare("UPDATE activation_codes SET status='revoked'").run();
  assert.equal((await invoke(env)).code,403);
  assert.equal((await invoke(env,{feedback:true})).code,403);
 }finally{sql.close()}
 for(const config of [{approved:false},{sourceEnabled:false}]){
  const {env,sql}=fixture(config);try{
   assert.equal((await invoke(env)).code,403);
   assert.equal((await invoke(env,{feedback:true})).code,403);
  }finally{sql.close()}
 }
});
test('disabled, production, wrong Origin and no transactional batch fail closed',async()=>{
 const {env,sql}=fixture();try{
  assert.equal((await invoke({...env,APP_ENV:'production'})).code,404);
  assert.equal((await invoke({...env,GLOBAL_DICTIONARY_SENSE_SRS_ENABLED:'false'})).code,503);
  assert.equal((await invoke({...env,GLOBAL_DICTIONARY_SENSE_SRS_WRITE_ENABLED:'false'},{feedback:true})).code,503);
  assert.equal((await invoke(env,{feedback:true,origin:false})).code,403);
  const db=env.DB;assert.equal((await invoke({...env,DB:{prepare:db.prepare.bind(db)}},{feedback:true})).code,503);
  assert.equal(sql.prepare('SELECT count(*) n FROM user_dictionary_sense_study').get().n,0);
 }finally{sql.close()}
});

test('concurrent revision advance never records a dangling audit event',async()=>{
 const {env,sql}=fixture();try{
  const original=env.DB;
  const competing={prepare:original.prepare.bind(original),
   batch:async operations=>{
    // Another device successfully committed revision 1 before this transaction.
    sql.prepare(`INSERT INTO user_dictionary_sense_study
     (user_id,sense_id,status,stage,bookmarked,encounter_count,remembered_count,
      forgotten_count,due_at,last_seen_at,last_feedback_at,last_advanced_day,
      mastered_at,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
     .run('alice',N,'learning',1,0,0,1,0,later(1),UTC,UTC,UTC.slice(0,10),null,1);
    sql.prepare(`INSERT INTO user_dictionary_sense_review_events
      (event_id,user_id,sense_id,entry_id,action,source_book_id,source_chapter_id,
       source_context_anchor,state_revision) VALUES(?,?,?,?,?,?,?,?,?)`)
     .run(uid(99),'alice',N,ENTRY,'remembered','book-a','ch-a','a:record:n',1);
    return original.batch(operations);
   }};
  const result=await invoke({...env,DB:competing},{feedback:true,event:98});
  assert.equal(result.code,503);
  assert.equal(sql.prepare('SELECT count(*) n FROM user_dictionary_sense_review_events').get().n,1);
  assert.equal(sql.prepare('SELECT revision FROM user_dictionary_sense_study').get().revision,1);
 }finally{sql.close()}
});
