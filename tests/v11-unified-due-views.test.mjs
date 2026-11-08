import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {projectStudySenseRows} from '../src/study-identity.js';
import {handleLearningState} from '../src/reading-library.js';
import {handleEcho} from '../src/echo-cloud.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(read('db/001_schema.sql'));
 db.exec(read('db/011_v11_study_schedules.sql'));
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES"+
  "('u1','reader_one','hash','salt'),('u2','reader_two','hash','salt')");
 db.exec("INSERT INTO categories(id,slug,title,is_visible) VALUES"+
  "('cat4','cet4','四级',1),('cat6','cet6','六级',1)");
 db.exec("INSERT INTO books(id,category_id,title,status) VALUES"+
  "('booka','cat4','A','published'),('bookb','cat4','B','published'),"+
  "('locked','cat6','Locked','published')");
 db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES"+
  "('ch-a','booka',1,'One','{}','2026-01-01 00:00:00'),"+
  "('ch-b','bookb',1,'Two','{}','2026-01-01 00:00:00'),"+
  "('ch-locked','locked',1,'Three','{}','2026-01-01 00:00:00')");
 db.exec("INSERT INTO entitlements(user_id,category_id) VALUES ('u1','cat4')");
 db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES"+
  "('wa','record','n.','记录；档案'),('wb','record','n.','记录'),"+
  "('wc','record','v.','录制'),('wd','sustain','v.','维持')");
 db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
  "('ch-a','wa','A record remains.','a'),('ch-b','wb','Keep a record.','a'),"+
  "('ch-b','wc','They record a message.','b'),('ch-locked','wd','Sustain the story.','a')");
 db.exec("INSERT INTO reading_progress(user_id,chapter_id,progress,completed_at) VALUES"+
  "('u1','ch-a',1,'2026-11-01 00:00:00'),('u1','ch-b',1,'2026-11-01 00:00:00')");
 const adapter={
  prepare(query){return {bind(...args){
   const st=db.prepare(query);
   return {async first(){return st.get(...args)||null},
    async all(){return {results:st.all(...args)}},
    async run(){return st.run(...args)}};
  }}},
  async batch(statements){db.exec('BEGIN');try{
   const output=[];for(const st of statements)output.push(await st.run());
   db.exec('COMMIT');return output;
  }catch(error){db.exec('ROLLBACK');throw error}}
 };
 const env={DB:adapter};
 const call=async(path,{method='GET',payload=null,userId='u1'}={})=>{
  const request=new Request('https://miaowu.test'+path,{method,
   ...(payload?{headers:{'content-type':'application/json'},body:JSON.stringify(payload)}:{})});
  const fn=path.startsWith('/api/me/echo')?handleEcho:handleLearningState;
  const response=await fn(request,env,new URL(request.url).pathname,{id:userId});
  return {status:response.status,data:await response.json()};
 };
 const insert=(id,status='learning',bookmarked=0,due='2026-01-01 00:00:00',userId='u1')=>
  db.prepare('INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES(?,?,?,?,?)')
   .run(userId,id,status,bookmarked,due);
 return {db,env,call,insert};
}
test('P4 stale due alias never overrides mastered in home, flashcards or Story Echo',async()=>{
 const f=fixture();try{
  f.insert('wa','mastered',1,null);
  f.insert('wb','learning',0);
  const home=await f.call('/api/me/words');
  const echo=await f.call('/api/me/echo/stats');
  const flash=await f.call('/api/me/flashcards?scope=due&size=20');
  const available=await f.call('/api/me/echo/available?scope=due');
  const mastered=await f.call('/api/me/flashcards?scope=mastered');
  assert.equal(home.data.flashDue,0);
  assert.equal(echo.data.due,0);
  assert.equal(flash.data.total,0);
  assert.equal(available.data.distinctWords,0);
  assert.equal(mastered.data.total,1);
  assert.equal(mastered.data.words[0].status,'mastered');
 }finally{f.db.close()}
});
test('P4 explicit canonical unmaster overrides legacy mastered and exposes one due item in three UIs',async()=>{
 const f=fixture();try{
  f.insert('wa','mastered',1,null);
  f.insert('wb','learning',0);
  const key='sense:record|n|记录';
  f.db.prepare('INSERT INTO user_study_schedules(user_id,study_key,stage_index,due_at,mastered,bookmarked) VALUES(?,?,?,?,?,?)')
   .run('u1',key,0,'2026-01-01 00:00:00',0,1);
  assert.equal((await f.call('/api/me/words')).data.flashDue,1);
  assert.equal((await f.call('/api/me/echo/stats')).data.due,1);
  const flash=await f.call('/api/me/flashcards?scope=due&size=20');
  assert.equal(flash.data.total,1);
  assert.equal(flash.data.words[0].status,'learning');
  const available=await f.call('/api/me/echo/available?scope=due');
  assert.equal(available.data.distinctWords,1);
 }finally{f.db.close()}
});
test('P4 same spelling with different POS is an independent due sense',async()=>{
 const f=fixture();try{
  f.insert('wa','mastered',1,null);
  f.insert('wb','learning',0);
  f.insert('wc','learning',0);
  const due=await f.call('/api/me/flashcards?scope=due');
  assert.equal(due.data.total,1);
  assert.equal(due.data.words[0].part_of_speech,'v.');
  assert.equal((await f.call('/api/me/echo/stats')).data.due,1);
  assert.equal((await f.call('/api/me/echo/available?scope=due')).data.distinctWords,1);
 }finally{f.db.close()}
});
test('P4 unentitled-category and another account never enter due read model',async()=>{
 const f=fixture();try{
  f.insert('wd','learning',0);
  f.insert('wa','learning',0,'2026-01-01 00:00:00','u2');
  assert.equal((await f.call('/api/me/flashcards?scope=due')).data.total,0);
  assert.equal((await f.call('/api/me/words')).data.flashDue,0);
  assert.equal((await f.call('/api/me/echo/stats')).data.due,0);
 }finally{f.db.close()}
});
test('P4 submitting quick-flashcard answer moves due to future for every interface',async()=>{
 const f=fixture();try{
  f.insert('wa','learning',1);
  f.insert('wb','learning',0);
  assert.equal((await f.call('/api/me/flashcards?scope=due')).data.total,1);
  const answered=await f.call('/api/me/flashcards/answer',{method:'POST',payload:{
   wordId:'wb',mode:'flip',judgment:'known',requestId:randomUUID()}});
  assert.equal(answered.status,200,JSON.stringify(answered.data));
  assert.equal(answered.data.correct,true);
  assert.equal((await f.call('/api/me/echo/stats')).data.due,0);
  assert.equal((await f.call('/api/me/words')).data.flashDue,0);
  assert.equal((await f.call('/api/me/flashcards?scope=due')).data.total,0);
  assert.equal((await f.call('/api/me/echo/available?scope=due')).data.distinctWords,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM user_study_schedules').get().n,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM review_events').get().n,1);
 }finally{f.db.close()}
});
test('P4 pure projection processes all aliases before filtering and respects schedule bookmark removal',()=>{
 const rows=[
  {word_id:'b',headword:'record',part_of_speech:'n.',meaning_zh:'记录',status:'learning',bookmarked:1,due_at:'2026-01-01 00:00:00'},
  {word_id:'a',headword:'record',part_of_speech:'n.',meaning_zh:'记录',status:'mastered',bookmarked:0,due_at:null}
 ];
 assert.equal(projectStudySenseRows(rows,[],'due').length,0);
 assert.equal(projectStudySenseRows(rows,[],'mastered').length,1);
 const plan=[{study_key:'sense:record|n|记录',mastered:0,bookmarked:0,due_at:'2026-01-01 00:00:00'}];
 assert.equal(projectStudySenseRows(rows,plan,'due').length,1);
 assert.equal(projectStudySenseRows(rows,plan,'saved').length,0);
});

