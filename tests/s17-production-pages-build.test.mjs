import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
const base=new URL("../pages-production/",import.meta.url);
const root=new URL("../pages-production/dist/",import.meta.url);
const file=relative=>readFileSync(new URL(relative,root),"utf8");
test("S17 built production Pages artifact contains only routing code and harmless placeholder",()=>{
 execFileSync(process.execPath,[fileURLToPath(new URL("build.mjs",base))],{
  cwd:fileURLToPath(base),encoding:"utf8"
 });
 assert.deepEqual(readdirSync(root).sort(),[
  "__miaowu_deployment_placeholder.txt","_routes.json","_worker.js"].sort());
 const routes=JSON.parse(file("_routes.json"));
 assert.deepEqual(routes.include,["/*"]);
 assert.deepEqual(routes.exclude,[]);
 const worker=file("_worker.js");
 assert.match(worker,/PRODUCTION_ORIGIN/);
 for(const forbidden of ["STAGING_ORIGIN","ACTIVATION_PEPPER","STAGING_PREVIEW_PASSWORD",
  "miaowu-english-test","rns1-","rose-v03","localStorage","const CHAPTERS="]){
  assert.ok(!worker.includes(forbidden),forbidden);
 }
 assert.match(file("__miaowu_deployment_placeholder.txt"),/no reader content/i);
});
test("S17 production Pages service binding must be production, never staging",()=>{
 const config=JSON.parse(readFileSync(new URL("wrangler.jsonc",base),"utf8"));
 assert.equal(config.name,"miaowu-english-web");
 assert.equal(config.pages_build_output_dir,"./dist");
 assert.deepEqual(config.services,[{
  binding:"PRODUCTION_ORIGIN",service:"miaowu-english-production"
 }]);
 assert.equal("d1_databases" in config,false);
 assert.equal("vars" in config,false);
 assert.equal("secrets" in config,false);
});
