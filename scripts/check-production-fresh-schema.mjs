// Checks a fresh production D1 schema on an IN-MEMORY SQLite database.
// This script cannot connect to Cloudflare or mutate a remote D1 database.
// Run before independently reviewing/applying SQL to the newly created D1.
import {DatabaseSync} from "node:sqlite";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const FRESH_PRODUCTION_SCHEMA_FILES=Object.freeze([
 "db/001_schema.sql",
 "db/002_s1.sql",
 "db/003_public_categories.sql",
 "db/004_editorial_content.sql",
 "db/005_editorial_revisions.sql",
 "db/006_editorial_review_signoffs.sql",
 "db/007_ops_identity_audit.sql",
 "db/008_ops_release_workflow.sql",
 "db/production/001_one_paid_order_one_code.sql",
 "db/production/002_account_recovery_codes.sql"
]);
export const EXPECTED_NEW_PRODUCTION_D1="649c71b3-340c-49bf-b806-3d39256851d3";
export const EXPECTED_CATEGORY_SLUGS=["cet4","cet6","ielts","postgrad"];

export function assertCleanDatabase(db){
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV'").all();
 if(tables.length)throw Error("NOT_A_FRESH_EMPTY_DATABASE: "+tables.length+" existing application tables/views");
}
export function createLocalFreshSchema(){
 const db=new DatabaseSync(":memory:");
 try{
  db.exec("PRAGMA foreign_keys=ON;");
  assertCleanDatabase(db);
  for(const path of FRESH_PRODUCTION_SCHEMA_FILES){
   const sql=readFileSync(new URL("../"+path,import.meta.url),"utf8");
   if(/\bINSERT\s+(?:INTO|OR\s+\w+\s+INTO)\s+(?:users|sessions|activation_codes|entitlements|reading_progress|user_words|review_events)\b/i.test(sql))
    throw Error("PROHIBITED_CUSTOMER_OR_SECRET_SEED_IN_"+path);
   db.exec(sql);
  }
  const categorySlugs=db.prepare("SELECT slug FROM categories ORDER BY slug").all().map(x=>x.slug);
  if(JSON.stringify(categorySlugs)!==JSON.stringify(EXPECTED_CATEGORY_SLUGS))
   throw Error("CATEGORY_SEED_MISMATCH");
  const requiredTables=[
   "users","categories","books","chapters","words","chapter_words",
   "activation_codes","entitlements","sessions","request_throttle",
   "reading_progress","user_words","review_events","content_packages",
   "word_categories","editorial_revisions","editorial_review_signoffs",
   "ops_operators","ops_audit_events","ops_book_content_versions",
   "ops_publication_approvals","account_recovery"
  ];
  for(const name of requiredTables){
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
    throw Error("MISSING_REQUIRED_TABLE_"+name);
  }
  const indexes=["uq_activation_codes_one_paid_order","idx_account_recovery_hash"];
  for(const name of indexes){
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(name))
    throw Error("MISSING_REQUIRED_INDEX_"+name);
  }
  const columns=db.prepare("PRAGMA table_info(books)").all().map(x=>x.name);
  if(!columns.includes("last_release_request_id"))throw Error("MISSING_RELEASE_VERSION_COLUMN");
  const triggers=db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map(x=>x.name);
  if(!triggers.includes("ops_book_insert_version")||!triggers.includes("ops_audit_no_delete"))
   throw Error("MISSING_RELEASE_AUDIT_GUARDS");
  if(db.prepare("SELECT COUNT(*) AS n FROM users").get().n!==0||
     db.prepare("SELECT COUNT(*) AS n FROM activation_codes").get().n!==0||
     db.prepare("SELECT COUNT(*) AS n FROM books").get().n!==0||
     db.prepare("SELECT COUNT(*) AS n FROM account_recovery").get().n!==0)
   throw Error("FRESH_PRODUCTION_SCHEMA_SEEDED_PRIVATE_DATA");
  return {db,report:{
   mode:"IN_MEMORY_ONLY_NO_CLOUDFLARE",
   requiredSchemaFiles:FRESH_PRODUCTION_SCHEMA_FILES,
   tableCount:db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n,
   categorySlugs,requiredTablesPresent:requiredTables.length,
   triggeredVersionGuards:triggers.length,
   productionDatabaseId:EXPECTED_NEW_PRODUCTION_D1,
   qaDbTouched:false,productionDbTouched:false,
   status:"FRESH_SCHEMA_DRY_RUN_VALID_ONLY"
  }};
 }catch(e){db.close();throw e}
}
export function inspectProductionWrangler(){
 const cf=JSON.parse(readFileSync(new URL("../deploy/production.wrangler.jsonc",import.meta.url),"utf8"));
 const item=cf.d1_databases?.[0];
 if(cf.name!=="miaowu-english-production"||cf.vars?.APP_ENV!=="production"||
    cf.workers_dev!==false||cf.preview_urls!==false||
    item?.binding!=="DB"||item?.database_name!=="miaowu-english-prod"||
    item?.database_id!==EXPECTED_NEW_PRODUCTION_D1||
    cf.d1_databases.length!==1||
    !cf.assets?.run_worker_first||cf.assets.binding!=="ASSETS"||cf.assets.directory!=="../dist-production/public"||
    Object.prototype.hasOwnProperty.call(cf,"secrets"))
  throw Error("PRODUCTION_CONFIG_TARGET_MISMATCH_OR_UNSAFE");
 return {worker:cf.name,database:item.database_name,databaseId:item.database_id};
}
function buildManualScript(){
 const header=[
 "-- FOR A BRAND NEW EMPTY 'miaowu-english-prod' D1 ONLY.",
 "-- DATABASE ID: "+EXPECTED_NEW_PRODUCTION_D1,
 "-- Do not execute on any existing/staging database.",
 "-- This file is an offline-reviewed bundle; its application to Cloudflare is MANUAL.",
 "-- If interrupted, STOP and inspect state before attempting again.",
 ""
 ].join("\n");
 const files=FRESH_PRODUCTION_SCHEMA_FILES.map(path=>
  "-- BEGIN "+path+"\n"+
  readFileSync(new URL("../"+path,import.meta.url),"utf8").trim()+"\n"+
  "-- END "+path+"\n").join("\n");
 return header+files;
}
function main(){
 inspectProductionWrangler();
 const result=createLocalFreshSchema();
 try{
  if(process.argv.includes("--write-private")){
   const dir=resolve("private-output");
   mkdirSync(dir,{recursive:true,mode:0o700});
   writeFileSync(join(dir,"production-fresh-d1-bootstrap-REVIEW_BEFORE_APPLY.sql"),
    buildManualScript(),{encoding:"utf8",mode:0o600});
  }
  process.stdout.write(JSON.stringify(result.report,null,2)+"\n");
 }finally{result.db.close()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){process.stderr.write("FRESH_PRODUCTION_SCHEMA_CHECK_FAILED: "+e.message+"\n");process.exitCode=1}
}
