// Offline integration rehearsal for the exact D1 schema and the real 12-chapter draft.
// Safety: memory-only SQLite; no Cloudflare account, credentials or network access.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createLocalFreshSchema} from "../scripts/check-production-fresh-schema.mjs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {generateSql} from "../scripts/build-content-import.mjs";
import {auditRainyNight} from "../scripts/audit-rainy-night-s1.mjs";

const scalar=(db,query)=>db.prepare(query).get().n;
const count=(db,table)=>scalar(db,"SELECT COUNT(*) AS n FROM "+table);

test("S33 actual Rainy Night SQL imports to exact fresh production schema only as a private draft",()=>{
 const {db,report}=createLocalFreshSchema();
 try{
  assert.equal(report.qaDbTouched,false);
  assert.equal(report.productionDbTouched,false);
  const {bundle}=composeRainyNightSeasonDraft();
  const audit=auditRainyNight(bundle);
  assert.equal(audit.releaseStatus,"BLOCKED_FOR_EDITORIAL_REVIEW");
  const imported=generateSql(bundle);
  assert.equal(imported.summary.publication,"draft-only");
  assert.equal(imported.summary.wordOccurrences,733);
  assert.match(bundle.book.id,/^draft-/);
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec(imported.sql);

  assert.equal(count(db,"books"),1);
  assert.equal(count(db,"chapters"),12);
  assert.equal(count(db,"words"),188);
  assert.equal(count(db,"word_categories"),188);
  assert.equal(count(db,"chapter_words"),733);
  assert.equal(count(db,"content_packages"),1);
  assert.equal(scalar(db,"SELECT COUNT(*) AS n FROM books WHERE status='draft'"),1);
  assert.equal(scalar(db,"SELECT COUNT(*) AS n FROM chapters WHERE published_at IS NOT NULL"),0);
  assert.equal(scalar(db,"SELECT COUNT(*) AS n FROM chapters WHERE is_preview=1"),1);

  // Same read-path constraints that prevent published readers from seeing drafts.
  assert.equal(scalar(db,"SELECT COUNT(*) AS n FROM books b JOIN categories c "+
   "ON b.category_id=c.id WHERE b.status='published' AND c.is_visible=1"),0);
  assert.equal(scalar(db,"SELECT COUNT(*) AS n FROM chapters ch JOIN books b "+
   "ON ch.book_id=b.id WHERE b.status='published' AND ch.published_at IS NOT NULL"),0);

  // No users, session cookies, recovery codes, vouchers or paid entitlements are seeded.
  for(const table of ["users","sessions","activation_codes","entitlements","reading_progress",
   "user_words","review_events","account_recovery","ops_operators","ops_audit_events"]){
    assert.equal(count(db,table),0,"customer / secret data present in "+table);
  }
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
 }finally{db.close();}
});

test("S33 draft SQL can safely be replayed in isolated SQLite without duplicate chapters, words or purchases",()=>{
 const {db}=createLocalFreshSchema();
 try{
  const {bundle}=composeRainyNightSeasonDraft(),sql=generateSql(bundle).sql;
  db.exec(sql);
  const tables=["books","chapters","words","word_categories","chapter_words","content_packages",
    "users","activation_codes","entitlements","review_events","ops_publication_approvals"];
  const before=Object.fromEntries(tables.map(table=>[table,count(db,table)]));
  db.exec(sql);
  const after=Object.fromEntries(tables.map(table=>[table,count(db,table)]));
  assert.deepEqual(after,before);
  assert.equal(after.chapter_words,733);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
 }finally{db.close();}
});

test("S33 reimport cannot republish a previously published book or mutate any published chapter",()=>{
 const {db}=createLocalFreshSchema();
 try{
  const {bundle}=composeRainyNightSeasonDraft(),sql=generateSql(bundle).sql;
  db.exec(sql);
  const id=bundle.book.id;
  // Model a book already under access control. Importer should never rewrite it.
  db.prepare("UPDATE books SET status='published' WHERE id=?").run(id);
  db.prepare("UPDATE chapters SET published_at=CURRENT_TIMESTAMP WHERE book_id=?").run(id);
  const previous=db.prepare("SELECT id,content_json,published_at FROM chapters ORDER BY chapter_no").all();
  db.exec(sql);
  const next=db.prepare("SELECT id,content_json,published_at FROM chapters ORDER BY chapter_no").all();
  assert.deepEqual(next,previous);
  assert.equal(scalar(db,"SELECT COUNT(*) AS n FROM books WHERE status='published'"),1);
  assert.equal(scalar(db,"SELECT COUNT(*) AS n FROM content_packages"),1);
 }finally{db.close();}
});
