// Safely rehearsal-test the exact Cloudflare staging D1 SQL export against
// additive 007/008 migrations. All work occurs in an isolated in-memory SQLite
// database. It never contacts Cloudflare or writes the original backup.
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {readFileSync,statSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {checkExportSql} from "./verify-d1-backup.mjs";

const existingTables=[
  "users","categories","books","chapters","words","chapter_words",
  "activation_codes","entitlements","sessions","reading_progress",
  "user_words","review_events","request_throttle","content_packages",
  "word_categories","editorial_revisions","editorial_review_signoffs"
];
const newTables=[
  "ops_operators","ops_audit_events",
  "ops_book_content_versions","ops_publication_approvals"
];
function assert(cond,code){if(!cond)throw Error(code)}
function tablePresent(db,name){
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function columnNames(db,table){
  // Table names are an internal constant allowlist, never untrusted input.
  return db.prepare("PRAGMA table_info("+table+")").all().map(row=>row.name);
}
function digest(db,table,originalColumns){
  // Compare only fields that existed BEFORE the migration. New columns are
  // validated separately; SELECT * would report a false data mutation after
  // ALTER TABLE books ADD COLUMN last_release_request_id.
  const projection=originalColumns.map(col=>'"'+col.replaceAll('"','""')+'"').join(",");
  const rows=db.prepare("SELECT "+projection+" FROM "+table+" ORDER BY rowid").all();
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
function validate(db){
  assert(db.prepare("PRAGMA integrity_check").all().length===1 &&
    db.prepare("PRAGMA integrity_check").get().integrity_check==="ok",
    "INTEGRITY_CHECK_FAILED");
  assert(db.prepare("PRAGMA foreign_key_check").all().length===0,
    "FOREIGN_KEY_CHECK_FAILED");
}
export function rehearseS9Migration(backupSql,sql007,sql008){
  checkExportSql(backupSql);
  const db=new DatabaseSync(":memory:");
  try{
    db.exec(backupSql);
    validate(db);
    for(const t of existingTables)assert(tablePresent(db,t),"BASELINE_TABLE_MISSING_"+t);
    for(const t of newTables)assert(!tablePresent(db,t),"S9_ALREADY_INSTALLED_"+t);
    assert(!tablePresent(db,"d1_migrations"),"UNEXPECTED_MIGRATION_LEDGER");
    assert(db.prepare("SELECT 1 FROM pragma_table_info('books') WHERE name='last_release_request_id'").get()===undefined,
      "S9_COLUMN_ALREADY_INSTALLED");
    const original=new Map(existingTables.map(t=>{
      const columns=columnNames(db,t);
      return [t,{columns,digest:digest(db,t,columns)}];
    }));
    const counts=Object.fromEntries(["books","chapters","users","entitlements",
      "reading_progress","user_words","review_events"].map(t=>[
       t,db.prepare("SELECT COUNT(*) AS n FROM "+t).get().n]));
    try{db.exec(sql007)}catch{throw Error("SQL_007_FAILED")}
    try{db.exec(sql008)}catch{throw Error("SQL_008_FAILED")}
    for(const t of newTables)assert(tablePresent(db,t),"S9_TABLE_NOT_CREATED_"+t);
    assert(db.prepare("SELECT 1 FROM pragma_table_info('books') WHERE name='last_release_request_id'").get()!==undefined,
      "S9_COLUMN_MISSING");
    for(const [t,before] of original){
      const currentColumns=columnNames(db,t);
      const expectedColumns=t==="books"
        ?[...before.columns,"last_release_request_id"]:before.columns;
      assert(JSON.stringify(currentColumns)===JSON.stringify(expectedColumns),
        "UNEXPECTED_SCHEMA_CHANGE_"+t);
      assert(digest(db,t,before.columns)===before.digest,
        "ORIGINAL_ROWS_CHANGED_"+t);
    }
    // Adding the release request ID must not populate old books implicitly.
    assert(db.prepare("SELECT COUNT(*) AS n FROM books WHERE last_release_request_id IS NOT NULL").get().n===0,
      "LEGACY_BOOK_RELEASE_ID_CHANGED");
    assert(db.prepare("SELECT COUNT(*) AS n FROM ops_book_content_versions").get().n===counts.books,
      "BOOK_VERSION_SEED_COUNT_MISMATCH");
    assert(db.prepare("SELECT COUNT(*) AS n FROM ops_operators").get().n===0,
      "UNEXPECTED_OPERATOR_ACCOUNTS");
    assert(db.prepare("SELECT COUNT(*) AS n FROM ops_publication_approvals").get().n===0,
      "UNEXPECTED_PUBLICATION_APPROVALS");
    validate(db);
    // The trigger must invalidate a previous approval on any book update,
    // including no-op rewrites. Roll back this test entirely before exit.
    const book=db.prepare("SELECT id FROM books LIMIT 1").get();
    if(book){
      db.exec("SAVEPOINT s9_trigger_rehearsal");
      try{
        const before=db.prepare("SELECT version FROM ops_book_content_versions WHERE book_id=?").get(book.id).version;
        db.prepare("UPDATE books SET title=title WHERE id=?").run(book.id);
        const after=db.prepare("SELECT version FROM ops_book_content_versions WHERE book_id=?").get(book.id).version;
        assert(after===before+1,"BOOK_VERSION_TRIGGER_FAILED");
      }finally{
        db.exec("ROLLBACK TO s9_trigger_rehearsal");
        db.exec("RELEASE s9_trigger_rehearsal");
      }
    }
    for(const [t,before] of original)
      assert(digest(db,t,before.columns)===before.digest,"TRIGGER_TEST_CHANGED_"+t);
    validate(db);
    return {dryRunPassed:true,restoredLocally:true,remoteDatabaseModified:false,
      oldRowsPreserved:true,oldTablesChecked:existingTables.length,
      newTablesCreated:newTables.length,bookVersionRows:counts.books,
      countsBeforeAndAfter:counts,integrity:"ok",foreignKeys:"ok",
      next:"Remote migration requires a separate deliberate decision."};
  }finally{db.close()}
}
function main(){
  if(process.argv.length!==3)throw Error("Usage: node --experimental-sqlite scripts/rehearse-s9-migration.mjs /ABS/PATH/PRIVATE_BACKUP.sql");
  const file=resolve(process.argv[2]);
  const size=statSync(file).size;
  assert(size>=100&&size<=250*1024*1024,"BACKUP_SIZE_INVALID");
  const backup=readFileSync(file,"utf8");
  const seven=readFileSync(new URL("../db/007_ops_identity_audit.sql",import.meta.url),"utf8");
  const eight=readFileSync(new URL("../db/008_ops_release_workflow.sql",import.meta.url),"utf8");
  process.stdout.write(JSON.stringify(rehearseS9Migration(backup,seven,eight),null,2)+"\n");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{main()}catch(error){process.stderr.write("S9_DRY_RUN_FAILED: "+error.message+"\n");process.exitCode=1}
}
