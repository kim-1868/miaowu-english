import test from "node:test";
import assert from "node:assert/strict";
import {createLocalFreshSchema} from "../scripts/check-production-fresh-schema.mjs";
import {digestOpsToken} from "../src/ops-access.js";
import {handleOpsImport} from "../src/ops-import.js";
import {buildRainyNightFullDensityReviewDraft} from "../scripts/assemble-rainy-night-high-density-review-draft.mjs";
const TOKEN="mwops_"+"f".repeat(64);
const PEPPER="production-import-test-operator-unique-pepper-2026";
function D1(sqlite){
 return {prepare(sql){return {
  bind(...params){const st=sqlite.prepare(sql);return {
   async first(){return st.get(...params)||null},
   async all(){return {results:st.all(...params)}},
   async run(){return st.run(...params)}
  }},
  async first(){return sqlite.prepare(sql).get()||null},
  async all(){return {results:sqlite.prepare(sql).all()}}
 }},
 async batch(stmts){
  sqlite.exec("BEGIN");
  try{
   const result=[];
   for(const s of stmts)result.push(await s.run());
   sqlite.exec("COMMIT");return result;
  }catch(e){sqlite.exec("ROLLBACK");throw e;}
 }};
}
const makeRequest=(path,method="GET",payload=null,token=TOKEN)=>
 new Request("https://miaowu.example"+path,{method,
  headers:{...(token?{"X-Mw-Ops-Key":token}:{}),
   ...(payload?{"Content-Type":"application/json"}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{})});
test("S122 12 chapters / 1892 anchors import transactionally with publisher authorization",async()=>{
 const {db}=createLocalFreshSchema();
 try{
  const digest=await digestOpsToken(TOKEN,PEPPER);
  db.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES(?,?,?,?,?)")
   .run("ops-importer","Content publisher","publisher","production",digest);
  const env={APP_ENV:"production",OPS_TOKEN_PEPPER:PEPPER,DB:D1(db)};
  const {draft}=buildRainyNightFullDensityReviewDraft();
  const request=makeRequest("/api/ops/import","POST",{package:draft});
  const result=await handleOpsImport(request,env,"/api/ops/import");
  assert.equal(result.status,201,await result.clone().text());
  const data=await result.json();
  assert.equal(data.anchors,1892);
  assert.equal(data.wordCards,188);
  assert.equal(data.chapters,12);
  assert.equal(data.published,false);
  assert.equal(db.prepare("SELECT status FROM books WHERE id=?").get(draft.book.id).status,"draft");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM chapters WHERE published_at IS NULL AND is_preview=0").get().n,12);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM chapter_words").get().n,1892);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM word_categories").get().n,188);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM words").get().n,188);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ops_publication_approvals").get().n,0);
  for(const table of ["users","entitlements","activation_codes","reading_progress","user_words","review_events"])
   assert.equal(db.prepare("SELECT COUNT(*) n FROM "+table).get().n,0);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
  const catalog=await handleOpsImport(makeRequest("/api/ops/lexicon?category=cet4"),env,"/api/ops/lexicon");
  assert.equal(catalog.status,200);
  assert.equal((await catalog.json()).words.length,188);
  const again=await handleOpsImport(makeRequest("/api/ops/import","POST",{package:draft}),env,"/api/ops/import");
  assert.equal(again.status,409);
  assert.equal((await again.json()).error,"BOOK_ALREADY_EXISTS_USE_VERSIONED_REVISION");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM chapter_words").get().n,1892);
  const noToken=await handleOpsImport(makeRequest("/api/ops/lexicon?category=cet4","GET",null,null),env,"/api/ops/lexicon");
  assert.equal(noToken.status,401);
 }finally{db.close();}
});

test("coverage uses only visible published chapter anchors and projects same-ID replacements",async()=>{
 const {db}=createLocalFreshSchema();
 try{
  const digest=await digestOpsToken(TOKEN,PEPPER);
  db.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES(?,?,?,?,?)")
   .run("ops-importer","Content publisher","publisher","production",digest);
  const env={APP_ENV:"production",OPS_TOKEN_PEPPER:PEPPER,DB:D1(db)};
  db.prepare("UPDATE categories SET is_visible=1 WHERE slug='cet4'").run();
  const makeBook=(id,heads)=>({
   version:1,book:{id,title:id,category:"cet4"},
   words:[...new Set(heads)].map(headword=>({id:"word-"+headword,headword,partOfSpeech:"n.",meaningZh:"释义"})),
   chapters:[{id:id+"-1",number:1,title:"第一章",preview:false,paragraphs:[{
    segments:heads.map(head=>({wordId:"word-"+head,surface:head,gloss:"释义"}))
   }]}]
  });
  for(const [id,heads] of [["published-book",["abandon","ability","abnormal"]],["draft-book",["absence"]],["future-book",["absence"]]]){
   const res=await handleOpsImport(makeRequest("/api/ops/import","POST",makeBook(id,heads)),env,"/api/ops/import");
   assert.equal(res.status,201,await res.clone().text());
  }
  db.exec(`UPDATE books SET status='published' WHERE id IN ('published-book','future-book');
   UPDATE chapters SET published_at='2020-01-01 00:00:00' WHERE book_id='published-book';
   UPDATE chapters SET published_at='2099-01-01 00:00:00' WHERE book_id='future-book';
   UPDATE chapter_words SET context_anchor='p0:s99' WHERE word_id='word-abnormal';`);
  const path="/api/ops/import/coverage";
  const pkg=makeBook("new-book",["abandon","abandon","absence","abnormal"]);
  const unauthorized=await handleOpsImport(makeRequest(path,"POST",pkg,null),env,path);
  assert.equal(unauthorized.status,401);
  const before=db.prepare("SELECT total_changes() n").get().n;
  const response=await handleOpsImport(makeRequest(path,"POST",pkg),env,path);
  assert.equal(response.status,200,await response.clone().text());
  const report=await response.json();
  assert.equal(report.total,3849);
  assert.equal(report.currentCovered,2);
  assert.equal(report.projectedCovered,4);
  assert.deepEqual(report.overlapWords,["abandon"]);
  assert.deepEqual(report.addedWords,["abnormal","absence"]);
  assert.equal(report.crossBookRate,33.33);
  assert.equal(report.withinBookRate,25);
  assert.equal(report.remaining,3845);
  const revised=await handleOpsImport(makeRequest(path,"POST",makeBook("published-book",["abandon","absence"])),env,path);
  const replacement=await revised.json();
  assert.deepEqual(replacement.overlapWords,[]);
  assert.deepEqual(replacement.lostWords,["ability"]);
  assert.equal(replacement.netGain,0);
  assert.equal(db.prepare("SELECT total_changes() n").get().n,before);
 }finally{db.close();}
});
