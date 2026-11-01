// Offline-only verification for a Cloudflare D1 SQL export.
// No Cloudflare requests, production writes or private row output.
// Usage: node --experimental-sqlite scripts/verify-d1-backup.mjs /ABS/PATH/backup.sql
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {readFileSync,statSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const REQUIRED_TABLES=[
  "users","categories","books","chapters","words","chapter_words",
  "activation_codes","entitlements","sessions","reading_progress",
  "user_words","review_events","word_categories",
  "editorial_revisions","editorial_review_signoffs"
];

export function checkExportSql(sql) {
  if(typeof sql!=="string"||sql.trim().length<100)throw Error("BACKUP_FILE_TOO_SMALL");
  if(!/CREATE\s+TABLE/i.test(sql))throw Error("BACKUP_SCHEMA_MISSING");
  const db=new DatabaseSync(":memory:");
  try {
    // The private dump is executed in a temporary in-memory DB, never remotely.
    db.exec(sql);
    const available=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
    const missing=REQUIRED_TABLES.filter(t=>!available.has(t));
    if(missing.length)throw Error("BACKUP_REQUIRED_TABLES_MISSING: "+missing.join(","));
    const integrity=db.prepare("PRAGMA integrity_check").all();
    if(integrity.length!==1||integrity[0].integrity_check!=="ok")throw Error("BACKUP_INTEGRITY_FAILED");
    const fk=db.prepare("PRAGMA foreign_key_check").all();
    if(fk.length)throw Error("BACKUP_FOREIGN_KEYS_FAILED: "+fk.length+" violations");
    // Only non-sensitive totals, not row contents or user identifiers.
    const totals={};
    for(const table of ["books","chapters","users","entitlements","reading_progress","user_words","review_events"]){
      totals[table]=db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n;
    }
    return {verified:true,tables:available.size,requiredTables:REQUIRED_TABLES.length,
      integrity:"ok",foreignKeys:"ok",totals};
  } finally {db.close()}
}
function main(){
 const input=process.argv[2];
 if(!input||process.argv.length!==3)throw Error("Usage: node --experimental-sqlite scripts/verify-d1-backup.mjs /absolute/path/to/backup.sql");
 const path=resolve(input);
 const size=statSync(path).size;
 if(size<100||size>250*1024*1024)throw Error("BACKUP_SIZE_INVALID");
 const bytes=readFileSync(path);
 const result=checkExportSql(bytes.toString("utf8"));
 const sha256=createHash("sha256").update(bytes).digest("hex");
 process.stdout.write(JSON.stringify({...result,bytes:size,sha256},null,2)+"\n");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{main()}catch(e){process.stderr.write("Backup verification FAILED: "+e.message+"\n");process.exitCode=1}
}
