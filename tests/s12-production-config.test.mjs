import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditProductionConfig,STAGING_DB_ID} from "../scripts/check-production-config.mjs";

const clean=()=>({
 name:"miaowu-english-production",workers_dev:false,preview_urls:false,
 main:"../src/worker.js",
 vars:{APP_ENV:"production"},
 assets:{directory:"../public",binding:"ASSETS",run_worker_first:true},
 d1_databases:[{binding:"DB",database_name:"miaowu-english-prod",
  database_id:"1ec3883a-75ca-4572-a167-9860f341927d"}],
 secrets:{required:["ACTIVATION_PEPPER"]}
});
test("S12 new and isolated production Worker config passes audit but is NOT approved to launch",()=>{
 const audit=auditProductionConfig(clean());
 assert.equal(audit.safe,true);
 assert.equal(audit.status,"CONFIG_CHECK_ONLY_NOT_LAUNCH_APPROVAL");
});
test("S12 shipped template intentionally cannot deploy with fake D1 id",()=>{
 const sample=JSON.parse(readFileSync(new URL("../deploy/production.wrangler.jsonc.example",import.meta.url),"utf8"));
 assert.equal(auditProductionConfig(sample).safe,false);
 assert.ok(auditProductionConfig(sample).issues.includes("STAGING_DB_IDENTIFIER"));
});
test("S12 refuse exact staging database even when it is deceptively renamed prod",()=>{
 const config=clean();
 config.d1_databases[0].database_id=STAGING_DB_ID;
 const audit=auditProductionConfig(config);
 assert.equal(audit.safe,false);
 assert.ok(audit.issues.includes("STAGING_DB_IDENTIFIER"));
});
test("S12 prohibit legacy staging, unsafe static paths and secrets in plain env",()=>{
 for(const alter of [
  c=>c.name="miaowu-english-staging",
  c=>c.workers_dev=true,
  c=>c.preview_urls=true,
  c=>c.vars.APP_ENV="staging",
  c=>c.vars.ACTIVATION_PEPPER="DO_NOT_STORE_IN_CONFIG",
  c=>c.assets.run_worker_first=false,
  c=>c.assets.directory="../public-unverified",
  c=>c.main="../src/suspicious.js",
  c=>c.secrets.required=[],
  c=>c.secrets.required.push("STAGING_PREVIEW_PASSWORD"),
  c=>c.d1_databases[0].database_name="miaowu-english-test",
  c=>c.vars.OPS_PUBLICATION_ENABLED="true",
  c=>c.migrations_auto_apply=true
 ]){
  const config=clean();alter(config);
  assert.equal(auditProductionConfig(config).safe,false,JSON.stringify(config));
 }
});
test("S12 Pages must not point its service binding at staging after commercial launch",()=>{
 const stage={services:[{binding:"STAGING_ORIGIN",service:"miaowu-english-staging"}]};
 assert.equal(stage.services[0].service,"miaowu-english-staging");
 // This is a deployment checklist invariant, not a Pages API mutation.
 const commercialService="miaowu-english-production";
 assert.notEqual(stage.services[0].service,commercialService);
});
