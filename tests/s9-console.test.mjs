import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../src/worker.js";
import {digestOpsToken} from "../src/ops-access.js";
import {generateSql} from "../scripts/build-content-import.mjs";

const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const ORIGIN="https://miaowu.test",TOKEN="mwops_"+"e".repeat(64);
const PEPPER="ops-test-pepper-independently-created-from-users-2026";
const bookId="sample-cet4-letter",chapterId="sample-letter-ch1";
const sample=JSON.parse(read("../content/examples/cet4-sample-draft.json"));

function fixture({withdrawal="true",consoleEnabled="true",role="publisher"}={}){
 const sqlite=new DatabaseSync(":memory:");sqlite.exec("PRAGMA foreign_keys=ON;");
 for(const name of ["001_schema","002_s1","003_public_categories","004_editorial_content",
   "005_editorial_revisions","006_editorial_review_signoffs","007_ops_identity_audit",
   "008_ops_release_workflow"])sqlite.exec(read("../db/"+name+".sql"));
 sqlite.exec(generateSql(sample).sql);
 sqlite.prepare("UPDATE books SET status='published',last_release_request_id='published-seed-2026' WHERE id=?").run(bookId);
 sqlite.prepare("UPDATE chapters SET published_at=CURRENT_TIMESTAMP WHERE book_id=?").run(bookId);
 sqlite.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES('user1','customer','hash','salt')").run();
 sqlite.prepare("INSERT INTO entitlements(user_id,category_id) VALUES('user1','cet4')").run();
 sqlite.prepare("INSERT INTO reading_progress(user_id,chapter_id,progress) VALUES('user1',?,0.5)").run(chapterId);
 sqlite.prepare("INSERT INTO user_words(user_id,word_id,status,bookmarked) VALUES('user1','cet4-hesitate','learning',1)").run();
 sqlite.prepare("INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) "+
   "VALUES('rev1','user1','cet4-hesitate',?,'echo','correct')").run(chapterId);
 const DB={prepare(sql){return{
   bind(...params){const stmt=sqlite.prepare(sql);return{
      async first(){return stmt.get(...params)??null},
      async all(){return {results:stmt.all(...params)}},
      async run(){return stmt.run(...params)}
   }},
   async first(){return sqlite.prepare(sql).get()??null},
   async all(){return {results:sqlite.prepare(sql).all()}}
 }},async batch(items){
  sqlite.exec("BEGIN IMMEDIATE");try{const results=[];for(const item of items)results.push(await item.run());sqlite.exec("COMMIT");return results}
  catch(e){sqlite.exec("ROLLBACK");throw e}
 }};
 const env={DB,APP_ENV:"production",OPS_TOKEN_PEPPER:PEPPER,
  OPS_CONSOLE_ENABLED:consoleEnabled,OPS_WITHDRAWAL_ENABLED:withdrawal,
  OPS_PUBLICATION_ENABLED:"false",ACTIVATION_PEPPER:"activation-test-secret-more-than-thirty-two",
  ASSETS:{fetch:async r=>new Response(r.url.endsWith(".html")?"ops page":"static asset",{status:200})}};
 return {env,sqlite,role};
}
async function createOperator(f){
 const digest=await digestOpsToken(TOKEN,PEPPER);
 f.sqlite.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES(?,?,?,?,?)")
   .run("ops-owner","Owner",f.role,"production",digest);
}
function call(env,path,method="GET",data,token=TOKEN,origin=ORIGIN){
 const headers={Origin:origin};if(token!==null)headers["X-Mw-Ops-Key"]=token;
 if(data!==undefined)headers["Content-Type"]="application/json";
 return worker.fetch(new Request(ORIGIN+path,{method,headers,
   body:data===undefined?undefined:JSON.stringify(data)}),env);
}
const base="/api/ops/books/"+bookId;
const submission=(overrides={})=>({confirmTitle:sample.book.title,
  reason:"因人工校对发现词汇错误，需要临时下架并完成后续售后处理。",
  confirmAction:"WITHDRAW_PUBLIC_ACCESS",requestId:"withdraw-req-0001",...overrides});

test("S9-C operator catalog never exposes manuscripts or editor secrets",async()=>{
 const f=fixture();await createOperator(f);
 const response=await call(f.env,"/api/ops/books");
 assert.equal(response.status,200,await response.clone().text());
 const data=await response.json();
 assert.equal(data.books.some(b=>b.id===bookId),true);
 assert.equal(JSON.stringify(data).includes("paragraphs"),false);
 assert.equal(JSON.stringify(data).includes(TOKEN),false);
 const a=await call(f.env,base+"/audit");
 assert.equal(a.status,200);
 assert.deepEqual((await a.json()).events,[]);
 const inspection=await call(f.env,base+"/withdraw-readiness");
 assert.equal(inspection.status,200);
 const stats=await inspection.json();
 assert.equal(stats.activeCategoryGrants,1);
 assert.equal(stats.canWithdraw,true);
 const page=await worker.fetch(new Request(ORIGIN+"/ops.html"),f.env);
 assert.equal(page.status,200);
 assert.match(page.headers.get("content-security-policy"),/script-src 'self'/);
 assert.match(page.headers.get("cache-control"),/no-store/);
});

