import {test} from "node:test";
import assert from "node:assert/strict";
import entry from "./entry.mjs";
const base="https://miaowu-english-access-check.pages.dev";
const req=path=>new Request(base+path);
const asset=()=>({fetch:async()=>new Response("MIAOWU_PAGES_STATIC_ASSET_OK")});

test("two harmless probes work without any database or secrets",async()=>{
 const env={ASSETS:asset()};
 const response=await entry.fetch(req("/__miaowu_pages_function_probe"),env,{});
 const info=await response.json();
 assert.equal(response.status,200);
 assert.equal(info.ok,true);
 assert.equal(info.layer,"pages-function");
 assert.equal(info.serviceBindingPresent,false);
 assert.equal(info.dataAccess,false);
 const staticResponse=await entry.fetch(req("/__miaowu_pages_asset_probe.txt"),env,{});
 assert.equal(staticResponse.status,200);
 assert.match(await staticResponse.text(),/MIAOWU_PAGES_STATIC_ASSET_OK/);
});

test("a missing service binding never leaks any private staging page or API",async()=>{
 const env={ASSETS:{fetch:async()=>new Response("LEAKED_PAGE")}};
 for(const path of ["/","/api/auth/me","/reading-test.html","/ops.html"]){
  const response=await entry.fetch(req(path),env,{});
  assert.equal(response.status,503);
  assert.doesNotMatch(await response.text(),/LEAKED_PAGE/);
 }
});

test("all protected application requests delegate unchanged to staging Worker",async()=>{
 const calls=[];
 const env={
  ASSETS:asset(),
  STAGING_ORIGIN:{fetch:async request=>{
    calls.push(request);
    return new Response("STAGING_ACCESS_REQUIRED",{status:401,
      headers:{"set-cookie":"__Host-mw_preview=redacted; HttpOnly; Secure"}});
  }}
 };
 for(const path of ["/","/api/chapters/qa-cet4-paid","/reading-test.html"]){
  const request=req(path);
  const response=await entry.fetch(request,env,{});
  assert.equal(response.status,401);
  assert.equal(response.headers.get("set-cookie"),
    "__Host-mw_preview=redacted; HttpOnly; Secure");
 }
 assert.deepEqual(calls.map(r=>new URL(r.url).pathname),
   ["/","/api/chapters/qa-cet4-paid","/reading-test.html"]);
 assert.ok(calls.every(r=>new URL(r.url).host==="miaowu-english-access-check.pages.dev"));
});
