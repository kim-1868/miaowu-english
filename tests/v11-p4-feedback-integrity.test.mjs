import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {Script} from "node:vm";
import {handleLearningState} from "../src/reading-library.js";
import {handleEcho} from "../src/echo-cloud.js";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec(read("db/001_schema.sql"));
 db.exec(read("db/011_v11_study_schedules.sql"));
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES('u1','first','a','b')");
 db.exec("INSERT INTO categories(id,slug,title,is_visible) VALUES ('c4','cet4','四级',1),('c6','cet6','六级',1)");
 db.exec("INSERT INTO books(id,category_id,title,status) VALUES('b4','c4','Unlocked','published'),('b6','c6','Locked','published')");
 db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES"+
   "('ch4','b4',1,'One','{}','2026-01-01 00:00:00'),"+
   "('ch6','b6',1,'Locked','{}','2026-01-01 00:00:00')");
 db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES"+
   "('w1','record','n.','记录'),('w2','record','n.','记录；档案'),"+
   "('w3','record','v.','录制'),('w4','record','v.','提交记录')");
 db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
   "('ch4','w1','A record was lost.','a'),('ch4','w2','Another record.','b'),"+
   "('ch4','w3','They record sounds.','c'),('ch6','w4','Locked record.','a')");
 db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('u1','c4')");
 db.exec("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES"+
   "('u1','w1','learning',1,'2026-01-01 00:00:00'),"+
   "('u1','w2','learning',1,'2026-01-01 00:00:00'),"+
   "('u1','w3','learning',1,'2026-01-01 00:00:00')");
 const adapter={prepare(query){return {bind(...params){const stmt=db.prepare(query);return {
   async first(){return stmt.get(...params)||null},
   async all(){return {results:stmt.all(...params)}},
   async run(){return stmt.run(...params)}
 }}}},async batch(stmts){
   db.exec("BEGIN");try{const results=[];for(const s of stmts)results.push(await s.run());db.exec("COMMIT");return results}
   catch(e){db.exec("ROLLBACK");throw e}
 }};
 const env={DB:adapter},user={id:"u1"};
 const call=async(path,body,method="POST")=>{
  const req=new Request("https://miaowu.test"+path,{method,headers:{"Content-Type":"application/json"},
   body:body?JSON.stringify(body):undefined});
  const response=path.startsWith("/api/me/echo")?
   await handleEcho(req,env,new URL(req.url).pathname,user):
   await handleLearningState(req,env,new URL(req.url).pathname,user);
  return {status:response.status,body:await response.json()};
 };
 return {db,call};
}
test("V1.1 P4 replay same flashcard requestId returns COMPLETE feedback without a second event",async()=>{
 const f=fixture();
 try{
  const requestId=randomUUID();
  const body={wordId:"w1",mode:"spell",answer:"record",requestId};
  const first=await f.call("/api/me/flashcards/answer",body);
  assert.equal(first.status,200,JSON.stringify(first.body));
  assert.equal(first.body.correct,true);
  const again=await f.call("/api/me/flashcards/answer",body);
  assert.equal(again.status,200,JSON.stringify(again.body));
  assert.equal(again.body.alreadyApplied,true);
  assert.equal(again.body.correct,true);
  assert.equal(again.body.expected,"record");
  assert.equal(again.body.meaning,"记录");
  assert.equal(typeof again.body.nextReviewDays,"number");
  assert.equal(again.body.status,"learning");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,1);
  const collision=await f.call("/api/me/flashcards/answer",{
    ...body,wordId:"w3"
  });
  assert.equal(collision.status,409,"a requestId cannot be used for another word");
 }finally{f.db.close()}
});
test("V1.1 P4 Story Echo multiple-choice distinguishes identical spelling with different sense",async()=>{
 const f=fixture();
 try{
  const wrong=await f.call("/api/me/echo/answer",{
   wordId:"w1",chapterId:"ch4",gameType:"fill",answer:"record",choiceId:"w3",hinted:false
  });
  assert.equal(wrong.status,200,JSON.stringify(wrong.body));
  assert.equal(wrong.body.correct,false,"verb 'record' cannot satisfy the noun question");
  const equivalent=await f.call("/api/me/echo/answer",{
   wordId:"w1",chapterId:"ch4",gameType:"fill",answer:"record",choiceId:"w2",hinted:false
  });
  assert.equal(equivalent.status,200,JSON.stringify(equivalent.body));
  assert.equal(equivalent.body.correct,true,"synonym IDs with same sense can be accepted");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,2);
  const locked=await f.call("/api/me/echo/answer",{
   wordId:"w1",chapterId:"ch4",gameType:"fill",answer:"record",choiceId:"w4",hinted:false
  });
  assert.equal(locked.status,403,"no option from a locked category can be used");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,2);
  const forged=await f.call("/api/me/echo/answer",{
   wordId:"w1",chapterId:"ch4",gameType:"fill",answer:"notrecord",choiceId:"w2",hinted:false
  });
  assert.equal(forged.status,400,"submitted text must match chosen ID");
 }finally{f.db.close()}
});
test("V1.1 P4 student sees honest spelling correction and only post-answer clickable words",()=>{
 const flash=read("public/flashcards.js");
 const echo=read("public/echo-cloud.js");
 const app=read("public/app.js");
 assert.match(flash,/submittedAnswer:body\.answer\|\|""/);
 assert.match(flash,/entry\.submitPayload=body/);
 assert.match(flash,/const body=entry\.submitPayload/);
 assert.match(flash,/lastBySense=new Map\(\)/);
 assert.match(flash,/你的填写/);
 assert.match(flash,/正确答案/);
 assert.match(flash,/本轮稍后最多再出现两次/);
 assert.match(echo,/const readable=\(text,answered\)=>answered&&/);
 assert.match(echo,/data-choice-id/);
 assert.match(echo,/你的选择/);
 assert.match(echo,/正确答案/);
 assert.match(echo,/submittedAnswer:value,submittedChoiceId:choiceId/);
 assert.match(app,/window\.MiaowuExampleLookup=Object\.freeze/);
 assert.doesNotThrow(()=>new Script(flash,{filename:"flashcards.js"}));
 assert.doesNotThrow(()=>new Script(echo,{filename:"echo-cloud.js"}));
 assert.doesNotThrow(()=>new Script(app,{filename:"app.js"}));
});
