import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {buildProductionAssets,auditProductionAssets,PRODUCTION_ASSET_ALLOWLIST}
 from "../scripts/build-production-assets.mjs";

test("S22 production bundle contains only explicit reviewed assets and no test laboratories",()=>{
 const report=buildProductionAssets();
 assert.equal(report.status,"REVIEWED_STATIC_ASSETS_ONLY");
 assert.deepEqual(report.assets,[...PRODUCTION_ASSET_ALLOWLIST].sort());
 assert.equal(report.assets.length,16);
 assert.ok(report.assets.includes("novel-file-parser.js"),"self-service uploader parser must deploy");
 const names=readdirSync(new URL("../dist-production/public/",import.meta.url));
 assert.deepEqual(names.sort(),[...PRODUCTION_ASSET_ALLOWLIST].sort());
 for(const prohibited of ["account-test.html","account-test.js","reading-test.html",
  "reading-test.js","editor.html","editor.js","editor-review.js",
  "editor-publication.js","editor-edit.js","design-reference-v03.html"]){
  assert.ok(!names.includes(prohibited),"must not ship "+prohibited);
 }
 assert.ok(readFileSync(new URL("../public/account-test.html",import.meta.url),"utf8").length>0,
  "keep staging public/ completely unchanged");
 assert.deepEqual(auditProductionAssets(),report);
});
test("S22 Worker must load only the sanitized production asset directory",()=>{
 const prod=JSON.parse(readFileSync(new URL("../deploy/production.wrangler.jsonc",import.meta.url),"utf8"));
 assert.equal(prod.assets.directory,"../dist-production/public");
 assert.equal(prod.assets.run_worker_first,true);
 assert.equal(prod.workers_dev,false);
 assert.equal(prod.preview_urls,false);
 assert.equal(prod.d1_databases[0].database_name,"miaowu-english-prod");
 const stage=JSON.parse(readFileSync(new URL("../wrangler.jsonc",import.meta.url),"utf8"));
 assert.equal(stage.assets.directory,"./public");
 assert.equal(stage.d1_databases[0].database_name,"miaowu-english-test");
});
