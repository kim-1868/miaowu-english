import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {handleHeadwordStudyApi} from '../src/global-dictionary-headword-api.js';

const ENTRY='gdict_'+'a'.repeat(24);
const N='gds_'+'b'.repeat(24);
const V='gds_'+'c'.repeat(24);
const UTC='2026-11-11T09:00:00.000Z';
const at=(days,mins=0)=>new Date(Date.parse(UTC)+days*86400000+mins*60000).toISOString();
const uuid=n=>`${String(n).padStart(8,'0')}-1234-4234-8234-123456789abc`;

class D1Local{
 constructor(db){this.raw=db}
 prepare(sql){
  const parent=this;
  return {bind(...args){return {
   first:async()=>parent.raw.prepare(sql).get(...args)??null,
   all:async()=>({results:parent.raw.prepare(sql).all(...args)}),
   run:async()=>({meta:{changes:Number(parent.raw.prepare(sql).run(...args).changes)}}),
   _run:()=>({meta:{changes:Number(parent.raw.prepare(sql).run(...args).changes)}})
  }}}
 }
 async batch(statements){
  this.raw.exec('BEGIN IMMEDIATE');
  try{const result=statements.map(s=>s._run());this.raw.exec('COMMIT');return result}
  catch(e){this.raw.exec('ROLLBACK');throw e}
 }
}
const ddl=`PRAGMA foreign_keys=ON;
CREATE TABLE users(id TEXT PRIMARY KEY);
CREATE TABLE categories(id TEXT PRIMARY KEY,is_visible INTEGER NOT NULL);
CREATE TABLE books(id TEXT PRIMARY KEY,category_id TEXT,status TEXT NOT NULL);
CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,published_at TEXT,is_preview INTEGER NOT NULL);
CREATE TABLE entitlements(user_id TEXT,category_id TEXT,source_code_id TEXT,revoked_at TEXT);
CREATE TABLE activation_codes(id TEXT PRIMARY KEY,status TEXT);
CREATE TABLE user_words(user_id TEXT,word_id TEXT,status TEXT);
CREATE TABLE global_dictionary_entries(entry_id TEXT PRIMARY KEY,headword TEXT,source_name TEXT,teaching_ready INTEGER,reviewed_at TEXT);
CREATE TABLE global_dictionary_sources(source_key TEXT PRIMARY KEY,enabled INTEGER,license_reviewed INTEGER);
CREATE TABLE global_dictionary_lessons(entry_id TEXT PRIMARY KEY,headword TEXT,senses_json TEXT,
 phonetic_uk TEXT,phonetic_us TEXT,collocations_json TEXT,reviewed_by TEXT,reviewed_at TEXT);
CREATE TABLE global_dictionary_senses(sense_id TEXT PRIMARY KEY,entry_id TEXT,pos TEXT,meaning_zh TEXT,
 example_en TEXT,example_zh TEXT,reviewed_by TEXT,reviewed_at TEXT,approved INTEGER,active INTEGER);
CREATE TABLE global_dictionary_book_sense_bindings(book_id TEXT,chapter_id TEXT,context_anchor TEXT,
 sense_id TEXT,entry_id TEXT);
`;
function fixture({approved=true,sourceEnabled=true,with019=true}={}){
 const sql=new DatabaseSync(':memory:');sql.exec(ddl);
 for(const id of ['alice','bob','charlie'])sql.prepare('INSERT INTO users VALUES(?)').run(id);
 for(const id of ['cet4','cet6'])sql.prepare('INSERT INTO categories VALUES(?,1)').run(id);
 for(const [id,cat] of [['story-a','cet4'],['story-b','cet6']])
  sql.prepare("INSERT INTO books VALUES(?,?,'published')").run(id,cat);
 for(const [id,b] of [['chapter-a','story-a'],['chapter-b','story-b']])
  sql.prepare("INSERT INTO chapters VALUES(?,?,'2026-11-01 08:00:00',0)").run(id,b);
 sql.prepare("INSERT INTO entitlements VALUES('alice','cet4','purchase-a',NULL)").run();
 sql.prepare("INSERT INTO entitlements VALUES('alice','cet6','purchase-b',NULL)").run();
 sql.prepare("INSERT INTO entitlements VALUES('bob','cet4',NULL,NULL)").run();
 for(const id of ['purchase-a','purchase-b'])sql.prepare("INSERT INTO activation_codes VALUES(?,'redeemed')").run(id);
 sql.prepare('INSERT INTO user_words VALUES(?,?,?)').run('alice','record-n','mastered');
 sql.prepare("INSERT INTO global_dictionary_entries VALUES(?,'record','source',1,'2026-11-11')").run(ENTRY);
 sql.prepare('INSERT INTO global_dictionary_sources VALUES(?,?,1)').run('source',sourceEnabled?1:0);
 const senses=[
  {pos:'n.',meaningZh:'记录',exampleEn:'She kept a record.',exampleZh:'她保存了记录。'},
  {pos:'v.',meaningZh:'录制',exampleEn:'He recorded a song.',exampleZh:'他录制了一首歌。'}
 ];
 sql.prepare('INSERT INTO global_dictionary_lessons VALUES(?,?,?,?,?,?,?,?)').run(
  ENTRY,'record',JSON.stringify(senses),'/ˈrek.ɔːd/','/ˈrek.ɚd/',
  JSON.stringify([{en:'keep a record',zh:'保留记录'}]),'editor','2026-11-11');
 for(const [sid,ix] of [[N,0],[V,1]]){
  const s=senses[ix];sql.prepare('INSERT INTO global_dictionary_senses VALUES(?,?,?,?,?,?,?,?,?,?)')
   .run(sid,ENTRY,s.pos,s.meaningZh,s.exampleEn,s.exampleZh,'publisher','2026-11-11',approved?1:0,approved?1:0);
 }
 for(const [book,ch,anchor,sid] of [['story-a','chapter-a','a:record:n',N],['story-b','chapter-b','b:record:v',V]])
  sql.prepare('INSERT INTO global_dictionary_book_sense_bindings VALUES(?,?,?,?,?)').run(book,ch,anchor,sid,ENTRY);
 if(with019)sql.exec(readFileSync(new URL('../db/019_global_dictionary_headword_study.sql',import.meta.url),'utf8'));
 return {sql,env:{APP_ENV:'staging',GLOBAL_DICTIONARY_HEADWORD_SRS_ENABLED:'true',
  GLOBAL_DICTIONARY_HEADWORD_SRS_WRITE_ENABLED:'true',DB:new D1Local(sql)}};
}
function request({user='alice',book='a',feedback=false,kind='remembered',event=1,revision=0,
 origin=true,anchor,entry=ENTRY}={}){
 const chapter=book==='a'?'chapter-a':'chapter-b';
 const context=anchor??(book==='a'?'a:record:n':'b:record:v');
 const path=`/api/me/dictionary/headwords/${entry}${feedback?'/feedback':''}`;
 const url='https://staging.example.test'+path+(feedback?'':
   `?chapterId=${encodeURIComponent(chapter)}&anchor=${encodeURIComponent(context)}`);
 const headers=feedback?{'content-type':'application/json',...(origin?{'origin':'https://staging.example.test'}:{})}:{};
 const req=new Request(url,{method:feedback?'POST':'GET',headers,
   ...(feedback?{body:JSON.stringify({chapterId:chapter,anchor:context,kind,eventId:uuid(event),
     expectedRevision:revision})}:{})});
 return {req,path,user:{id:user}};
}
async function invoke(env,opts={},clock=UTC){
 const {req,path,user}=request(opts);
 const res=await handleHeadwordStudyApi(req,env,path,user,{clock:()=>clock});
 return {code:res.status,body:await res.json()};
}

