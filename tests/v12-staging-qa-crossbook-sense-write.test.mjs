import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {compileStagingCrossbookPilot}
 from '../scripts/compile-staging-owner-crossbook-pilot.mjs';
import {qaCrossbookStatements,QA_USER,BOOK_A,BOOK_B,QA_SOURCE}
 from '../scripts/staging-qa-crossbook-sense-write.mjs';
const file=n=>readFileSync(new URL(n,import.meta.url),'utf8');
function liveSchemaMirror(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const path of ['../db/001_schema.sql','../db/013_global_dictionary.sql',
  '../db/016_global_dictionary_lessons.sql',
  '../db/018_global_dictionary_reviewed_senses.sql',
  '../db/020_global_dictionary_sense_study.sql'])db.exec(file(path));
 db.prepare("INSERT INTO categories(id,slug,title,is_visible) VALUES('cet4','cet4','四级',1)").run();
 db.prepare("INSERT INTO global_dictionary_sources(source_key,license_name,source_sha256,imported_at) VALUES('upstream_ecdict_unverified','unreviewed',?,'2026-11-01')").run('f'.repeat(64));
 db.prepare("INSERT INTO global_dictionary_entries(entry_id,headword,source_name,teaching_ready) VALUES(?,?,?,0)").run('gdict_'+'a'.repeat(24),'choice','upstream_ecdict_unverified');
 db.exec(compileStagingCrossbookPilot().sql);
 return db;
}
function parseRow(db,sql){const rows=db.prepare(sql).all();assert.equal(rows.length,1);return {...rows[0]}}
test('test-only D1 study write persists one sense across two distinct REAL STORY excerpts and removes only QA rows',()=>{
 const db=liveSchemaMirror();
 try{
  const s=qaCrossbookStatements(),before=parseRow(db,s.preflight);
  assert.deepEqual(before,{qa_user_collisions:0,qa_study_collisions:0,
   qa_event_collisions:0,source_a:1,source_b:1,same_qa_sense:1,
   source_anchors:2});
  const protectedBaseline={
   users:db.prepare('SELECT count(*) n FROM users').get().n,
   books:db.prepare('SELECT count(*) n FROM books').get().n,
   links:db.prepare('SELECT count(*) n FROM global_dictionary_legacy_sense_links').get().n,
   legacyWords:db.prepare('SELECT count(*) n FROM user_words').get().n
  };
  db.exec(s.first);
  assert.deepEqual(parseRow(db,s.check),{qa_users:1,study_rows:1,
   revision:1,remembered:1,seen:0,events:1,source_books:1,
   distinct_event_senses:1,expected_events:1,username_conflicts:0});
  db.exec(s.second);
  assert.deepEqual(parseRow(db,s.check),{qa_users:1,study_rows:1,
   revision:2,remembered:1,seen:1,events:2,source_books:2,
   distinct_event_senses:1,expected_events:2,username_conflicts:0});
  const proof=db.prepare(`SELECT e.source_book_id,st.sense_id,
    st.revision,st.stage,st.remembered_count,st.encounter_count
    FROM user_dictionary_sense_review_events e
    JOIN user_dictionary_sense_study st ON st.sense_id=e.sense_id
     AND st.user_id=e.user_id
    WHERE e.user_id=? ORDER BY e.state_revision`).all(QA_USER);
  assert.deepEqual(proof.map(x=>x.source_book_id),[BOOK_A,BOOK_B]);
  assert.equal(new Set(proof.map(x=>x.sense_id)).size,1);
  assert.equal(proof[0].stage,1);
  assert.equal(proof[1].remembered_count,1);
  assert.equal(proof[1].encounter_count,1);
  assert.ok(db.prepare('SELECT count(*) n FROM global_dictionary_sources WHERE source_key=? AND enabled=1').get(QA_SOURCE).n===1);
  db.exec(s.cleanup);
  assert.deepEqual(parseRow(db,s.check),{qa_users:0,study_rows:0,
   revision:0,remembered:0,seen:0,events:0,source_books:0,
   distinct_event_senses:0,expected_events:0,username_conflicts:0});
  assert.equal(db.prepare('SELECT count(*) n FROM users').get().n,protectedBaseline.users);
  assert.equal(db.prepare('SELECT count(*) n FROM books').get().n,protectedBaseline.books);
  assert.equal(db.prepare('SELECT count(*) n FROM global_dictionary_legacy_sense_links').get().n,protectedBaseline.links);
  assert.equal(db.prepare('SELECT count(*) n FROM user_words').get().n,protectedBaseline.legacyWords);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db.close()}
});
test('QA isolated id cannot duplicate normal user and event ids',()=>{
 const db=liveSchemaMirror();
 try{
  const s=qaCrossbookStatements();
  db.exec(s.first);
  assert.throws(()=>db.exec(s.first),/UNIQUE constraint failed/);
  assert.throws(()=>db.exec(s.second+'\n'+s.second),/UNIQUE constraint failed/);
 }finally{db.close()}
});
test('SQL bounded to TEST-only users and one QA source with mandatory cleanup',()=>{
 const s=qaCrossbookStatements();
 for(const [name,sql] of Object.entries(s)){
  assert.ok(sql.includes('v12-crossbook-qa-20261112')||
    name==='preflight'||name==='first'||name==='second',
   'QA_SCOPE_ONLY');
  assert.doesNotMatch(sql,/wrangler|production\.wrangler|UPDATE\s+user_words|UPDATE\s+entitlements|UPDATE\s+review_events|DROP\s+TABLE/iu);
 }
 assert.match(s.first,/source_book_id/);
 assert.match(s.second,/source_chapter_id/);
 assert.match(s.cleanup,/DELETE FROM user_dictionary_sense_review_events/);
 assert.match(s.cleanup,/DELETE FROM users WHERE id=/);
});
