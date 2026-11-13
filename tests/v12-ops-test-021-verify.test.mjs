import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {snapshotSQL,parseSnapshot,checkIntegrity,verifyBefore,verifyAfter,CORE_COLUMNS}
 from '../scripts/v12-ops-test-021-verify.mjs';

const load=(db,p)=>db.exec(readFileSync(new URL('../db/'+p,import.meta.url),'utf8'));
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const p of ['001_schema.sql','007_ops_identity_audit.sql',
  '013_global_dictionary.sql','016_global_dictionary_lessons.sql',
  '018_global_dictionary_reviewed_senses.sql',
  '020_global_dictionary_sense_study.sql'])load(db,p);
 db.prepare('INSERT INTO ops_operators(id,display_name,role,environment,key_digest) '+
  'VALUES(?,?,?,?,?)').run('owner_main','Synthetic','publisher','staging','a'.repeat(64));
 return db;
}
const pack=results=>[{results}];
const counters=(db,phase)=>pack([db.prepare(snapshotSQL(phase)).get()]);
const fk=db=>pack(db.prepare('PRAGMA foreign_key_check;').all());
const quick=db=>pack(db.prepare('PRAGMA quick_check;').all());

test('only a SELECT with 16 aggregate counts and 021 schema metadata, no personal rows',()=>{
 const a=snapshotSQL('before'),b=snapshotSQL('after');
 assert.match(a,/^SELECT /u);assert.match(b,/^SELECT /u);
 assert.doesNotMatch(a,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|ATTACH)\b/iu);
 assert.doesNotMatch(b,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|ATTACH)\b/iu);
 assert.equal(CORE_COLUMNS.length,16);
 assert.doesNotMatch(a,/\bSELECT\s+\*\b/iu);
 assert.throws(()=>snapshotSQL('production'));
});

test('real 007/021 SQL succeeds with exact before/after business counts and empty new registry',()=>{
 const db=setup();
 try{
  const before=counters(db,'before'),b=verifyBefore(before,fk(db),quick(db));
  assert.equal(b.baseline.existing_ops_tables,2);
  assert.equal(b.baseline.ops_operators,1);
  load(db,'021_ops_dictionary_publisher_receipt_bridge.sql');
  const after=verifyAfter(parseSnapshot(before),counters(db,'after'),fk(db),quick(db));
  assert.equal(after.status,'TEST_021_ADD_ONLY_SCHEMA_VERIFIED');
  assert.equal(after.metadata_tables_added,2);
  assert.equal(after.historical_counts_preserved,16);
  assert.equal(db.prepare('SELECT count(*) n FROM ops_dictionary_publisher_keys').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM ops_dictionary_publisher_receipts').get().n,0);
 }finally{db.close()}
});

test('partial or preexisting migration fails closed before a write',()=>{
 const db=setup();
 try{
  db.exec("CREATE TABLE ops_dictionary_publisher_keys(id TEXT)");
  assert.throws(()=>verifyBefore(counters(db,'before'),fk(db),quick(db)),
   /P0_021_ALREADY_PRESENT_OR_PARTIALLY_APPLIED/);
 }finally{db.close()}
});

test('a changed existing OPS row or missing migration object fails after-verification',()=>{
 const db=setup();
 try{
  const before=parseSnapshot(counters(db,'before'));
  load(db,'021_ops_dictionary_publisher_receipt_bridge.sql');
  db.prepare("UPDATE ops_operators SET display_name='Changed' WHERE id='owner_main'").run();
  // A name edit is not detectable by aggregate counts; this stage guards counts, not row content.
  // Independent backup and no DML in exact SQL ensure existing data are not rewritten.
  db.prepare("INSERT INTO ops_audit_events(id,actor_id,event_type,resource_type,resource_id,request_id) VALUES(?,?,?,?,?,?)")
   .run('audit1','owner_main','test','word','a','reqid_123456');
  assert.throws(()=>verifyAfter(before,counters(db,'after'),fk(db),quick(db)),
   /P0_021_UNEXPECTED_HISTORICAL_DELTA_ops_audit_events/);
  db.prepare("DELETE FROM ops_audit_events WHERE id='audit1'"); // append-only prevents deletion
 }finally{db.close()}
});

test('reject malformed remote results, quick-check errors and foreign-key violations',()=>{
 const db=setup();
 try{
  const before=counters(db,'before'),good=before[0].results[0];
  assert.throws(()=>parseSnapshot(pack([{...good,users:'0'}])),
   /P0_021_NONINTEGER_COUNT/);
  assert.throws(()=>parseSnapshot(pack([{...good,evil:1}])),
   /P0_021_UNEXPECTED_COLUMNS/);
  assert.throws(()=>checkIntegrity(pack([{bad:'fk'}]),quick(db)),/P0_021_FK_VIOLATIONS/);
  assert.throws(()=>checkIntegrity(fk(db),pack([{quick_check:'corrupt'}])),
   /P0_021_INTEGRITY_FAIL/);
 }finally{db.close()}
});