test('P4 bookmarked wordbook displays mastered even if the bookmarked alias is stale learning',async()=>{
 const f=fixture();try{
  f.insert('wa','mastered',0,null);
  f.insert('wb','learning',1);
  const wordbook=await f.call('/api/me/words');
  assert.equal(wordbook.status,200);
  assert.equal(wordbook.data.words.length,1);
  assert.equal(wordbook.data.words[0].status,'mastered');
  assert.equal(wordbook.data.words[0].study_key,'sense:record|n|记录');
  assert.equal(wordbook.data.flashDue,0);
  assert.equal((await f.call('/api/me/flashcards?scope=mastered')).data.total,1);
 }finally{f.db.close()}
});
test('P4 after explicit unbookmark canonical false, old bookmarked alias must not show in wordbook',async()=>{
 const f=fixture();try{
  f.insert('wa','learning',1);
  const key='sense:record|n|记录';
  f.db.prepare('INSERT INTO user_study_schedules(user_id,study_key,mastered,bookmarked) VALUES(?,?,0,0)').run('u1',key);
  const r=await f.call('/api/me/words');
  assert.equal(r.data.words.length,0);
  assert.equal((await f.call('/api/me/flashcards?scope=saved')).data.total,0);
 }finally{f.db.close()}
});

test('P5 wordbook shows explicitly bookmarked study sense even when every legacy alias has bookmarked=0',async()=>{
 const f=fixture();try{
  f.insert('wa','learning',0);
  f.insert('wb','learning',0);
  f.db.prepare('INSERT INTO user_study_schedules(user_id,study_key,stage_index,due_at,mastered,bookmarked) VALUES(?,?,?,?,?,?)')
   .run('u1','sense:record|n|记录',0,'2026-01-01 00:00:00',0,1);
  const result=await f.call('/api/me/words');
  assert.equal(result.status,200);
  assert.equal(result.data.words.length,1);
  assert.equal(result.data.words[0].bookmarked,1);
  assert.equal(result.data.words[0].study_key,'sense:record|n|记录');
  assert.equal(result.data.words[0].context_sentence,'A record remains.');
  assert.equal(result.data.words[0].headword,'record');
  assert.equal(result.data.flashDue,1);
  assert.equal((await f.call('/api/me/flashcards?scope=saved')).data.total,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM user_words WHERE bookmarked=1').get().n,0,
   'read model must not write legacy rows');
 }finally{f.db.close()}
});
test('P5 wordbook does not leak newly bookmarked study words from an unentitled book',async()=>{
 const f=fixture();try{
  f.insert('wd','learning',0);
  f.db.prepare('INSERT INTO user_study_schedules(user_id,study_key,stage_index,due_at,mastered,bookmarked) VALUES(?,?,?,?,?,?)')
   .run('u1','sense:sustain|v|维持',0,'2026-01-01 00:00:00',0,1);
  const result=await f.call('/api/me/words');
  assert.equal(result.data.words.length,0);
  assert.equal(result.data.flashDue,0);
 }finally{f.db.close()}
});

