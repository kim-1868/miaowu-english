import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleMyBookshelf} from "../src/my-bookshelf.js";
import {handleLearningState} from "../src/reading-library.js";
import {handleOnboarding,registrationOnboardingStatement} from "../src/onboarding.js";
import {handleExampleWordLookup} from "../src/example-word-lookup.js";

const file=name=>readFileSync(new URL("../db/"+name,import.meta.url),"utf8");
function fixture(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("PRAGMA foreign_keys=ON;");
 for(const f of ["001_schema.sql","009_v11_onboarding.sql","010_v11_my_bookshelf.sql","012_v11_supplemental_dictionary.sql","013_v11_supplemental_starter.sql"]){
  sqlite.exec(file(f));
 }
 const DB={prepare(sql){
  const statement=sqlite.prepare(sql);
  return {bind(...args){
   return {
    async first(){return statement.get(...args)||null},
    async all(){return {results:statement.all(...args)}},
    async run(){const changes=statement.run(...args);return {success:true,meta:{changes:changes.changes}}}
   };
  }};
 }};
 sqlite.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES(?,?,?,?)").run("u1","reader1","hash1","salt1");
 sqlite.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES(?,?,?,?)").run("u2","reader2","hash2","salt2");
 sqlite.prepare("INSERT INTO categories(id,slug,title,is_visible) VALUES(?,?,?,?)").run("cat1","cet4","大学英语四级",1);
 sqlite.prepare("INSERT INTO books(id,category_id,title,description,status) VALUES(?,?,?,?,?)").run("book-1","cat1","一朵小小花","一段阅读故事","published");
 sqlite.prepare("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)").run("chapter-1","book-1",1,"第一章","{}",1);
 sqlite.prepare("INSERT INTO words(id,headword,example_en,meaning_zh) VALUES(?,?,?,?)").run("word-1","puzzle","The puzzle was difficult.","谜题");
 sqlite.prepare("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES(?,?,?,?)").run("chapter-1","word-1","The puzzle was difficult.","anchor1");
 return {sqlite,env:{DB}};
}
const request=(url,method="GET",payload=null)=>{
 const opt={method,headers:{"content-type":"application/json"}};
 if(payload!==null)opt.body=JSON.stringify(payload);
 return new Request("https://example.test"+url,opt);
};
const read=async res=>({status:res.status,data:await res.json()});

test("Wave2 live-schema integration: bookmarks are user-specific, progress retains finished books and no paid access",async()=>{
 const {sqlite,env}=fixture();try{
  assert.equal((await read(await handleMyBookshelf(request("/api/me/bookshelf"),env,null))).status,401);
  let listing=await read(await handleMyBookshelf(request("/api/me/bookshelf"),env,{id:"u1"}));
  assert.equal(listing.status,200);assert.deepEqual(listing.data.books,[]);
  const add=await read(await handleMyBookshelf(request("/api/me/bookshelf/book-1","PUT",{bookmarked:true}),env,{id:"u1"}));
  assert.equal(add.status,200);
  listing=await read(await handleMyBookshelf(request("/api/me/bookshelf"),env,{id:"u1"}));
  assert.equal(listing.data.books.length,1);
  assert.equal(listing.data.books[0].state,"want");
  assert.equal(listing.data.books[0].bookmarked,true);
  const other=await read(await handleMyBookshelf(request("/api/me/bookshelf"),env,{id:"u2"}));
  assert.deepEqual(other.data.books,[]);
  sqlite.prepare("INSERT INTO reading_progress(user_id,chapter_id,progress) VALUES(?,?,?)").run("u1","chapter-1",0.4);
  listing=await read(await handleMyBookshelf(request("/api/me/bookshelf"),env,{id:"u1"}));
  assert.equal(listing.data.books[0].state,"reading");
  sqlite.prepare("UPDATE reading_progress SET completed_at=CURRENT_TIMESTAMP,progress=1 WHERE user_id=? AND chapter_id=?").run("u1","chapter-1");
  await handleMyBookshelf(request("/api/me/bookshelf/book-1","PUT",{bookmarked:false}),env,{id:"u1"});
  listing=await read(await handleMyBookshelf(request("/api/me/bookshelf"),env,{id:"u1"}));
  assert.deepEqual(listing.data.books,[]);
  assert.equal(listing.data.recent.length,1);
  assert.equal(listing.data.recent[0].state,"finished");
  assert.equal(listing.data.recent[0].bookmarked,false);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM reading_progress WHERE user_id='u1'").get().n,1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM entitlements").get().n,0);
 }finally{sqlite.close()}
});

test("Wave2 live-schema integration: only newly registered user rows receive onboarding, completion persists",async()=>{
 const {sqlite,env}=fixture();try{
  const old=await read(await handleOnboarding(request("/api/me/onboarding"),env,{id:"u1"}));
  assert.equal(old.status,200);assert.equal(old.data.eligible,false);assert.equal(old.data.pending,false);
  assert.equal((await read(await handleOnboarding(request("/api/me/onboarding"),env,null))).status,401);
  await registrationOnboardingStatement(env,"u2").run();
  const fresh=await read(await handleOnboarding(request("/api/me/onboarding"),env,{id:"u2"}));
  assert.equal(fresh.data.pending,true);
  assert.equal(fresh.data.wordTipPending,true);
  const word=await read(await handleOnboarding(request("/api/me/onboarding","PUT",{dismissTip:"word"}),env,{id:"u2"}));
  assert.equal(word.status,200);
  const finished=await read(await handleOnboarding(request("/api/me/onboarding","PUT",{complete:"finished"}),env,{id:"u2"}));
  assert.equal(finished.status,200);
  const after=await read(await handleOnboarding(request("/api/me/onboarding"),env,{id:"u2"}));
  assert.equal(after.data.pending,false);assert.equal(after.data.wordTipPending,false);
  assert.equal(after.data.completionKind,"finished");
  assert.equal((await read(await handleOnboarding(request("/api/me/onboarding","PUT",{complete:"finished"}),env,{id:"u1"}))).status,409);
 }finally{sqlite.close()}
});

