// Fail-closed V1.1 preview target verification. No Cloudflare connection or writes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
export function auditV11PreviewConfig(staging=read("wrangler.jsonc"),production=read("deploy/production.wrangler.jsonc"),pages=read("pages-production/wrangler.jsonc")){
  const errors=[];
  const assert=(ok,message)=>{if(!ok)errors.push(message)};
  assert(staging.name==="miaowu-english-staging","STAGING_WORKER_NAME_MISMATCH");
  assert(staging.main==="src/worker.js","STAGING_ENTRY_MISMATCH");
  assert(staging.vars?.APP_ENV==="staging","STAGING_APP_ENV_REQUIRED");
  assert(staging.assets?.directory==="./public"&&staging.assets?.run_worker_first===true,
    "STAGING_ASSET_GATE_REQUIRED");
  assert(staging.d1_databases?.length===1,"ONE_STAGING_D1_REQUIRED");
  assert(staging.d1_databases?.[0]?.binding==="DB" &&
    staging.d1_databases[0].database_name==="miaowu-english-test" &&
    staging.d1_databases[0].database_id==="88a817cb-23bb-4ae4-bcb8-92286c4165d4",
    "STAGING_D1_MUST_BE_TEST_ONLY");
  assert(staging.secrets?.required?.includes("STAGING_PREVIEW_PASSWORD"),"PREVIEW_ACCESS_SECRET_REQUIRED");
  assert(staging.secrets?.required?.includes("ACTIVATION_PEPPER"),"STAGING_ACTIVATION_SECRET_REQUIRED");
  assert(production.name==="miaowu-english-production"&&production.vars?.APP_ENV==="production",
    "PRODUCTION_CONFIG_CHANGED");
  assert(production.d1_databases?.[0]?.database_name==="miaowu-english-prod" &&
    production.d1_databases?.[0]?.database_id!=="88a817cb-23bb-4ae4-bcb8-92286c4165d4",
    "PRODUCTION_D1_NOT_DISTINCT");
  assert(staging.d1_databases?.[0]?.database_id!==production.d1_databases?.[0]?.database_id,
    "STAGING_MUST_NOT_SHARE_PRODUCTION_D1");
  assert(pages.services?.[0]?.binding==="PRODUCTION_ORIGIN" &&
    pages.services?.[0]?.service==="miaowu-english-production",
    "PUBLIC_PAGES_ROUTING_UNEXPECTED");
  assert(!("services" in staging),"STAGING_MUST_NOT_PROXY_PRODUCTION");
  assert(!("migrations_auto_apply" in staging),"PREVIEW_MUST_NOT_AUTO_MIGRATE");
  assert(!("ACTIVATION_PEPPER" in (staging.vars||{})),"NO_PLAINTEXT_STAGING_SECRETS");
  assert(!("STAGING_PREVIEW_PASSWORD" in (staging.vars||{})),"NO_PLAINTEXT_PREVIEW_SECRET");
  return {safe:errors.length===0,environment:"STAGING_ONLY",database:"miaowu-english-test",errors};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const result=auditV11PreviewConfig();
 if(!result.safe){console.error(JSON.stringify(result));process.exitCode=1}
 else console.log(JSON.stringify(result));
}
