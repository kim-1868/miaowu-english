import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {applySenseReview,setSenseManualState,studyScheduleReady} from "../src/study-schedule-store.js";
const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const T=s=>new Date(s);
function setup({migrated=true}={}){
 const db=new DatabaseSync(":memory:");
 db.exec(file("db/001_schema.sql"));
 if(migrated)db.exec(file("db/011_v11_study_schedules.sql"));
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES ('u1','test_1','hash','salt'),('u2','test_2','hash','salt')");
 db.exec("INSERT INTO categories(id,slug,title,is_visible) VALUES ('cet4','cet4','四级',1)");
 db.exec("INSERT INTO books(id,category_id,title,status) VALUES ('book1','cet4','Novel A','published'),('book2','cet4','Novel B','published')");
 db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES"+
  "('c1','book1',1,'One','{}','2026-01-01 00:00:00'),('c2','book2',1,'Two','{}','2026-01-01 00:00:00')");
 db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('u1','cet4'),('u2','cet4')");
 db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES"+
  "('w1','evidence','n.','证据；根据'),('w2','evidence','n.','证据；根据'),"+
  "('w3','evidence','v.','证明；证实'),('w4','sustain','v.','维持')");
 db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
  "('c1','w1','First evidence.','a'),('c2','w2','Second evidence.','a'),"+
  "('c2','w3','She can evidence that.','b'),('c1','w4','We sustain it.','b')");
 const adapter={
  prepare(query){return {bind(...args){
   const stmt=db.prepare(query);
   return {async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},
    async run(){return stmt.run(...args)}};
  }}},
  async batch(statements){
   db.exec("BEGIN");
   try{const result=[];for(const st of statements)result.push(await st.run());db.exec("COMMIT");return result}
   catch(e){db.exec("ROLLBACK");throw e}
  }
 };
 const env={DB:adapter};
 const review=({wordId="w1",time="2026-11-06T10:00:00.000Z",correct=true,result=correct?"correct":"incorrect",userId="u1",mode="bookplate-flip",id=randomUUID(),chapterId=null,addBookmarkOnWrong=false}={})=>
  applySenseReview(env,{userId,wordId,gameType:mode,eventId:id,chapterId,correct,result,now:T(time),addBookmarkOnWrong});
 const manual=(args={})=>setSenseManualState(env,{
  userId:"u1",wordId:"w1",status:"learning",bookmarked:true,now:T("2026-11-06T08:00:00Z"),...args
 });
 const row=(id="w1",userId="u1")=>db.prepare("SELECT * FROM user_words WHERE user_id=? AND word_id=?").get(userId,id);
 const schedule=(userId="u1")=>db.prepare("SELECT * FROM user_study_schedules WHERE user_id=? ORDER BY study_key").all(userId);
 return {db,env,review,manual,row,schedule};
}
test("P4 011 schema is additive/repeatable and unavailable before explicit migration",async()=>{
 const a=setup({migrated:false});
 try{
  assert.equal(await studyScheduleReady(a.env),false);
  await assert.rejects(a.review(),/STUDY_SCHEDULE_NOT_READY/);
  assert.equal(a.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,0);
  a.db.exec(file("db/011_v11_study_schedules.sql"));
  a.db.exec(file("db/011_v11_study_schedules.sql"));
  assert.equal(await studyScheduleReady(a.env),true);
  assert.equal(a.schedule().length,0);
 }finally{a.db.close()}
});
test("P4 passive book-saving never creates active successful review or a due date",async()=>{
 const a=setup();
 try{
  const x=await a.manual();
  assert.equal(x.status,"learning");
  assert.equal(a.schedule().length,1);
  assert.equal(a.schedule()[0].due_at,null);
  assert.equal(a.row().due_at,null);
  assert.equal(a.row("w2").bookmarked,1,"all accessible aliases share saved status");
  assert.equal(a.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,0);
 }finally{a.db.close()}
});
test("P4 identical study senses share one schedule across books, distinct POS keeps its own",async()=>{
 const a=setup();
 try{
  const x=await a.review();
  assert.equal(x.nextReviewDays,1);
  assert.equal(a.schedule().length,1);
  assert.equal(a.row("w1").due_at,a.row("w2").due_at);
  const second=await a.review({wordId:"w2",time:"2026-11-06T15:00:00Z",mode:"story-echo-fill"});
  assert.equal(second.nextDueAt,x.nextDueAt,"same-day re-answer does not postpone");
  assert.equal(a.schedule().length,1);
  assert.equal(a.db.prepare("SELECT count(*) n FROM review_events").get().n,2);
  await a.review({wordId:"w3",time:"2026-11-06T10:00:00Z"});
  assert.equal(a.schedule().length,2,"different grammatical sense has separate card");
  assert.equal(a.schedule()[0].mastered,0);
 }finally{a.db.close()}
});
test("P4 1/3/7/14/30-day progression across separate games, no automatic mastery",async()=>{
 const a=setup();
 try{
  let current=await a.review({wordId:"w4"});
  const expected=[3,7,14,30,30];
  for(let n=0;n<expected.length;n++){
   current=await a.review({wordId:"w4",time:current.nextDueAt,
    mode:n%2?"bookplate-spell":"story-echo-fill"});
   assert.equal(current.nextReviewDays,expected[n]);
   assert.equal(current.status,"learning");
  }
  assert.equal(a.schedule()[0].stage_index,4);
  assert.equal(a.schedule()[0].mastered,0);
  assert.equal(a.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,6);
 }finally{a.db.close()}
});
test("P4 failures pull due earlier, same-day repeat advances only once",async()=>{
 const a=setup();
 try{
  let x=await a.review({wordId:"w4",time:"2026-11-06T08:00:00Z"});
  const first=x.nextDueAt;
  x=await a.review({wordId:"w4",time:"2026-11-06T09:00:00Z",correct:false});
  assert.ok(Date.parse(x.nextDueAt)<Date.parse(first));
  const back=await a.review({wordId:"w4",time:"2026-11-06T11:00:00Z"});
  assert.equal(back.status,"learning");
  assert.equal(a.schedule()[0].mastered,0);
 }finally{a.db.close()}
});
test("P4 preserves legacy mastery, bookmark and earliest due on first hydration",async()=>{
 const a=setup();
 try{
  a.db.exec("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES"+
   "('u1','w1','learning',1,'2026-11-09 09:00:00'),"+
   "('u1','w2','learning',0,'2026-11-08 08:00:00')");
  const x=await a.review({wordId:"w1",time:"2026-11-06T10:00:00Z"});
  assert.equal(x.nextDueAt,"2026-11-08T08:00:00.000Z","earliest legacy due is retained until due");
  assert.equal(x.bookmarked,true);
  a.db.exec("UPDATE user_words SET status='mastered',due_at=NULL WHERE word_id='w2'");
  const b=setup();
  try{
   b.db.exec("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES"+
    "('u1','w1','learning',1,'2026-11-09 09:00:00'),('u1','w2','mastered',0,NULL)");
   const kept=await b.review({correct:false});
   assert.equal(kept.status,"mastered");
   assert.equal(kept.nextDueAt,null);
   assert.equal(b.row("w1").status,"mastered");
   assert.equal(b.row("w2").status,"mastered");
   assert.equal(b.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,1);
   const reset=await b.manual({status:"learning",bookmarked:false});
   assert.equal(reset.status,"learning");
   assert.equal(reset.bookmarked,false);
   assert.ok(reset.nextDueAt,"only explicit unmaster returns to learning");
  }finally{b.db.close()}
 }finally{a.db.close()}
});
test("P4 one user's history cannot leak into another and duplicate event rolls back atomically",async()=>{
 const a=setup();
 try{
  const uuid=randomUUID();
  await a.review({id:uuid});
  const before=a.schedule()[0].due_at;
  await assert.rejects(a.review({id:uuid,correct:false,time:"2026-11-06T13:00:00Z"}));
  assert.equal(a.schedule()[0].due_at,before);
  assert.equal(a.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,1);
  const other=await a.review({userId:"u2",time:"2026-11-07T10:00:00Z"});
  assert.equal(other.nextReviewDays,1);
  assert.equal(a.schedule("u2").length,1);
  assert.equal(a.schedule()[0].due_at,before);
  assert.equal(a.db.prepare("SELECT count(*) n FROM review_events WHERE user_id='u2'").get().n,1);
 }finally{a.db.close()}
});
