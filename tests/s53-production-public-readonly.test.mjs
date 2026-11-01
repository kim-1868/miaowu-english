import {test} from "node:test";
import assert from "node:assert/strict";
import {
 PUBLIC_ORIGIN,SAFETY_ENDPOINTS,probeProductionReadonly
} from "../scripts/probe-production-readonly.mjs";

const fixtures={
 "/__miaowu_prod_edge_probe":{ok:true,layer:"pages-production-entry",
  productionBindingPresent:true,dataAccess:false},
 "/api/health":{ok:true,dbBound:true,authConfigured:true,
  activationSecretReady:true,activationSecretStatus:"hidden",paymentIntegration:false},
 "/api/categories":{categories:[{slug:"cet4"},{slug:"cet6"},
  {slug:"ielts"},{slug:"postgrad"}]},
 "/api/auth/me":{error:"LOGIN_REQUIRED"},
 "/api/books?category=cet4":{books:[]},
 "/":"<!doctype html><html lang=\"zh-CN\"><title>妙屋英语</title></html>"
};
function fixtureFetch(overrides={},capture=[]){
 return async(url,options)=>{
  const u=new URL(url),path=u.pathname+u.search;
  capture.push({u:url,method:options?.method,redirect:options?.redirect,
    credentials:options?.credentials,headers:options?.headers});
  assert.equal(u.origin,PUBLIC_ORIGIN);
  assert.equal(options.method,"GET");
  assert.equal(options.redirect,"manual");
  assert.ok(!options.headers.cookie);
  assert.ok(!options.headers.authorization);
  if(SAFETY_ENDPOINTS.includes(path))
   return new Response(path.startsWith("/api/")?
    JSON.stringify({error:"NOT_FOUND"}):"Not found",
    {status:404});
  if(!Object.hasOwn(fixtures,path))throw Error("UNKNOWN_PATH_"+path);
  const value=Object.hasOwn(overrides,path)?overrides[path]:fixtures[path];
  const code=path==="/api/auth/me"?401:200;
  return new Response(typeof value==="string"?value:JSON.stringify(value),
   {status:code});
 };
}
test("S53 public production probe is GET-only and checks binding, anonymous isolation and no staging lab leaks",async()=>{
 const calls=[],result=await probeProductionReadonly({fetcher:fixtureFetch({},calls)});
 assert.equal(result.status,"READONLY_PRODUCTION_EDGE_PROBE_PASSED");
 assert.equal(result.checks,6+SAFETY_ENDPOINTS.length);
 assert.equal(result.visibleCET4Books,0);
 assert.equal(result.paymentIntegration,false);
 assert.equal(result.productionWrites,0);
 assert.equal(result.credentialsUsed,false);
 assert.equal(calls.length,result.checks);
 assert.ok(result.NOT_VERIFIED.includes("paid chapter entitlement"));
});
test("S53 refuses any alternate origin, even when apparently owned by Cloudflare",async()=>{
 for(const origin of ["https://miaowu-english-staging.kim10086a.workers.dev",
  "https://example.com","http://miaowu-english-pages.pages.dev"]){
  await assert.rejects(()=>probeProductionReadonly({origin,fetcher:fixtureFetch()}),
   /S53_PUBLIC_ORIGIN_MUST_BE_PINNED/);
 }
});
test("S53 fails closed for disconnected service binding, missing D1, leaked guest session or QA book",async()=>{
 const cases=[
  {"/__miaowu_prod_edge_probe":{...fixtures["/__miaowu_prod_edge_probe"],
   productionBindingPresent:false}},
  {"/api/health":{...fixtures["/api/health"],dbBound:false}},
  {"/api/auth/me":{error:"LEAKED_ACCOUNT"}},
  {"/api/books?category=cet4":{books:[{id:"draft-first-story",title:"审核中"}]}}
 ];
 for(const item of cases)
  await assert.rejects(()=>probeProductionReadonly({fetcher:fixtureFetch(item)}),
   /S53_(PAGES_SERVICE_BINDING_NOT_CONFIRMED|WORKER_D1_AUTH_HEALTH_NOT_READY|GUEST_AUTH_LEAK|PRIVATE_OR_TEST_BOOK_VISIBLE)/);
});
const onVerificationBranch=process.env.GITHUB_HEAD_REF===
 "qa/s53-production-readonly-acceptance-probe-20261102"||
 process.env.MIAOWU_PUBLIC_READONLY_PROBE==="1";
test("S53 real customer-facing Pages host supports safe anonymous read-only acceptance",
 {skip:!onVerificationBranch},
 async()=>{
  const report=await probeProductionReadonly();
  assert.equal(report.productionWrites,0);
  assert.equal(report.credentialsUsed,false);
  assert.equal(report.status,"READONLY_PRODUCTION_EDGE_PROBE_PASSED");
 });
