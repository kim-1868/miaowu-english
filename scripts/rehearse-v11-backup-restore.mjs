// V1.1 P5: test local backups by reopening independent SQLite files,
// rehearsing additive migrations, and restoring the original once more.
// No Wrangler, Cloudflare, network, external commands or remote write paths.
// Real D1 backups remain a separate, explicitly approved production gate.
import {backup,DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {chmodSync,mkdtempSync,readFileSync,rmSync,statSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {checkExportSql} from "./verify-d1-backup.mjs";
import {newFixture,rehearseV11Migrations} from "./rehearse-v11-migrations.mjs";
import {auditRestoredRights,compareRestoredRights} from "./v11-restored-rights-audit.mjs";

const assert=(ok,code)=>{if(!ok)throw Error(code)};
const quote=x=>'"'+String(x).replaceAll('"','""')+'"';
const columns=db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
const jsonValue=(key,value)=>typeof value==="bigint"?String(value):value;
function proveHealthy(db,phase){
 const integrity=db.prepare("PRAGMA integrity_check").all();
 assert(integrity.length===1&&integrity[0].integrity_check==="ok","RESTORE_INTEGRITY_"+phase);
 const foreign=db.prepare("PRAGMA foreign_key_check").all();
 assert(foreign.length===0,"RESTORE_FOREIGN_KEYS_"+phase);
}
function snapshot(db){
 const all=columns(db),tableHash=createHash("sha256");
 const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master "+
  "WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 tableHash.update(JSON.stringify(schema));
 const rows={};
 for(const table of all){
  const hash=createHash("sha256");
  let n=0;
  // Row iteration stays bounded in memory even for a large, trusted SQL dump.
  // Existing V42 tables all have a rowid. WITHOUT ROWID falls back to PK order.
  let cursor;
  try{cursor=db.prepare("SELECT * FROM "+quote(table)+" ORDER BY rowid").iterate()}
  catch{
   const keys=db.prepare("PRAGMA table_info("+quote(table)+")").all()
     .filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>quote(c.name));
   assert(keys.length>0,"TABLE_MISSING_ROW_ORDER_"+table);
   cursor=db.prepare("SELECT * FROM "+quote(table)+" ORDER BY "+keys.join(",")).iterate();
  }
  for(const row of cursor){hash.update(JSON.stringify(row,jsonValue));hash.update("\n");n++}
  rows[table]={count:n,sha256:hash.digest("hex")};
 }
 const digest=createHash("sha256").update(JSON.stringify(rows)).update(tableHash.digest("hex")).digest("hex");
 return {tables:all.length,rows,digest};
}
function sameSnapshot(a,b,phase){
 assert(a.digest===b.digest,"RESTORE_FINGERPRINT_MISMATCH_"+phase);
}
function safeClose(db){try{db?.close()}catch{}}
export async function rehearseV11BackupRestore({sqlText=null,fixture=false}={}){
 if(fixture===Boolean(sqlText))throw Error("RESTORE_REQUIRES_FIXTURE_OR_LOCAL_SQL");
 if(sqlText!==null){
  assert(typeof sqlText==="string"&&Buffer.byteLength(sqlText)>100&&Buffer.byteLength(sqlText)<=250*1024*1024,
   "RESTORE_LOCAL_SQL_SIZE_INVALID");
  checkExportSql(sqlText);
 }
 const dir=mkdtempSync(join(tmpdir(),"wordletter-v11-restore-"));
 let source,original,working,rollback,roundtrip;
 try{
  source=fixture?newFixture():new DatabaseSync(":memory:");
  if(!fixture)source.exec(sqlText);
  proveHealthy(source,"SOURCE");
  const before=snapshot(source);
  const originalRights=auditRestoredRights(source);
  const originalPath=join(dir,"original-private.sqlite");
  await backup(source,originalPath);
  chmodSync(originalPath,0o600);
  safeClose(source);source=null;
  original=new DatabaseSync(originalPath,{readOnly:true});
  proveHealthy(original,"REOPEN_ORIGINAL");
  sameSnapshot(before,snapshot(original),"REOPEN_ORIGINAL");
  const workPath=join(dir,"migration-test.sqlite");
  await backup(original,workPath);
  chmodSync(workPath,0o600);
  working=new DatabaseSync(workPath);
  proveHealthy(working,"BEFORE_MIGRATION");
  sameSnapshot(before,snapshot(working),"MIGRATION_COPY");
  const migration=rehearseV11Migrations(working);
  proveHealthy(working,"AFTER_MIGRATION");
  const migratedRights=auditRestoredRights(working);
  compareRestoredRights(originalRights,migratedRights);
  // Independently enforce old row preservation; migration helper also
  // checks all old table schema and hashes twice.
  const after=snapshot(working);
  for(const [table,record] of Object.entries(before.rows))
   assert(JSON.stringify(after.rows[table])===JSON.stringify(record),
    "RESTORE_EXISTING_TABLE_CHANGED_"+table);
  safeClose(working);working=null;
  roundtrip=new DatabaseSync(workPath,{readOnly:true});
  proveHealthy(roundtrip,"REOPEN_MIGRATED");
  for(const [table,record] of Object.entries(before.rows))
   assert(JSON.stringify(snapshotTable(roundtrip,table))===JSON.stringify(record),
    "RESTORE_REOPEN_CHANGED_"+table);
  // A second independent restore from the untouched original backup must
  // recreate exact pre-upgrade records, including orders, cards and progress.
  const rollbackPath=join(dir,"independent-restore.sqlite");
  await backup(original,rollbackPath);
  chmodSync(rollbackPath,0o600);
  rollback=new DatabaseSync(rollbackPath,{readOnly:true});
  proveHealthy(rollback,"INDEPENDENT_RESTORE");
  sameSnapshot(before,snapshot(rollback),"INDEPENDENT_RESTORE");
  const restoredRights=auditRestoredRights(rollback);
  const rightsComparison=compareRestoredRights(originalRights,restoredRights);
  return {
   status:"LOCAL_RESTORE_AND_MIGRATION_REHEARSAL_PASSED",
   input:fixture?"SYNTHETIC_FIXTURE":"TRUSTED_LOCAL_SQL_EXPORT",
   tempSqliteFilesDeletedOnExit:true,
   diskBackedReopenPassed:true,
   independentRestorationPassed:true,
   additiveMigrationsPassed:migration.dryRunPassed,
   duplicateMigrationApplyPassed:migration.duplicateApplyPassed,
   oldDataPreserved:true,foreignKeys:"ok",integrity:"ok",
   baselineTables:before.tables,baselineDigest:before.digest,
   newTables:migration.newTables,
   restoredRightsAudit:originalRights,
   restoredRightsCountsPreserved:rightsComparison.rightCountsPreserved,
   realOrdersAndAccountsHumanReviewed:false,
   actualCloudflareTimeTravelRestoreVerified:false,
   productionDatabaseModified:false,productionReleaseApproved:false
  };
 }finally{
  for(const db of [roundtrip,rollback,working,original,source])safeClose(db);
  rmSync(dir,{recursive:true,force:true,maxRetries:3});
 }
}
function snapshotTable(db,table){
 const row=db.prepare("SELECT COUNT(*) n FROM "+quote(table)).get();
 const hash=createHash("sha256");
 let cursor;
 try{cursor=db.prepare("SELECT * FROM "+quote(table)+" ORDER BY rowid").iterate()}
 catch{
  const keys=db.prepare("PRAGMA table_info("+quote(table)+")").all()
   .filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>quote(c.name));
  assert(keys.length>0,"TABLE_MISSING_ROW_ORDER_"+table);
  cursor=db.prepare("SELECT * FROM "+quote(table)+" ORDER BY "+keys.join(",")).iterate();
 }
 let count=0;for(const x of cursor){hash.update(JSON.stringify(x,jsonValue));hash.update("\n");count++}
 assert(count===row.n,"TABLE_ROW_COUNT_CHANGED_"+table);
 return {count,sha256:hash.digest("hex")};
}
async function main(){
 const args=process.argv.slice(2),fixture=args.length===1&&args[0]==="--fixture";
 const sql=args.length===2&&args[0]==="--sql"?args[1]:null;
 if(!fixture&&!sql)throw Error("USAGE: --fixture | --sql /PRIVATE/TRUSTED/export.sql");
 let sqlText=null;
 if(sql){
  const path=resolve(sql),stats=statSync(path);
  assert(stats.isFile()&&stats.size>100&&stats.size<=250*1024*1024,"RESTORE_EXPORT_SIZE_INVALID");
  sqlText=readFileSync(path,"utf8");
 }
 const result=await rehearseV11BackupRestore({fixture,sqlText});
 console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 main().catch(error=>{
  // Do not disclose local file names or source SQL (which may hold secrets).
  const code=String(error?.message||"").replace(/[^A-Z_0-9]/g,"_").slice(0,100);
  console.error("V11_LOCAL_RESTORE_REHEARSAL_FAILED: "+code);
  process.exitCode=1;
 });
}
