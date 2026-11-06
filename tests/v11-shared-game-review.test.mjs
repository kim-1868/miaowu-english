import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {handleLearningState} from "../src/reading-library.js";
import {handleEcho} from "../src/echo-cloud.js";
const load=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec(load("db/001_schema.sql"));
 db.exec(load("db/011_v11_study_schedules.sql"));
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES('u1','reader_1','a','b')");
 db.exec("INSERT INTO categories(id,slug,title,is_visible) VALUES('cat','cet4','英语四级',1)");
 db.exec("INSERT INTO books(id,category_id,title,status) VALUES('b1','cat','A','published'),('b2','cat','B','published')");
 db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES"+
  "('c1','b1',1,'One','{}','2026-01-01 00:00:00'),('c2','b2',1,'Two','{}','2026-01-01 00:00:00')");
 db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES"+
  "('w1','evidence','n.','证据；依据'),('w2','evidence','n.','证据；依据'),"+
  "('w3','evidence','v.','证明；证实')");
 db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
  "('c1','w1','First evidence.','a'),('c2','w2','Different evidence.','a'),"+
  "('c2','w3','Proof to evidence.','b')");
 db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('u1','cat')");
 const adapter={
  prepare(q){return {bind(...params){const st=db.prepare(q);return {
   async first(){return st.get(...params)||null},async all(){return {results:st.all(...params)}},
   async run(){return st.run(...params)}};
  }}},
  async batch(stmts){db.exec("BEGIN");try{
   const a=[];for(const stmt of stmts)a.push(await stmt.run());db.exec("COMMIT");return a;
  }catch(e){db.exec("ROLLBACK");throw e}}
 };
 const env={DB:adapter},user={id:"u1"};
 const call=async(path,body=null)=>{
  const req=new Request("https://mw.test"+path,{method:body?"POST":"GET",
   headers:body?{"Content-Type":"application/json"}:{},
   ...(body?{body:JSON.stringify(body)}:{})});
  const response=path.startsWith("/api/me/echo")?
   await handleEcho(req,env,new URL(req.url).pathname,user):
   await handleLearningState(req,env,new URL(req.url).pathname,user);
  return {status:response.status,body:await response.json()};
 };
 const edit=async(id,payload)=>{
  const path="/api/me/words/"+id,req=new Request("https://mw.test"+path,{
   method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const response=await handleLearningState(req,env,path,user);
  return {status:response.status,body:await response.json()};
 };
 return {db,call,edit};
}
test("V1.1 P4 all three actual answer routes use the SAME user+sense schedule",async()=>{
 const f=fixture();
 try{
  let x=await f.edit("w1",{bookmarked:true,status:"learning"});
  assert.equal(x.status,200,JSON.stringify(x.body));
  assert.equal(f.db.prepare("SELECT count(*) n FROM user_study_schedules").get().n,1);
  assert.equal(f.db.prepare("SELECT due_at FROM user_words WHERE word_id='w1'").get().due_at,null);
  x=await f.call("/api/me/flashcards/answer",{wordId:"w1",mode:"flip",judgment:"known",requestId:randomUUID()});
  assert.equal(x.status,200,JSON.stringify(x.body));
  assert.equal(x.body.nextReviewDays,1);
  const initial=f.db.prepare("SELECT due_at FROM user_study_schedules").get().due_at;
  assert.ok(initial);
  x=await f.call("/api/me/quick-review",{wordId:"w2",chapterId:"c2",remembered:true});
  assert.equal(x.status,200,JSON.stringify(x.body));
  assert.equal(f.db.prepare("SELECT due_at FROM user_study_schedules").get().due_at,initial,
   "same-day correct in another novel cannot postpone");
  x=await f.call("/api/me/echo/answer",{
   wordId:"w1",chapterId:"c1",gameType:"spell",answer:"evidence",hinted:false});
  assert.equal(x.status,200,JSON.stringify(x.body));
  assert.equal(f.db.prepare("SELECT due_at FROM user_study_schedules").get().due_at,initial,
   "Story Echo shares interval with flip and quick review");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,3);
  assert.equal(f.db.prepare("SELECT count(*) n FROM user_study_schedules").get().n,1);
  assert.equal(f.db.prepare("SELECT status FROM user_words WHERE word_id='w2'").get().status,"learning");
 }finally{f.db.close()}
});
test("V1.1 P4 a wrong answer does not auto-unmaster an explicitly mastered sense",async()=>{
 const f=fixture();
 try{
  await f.edit("w1",{bookmarked:true,status:"mastered"});
  const answer=await f.call("/api/me/echo/answer",{
   wordId:"w2",chapterId:"c2",gameType:"spell",answer:"invalid",hinted:false});
  assert.equal(answer.status,200);
  assert.equal(answer.body.correct,false);
  assert.equal(answer.body.status,"mastered");
  assert.equal(f.db.prepare("SELECT status FROM user_words WHERE word_id='w1'").get().status,"mastered");
  assert.equal(f.db.prepare("SELECT due_at FROM user_study_schedules").get().due_at,null);
  await f.edit("w2",{bookmarked:true,status:"learning"});
  assert.equal(f.db.prepare("SELECT status FROM user_words WHERE word_id='w1'").get().status,"learning");
  assert.ok(f.db.prepare("SELECT due_at FROM user_study_schedules").get().due_at);
 }finally{f.db.close()}
});
test("V1.1 P4 completed chapters and unlocked categories remain necessary for Story Echo questions",async()=>{
 const f=fixture();
 try{
  await f.edit("w1",{bookmarked:true,status:"learning"});
  const denied=await f.call("/api/me/echo/answer",{
   wordId:"w1",chapterId:"unknown",gameType:"spell",answer:"evidence",hinted:false});
  assert.equal(denied.status,403);
  assert.equal(f.db.prepare("SELECT count(*) n FROM review_events").get().n,0);
 }finally{f.db.close()}
});
