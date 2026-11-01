import {test} from "node:test";
import assert from "node:assert/strict";
import entry from "./entry.mjs";
const origin="https://miaowu-prod-unit-test.invalid";
const request=(pathname,method="GET",body)=>new Request(origin+pathname,{
 method,headers:{"Origin":origin,"Content-Type":"application/json",
 "Cookie":"mw_session=ONLY_A_TEST_TOKEN","Cache-Control":"no-store"},
 ...(body?{body:JSON.stringify(body)}:{})
});
test("S17 production Pages refuses ALL application content when binding absent",async()=>{
 const env={ASSETS:{fetch:async()=>new Response("LEAKED_STATIC_ASSET")}};
 for(const path of ["/","/index.html","/app.js","/api/auth/me",
  "/api/auth/register","/api/chapters/chapter-cet4","/account-test.html"]){
  const result=await entry.fetch(request(path),env);
  assert.equal(result.status,503,path);
  assert.equal(result.headers.get("cache-control"),"no-store, max-age=0");
  assert.doesNotMatch(await result.text(),/LEAKED_STATIC_ASSET/);
 }
});
test("S17 production Pages forwards request unchanged to dedicated Worker",async()=>{
 const calls=[],body={chapterId:"chapter-01",progress:1};
 const env={PRODUCTION_ORIGIN:{fetch:async req=>{
  calls.push({url:req.url,method:req.method,cookie:req.headers.get("cookie"),
   origin:req.headers.get("origin"),body:await req.text()});
  return new Response(JSON.stringify({saved:true}),{status:200,headers:{
   "content-type":"application/json","cache-control":"private, no-store"
  }});
 }}};
 const reply=await entry.fetch(request("/api/me/progress?from=reader","POST",body),env);
 assert.equal(reply.status,200);
 assert.deepEqual(await reply.json(),{saved:true});
 assert.equal(reply.headers.get("cache-control"),"private, no-store");
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,origin+"/api/me/progress?from=reader");
 assert.equal(calls[0].method,"POST");
 assert.equal(calls[0].cookie,"mw_session=ONLY_A_TEST_TOKEN");
 assert.equal(calls[0].origin,origin);
 assert.deepEqual(JSON.parse(calls[0].body),body);
});
test("S17 only harmless GET production-edge probe can bypass service binding",async()=>{
 const env={PRODUCTION_ORIGIN:{fetch:async()=>new Response("FROM_PRODUCTION_WORKER",{status:407})}};
 const good=await entry.fetch(request("/__miaowu_prod_edge_probe"),{});
 assert.equal(good.status,200);
 assert.deepEqual(await good.json(),{
  ok:true,layer:"pages-production-entry",dataAccess:false,productionBindingPresent:false
 });
 for(const [p,m] of [["/__miaowu_prod_edge_probe","POST"],["/__miaowu_prod_edge_probe/","GET"],
  ["/__miaowu_prod_edge_probe2","GET"],["/","GET"]]){
  const r=await entry.fetch(request(p,m),env);assert.equal(r.status,407);
 }
});
