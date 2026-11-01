import {test} from "node:test";
import assert from "node:assert/strict";
import {createLocalFreshSchema} from "../scripts/check-production-fresh-schema.mjs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {generateSql} from "../scripts/build-content-import.mjs";
import {handleEcho} from "../src/echo-cloud.js";

// D1 adapter implemented entirely on SQLite in memory. Nothing touches Cloudflare.
function environment(db){
 return {DB:{
  prepare(sql){
   const stmt=db.prepare(sql);
   return {
    bind(...values){
     return {
      first:async()=>stmt.get(...values)||null,
      all:async()=>({results:stmt.all(...values)}),
      run:async()=>stmt.run(...values)
     };
    }
   };
  },
  batch:async statements=>Promise.all(statements.map(s=>s.run()))
 }};
}
function harness(){
 const {db}=createLocalFreshSchema();
 db.exec(generateSql(composeRainyNightSeasonDraft().bundle).sql);
 const {bundle}=composeRainyNightSeasonDraft();
 const one=bundle.chapters[0],last=bundle.chapters.at(-1);
 db.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES(?,?,?,?)")
  .run("qa-user","qa-user","not-real-password-hash","test-only");
 const user={id:"qa-user"};
 const env=environment(db);
 const action=async(path,body,userValue=user)=>{
  const method=body?"POST":"GET";
  const req=new Request("https://offline.invalid"+path,{method,
   headers:body?{"content-type":"application/json"}:{},
   body:body?JSON.stringify(body):undefined});
  const res=await handleEcho(req,env,new URL(req.url).pathname,userValue);
  return {status:res.status,data:await res.json()};
 };
 const progress=chapter=>db.prepare("INSERT OR REPLACE INTO reading_progress "+
  "(user_id,chapter_id,progress,completed_at,updated_at) "+
  "VALUES(?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run(user.id,chapter.id);
 const grant=()=>db.prepare("INSERT OR REPLACE INTO entitlements "+
  "(user_id,category_id,scope_version,revoked_at) VALUES(?,?,?,NULL)")
  .run(user.id,"cet4","qa-only");
 return {db,bundle,one,last,user,env,action,progress,grant};
}
test("S37 real draft never becomes eligible for Echo even with a completed chapter and voucher entitlement",async()=>{
 const h=harness();
 try{
  h.progress(h.one);h.grant();
  const av=await h.action("/api/me/echo/available?scope=chapter&chapterId="+h.one.id);
  assert.equal(av.status,200);
  assert.equal(av.data.distinctWords,0);
  const stats=await h.action("/api/me/echo/stats");
  assert.equal(stats.data.due,0);
 }finally{h.db.close();}
});
test("S37 public preview only permits completed chapter 1, not paid chapter 12",async()=>{
 const h=harness();
 try{
  h.db.prepare("UPDATE books SET status='published' WHERE id=?").run(h.bundle.book.id);
  h.db.prepare("UPDATE chapters SET published_at=CURRENT_TIMESTAMP WHERE book_id=?")
   .run(h.bundle.book.id);
  h.progress(h.one);h.progress(h.last);
  const free=await h.action("/api/me/echo/available?scope=chapter&chapterId="+h.one.id);
  const pay=await h.action("/api/me/echo/available?scope=chapter&chapterId="+h.last.id);
  assert.ok(free.data.distinctWords>3);
  assert.equal(pay.data.distinctWords,0);
  assert.equal((await h.action("/api/me/echo/stats",null,null)).status,401);
  h.grant();
  const unlocked=await h.action("/api/me/echo/available?scope=chapter&chapterId="+h.last.id);
  assert.ok(unlocked.data.distinctWords>3);
 }finally{h.db.close();}
});
test("S37 chapter 1 remains reviewable with all twelve chapters completed despite 733 raw annotations and 600-row cap",async()=>{
 const h=harness();
 try{
  h.db.prepare("UPDATE books SET status='published'").run();
  h.db.prepare("UPDATE chapters SET published_at=CURRENT_TIMESTAMP").run();
  h.grant();
  for(const ch of h.bundle.chapters)h.progress(ch);
  const first=await h.action("/api/me/echo/available?scope=chapter&chapterId="+h.one.id);
  assert.equal(first.status,200);
  assert.ok(first.data.distinctWords>3,"chapter 1 silently disappeared behind LIMIT 600");
  assert.ok(first.data.words.every(w=>w.chapter_id===h.one.id));
  const last=await h.action("/api/me/echo/available?scope=chapter&chapterId="+h.last.id);
  assert.ok(last.data.distinctWords>3);
  assert.ok(last.data.words.every(w=>w.chapter_id===h.last.id));
  const specific=await h.action("/api/me/echo/available?scope=custom&bookId="+h.bundle.book.id+"&from=1&to=1");
  assert.ok(specific.data.distinctWords>3);
  assert.ok(specific.data.words.every(w=>w.chapter_no===1));
 }finally{h.db.close();}
});
test("S37 due scope filters target words inside SQL before cap, and never exposes inaccessible paid chapters",async()=>{
 const h=harness();
 try{
  h.db.prepare("UPDATE books SET status='published'").run();
  h.db.prepare("UPDATE chapters SET published_at=CURRENT_TIMESTAMP").run();
  h.grant();
  for(const ch of h.bundle.chapters)h.progress(ch);
  const firstWord=h.bundle.chapters[0].paragraphs.flatMap(p=>p.segments).find(s=>s.wordId);
  h.db.prepare("INSERT INTO user_words(user_id,word_id,status,due_at) "+
    "VALUES(?,?,?,datetime('now','-2 days'))").run(h.user.id,firstWord.wordId,"review_due");
  const due=await h.action("/api/me/echo/available?scope=due");
  assert.equal(due.status,200);
  assert.ok(due.data.words.some(w=>w.word_id===firstWord.wordId),
    "due words in old chapters were excluded by unfiltered SQL LIMIT 600");
  assert.ok(due.data.words.every(w=>w.word_id===firstWord.wordId));
  const stats=await h.action("/api/me/echo/stats");
  assert.equal(stats.data.due,1);
  h.db.prepare("UPDATE entitlements SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?")
   .run(h.user.id);
  // The word in preview chapter is still eligible; paid-only word is never eligible.
  const lastWord=h.bundle.chapters.at(-1).paragraphs.flatMap(p=>p.segments).find(s=>s.wordId);
  assert.ok(lastWord);
  const noPay=await h.action("/api/me/echo/available?scope=chapter&chapterId="+h.last.id);
  assert.equal(noPay.data.distinctWords,0);
 }finally{h.db.close();}
});
test("S37 real Echo answer saves review only for authenticated, completed, accessible word",async()=>{
 const h=harness();
 try{
  h.db.prepare("UPDATE books SET status='published'").run();
  h.db.prepare("UPDATE chapters SET published_at=CURRENT_TIMESTAMP").run();
  h.progress(h.one);
  const list=(await h.action("/api/me/echo/available?scope=chapter&chapterId="+h.one.id)).data;
  assert.ok(list.words.length>3);
  const w=list.words[0];
  const args={wordId:w.word_id,chapterId:w.chapter_id,gameType:"spell",answer:w.headword,hinted:false};
  const unauth=await h.action("/api/me/echo/answer",args,null);
  assert.equal(unauth.status,401);
  const saved=await h.action("/api/me/echo/answer",args);
  assert.equal(saved.status,200);
  assert.equal(saved.data.correct,true);
  assert.equal(saved.data.saved,true);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,1);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM user_words").get().n,1);
  const denied=await h.action("/api/me/echo/answer",{...args,wordId:"rns1-invalid"});
  assert.equal(denied.status,403);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,1);
 }finally{h.db.close();}
});