test('GET: approved multi-POS record displays ONE headword card; no D1 writes',async()=>{
 const {sql,env}=fixture();try{
  const r=await invoke(env,{book:'a'});
  assert.equal(r.code,200);
  assert.equal(r.body.card.headword,'record');
  assert.equal(r.body.card.senses.length,2);
  assert.equal(r.body.card.context_sense_id,N);
  assert.equal(r.body.card.collocations[0].en,'keep a record');
  assert.equal(r.body.study.status,'new');assert.equal(r.body.revision,0);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_headword_study').get().n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_words').get().n,1);
 }finally{sql.close()}
});
test('book A noun and B verb share 1 user+entry SRS and approved context senses',async()=>{
 const {sql,env}=fixture();try{
  let x=await invoke(env,{feedback:true,book:'a',event:1},UTC);
  assert.equal(x.code,200);assert.equal(x.body.revision,1);
  assert.equal(x.body.study.due_at,at(1));
  const b=await invoke(env,{book:'b'},at(0,1));
  assert.equal(b.code,200);assert.equal(b.body.card.context_sense_id,V);
  assert.equal(b.body.revision,1);
  assert.equal(b.body.study.due_at,at(1));
  x=await invoke(env,{feedback:true,book:'b',kind:'remembered',event:2,revision:1},at(0,2));
  assert.equal(x.code,200);assert.equal(x.body.advanced,false);
  assert.equal(x.body.study.due_at,at(1));
  const count=sql.prepare('SELECT COUNT(*) n FROM user_headword_study').get().n;
  assert.equal(count,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_headword_review_events').get().n,2);
  assert.equal(sql.prepare('SELECT status FROM user_words').get().status,'mastered');
 }finally{sql.close()}
});
test('SRS remembered on due date advances 1→3, missed shortens without mastery',async()=>{
 const {sql,env}=fixture();try{
  await invoke(env,{feedback:true,event:3});
  const x=await invoke(env,{feedback:true,event:4,revision:1},at(1));
  assert.equal(x.body.advanced,true);assert.equal(x.body.study.due_at,at(4));
  const y=await invoke(env,{feedback:true,kind:'forgotten',event:5,revision:2},at(2));
  assert.equal(y.code,200);assert.equal(y.body.study.due_at,at(3));
  assert.equal(y.body.session_requeue_after,5);
  assert.notEqual(y.body.study.status,'mastered');
 }finally{sql.close()}
});
test('idempotent replay does not increment SRS or append a second event',async()=>{
 const {sql,env}=fixture();try{
  const first=await invoke(env,{feedback:true,event:6});
  const second=await invoke(env,{feedback:true,event:6},at(0,5));
  assert.equal(first.code,200);assert.equal(second.code,200);
  assert.equal(second.body.idempotent_replay,true);
  assert.equal(second.body.revision,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_headword_review_events').get().n,1);
  const invalid=await invoke(env,{feedback:true,event:6,book:'b'},at(0,6));
  assert.equal(invalid.code,409);assert.equal(invalid.body.error,'HEADWORD_EVENT_ID_CONFLICT');
 }finally{sql.close()}
});
test('stale expectedRevision rejected; no missing or duplicate audit events',async()=>{
 const {sql,env}=fixture();try{
  const first=await invoke(env,{feedback:true,event:7});assert.equal(first.code,200);
  const stale=await invoke(env,{feedback:true,event:8,revision:0},at(1));
  assert.equal(stale.code,409);
  assert.equal(sql.prepare('SELECT revision FROM user_headword_study').get().revision,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_headword_review_events').get().n,1);
 }finally{sql.close()}
});
test('user isolation and paid category scope cannot be bypassed by guessed entryId',async()=>{
 const {sql,env}=fixture();try{
  const forbidden=await invoke(env,{user:'bob',book:'b'});assert.equal(forbidden.code,403);
  const other=await invoke(env,{user:'bob',book:'a'});assert.equal(other.code,200);
  const notOwner=await invoke(env,{user:'charlie',book:'a'});assert.equal(notOwner.code,403);
  const mutated=await invoke(env,{book:'a',anchor:'b:record:v'});assert.equal(mutated.code,403);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_headword_study').get().n,0);
 }finally{sql.close()}
});
test('revoking the purchased voucher immediately blocks learning and wordcard',async()=>{
 const {sql,env}=fixture();try{
  await invoke(env,{feedback:true,event:9});
  sql.prepare("UPDATE activation_codes SET status='revoked' WHERE id='purchase-a'").run();
  assert.equal((await invoke(env,{book:'a'})).code,403);
  assert.equal((await invoke(env,{feedback:true,book:'a',event:10,revision:1},at(1))).code,403);
  assert.equal((await invoke(env,{book:'b'})).code,200);
  assert.equal(sql.prepare('SELECT revision FROM user_headword_study').get().revision,1);
 }finally{sql.close()}
});
test('draft book, unpublished chapter and disabled category all fail closed',async()=>{
 const {sql,env}=fixture();try{
  sql.prepare("UPDATE books SET status='draft' WHERE id='story-a'").run();
  assert.equal((await invoke(env,{book:'a'})).code,403);
  sql.prepare("UPDATE books SET status='published' WHERE id='story-a'").run();
  sql.prepare("UPDATE chapters SET published_at=NULL WHERE id='chapter-a'").run();
  assert.equal((await invoke(env,{book:'a'})).code,403);
  sql.prepare("UPDATE chapters SET published_at='2026-11-01',is_preview=1 WHERE id='chapter-a'").run();
  sql.prepare("UPDATE categories SET is_visible=0 WHERE id='cet4'").run();
  assert.equal((await invoke(env,{book:'a'})).code,403);
 }finally{sql.close()}
});
test('unapproved sense and disabled source never expose card or accept feedback',async()=>{
 for(const data of [{approved:false},{sourceEnabled:false}]){
  const {sql,env}=fixture(data);try{
   assert.equal((await invoke(env,{book:'a'})).code,403);
   assert.equal((await invoke(env,{feedback:true,event:11})).code,403);
   assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_headword_study').get().n,0);
  }finally{sql.close()}
 }
});
test('only explicitly approved ACTIVE senses shown, and example tampering blocks entire lesson',async()=>{
 const {sql,env}=fixture();try{
  sql.prepare('UPDATE global_dictionary_senses SET approved=0,active=0 WHERE sense_id=?').run(V);
  const a=await invoke(env,{book:'a'});
  assert.equal(a.code,200);assert.equal(a.body.card.senses.length,1);
  assert.deepEqual(a.body.card.collocations,[]); // avoid exposing collocations of unapproved senses
  assert.equal((await invoke(env,{book:'b'})).code,403);
  sql.prepare("UPDATE global_dictionary_senses SET example_zh='伪造文本' WHERE sense_id=?").run(N);
  assert.equal((await invoke(env,{book:'a'})).code,403);
 }finally{sql.close()}
});
test('GET does not mutate. POST without same-origin or missing write flag rejects',async()=>{
 const {sql,env}=fixture();try{
  assert.equal((await invoke(env,{feedback:true,origin:false,event:12})).code,403);
  const readonly={...env,GLOBAL_DICTIONARY_HEADWORD_SRS_WRITE_ENABLED:'false'};
  assert.equal((await invoke(readonly,{feedback:true,event:13})).code,503);
  assert.equal((await invoke(readonly,{book:'a'})).code,200);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_headword_study').get().n,0);
 }finally{sql.close()}
});
test('never available in production regardless of flags; requires a real logged-in user',async()=>{
 const {sql,env}=fixture();try{
  assert.equal((await invoke({...env,APP_ENV:'production'},{book:'a'})).code,404);
  const {req,path}=request({book:'a'});
  const r=await handleHeadwordStudyApi(req,env,path,null,{clock:()=>UTC});
  assert.equal(r.status,401);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_headword_study').get().n,0);
 }finally{sql.close()}
});
test('schema missing 019 is 503; requires transactional batch for feedback',async()=>{
 const {sql,env}=fixture({with019:false});try{
  assert.equal((await invoke(env,{book:'a'})).code,503);
 }finally{sql.close()}
 const fresh=fixture();try{
  const readOnlyDb={...fresh.env.DB,batch:undefined};
  assert.equal((await invoke({...fresh.env,DB:readOnlyDb},{feedback:true,event:16})).code,503);
 }finally{fresh.sql.close()}
});
test('future user state cannot accidentally inherit legacy mastered flag',async()=>{
 const {sql,env}=fixture();try{
  assert.equal(sql.prepare('SELECT status FROM user_words WHERE user_id=?').get('alice').status,'mastered');
  const r=await invoke(env,{book:'a'});
  assert.equal(r.body.study.status,'new');
  // Actual existing-user migration is deliberately a separate, guarded review.
 }finally{sql.close()}
});
test('malformed request, fake nonapproved source and event conflicts fail closed',async()=>{
 const {sql,env}=fixture();try{
  assert.equal((await invoke(env,{book:'a',entry:'gdict_'+'e'.repeat(24)})).code,403);
  assert.equal((await invoke(env,{book:'a',anchor:'unknown'})).code,403);
  assert.equal((await invoke(env,{feedback:true,event:18,revision:-1})).code,400);
  assert.equal((await invoke(env,{feedback:true,event:19,kind:'auto_mastered'})).code,400);
  const bad=request({feedback:true,event:20});bad.req.headers.set('origin','https://attacker.test');
  const res=await handleHeadwordStudyApi(bad.req,env,bad.path,bad.user,{clock:()=>UTC});
  assert.equal(res.status,403);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_headword_study').get().n,0);
 }finally{sql.close()}
});

test('same eventId cannot be reused at a different anchor inside the same chapter',async()=>{
 const {sql,env}=fixture();try{
  sql.prepare('INSERT INTO global_dictionary_book_sense_bindings VALUES(?,?,?,?,?)')
    .run('story-a','chapter-a','a:record:another',N,ENTRY);
  const a=await invoke(env,{feedback:true,event:51});assert.equal(a.code,200);
  const b=await invoke(env,{feedback:true,event:51,revision:1,anchor:'a:record:another'});
  assert.equal(b.code,409);assert.equal(b.body.error,'HEADWORD_EVENT_ID_CONFLICT');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_headword_review_events').get().n,1);
 }finally{sql.close()}
});
test('simulated two-device race is blocked by transaction CAS and unique revision',async()=>{
 const {sql,env}=fixture();try{
  const originalBatch=env.DB.batch.bind(env.DB);
  env.DB.batch=async statements=>{
   // Another device wins while this request has already read revision=0.
   sql.prepare(`INSERT INTO user_headword_study(user_id,entry_id,status,stage,
     bookmarked,encounter_count,remembered_count,forgotten_count,due_at,
     last_seen_at,last_feedback_at,last_advanced_day,revision)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('alice',ENTRY,'learning',1,
       0,0,1,0,at(1),UTC,UTC,'2026-11-11',1);
   sql.prepare(`INSERT INTO user_headword_review_events(event_id,user_id,entry_id,
     action,source_book_id,source_chapter_id,source_context_anchor,state_revision)
     VALUES(?,?,?,?,?,?,?,?)`).run(uuid(98),'alice',ENTRY,'remembered','story-a',
      'chapter-a','a:record:n',1);
   return originalBatch(statements);
  };
  const r=await invoke(env,{feedback:true,event:99});
  assert.equal(r.code,409);
  assert.equal(sql.prepare('SELECT revision n FROM user_headword_study').get().n,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_headword_review_events').get().n,1);
 }finally{sql.close()}
});
test('add-only 019 migration preserves existing legacy tables and keys',()=>{
 const {sql}=fixture();try{
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_words').get().n,1);
  assert.throws(()=>sql.prepare('INSERT INTO user_headword_study(user_id,entry_id,stage) VALUES(?,?,6)').run('alice',ENTRY));
  const migration=readFileSync(new URL('../db/019_global_dictionary_headword_study.sql',import.meta.url),'utf8');
  assert.doesNotMatch(migration,/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+user_words/iu);
  sql.exec(migration);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM user_words').get().n,1);
 }finally{sql.close()}
});
// Additional CI-only exercise: all actual upstream 001, 013, 014, 015, 016,
// 018 schemas must accept the 019 add-only migration on a clean SQLite DB.
test('actual project 001/013–019 schemas integrate without destructive migration',()=>{
 const root=new URL('../db/001_schema.sql',import.meta.url);
 if(!existsSync(root))return; // Local minimal fixture, always present in GitHub CI.
 const db=new DatabaseSync(':memory:');try{
  const files=['001_schema.sql','013_global_dictionary.sql',
    '014_global_dictionary_bindings.sql','015_global_dictionary_book_bindings.sql',
    '016_global_dictionary_lessons.sql','017_global_dictionary_legacy_links.sql',
    '018_global_dictionary_reviewed_senses.sql',
    '019_global_dictionary_headword_study.sql'];
  for(const f of files)db.exec(readFileSync(new URL('../db/'+f,import.meta.url),'utf8'));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='user_headword_review_events'").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='user_words'").get().n,1);
 }finally{db.close()}
});