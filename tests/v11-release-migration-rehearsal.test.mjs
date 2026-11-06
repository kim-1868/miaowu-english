import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {rehearseV11Migrations,newFixture} from "../scripts/rehearse-v11-migrations.mjs";
const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("V1.1 009-011 migrations are idempotent and preserve all old customers, entitlements and reviews",()=>{
 const db=newFixture();
 try{
  const before={
   user:db.prepare("SELECT username FROM users WHERE id='old-1'").get(),
   rights:db.prepare("SELECT count(*) AS n FROM entitlements").get().n,
   code:db.prepare("SELECT status FROM activation_codes WHERE id='code-1'").get(),
   chapter:db.prepare("SELECT completed_at FROM reading_progress WHERE user_id='old-1'").get(),
   mastered:db.prepare("SELECT status,bookmarked,due_at FROM user_words WHERE user_id='old-1'").get(),
   review:db.prepare("SELECT count(*) AS n FROM review_events").get().n
  };
  const result=rehearseV11Migrations(db);
  assert.equal(result.dryRunPassed,true);
  assert.equal(result.duplicateApplyPassed,true);
  assert.equal(result.remoteDatabaseModified,false);
  assert.deepEqual(result.newTables.sort(),["user_bookmarks","user_onboarding","user_study_schedules"]);
  assert.deepEqual(db.prepare("SELECT username FROM users WHERE id='old-1'").get(),before.user);
  assert.equal(db.prepare("SELECT count(*) AS n FROM entitlements").get().n,before.rights);
  assert.deepEqual(db.prepare("SELECT status FROM activation_codes WHERE id='code-1'").get(),before.code);
  assert.deepEqual(db.prepare("SELECT completed_at FROM reading_progress WHERE user_id='old-1'").get(),before.chapter);
  assert.deepEqual(db.prepare("SELECT status,bookmarked,due_at FROM user_words WHERE user_id='old-1'").get(),before.mastered);
  assert.equal(db.prepare("SELECT count(*) AS n FROM review_events").get().n,before.review);
 }finally{db.close()}
});
test("V1.1 rehearsal refuses a wrong baseline (does not pretend to have migrated)",()=>{
 const db=new DatabaseSync(":memory:");
 try{db.exec(file("db/001_schema.sql"));
  assert.throws(()=>rehearseV11Migrations(db),/V11_MISSING_BASE_TABLE_request_throttle|V11_MISSING_BASE_TABLE_sessions/);
 }finally{db.close()}
});
test("V1.1 stage SQL contains ONLY additive independent tables and no changes to existing access policy",()=>{
 for(const sql of ["db/009_v11_onboarding.sql","db/010_v11_my_bookshelf.sql","db/011_v11_study_schedules.sql"]){
  const s=file(sql);
  assert.match(s,/CREATE TABLE IF NOT EXISTS/);
  assert.doesNotMatch(s,/\b(?:ALTER|DROP|DELETE|UPDATE)\b\s+(?:TABLE|FROM|\w+)/i);
  assert.doesNotMatch(s,/\b(?:INSERT INTO|REPLACE INTO)\b/i);
 }
 const packageJson=JSON.parse(file("package.json"));
 assert.match(packageJson.scripts["db:migrate:remote"],/refuse-unbaselined-remote-migration/);
});
