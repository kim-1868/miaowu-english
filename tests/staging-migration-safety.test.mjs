import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
function legacy(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON;");
 for(const name of ["001_schema","002_s1","003_public_categories","004_editorial_content",
  "005_editorial_revisions","006_editorial_review_signoffs"]){
   db.exec(read("../db/"+name+".sql"));
 }
 return db;
}
test("S9 incremental migration preserves existing accounts, rights and reading history without migrations ledger",()=>{
 const db=legacy();
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='d1_migrations'").get().n,0);
 db.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES('legacy-user','reader','hash','salt')").run();
 db.prepare("INSERT INTO books(id,category_id,title,status) VALUES('legacy-story','cet4','已存在的旧草稿','draft')").run();
 db.prepare("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview) VALUES('legacy-ch','legacy-story',1,'第一章','{}',1)").run();
 db.prepare("INSERT INTO words(id,headword,meaning_zh) VALUES('legacy-word','remember','记得')").run();
 db.prepare("INSERT INTO word_categories(word_id,category_id) VALUES('legacy-word','cet4')").run();
 db.prepare("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES('legacy-ch','legacy-word','remember me','p0:s1')").run();
 db.prepare("INSERT INTO entitlements(user_id,category_id) VALUES('legacy-user','cet4')").run();
 db.prepare("INSERT INTO reading_progress(user_id,chapter_id,progress) VALUES('legacy-user','legacy-ch',0.3)").run();
 db.prepare("INSERT INTO user_words(user_id,word_id,status,bookmarked) VALUES('legacy-user','legacy-word','learning',1)").run();
 db.prepare("INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) VALUES('legacy-review','legacy-user','legacy-word','legacy-ch','echo','correct')").run();
 const tables=["users","books","chapters","words","chapter_words","entitlements","reading_progress","user_words","review_events","activation_codes"];
 const before=Object.fromEntries(tables.map(t=>[t,db.prepare("SELECT COUNT(*) AS n FROM "+t).get().n]));
 db.exec(read("../db/007_ops_identity_audit.sql"));
 db.exec(read("../db/008_ops_release_workflow.sql"));
 const after=Object.fromEntries(tables.map(t=>[t,db.prepare("SELECT COUNT(*) AS n FROM "+t).get().n]));
 assert.deepEqual(after,before);
 assert.equal(db.prepare("SELECT status FROM books WHERE id='legacy-story'").get().status,"draft");
 assert.equal(db.prepare("SELECT version FROM ops_book_content_versions WHERE book_id='legacy-story'").get().version,0);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('books') WHERE name='last_release_request_id'").get().n,1);
 const result=db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='d1_migrations'").get().n;
 assert.equal(result,0); // Deliberate: replaying Wrangler's entire migration history is unsafe.
 // Shared-word changes, even when restored, must invalidate any previous content review.
 db.prepare("UPDATE words SET meaning_zh='牢记' WHERE id='legacy-word'").run();
 assert.equal(db.prepare("SELECT version FROM ops_book_content_versions WHERE book_id='legacy-story'").get().version,1);
 db.prepare("UPDATE words SET meaning_zh='记得' WHERE id='legacy-word'").run();
 assert.equal(db.prepare("SELECT version FROM ops_book_content_versions WHERE book_id='legacy-story'").get().version,2);
 db.close();
});
test("S9 approver and audit rows stay append-only after migrations",()=>{
 const db=legacy();
 db.prepare("INSERT INTO books(id,category_id,title) VALUES('legacy-story','cet4','旧草稿')").run();
 db.exec(read("../db/007_ops_identity_audit.sql"));
 db.exec(read("../db/008_ops_release_workflow.sql"));
 db.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES('ops-owner','Owner','publisher','staging',?)").run("f".repeat(64));
 db.prepare("INSERT INTO ops_publication_approvals(id,book_id,operator_id,content_fingerprint,content_version,checks_json,note) VALUES('approval-1','legacy-story','ops-owner',?,0,'[]','review')").run("a".repeat(64));
 db.prepare("INSERT INTO ops_audit_events(id,actor_id,event_type,resource_type,resource_id,request_id) VALUES('audit-1','ops-owner','book.approve','book','legacy-story','req-12345678')").run();
 assert.throws(()=>db.prepare("DELETE FROM ops_publication_approvals").run(),/OPS_APPROVAL_APPEND_ONLY/);
 assert.throws(()=>db.prepare("UPDATE ops_audit_events SET reason_code='CHANGED'").run(),/OPS_AUDIT_APPEND_ONLY/);
 assert.throws(()=>db.exec(read("../db/008_ops_release_workflow.sql")),/duplicate column/i);
 db.close();
});
test("Published staging candidate has hard stop against unattended D1 remote migrations",()=>{
 const pkg=JSON.parse(read("../package.json"));
 assert.equal(pkg.scripts["db:migrate:remote"],"node scripts/refuse-unbaselined-remote-migration.mjs");
 const text=read("../scripts/refuse-unbaselined-remote-migration.mjs");
 assert.match(text,/REMOTE_D1_MIGRATION_BLOCKED/);
 assert.match(text,/process\.exitCode=1/);
 const preflight=read("../docs/STAGING_D1_READONLY_CHECK.sql");
 assert.match(preflight,/pragma_table_info\('books'\)/);
 assert.doesNotMatch(preflight,/\b(CREATE|ALTER|UPDATE|INSERT|DELETE|DROP)\s+(TABLE|INTO|FROM|\w+)\b/i);
});
