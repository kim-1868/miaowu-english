import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inspectV11Preview} from "../scripts/check-v11-preview-config.mjs";
const read=(p)=>JSON.parse(readFileSync(new URL("../"+p,import.meta.url),"utf8"));
const staging=read("wrangler.jsonc"),production=read("deploy/production.wrangler.jsonc");
const clone=(x)=>structuredClone(x);
test("V1.1 preview uses only staging worker and test D1 behind reviewer password",()=>{
 const check=inspectV11Preview(staging,production);
 assert.equal(check.safe,true,check.failures.join(","));
 assert.equal(check.status,"CONFIG_ONLY_NOT_DEPLOYED");
});
test("V1.1 preview rejects accidental production D1, worker name, or environment",()=>{
 for(const mutate of [
  c=>c.d1_databases[0].database_id=production.d1_databases[0].database_id,
  c=>c.name="miaowu-english-production",
  c=>c.vars.APP_ENV="production",
  c=>c.assets.run_worker_first=false,
  c=>c.secrets.required=[],
  c=>c.vars.OPS_PUBLICATION_ENABLED="true"
 ]) {
  const c=clone(staging);mutate(c);
  assert.equal(inspectV11Preview(c,production).safe,false);
 }
});
test("V1.1 staging secret and production proxy remain isolated",()=>{
 assert.equal(production.vars.APP_ENV,"production");
 assert.notEqual(staging.name,production.name);
 const page=read("pages-production/wrangler.jsonc");
 assert.equal(page.services[0].binding,"PRODUCTION_ORIGIN");
 assert.equal(page.services[0].service,production.name);
 assert.notEqual(page.services[0].service,staging.name);
});
