import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {checkExportSql} from "../scripts/verify-d1-backup.mjs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const baseline=["001_schema","002_s1","003_public_categories","004_editorial_content",
  "005_editorial_revisions","006_editorial_review_signoffs"]
  .map(name=>read("../db/"+name+".sql")).join("\n");
test("isolated local D1 backup verification can load the full legacy schema",()=>{
 const r=checkExportSql(baseline);
 assert.equal(r.verified,true);
 assert.equal(r.integrity,"ok");
 assert.equal(r.foreignKeys,"ok");
 assert.equal(r.requiredTables,15);
 assert.equal(r.totals.users,0);
 assert.equal(r.totals.books,0);
 assert.equal(r.totals.entitlements,0);
});
test("refuses empty or incomplete backups rather than claiming success",()=>{
 assert.throws(()=>checkExportSql(""),/TOO_SMALL/);
 assert.throws(()=>checkExportSql("SELECT 1; ".repeat(30)),/BACKUP_SCHEMA_MISSING/);
 assert.throws(()=>checkExportSql("CREATE TABLE users(id TEXT); "+"-- incomplete".repeat(20)),/BACKUP_REQUIRED_TABLES_MISSING/);
});
test("offline verification detects broken foreign key references",()=>{
 const broken=baseline+
  "\nPRAGMA foreign_keys=OFF;"+
  "\nINSERT INTO reading_progress(user_id,chapter_id,progress) VALUES('missing-reader','missing-chapter',0.7);";
 assert.throws(()=>checkExportSql(broken),/BACKUP_FOREIGN_KEYS_FAILED/);
});
