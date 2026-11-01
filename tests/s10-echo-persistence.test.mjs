import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleEcho} from "../src/echo-cloud.js";

// S10: independent server-side QA verification; does not call Cloudflare,
// import private customer data, or change the deployed staging Worker.
class D1 {
  constructor(){
    this.db=new DatabaseSync(":memory:");
    this.db.exec(readFileSync(new URL("../db/001_schema.sql",import.meta.url),"utf8"));
    this.db.exec(readFileSync(new URL("../db/003_public_categories.sql",import.meta.url),"utf8"));
    this.db.exec(`
      INSERT INTO users(id,username,password_hash,password_salt)
      VALUES ('u1','reader-a','hash','salt'),('u2','reader-b','hash','salt');
      INSERT INTO books(id,category_id,title,status)
      VALUES ('qa-four','cet4','QA four','published');
      INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at)
      VALUES ('qa-echo','qa-four',1,'QA echo','{"paragraphs":[]}',0,CURRENT_TIMESTAMP);
      INSERT INTO entitlements(user_id,category_id) VALUES ('u1','cet4');
      INSERT INTO reading_progress(user_id,chapter_id,progress,completed_at)
      VALUES ('u1','qa-echo',1,CURRENT_TIMESTAMP);
      INSERT INTO words(id,headword,meaning_zh)
      VALUES ('w1','promise','承诺'),('w2','evidence','证据'),
             ('w3','confirm','确认'),('w4','identity','身份');
      INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor)
      VALUES ('qa-echo','w1','She kept her promise.','p0:s1'),
             ('qa-echo','w2','She found evidence.','p1:s1'),
             ('qa-echo','w3','She needed to confirm.','p2:s1'),
             ('qa-echo','w4','Her identity was hidden.','p3:s1');
      INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at)
      VALUES ('u1','w1','learning',1,CURRENT_TIMESTAMP);
    `);
  }
  prepare(query){
    const db=this.db;
    return {bind(...args){const statement=db.prepare(query);
      return {
        first:async()=>statement.get(...args)??null,
        all:async()=>({results:statement.all(...args)}),
        run:async()=>({success:true,meta:statement.run(...args)})
      }
    }};
  }
  async batch(statements){
    this.db.exec("BEGIN IMMEDIATE");
    try{const out=[];for(const s of statements)out.push(await s.run());this.db.exec("COMMIT");return out}
    catch(e){this.db.exec("ROLLBACK");throw e}
  }
}
const endpoint="https://test.invalid";
async function callEcho(store,path,user,answer){
  const opts=answer?{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(answer)}:{method:"GET"};
  return handleEcho(new Request(endpoint+path,opts),{DB:store},path,{id:user});
}

test("S10 four-word QA echo saves event, correct schedule and existing bookmark across requests",async()=>{
  const store=new D1();
  const words=await callEcho(store,"/api/me/echo/available?scope=recent","u1");
  // Handler takes the pathname rather than the full pathname + query.
  assert.equal(words.status,404); // This is intentionally the wrong caller shape.
  const available=await callEcho(store,"/api/me/echo/available","u1");
  assert.equal(available.status,200);
  const data=await available.json();
  assert.equal(data.distinctWords,4);
  assert.deepEqual(data.availableGames,["fill","situation","spell"]);
  const response=await callEcho(store,"/api/me/echo/answer","u1",{
    wordId:"w1",chapterId:"qa-echo",gameType:"spell",answer:"promise",hinted:false
  });
  assert.equal(response.status,200);
  const answer=await response.json();
  assert.equal(answer.saved,true);
  assert.equal(answer.result,"correct");
  assert.equal(answer.nextReviewDays,3);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM review_events WHERE user_id='u1' AND word_id='w1' AND result='correct'").get().n,1);
  const saved=store.db.prepare("SELECT status,bookmarked,due_at FROM user_words WHERE user_id='u1' AND word_id='w1'").get();
  assert.equal(saved.status,"learning");
  assert.equal(saved.bookmarked,1);
  assert.ok(saved.due_at);
  const repeatedRead=await callEcho(store,"/api/me/echo/available","u1");
  assert.equal((await repeatedRead.json()).distinctWords,4);
  assert.equal((await (await callEcho(store,"/api/me/echo/stats","u1")).json()).due,0);
});

test("S10 rejects unentitled accounts and incomplete reading before writing any echo record",async()=>{
  const store=new D1();
  const unavailable=await callEcho(store,"/api/me/echo/available","u2");
  assert.equal(unavailable.status,200);
  assert.equal((await unavailable.json()).distinctWords,0);
  const denial=await callEcho(store,"/api/me/echo/answer","u2",{
    wordId:"w1",chapterId:"qa-echo",gameType:"spell",answer:"promise",hinted:false
  });
  assert.equal(denial.status,403);
  assert.equal((await denial.json()).error,"REVIEW_WORD_UNAVAILABLE");
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM review_events").get().n,0);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM user_words WHERE user_id='u2'").get().n,0);
  store.db.exec("UPDATE reading_progress SET completed_at=NULL WHERE user_id='u1'");
  const incomplete=await callEcho(store,"/api/me/echo/answer","u1",{
    wordId:"w1",chapterId:"qa-echo",gameType:"fill",answer:"promise",hinted:false
  });
  assert.equal(incomplete.status,403);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM review_events").get().n,0);
});

test("S10 incorrect answer persists as learning and reschedules to next day",async()=>{
  const store=new D1();
  const response=await callEcho(store,"/api/me/echo/answer","u1",{
    wordId:"w2",chapterId:"qa-echo",gameType:"situation",answer:"identity",hinted:false
  });
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.correct,false);
  assert.equal(body.result,"incorrect");
  assert.equal(body.nextReviewDays,1);
  const event=store.db.prepare("SELECT game_type,result FROM review_events WHERE word_id='w2'").get();
  assert.deepEqual(event,{game_type:"situation",result:"incorrect"});
  const state=store.db.prepare("SELECT status,due_at,bookmarked FROM user_words WHERE word_id='w2'").get();
  assert.equal(state.status,"learning");
  assert.equal(state.bookmarked,0);
  assert.ok(state.due_at);
});
