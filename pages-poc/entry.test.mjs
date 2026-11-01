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

test("proxy preserves logged-in session, same-origin POST, request body and query string",async()=>{
 const requests=[];
 const env={STAGING_ORIGIN:{fetch:async request=>{
  requests.push({
   method:request.method,url:request.url,origin:request.headers.get("Origin"),
   cookie:request.headers.get("Cookie"),contentType:request.headers.get("Content-Type"),
   payload:await request.text()
  });
  return new Response(JSON.stringify({saved:true}),{status:200,headers:{
    "content-type":"application/json","cache-control":"private, no-store"
  }});
 }}};
 const req=new Request(base+"/api/me/progress?source=reader",{
  method:"POST",headers:{
   "Content-Type":"application/json",
   "Cookie":"mw_session=TEST_COOKIE_NEVER_A_REAL_TOKEN",
   "Origin":base
  },body:JSON.stringify({chapterId:"qa-cet4-echo",progress:1})
 });
 const result=await entry.fetch(req,env,{});
 assert.equal(result.status,200);
 assert.deepEqual(await result.json(),{saved:true});
 assert.equal(result.headers.get("cache-control"),"private, no-store");
 assert.equal(requests.length,1);
 assert.equal(requests[0].method,"POST");
 assert.equal(requests[0].url,base+"/api/me/progress?source=reader");
 assert.equal(requests[0].origin,base);
 assert.equal(requests[0].cookie,"mw_session=TEST_COOKIE_NEVER_A_REAL_TOKEN");
 assert.equal(requests[0].contentType,"application/json");
 assert.deepEqual(JSON.parse(requests[0].payload),{chapterId:"qa-cet4-echo",progress:1});
});

test("previews and paid endpoints return original Worker responses without caching or rewriting cookies",async()=>{
 const env={STAGING_ORIGIN:{fetch:async request=>{
  const url=new URL(request.url);
  if(url.pathname==="/"){
   return new Response("staging reviewer required",{status:401,headers:{
    "www-authenticate":'Basic realm="Miaowu Staging"',"cache-control":"no-store"
   }});
  }
  if(url.pathname==="/api/chapters/qa-cet4-paid"){
   return new Response(JSON.stringify({error:"LOGIN_REQUIRED"}),{status:401,
    headers:{"content-type":"application/json","cache-control":"private, no-store"}});
  }
  return new Response("not found",{status:404});
 }}};
 const root=await entry.fetch(req("/"),env,{});
 assert.equal(root.status,401);
 assert.equal(root.headers.get("www-authenticate"),'Basic realm="Miaowu Staging"');
 assert.equal(root.headers.get("cache-control"),"no-store");
 const paid=await entry.fetch(req("/api/chapters/qa-cet4-paid"),env,{});
 assert.equal(paid.status,401);
 assert.equal((await paid.json()).error,"LOGIN_REQUIRED");
 assert.equal(paid.headers.get("cache-control"),"private, no-store");
});

test("only exact GET network probes bypass staging authentication, never alternative methods or prefixes",async()=>{
 const requests=[];
 const env={ASSETS:asset(),STAGING_ORIGIN:{fetch:async request=>{
  requests.push(new URL(request.url).pathname+"|"+request.method);
  return new Response("STAGING_ACCESS_REQUIRED",{status:401});
 }}};
 for(const [pathname,method] of [
  ["/__miaowu_pages_function_probe","POST"],
  ["/__miaowu_pages_function_probe/","GET"],
  ["/__miaowu_pages_function_probe-extra","GET"],
  ["/__miaowu_pages_asset_probe.txt","POST"],
  ["/__miaowu_pages_asset_probe.txt/","GET"],
  ["/ops.html","GET"],
  ["/api/ops/me","GET"]
 ]){
  const response=await entry.fetch(new Request(base+pathname,{method}),env,{});
  assert.equal(response.status,401,pathname+" "+method);
 }
 assert.equal(requests.length,7);
});