test("S9-C withdrawal atomically unpublishes chapters without deleting rights or learning",async()=>{
 const f=fixture();await createOperator(f);
 assert.equal((await call(f.env,"/api/books?category=cet4")).status,200);
 const before=await call(f.env,"/api/chapters/"+chapterId);
 assert.equal(before.status,200);
 const r=await call(f.env,base+"/withdraw","POST",submission());
 assert.equal(r.status,201,await r.clone().text());
 const outcome=await r.json();assert.equal(outcome.withdrawn,true);
 assert.equal(outcome.supportActionRequired,true);
 assert.equal(f.sqlite.prepare("SELECT status FROM books WHERE id=?").get(bookId).status,"draft");
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM chapters WHERE book_id=? AND published_at IS NOT NULL").get(bookId).n,0);
 const result=await call(f.env,"/api/books?category=cet4");
 assert.equal((await result.json()).books.some(b=>b.id===bookId),false);
 assert.equal((await call(f.env,"/api/chapters/"+chapterId)).status,404);
 for(const table of ["entitlements","reading_progress","user_words","review_events"]){
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM "+table).get().n,1);
 }
 const logs=await (await call(f.env,base+"/audit")).json();
 assert.equal(logs.events[0].event_type,"book.withdraw");
 assert.equal(JSON.stringify(logs).includes(submission().reason),false);
 const again=await call(f.env,base+"/withdraw","POST",submission());
 assert.equal(again.status,200);assert.equal((await again.json()).alreadyApplied,true);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM ops_audit_events").get().n,1);
});
test("S9-C disabled or unconfigured console, withdrawal switch and wrong roles fail closed",async()=>{
 const missing=fixture({consoleEnabled:"false"});await createOperator(missing);
 assert.equal((await call(missing.env,"/api/ops/books")).status,403);
 assert.equal((await worker.fetch(new Request(ORIGIN+"/ops.html"),missing.env)).status,404);
 const disabled=fixture({withdrawal:"false"});await createOperator(disabled);
 assert.equal((await call(disabled.env,base+"/withdraw-readiness")).status,200);
 assert.equal((await call(disabled.env,base+"/withdraw","POST",submission())).status,403);
 const reviewer=fixture({role:"reviewer"});await createOperator(reviewer);
 assert.equal((await call(reviewer.env,"/api/ops/books")).status,403);
 assert.equal((await call(reviewer.env,base+"/withdraw","POST",submission())).status,403);
 assert.equal((await call(disabled.env,"/api/ops/books","GET",undefined,null)).status,401);
 assert.equal((await call(disabled.env,"/api/ops/books","GET",undefined,"staging-legacy-secret")).status,401);
});
test("S9-C withdrawal rejects incorrect title, missing acknowledgment and invalid origin",async()=>{
 const f=fixture();await createOperator(f);
 for(const bad of [
  {confirmTitle:"wrong"},{confirmAction:"YES"},{reason:"short"},{requestId:"bad"}
 ]){
  const r=await call(f.env,base+"/withdraw","POST",submission(bad));
  assert.equal(r.status,bad.confirmTitle?409:400);
 }
 const origin=await call(f.env,base+"/withdraw","POST",submission(),TOKEN,"https://evil.test");
 assert.equal(origin.status,403);
 assert.equal(f.sqlite.prepare("SELECT status FROM books WHERE id=?").get(bookId).status,"published");
});
test("S9-C rollback when audit insert fails and reject duplicate conflicting request",async()=>{
 const f=fixture();await createOperator(f);
 f.sqlite.exec("CREATE TRIGGER break_ops_audit BEFORE INSERT ON ops_audit_events "+
   "BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END");
 const res=await call(f.env,base+"/withdraw","POST",submission());
 assert.equal(res.status,409);
 assert.equal(f.sqlite.prepare("SELECT status FROM books WHERE id=?").get(bookId).status,"published");
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM chapters WHERE book_id=? AND published_at IS NULL").get(bookId).n,0);
 f.sqlite.exec("DROP TRIGGER break_ops_audit");
 f.sqlite.prepare("INSERT INTO ops_audit_events(id,actor_id,event_type,resource_type,resource_id,request_id) "+
   "VALUES('prior-event','ops-owner','book.withdraw','book','other-book','withdraw-req-0001')").run();
 const denied=await call(f.env,base+"/withdraw","POST",submission());
 assert.equal(denied.status,409);
 assert.equal(f.sqlite.prepare("SELECT status FROM books WHERE id=?").get(bookId).status,"published");
});
