import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {DIAGNOSTIC_SQL,verifyEmptyRealPublishedIntakeCounts as check}
 from '../scripts/v12-first-nonqa-test-intake-diagnostic.mjs';
const pack=x=>[{success:true,results:x}];
function db(){
 const d=new DatabaseSync(':memory:');
 d.exec("CREATE TABLE books(id TEXT PRIMARY KEY,status TEXT);"+
 "CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,published_at TEXT);"+
 "CREATE TABLE words(id TEXT PRIMARY KEY,headword TEXT);"+
 "CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT);"+
 "CREATE TABLE global_dictionary_entries(entry_id TEXT,headword TEXT COLLATE NOCASE,source_name TEXT);"+
 "CREATE TABLE global_dictionary_legacy_sense_links(legacy_word_id TEXT,sense_id TEXT);");
 return d;
}
function add(d,i,b,word,source=null,linked=false){
 const book='book-'+i;
 d.prepare("INSERT INTO books VALUES(?, 'published')").run(b||book);
 d.prepare("INSERT INTO chapters VALUES(?,?,CURRENT_TIMESTAMP)")
  .run('ch-'+i,b||book);
 d.prepare('INSERT INTO words VALUES(?,?)').run('old-'+i,word);
 d.prepare('INSERT INTO chapter_words VALUES(?,?)').run('ch-'+i,'old-'+i);
 if(source){
  d.prepare('INSERT OR IGNORE INTO global_dictionary_entries VALUES(?,?,?)')
   .run('entry-'+i,word,source);
 }
 if(linked)d.prepare('INSERT INTO global_dictionary_legacy_sense_links VALUES(?,?)')
  .run('old-'+i,'sense-'+i);
}
test('four published TEST anchors with QA fixtures, QA source and already-linked cards explain a zero intake',()=>{
 const d=db();try{
  add(d,1,'mw-v12-pilot-ex-20261112','qafirst','wordletter-internal-qa-x');
  add(d,2,'qa-stub','qasecond');
  add(d,3,'real-published-a','third','wordletter-internal-qa-inherited');
  add(d,4,'real-published-b','fourth','original-approved',true);
  const got=check(pack(d.prepare(DIAGNOSTIC_SQL).all()));
  assert.equal(got.status,'NONQA_CANDIDATES_ABSENT_REQUIRE_REAL_PUBLISHER_DATA');
  assert.equal(got.total_published_anchors,4);
  assert.equal(got.excluded_qa_book_anchors,2);
  assert.equal(got.nonqa_book_anchors,2);
  assert.equal(got.qa_source_on_nonqa_book_anchors,1);
  assert.equal(got.after_source_filter_anchors,1);
  assert.equal(got.existing_link_after_source_anchors,1);
  assert.equal(got.first_intake_sql_eligible_anchors,0);
  add(d,5,'real-published-c','fifth');
  const later=check(pack(d.prepare(DIAGNOSTIC_SQL).all()));
  assert.equal(later.first_intake_sql_eligible_anchors,1);
  assert.equal(later.eligible_without_dictionary_entry_anchors,1);
  assert.equal(later.status,'NONQA_CANDIDATES_PRESENT');
 }finally{d.close()}
});
test('diagnostic fails closed on private extra column, drift and failed SELECT',()=>{
 const row={total_published_anchors:0,excluded_qa_book_anchors:0,
  nonqa_book_anchors:0,qa_source_on_nonqa_book_anchors:0,
  after_source_filter_anchors:0,existing_link_after_source_anchors:0,
  first_intake_sql_eligible_anchors:0,eligible_without_dictionary_entry_anchors:0};
 assert.equal(check(pack([row])).first_intake_sql_eligible_anchors,0);
 assert.throws(()=>check(pack([{...row,book_id:'private'}])),/NO_PRIVATE_COLUMNS/);
 assert.throws(()=>check(pack([{...row,total_published_anchors:1}])));
 assert.throws(()=>check([{success:false,results:[]}]),/QUERY_FAILED/);
 assert.doesNotMatch(DIAGNOSTIC_SQL,/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
 assert.ok(!DIAGNOSTIC_SQL.includes('SELECT *'));
});
test('diagnostic is only in protected TEST workflow, never adds production or write tokens',()=>{
 const wf=readFileSync('.github/workflows/v12-first-nonqa-published-sense-review.yml','utf8');
 assert.ok(wf.includes('v12-first-nonqa-test-intake-diagnostic.mjs'));
 assert.ok(wf.includes('CLOUDFLARE_STAGING_D1_READ_TOKEN'));
 assert.ok(wf.includes('staging-d1-schema-approval'));
 assert.doesNotMatch(wf,/CLOUDFLARE_PROD_D1|CLOUDFLARE_STAGING_D1_WRITE_TOKEN|wrangler deploy/i);
});
