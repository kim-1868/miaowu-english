import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {rehearseV11BackupRestore} from "../scripts/rehearse-v11-backup-restore.mjs";

const read=part=>readFileSync(new URL("../db/"+part+".sql",import.meta.url),"utf8");
const LEGACY=["001_schema","002_s1","003_public_categories",
 "004_editorial_content","005_editorial_revisions",
 "006_editorial_review_signoffs","007_ops_identity_audit","008_ops_release_workflow"];
const syntheticExport=()=>LEGACY.map(read).join("\n")+"\n"+
 "INSERT INTO users(id,username,password_hash,password_salt) VALUES"+
 "('test-old','legacy-study','fakehash','fakesalt');\n"+
 "INSERT INTO books(id,category_id,title,status) VALUES"+
 "('book-old','cet4','Old tale','published');\n"+
 "INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES"+
 "('chapter-old','book-old',1,'Title','{}','2026-01-01 00:00:00');\n"+
 "INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES"+
 "('word-old','record','n.','记录');\n"+
 "INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
 "('chapter-old','word-old','A record remains.','p1');\n"+
 "INSERT INTO entitlements(user_id,category_id) VALUES('test-old','cet4');\n"+
 "INSERT INTO activation_codes(id,code_hash,category_id,status) VALUES"+
 "('code-old','test-only-hash','cet4','unused');\n"+
 "INSERT INTO reading_progress(user_id,chapter_id,progress,completed_at) VALUES"+
 "('test-old','chapter-old',1,'2026-11-01 00:00:00');\n"+
 "INSERT INTO user_words(user_id,word_id,status,bookmarked) VALUES"+
 "('test-old','word-old','mastered',1);\n"+
 "INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) VALUES"+
 "('review-old','test-old','word-old','chapter-old','story-echo-fill','correct');\n";

test("P5 synthetically backs up to disk, reopens, migrates twice and independently restores untouched legacy tables",async()=>{
 const result=await rehearseV11BackupRestore({fixture:true});
 assert.equal(result.status,"LOCAL_RESTORE_AND_MIGRATION_REHEARSAL_PASSED");
 assert.equal(result.input,"SYNTHETIC_FIXTURE");
 assert.equal(result.diskBackedReopenPassed,true);
 assert.equal(result.independentRestorationPassed,true);
 assert.equal(result.additiveMigrationsPassed,true);
 assert.equal(result.duplicateMigrationApplyPassed,true);
 assert.equal(result.oldDataPreserved,true);
 assert.equal(result.tempSqliteFilesDeletedOnExit,true);
 assert.equal(result.productionDatabaseModified,false);
 assert.equal(result.actualCloudflareTimeTravelRestoreVerified,false);
 assert.match(result.baselineDigest,/^[a-f0-9]{64}$/);
 assert.deepEqual(result.newTables.sort(),["supplemental_dictionary","user_bookmarks","user_onboarding","user_study_schedules"]);
});
test("P5 accepts a trusted local legacy SQL export, never publishes private rows or modifies actual Cloudflare",async()=>{
 const report=await rehearseV11BackupRestore({sqlText:syntheticExport()});
 assert.equal(report.input,"TRUSTED_LOCAL_SQL_EXPORT");
 assert.equal(report.independentRestorationPassed,true);
 assert.equal(report.oldDataPreserved,true);
 assert.ok(report.baselineTables>=18);
 assert.ok(!JSON.stringify(report).includes("legacy-study"));
 assert.ok(!JSON.stringify(report).includes("test-only-hash"));
 assert.equal(report.productionDatabaseModified,false);
 assert.equal(report.productionReleaseApproved,false);
});
test("P5 rejects export without required historical tables or mismatched migration baseline",async()=>{
 await assert.rejects(rehearseV11BackupRestore({sqlText:"CREATE TABLE only_one (id INTEGER); "+" ".repeat(150)}),
  /BACKUP_REQUIRED_TABLES_MISSING/);
 await assert.rejects(rehearseV11BackupRestore({fixture:false}),/RESTORE_REQUIRES_FIXTURE_OR_LOCAL_SQL/);
 await assert.rejects(rehearseV11BackupRestore({fixture:true,sqlText:"test"}),/RESTORE_REQUIRES_FIXTURE_OR_LOCAL_SQL/);
});
test("P5 corrupted SQLite legacy foreign keys fail before any copy or simulated upgrade",async()=>{
 const bad=syntheticExport()+
  "INSERT INTO reading_progress(user_id,chapter_id,progress) VALUES"+
  "('test-old','nonexistent-chapter',0.5);\n";
 await assert.rejects(rehearseV11BackupRestore({sqlText:bad}),
  /(?:BACKUP_FOREIGN_KEYS_FAILED|FOREIGN KEY constraint failed)/);
});
test("P5 backup tool has no remote deployment or D1 migration actions",()=>{
 const source=readFileSync(new URL("../scripts/rehearse-v11-backup-restore.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/from\s+["'](?:wrangler|cloudflare)[^"']*["']/);
 assert.doesNotMatch(source,/child_process|execSync\(|spawn\(|fetch\(/);
 assert.match(source,/rmSync\(dir,\{recursive:true,force:true,maxRetries:3\}\)/);
 assert.match(source,/productionDatabaseModified:false/);
});
