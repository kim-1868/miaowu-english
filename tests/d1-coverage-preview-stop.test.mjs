import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {handleOpsImport} from "../src/ops-import.js";

test("old coverage endpoint always returns 410 without accessing D1 or operator credentials",async()=>{
 let dbReads=0,configReads=0;
 const env=new Proxy({},{
  get(){configReads++;throw Error("Coverage kill-switch must not access env / D1");}
 });
 for(const method of ["GET","POST","OPTIONS"]){
  const req=new Request("https://miaowu.test/api/ops/import/coverage?book=legacy",{
   method,
   headers:{"content-type":"application/json"},
   ...(method==="POST"?{body:JSON.stringify({book:{id:"old"}})}:{})
  });
  const result=await handleOpsImport(req,env,"/api/ops/import/coverage");
  assert.equal(result.status,410);
  assert.equal(result.headers.get("cache-control"),"private, no-store");
  assert.equal((await result.json()).error,"COVERAGE_PREVIEW_DISABLED_BATCH_REVIEW_ONLY");
 }
 assert.equal(dbReads,0);
 assert.equal(configReads,0);
});

test("old Publisher preview no longer fires the global coverage endpoint",()=>{
 const js=readFileSync(new URL("../public/ops-console.js",import.meta.url),"utf8");
 assert.doesNotMatch(js,/api\(["']\/api\/ops\/import\/coverage["']/);
 assert.match(js,/整批发布后统一复核/);
 assert.match(js,/previewNovelPackage\(pkg\)/);
 const backend=readFileSync(new URL("../src/ops-import.js",import.meta.url),"utf8");
 assert.doesNotMatch(backend,/reviewNovelCoverage\(/);
 assert.match(backend,/COVERAGE_PREVIEW_DISABLED_BATCH_REVIEW_ONLY/);
});