test("Wave2 live-schema integration: 107 curated entries and example-only dictionary authorization",async()=>{
 const {sqlite,env}=fixture();try{
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM supplemental_dictionary").get().n,107);
  const good=await read(await handleExampleWordLookup(request("/api/lexicon/lookup?word=the&originWordId=word-1"),env,null));
  assert.equal(good.status,200);
  assert.equal(good.data.fallback.headword,"the");
  assert.equal(good.data.fallback.referenceOnly,true);
  const unrelated=await read(await handleExampleWordLookup(request("/api/lexicon/lookup?word=window&originWordId=word-1"),env,null));
  assert.equal(unrelated.status,200);
  assert.equal(unrelated.data.fallback,null);
  const badId=await read(await handleExampleWordLookup(request("/api/lexicon/lookup?word=the&originWordId=missing"),env,null));
  assert.equal(badId.data.fallback,null);
  sqlite.prepare("UPDATE chapters SET is_preview=0 WHERE id=?").run("chapter-1");
  const paid=await read(await handleExampleWordLookup(request("/api/lexicon/lookup?word=the&originWordId=word-1"),env,null));
  assert.equal(paid.data.fallback,null);
  sqlite.prepare("INSERT INTO entitlements(user_id,category_id,source_code_id) VALUES(?,?,NULL)").run("u1","cat1");
  const unlocked=await read(await handleExampleWordLookup(request("/api/lexicon/lookup?word=the&originWordId=word-1"),env,{id:"u1"}));
  assert.equal(unlocked.data.fallback.headword,"the");
 }finally{sqlite.close()}
});

test("V1.1 wordbook: 30 unique visible study senses paginate 12 per page with stable total and no 200 cap",async()=>{
 const {sqlite,env}=fixture();try{
  for(let i=1;i<=30;i++){
    const id="vocab-"+i;
    sqlite.prepare("INSERT INTO words(id,headword,part_of_speech,meaning_zh,example_en) VALUES(?,?,?,?,?)").run(
      id,"term"+String(i).padStart(3,"0"),"n.","含义"+i,"This is term "+i+".");
    sqlite.prepare("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES(?,?,?,?)").run(
      "chapter-1",id,"Example "+i,"term-"+i);
    sqlite.prepare("INSERT INTO user_words(user_id,word_id,status,bookmarked) VALUES(?,?,?,1)").run(
      "u1",id,i%2===0?"mastered":"learning");
  }
  const readPage=async(scope,page,user={id:"u1"})=>read(await handleLearningState(
    request("/api/me/wordbook?scope="+scope+"&page="+page),env,"/api/me/wordbook",user));
  const all1=await readPage("all",1);
  assert.equal(all1.status,200);
  assert.equal(all1.data.total,30);
  assert.equal(all1.data.allTotal,30);
  assert.equal(all1.data.pageSize,12);
  assert.equal(all1.data.totalPages,3);
  assert.equal(all1.data.words.length,12);
  const all3=await readPage("all",3);
  assert.equal(all3.data.words.length,6);
  assert.equal(new Set([...all1.data.words,...all3.data.words].map(x=>x.word_id)).size,18);
  const learning=await readPage("learning",2);
  assert.equal(learning.data.total,15);
  assert.equal(learning.data.totalPages,2);
  assert.equal(learning.data.words.length,3);
  const mastered=await readPage("mastered",1);
  assert.equal(mastered.data.total,15);
  assert.ok(mastered.data.words.every(w=>w.status==="mastered"));
  const clamped=await readPage("all",9999);
  assert.equal(clamped.data.page,3);
  assert.equal((await readPage("invalid",1)).status,400);
  assert.equal((await readPage("all",1,null)).status,401);
 }finally{sqlite.close()}
});
test("V1.1 bookshelf: reading without bookmarking remains in recent, not favorites",async()=>{
 const {sqlite,env}=fixture();try{
  sqlite.prepare("INSERT INTO reading_progress(user_id,chapter_id,progress) VALUES('u1','chapter-1',0.25)").run();
  let list=await read(await handleMyBookshelf(request("/api/me/bookshelf"),env,{id:"u1"}));
  assert.equal(list.data.books.length,0);
  assert.equal(list.data.recent.length,1);
  assert.equal(list.data.recent[0].state,"reading");
  await handleMyBookshelf(request("/api/me/bookshelf/book-1","PUT",{bookmarked:true}),env,{id:"u1"});
  list=await read(await handleMyBookshelf(request("/api/me/bookshelf"),env,{id:"u1"}));
  assert.equal(list.data.books.length,1);
  assert.equal(list.data.recent.length,0);
 }finally{sqlite.close()}
});