test('P5 Echo due finds same approved-looking sense in completed B even when only old A word ID was studied',async()=>{
 const f=fixture();try{
  f.insert('wa','learning',1,'2026-01-01 00:00:00');
  // The owner studied in A, but has only completed B; B uses a different
  // wordId for the same (headword, POS, first teaching meaning) identity.
  f.db.exec("DELETE FROM reading_progress WHERE chapter_id='ch-a'");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM user_words WHERE word_id='wb'").get().n,0);
  const due=await f.call('/api/me/echo/available?scope=due');
  assert.equal(due.status,200,JSON.stringify(due.data));
  assert.equal(due.data.distinctWords,1);
  assert.equal(due.data.words[0].word_id,'wb');
  assert.equal(due.data.words[0].chapter_id,'ch-b');
  assert.equal(due.data.words[0].headword,'record');
  assert.equal((await f.call('/api/me/flashcards?scope=due')).data.total,1);
  assert.equal((await f.call('/api/me/echo/stats')).data.due,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM user_words").get().n,1,
    'due query must never seed history or change an alias');
 }finally{f.db.close()}
});
test('P5 Echo due never merges the same English spelling with a different part-of-speech',async()=>{
 const f=fixture();try{
  f.insert('wa','learning',1,'2026-01-01 00:00:00');
  f.db.exec("DELETE FROM reading_progress WHERE chapter_id='ch-a'");
  const due=await f.call('/api/me/echo/available?scope=due');
  assert.equal(due.data.distinctWords,1);
  assert.equal(due.data.words[0].word_id,'wb');
  assert.equal(due.data.words[0].part_of_speech,'n.');
  assert.ok(!due.data.words.some(w=>w.word_id==='wc'));
 }finally{f.db.close()}
});
test('P5 Echo due scans past 600 wrong-POS occurrences to find a later completed valid synonym alias',async()=>{
 const f=fixture();try{
  f.insert('wa','learning',1,'2026-01-01 00:00:00');
  f.db.exec("DELETE FROM reading_progress WHERE chapter_id='ch-a'");
  const insert=f.db.prepare("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES('ch-b','wc',?,?)");
  for(let i=0;i<620;i++)insert.run('Repeated verb record occurrence','0'+String(i).padStart(4,'0'));
  const due=await f.call('/api/me/echo/available?scope=due');
  assert.equal(due.status,200);
  assert.equal(due.data.distinctWords,1,"600 earlier verb usages must not hide the due noun");
  assert.equal(due.data.words[0].word_id,'wb');
  assert.equal(due.data.words[0].chapter_id,'ch-b');
  assert.ok(!due.data.words.some(w=>w.word_id==='wc'));
 }finally{f.db.close()}
});
test('P5 Echo due respects revoked category and completed-chapter gates with cross-book candidate IDs',async()=>{
 const f=fixture();try{
  f.insert('wa','learning',0,'2026-01-01 00:00:00');
  f.db.exec("DELETE FROM reading_progress WHERE chapter_id='ch-a'");
  f.db.exec("UPDATE entitlements SET revoked_at=CURRENT_TIMESTAMP WHERE user_id='u1'");
  const result=await f.call('/api/me/echo/available?scope=due');
  assert.equal(result.data.distinctWords,0);
  assert.equal((await f.call('/api/me/echo/stats')).data.due,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM user_words").get().n,1);
 }finally{f.db.close()}
});
