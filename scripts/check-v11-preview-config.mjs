// V1.1 preview-only configuration audit. Never accesses Cloudflare or D1.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const EXPECTED_TEST_DB="88a817cb-23bb-4ae4-bcb8-92286c4165d4";
const EXPECTED_PROD_DB="649c71b3-340c-49bf-b806-3d39256851d3";
export function inspectV11Preview(staging,production) {
  const failures=[];
  const insist=(ok,reason)=>{if(!ok)failures.push(reason)};
  insist(staging?.name==="miaowu-english-staging","NOT_DEDICATED_STAGING_WORKER");
  insist(staging?.vars?.APP_ENV==="staging","APP_ENV_MUST_BE_STAGING");
  insist(!Object.keys(staging?.vars||{}).some(x=>/SECRET|PEPPER|PASSWORD|TOKEN/i.test(x)),
    "SECRET_EXPOSED_IN_PLAINTEXT_VARIABLES");
  insist(staging?.main==="src/worker.js","STAGING_WORKER_ENTRY_UNEXPECTED");
  insist(staging?.assets?.directory==="./public" && staging?.assets?.binding==="ASSETS" &&
    staging?.assets?.run_worker_first===true,"STAGING_ASSETS_MUST_PASS_WORKER_GATE");
  insist(Array.isArray(staging?.d1_databases) && staging.d1_databases.length===1,
    "STAGING_DB_BINDING_COUNT_INVALID");
  const db=staging?.d1_databases?.[0]??{};
  insist(db.binding==="DB" && db.database_name==="miaowu-english-test" &&
    db.database_id===EXPECTED_TEST_DB,"STAGING_D1_MUST_BE_TEST_INSTANCE");
  insist(db.database_id!==EXPECTED_PROD_DB,"PRODUCTION_D1_BINDING_FORBIDDEN");
  insist(production?.name==="miaowu-english-production","PRODUCTION_REFERENCE_INVALID");
  insist(production?.d1_databases?.[0]?.database_id===EXPECTED_PROD_DB,
    "PRODUCTION_REFERENCE_DB_INVALID");
  insist(db.database_id!==production?.d1_databases?.[0]?.database_id,
    "STAGING_AND_PRODUCTION_D1_MUST_DIFFER");
  const required=staging?.secrets?.required??[];
  insist(required.includes("STAGING_PREVIEW_PASSWORD") && required.includes("ACTIVATION_PEPPER"),
    "REVIEW_GATE_AND_TEST_PEPPER_REQUIRED");
  insist(staging?.keep_vars===true,"KEEP_STAGING_VARIABLES_ENABLED");
  insist(!Object.entries(staging?.vars??{}).some(([key,value])=>
    /^OPS_/.test(key) && String(value).toLowerCase()==="true"),"PUBLISHING_MUTATIONS_NOT_ALLOWED");
  return {safe:failures.length===0,failures,status:failures.length?"PREVIEW_BLOCKED":"CONFIG_ONLY_NOT_DEPLOYED"};
}
const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self) {
  try {
    const staging=JSON.parse(readFileSync(resolve("wrangler.jsonc"),"utf8"));
    const production=JSON.parse(readFileSync(resolve("deploy/production.wrangler.jsonc"),"utf8"));
    const report=inspectV11Preview(staging,production);
    process.stdout.write(JSON.stringify(report,null,2)+"\n");
    if(!report.safe)process.exitCode=1;
  } catch (error) {
    process.stderr.write("PREVIEW_CONFIG_CHECK_FAILED: "+error.message+"\n");
    process.exitCode=1;
  }
}
