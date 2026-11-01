import {test} from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import {isRestrictedProductionPath,productionSurfaceBlock} from "../src/production-surface.js";
const root="https://miaowu-public.example";
const req=path=>new Request(root+path);
test("S12 production refuses QA/debug HTML, source JavaScript and staging API",async()=>{
 const paths=[
  "/account-test.html","/account-test.js",
  "/reading-test.html","/reading-test.js",
  "/editor.html","/editor.js","/editor-edit.html","/editor-edit.js",
  "/editor-review.html","/editor-review.js","/editor-publication.html",
  "/ops.html","/ops-console.html","/ops-console.js",
  "/api/staging","/api/staging/test-voucher",
  "/api/staging/seed-echo-fixture","/api/staging/editor/books",
  "/api/chapters/qa-cet4-paid","/api/chapters/qa-cet4-paid/words",
  "/api/books/qa-cet4/chapters"
 ];
 for(const path of paths){
  assert.equal(isRestrictedProductionPath(path),true,path);
  const response=await worker.fetch(req(path),{
   APP_ENV:"production",ASSETS:{fetch:async()=>new Response("LEAKED_DEV_ASSET") }
  });
  assert.equal(response.status,404,path);
  assert.equal(response.headers.get("cache-control"),"no-store");
  assert.doesNotMatch(await response.text(),/LEAKED_DEV_ASSET/);
 }
});
test("S12 does not block normal reader pages or public auth endpoint routes",async()=>{
 for(const path of ["/","/index.html","/styles.css","/app.js",
 "/api/auth/register","/api/auth/login","/api/auth/me",
 "/api/categories","/api/activate","/api/books?category=cet4",
 "/api/chapters/chapter-01","/api/me/words","/api/ops/me"]){
  assert.equal(isRestrictedProductionPath(path.split("?")[0]),false,path);
  assert.equal(productionSurfaceBlock(req(path),{APP_ENV:"production"}),null);
 }
 const response=await worker.fetch(req("/"),{
  APP_ENV:"production",ASSETS:{fetch:async()=>new Response("PUBLIC_READER_FRONTEND")}
 });
 assert.equal(response.status,200);
 assert.equal(await response.text(),"PUBLIC_READER_FRONTEND");
});
test("S12 production restriction never changes existing private staging gate",async()=>{
 assert.equal(productionSurfaceBlock(req("/reading-test.html"),{APP_ENV:"staging"}),null);
 const denied=await worker.fetch(req("/reading-test.html"),{
  APP_ENV:"staging",ASSETS:{fetch:async()=>new Response("SHOULD_NOT_LEAK")}
 });
 assert.equal(denied.status,503);
 assert.match(await denied.text(),/Staging is not ready/);
});
test("S12 never exposes QA debug assets even for otherwise legitimate reader",async()=>{
 const assetPaths=["/account-test.html","/reading-test.html","/editor.html"];
 let assetHit=0;
 for(const path of assetPaths){
  const response=await worker.fetch(req(path),{
   APP_ENV:"production",ASSETS:{fetch:async()=>{assetHit++;return new Response("BAD")}}
  });
  assert.equal(response.status,404);
 }
 assert.equal(assetHit,0);
});
