import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {rehearseS9Migration} from "../scripts/rehearse-s9-migration.mjs";
const read=name=>readFileSync(new URL(name,import.meta.url),"utf8");
const backup=[
"001_schema","002_s1","003_public_categories","004_editorial_content",
"005_editorial_revisions","006_editorial_review_signoffs"
].map(name=>read("../db/"+name+".sql")).join("\n");
const seven=read("../db/007_ops_identity_audit.sql");
const eight=read("../db/008_ops_release_workflow.sql");

test("S9 remote database rehearsal is isolated, reads original dump and applies 007/008",()=>{
 const out=rehearseS9Migration(backup,seven,eight);
 assert.equal(out.dryRunPassed,true);
 assert.equal(out.oldRowsPreserved,true);
 assert.equal(out.remoteDatabaseModified,false);
 assert.equal(out.oldTablesChecked,17);
 assert.equal(out.newTablesCreated,4);
 assert.equal(out.integrity,"ok");
 assert.equal(out.foreignKeys,"ok");
});
test("S9 rehearsal is fail-closed if 007 or 008 cannot safely execute",()=>{
 assert.throws(()=>rehearseS9Migration(backup,"CREATE TABLE ops_operators (",eight),/SQL_007_FAILED/);
 assert.throws(()=>rehearseS9Migration(backup,seven,"ALTER TABLE books ADD COLUMN;"),/SQL_008_FAILED/);
});
test("S9 rehearsal refuses existing operator schema or replayed migration",()=>{
 assert.throws(()=>rehearseS9Migration(backup+"\n"+seven,seven,eight),/S9_ALREADY_INSTALLED/);
 assert.throws(()=>rehearseS9Migration(backup+"\nCREATE TABLE d1_migrations(id INTEGER);",seven,eight),/UNEXPECTED_MIGRATION_LEDGER/);
});
