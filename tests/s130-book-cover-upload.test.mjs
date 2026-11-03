import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../src/worker.js";
import {digestOpsToken} from "../src/ops-access.js";

const origin="https://cover-test.invalid";
const opsPepper="S130_FAKE_OPERATION_PEPPER_NO_REAL_PRODUCTION_KEYS_2026";
const token="mwops_"+"a".repeat(64);
function harness(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("PRAGMA foreign_keys=ON");
 for(const file of ["001_schema.sql","002_s1.sql","003_public_categories.sql",
   "004_editorial_content.sql","005_editorial_revisions.sql","006_editorial_review_signoffs.sql",
   "007_ops_identity_audit.sql","008_ops_release_workflow.sql"]){
  sqlite.exec(readFileSync(new URL("../db/"+file,import.meta.url),"utf8"));
 }
 sqlite.exec(readFileSync(new URL("../db/production/004_book_cover_images.sql",import.meta.url),"utf8"));
 sqlite.exec("INSERT INTO books(id,category_id,title,status) VALUES "+
  "('rainy-test','cet4','Rainy Night Test','published'),"+
  "('draft-test','cet4','Private Draft Cover','draft')");
 const DB={
  prepare(sql){
   const make=(args=[])=>({
    first:async()=>sqlite.prepare(sql).get(...args)??null,
    all:async()=>({results:sqlite.prepare(sql).all(...args)}),
    run:async()=>sqlite.prepare(sql).run(...args)
   });
   return {...make(),bind(...args){return make(args)}};
  },
  async batch(items){
   sqlite.exec("BEGIN IMMEDIATE");
   try{let out=[];for(const statement of items)out.push(await statement.run());sqlite.exec("COMMIT");return out;}
   catch(e){sqlite.exec("ROLLBACK");throw e}
  }
 };
 return {sqlite,env:{DB,APP_ENV:"production",OPS_CONSOLE_ENABLED:"true",
  OPS_TOKEN_PEPPER:opsPepper,ACTIVATION_PEPPER:"S130_FAKE_ACTIVATION_PEPPER_NOT_REAL",
  ASSETS:{fetch:async()=>new Response("NOT_FOUND",{status:404})}}};
}
function uploadReq(bookId,payload,{secret=token,mime="image/png"}={}){
 const form=new FormData();
 form.append("cover",new Blob([payload],{type:mime}),"book-cover.png");
 return new Request(origin+"/api/ops/books/"+bookId+"/cover",{
  method:"POST",headers:{Origin:origin,...(secret?{"X-Mw-Ops-Key":secret}:{})},
  body:form
 });
}
function validPng(){const buf=new Uint8Array(400);buf.set([137,80,78,71,13,10,26,10]);return buf}
test("S130 category book image upload is publisher-only; stores no executable content; public excludes private drafts",async()=>{
 const h=harness();
 try{
  const digest=await digestOpsToken(token,opsPepper);
  h.sqlite.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES (?,?,?,?,?)")
   .run("ops-cover-owner","Cover owner","publisher","production",digest);
  const uploadPath="/api/ops/books/rainy-test/cover";
  const png=validPng();
  assert.equal((await worker.fetch(uploadReq("rainy-test",png,{secret:null}),h.env)).status,401);
  assert.equal((await worker.fetch(uploadReq("rainy-test",png,{mime:"image/svg+xml"}),h.env)).status,415);
  const success=await worker.fetch(uploadReq("rainy-test",png),h.env);
  assert.equal(success.status,201,await success.clone().text());
  const json=await success.json();
  assert.match(json.coverUrl,/^\/api\/covers\/rainy-test\?v=[0-9a-f]{24}$/);
  assert.match(json.coverKey,/^cover-d1-[0-9a-f]{24}$/);
  assert.equal(h.sqlite.prepare("SELECT length(image_bytes) AS n FROM book_cover_images WHERE book_id=?").get("rainy-test").n,png.length);
  assert.equal(h.sqlite.prepare("SELECT cover_key FROM books WHERE id=?").get("rainy-test").cover_key,json.coverKey);
  const result=await worker.fetch(new Request(origin+"/api/covers/rainy-test"),h.env);
  assert.equal(result.status,200);
  assert.equal(result.headers.get("content-type"),"image/png");
  assert.equal((await result.arrayBuffer()).byteLength,png.length);
  assert.equal((await worker.fetch(new Request(origin+"/api/ops/books/rainy-test/cover"),h.env)).status,401);
  const privateCover=await worker.fetch(uploadReq("draft-test",png),h.env);
  assert.equal(privateCover.status,201);
  assert.equal((await worker.fetch(new Request(origin+"/api/covers/draft-test"),h.env)).status,404);
  assert.equal((await worker.fetch(new Request(origin+"/api/ops/books/draft-test/cover",{
   headers:{"X-Mw-Ops-Key":token}}),h.env)).status,200);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS n FROM ops_audit_events WHERE event_type='book.cover.upload'").get().n,2);
 }finally{h.sqlite.close()}
});
test("S130 cover migration is additive and never changes account records",()=>{
 const h=harness();
 try{
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n,0);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS n FROM activation_codes").get().n,0);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS n FROM book_cover_images").get().n,0);
 }finally{h.sqlite.close()}
});
