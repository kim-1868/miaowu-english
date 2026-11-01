// Configuration audit ONLY. This script does not deploy, query Cloudflare,
// create users, migrate tables, or approve a commercial release.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const STAGING_DB_ID="88a817cb-23bb-4ae4-bcb8-92286c4165d4";
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function auditProductionConfig(config){
 const issues=[];
 const reject=(code,condition)=>{if(condition)issues.push(code)};
 if(!config||typeof config!=="object"||Array.isArray(config))
  return {safe:false,issues:["CONFIG_NOT_OBJECT"],status:"NOT_DEPLOYABLE"};
 const name=config.name;
 reject("WORKER_NAME_MUST_BE_PRODUCTION",typeof name!=="string"||!/^miaowu-english-(?:production|prod)$/.test(name));
 reject("APP_ENV_NOT_PRODUCTION",config.vars?.APP_ENV!=="production");
 reject("STAGING_VARIABLES_PRESENT",Object.entries(config.vars??{}).some(
  ([k,v])=>/staging|preview|qa|test/i.test(k)||/staging|qa_only|test-only/i.test(String(v))));
 reject("PRODUCTION_ASSETS_MUST_RUN_THROUGH_WORKER",
  config.assets?.binding!=="ASSETS"||config.assets?.run_worker_first!==true||
  !/public\/?$/.test(config.assets?.directory??""));
 reject("WORKER_ENTRY_MISSING",typeof config.main!=="string"||
  !/src\/worker\.js$/.test(config.main));
 const dbs=config.d1_databases;
 reject("EXACTLY_ONE_DB_REQUIRED",!Array.isArray(dbs)||dbs.length!==1);
 const db=Array.isArray(dbs)&&dbs.length===1?dbs[0]:null;
 if(db){
  reject("DB_BINDING_INVALID",db.binding!=="DB");
  reject("STAGING_DB_NAME",typeof db.database_name!=="string"||
    db.database_name!=="miaowu-english-prod");
  reject("STAGING_DB_IDENTIFIER",!UUID.test(db.database_id??"")||
    db.database_id===STAGING_DB_ID);
 }
 const required=config.secrets?.required;
 reject("ACTIVATION_PEPPER_SECRET_REQUIRED",!Array.isArray(required)||
  !required.includes("ACTIVATION_PEPPER"));
 reject("PREVIEW_PASSWORD_NOT_ALLOWED_IN_PUBLIC_CONFIG",
  Array.isArray(required)&&required.some(s=>/STAGING_PREVIEW_PASSWORD/i.test(s)));
 reject("NO_OPS_PUBLISHING_IN_RELEASE_CONFIG",
  Object.entries(config.vars??{}).some(([k,v])=>
   ["OPS_CONSOLE_ENABLED","OPS_WITHDRAWAL_ENABLED","OPS_PUBLICATION_ENABLED"].includes(k)&&String(v)==="true"));
 reject("APP_SECRET_IN_PLAINTEXT_VARIABLES",
  Object.keys(config.vars??{}).some(k=>/PEPPER|TOKEN|PASSWORD|SECRET|KEY/i.test(k)));
 reject("NO_UNREVIEWED_MIGRATION_AUTOMATION",
  !!config.migrations_auto_apply || !!config.remote_migrations_apply);
 return {
  safe:issues.length===0,
  issues,
  status:issues.length?"NOT_DEPLOYABLE":"CONFIG_CHECK_ONLY_NOT_LAUNCH_APPROVAL",
  note:"Does not certify database lineage, content, payment, lawful operation or mainland availability."
 };
}
function main(args){
 if(args.length!==1)throw new Error("Usage: node scripts/check-production-config.mjs <new-production-wrangler.jsonc>");
 const input=readFileSync(resolve(args[0]),"utf8");
 const audit=auditProductionConfig(JSON.parse(input));
 process.stdout.write(JSON.stringify(audit,null,2)+"\n");
 if(!audit.safe)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main(process.argv.slice(2))}catch(e){
  process.stderr.write("PRODUCTION_CONFIG_CHECK_FAILED: "+e.message+"\n");
  process.exitCode=1;
 }
}
