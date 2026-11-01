import {test} from "node:test";
import assert from "node:assert/strict";
import entry from "./entry.mjs";

const base="https://miaowu-pages-test.invalid";
const req=path=>new Request(base+path);

test("safe public Pages probes expose only coarse connectivity flags",async()=>{
 const env={ASSETS:{fetch:async()=>new Response("MIAOWU_PAGES_STATIC_ASSET_OK")}};
 const res=await entry.fetch(req("/__miaowu_pages_function_probe"),env,{});
 assert.equal(res.status,200);
 const info=await res.json();
 assert.equal(info.ok,true);
 assert.equal(info.layer,"pages-function");
 assert.equal(info.stagingConfigured,false);
 assert.equal(info.dbBindingPresent,false);
 assert.equal(info.dataAccess,false);
 const staticResponse=await entry.fetch(req("/__miaowu_pages_asset_probe.txt"),env,{});
 assert.equal(staticResponse.status,200);
 assert.match(await staticResponse.text(),/MIAOWU_PAGES_STATIC_ASSET_OK/);
});
test("all other Pages paths fail closed before preview secrets if APP_ENV or D1 absent",async()=>{
 for(const environment of [
  {DB:{},ASSETS:{fetch:async()=>new Response("LEAKED_HTML")}},
  {APP_ENV:"staging",ASSETS:{fetch:async()=>new Response("LEAKED_HTML")}},
  {APP_ENV:"production",DB:{},ASSETS:{fetch:async()=>new Response("LEAKED_HTML")}}
 ]){
  for(const path of ["/","/account-test.html","/api/auth/me","/ops.html"]){
    const response=await entry.fetch(req(path),environment,{});
    assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),/LEAKED_HTML/);
  }
 }
});
test("with staging + DB but without preview secret, protected pages remain 503",async()=>{
 const env={APP_ENV:"staging",DB:{},ASSETS:{fetch:async()=>new Response("LEAKED_HTML")}};
 const response=await entry.fetch(req("/"),env,{});
 assert.equal(response.status,503);
 assert.match(await response.text(),/STAGING_PREVIEW_PASSWORD/);
});
