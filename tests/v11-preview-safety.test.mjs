import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditV11PreviewConfig} from "../scripts/check-v11-preview-config.mjs";
const read=p=>JSON.parse(readFileSync(new URL("../"+p,import.meta.url),"utf8"));
const staging=read("wrangler.jsonc"),prod=read("deploy/production.wrangler.jsonc"),pages=read("pages-production/wrangler.jsonc");
const copy=x=>structuredClone(x);
test("V1.1 staging review must be isolated from production and password protected",()=>{
 const result=auditV11PreviewConfig(staging,prod,pages);
 assert.equal(result.safe,true,result.errors.join(", "));
 assert.equal(result.database,"miaowu-english-test");
});
test("V1.1 review deployment must refuse prod DB, worker, proxies, and disabled gates",()=>{
 const bad=[
  s=>s.name="miaowu-english-production",
  s=>s.vars.APP_ENV="production",
  s=>s.d1_databases[0].database_name="miaowu-english-prod",
  s=>s.d1_databases[0].database_id=prod.d1_databases[0].database_id,
  s=>s.assets.run_worker_first=false,
  s=>s.secrets.required=[],
  s=>s.services=[{binding:"PRODUCTION_ORIGIN",service:"miaowu-english-production"}],
  s=>s.migrations_auto_apply=true,
  s=>s.vars.ACTIVATION_PEPPER="unsafe",
 ];
 for(const change of bad){
  const s=copy(staging);change(s);
  assert.equal(auditV11PreviewConfig(s,prod,pages).safe,false,JSON.stringify(s));
 }
});
test("V1.1 preview must not rewire public Pages to staging",()=>{
 const p=copy(pages);p.services[0].service="miaowu-english-staging";
 assert.equal(auditV11PreviewConfig(staging,prod,p).safe,false);
});
test("V1.1 preview gate requires a private reviewer before showing customer pages",()=>{
 const gate=readFileSync(new URL("../src/staging-gate.js",import.meta.url),"utf8");
 const worker=readFileSync(new URL("../src/worker.js",import.meta.url),"utf8");
 assert.match(gate,/STAGING_PREVIEW_PASSWORD/);
 assert.match(gate,/validBasic/);
 assert.match(gate,/status: 401/);
 assert.match(worker,/await stagingGate\(request, env\)/);
});
