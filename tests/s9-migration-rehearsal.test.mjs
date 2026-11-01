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

const populatedBackup=backup+String.raw`
INSERT INTO books(id,category_id,title,status) VALUES('pilot-story','cet4','Legacy story','draft');
INSERT INTO users(id,username,password_hash,password_salt) VALUES('user-old','legacy-user','opaque-hash','salt');
INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview) VALUES
  ('pilot-ch','pilot-story',1,'First chapter','{"version":1,"paragraphs":[]}',1);
INSERT INTO words(id,headword,meaning_zh) VALUES('pilot-word','remember','记得');
INSERT INTO word_categories(word_id,category_id) VALUES('pilot-word','cet4');
INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES
  ('pilot-ch','pilot-word','I remember','p0:s0');
INSERT INTO entitlements(user_id,category_id) VALUES('user-old','cet4');
INSERT INTO reading_progress(user_id,chapter_id,progress) VALUES('user-old','pilot-ch',0.5);
INSERT INTO user_words(user_id,word_id,status,bookmarked) VALUES('user-old','pilot-word','learning',1);
INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) VALUES
  ('review-old','user-old','pilot-word','pilot-ch','echo','correct');
`;

test("S9 real-data-shaped fixture preserves all legacy book fields and user learning rows",()=>{
  const result=rehearseS9Migration(populatedBackup,seven,eight);
  assert.equal(result.dryRunPassed,true);
  assert.equal(result.oldRowsPreserved,true);
  assert.equal(result.countsBeforeAndAfter.books,1);
  assert.equal(result.countsBeforeAndAfter.users,1);
  assert.equal(result.countsBeforeAndAfter.reading_progress,1);
  assert.equal(result.bookVersionRows,1);
});
test("S9 still detects an actual legacy book update, rather than ignoring it",()=>{
  assert.throws(
    ()=>rehearseS9Migration(populatedBackup,seven,
      eight+"\nUPDATE books SET title='changed unexpectedly' WHERE id='pilot-story';"),
    /ORIGINAL_ROWS_CHANGED_books/
  );
});
test("S9 prevents unauthorized extra schema changes while allowing ONLY expected books column",()=>{
  assert.throws(
    ()=>rehearseS9Migration(populatedBackup,seven,
      eight+"\nALTER TABLE users ADD COLUMN extra TEXT;"),
    /UNEXPECTED_SCHEMA_CHANGE_users/
  );
  assert.throws(
    ()=>rehearseS9Migration(populatedBackup,seven,
      eight+"\nUPDATE books SET last_release_request_id='unexpected' WHERE id='pilot-story';"),
    /LEGACY_BOOK_RELEASE_ID_CHANGED/
  );
});
