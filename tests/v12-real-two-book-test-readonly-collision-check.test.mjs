import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {
 makeRealTestReadOnlyCollisionSQL as sql,
 assessRealTestReadOnlyCollisionResults as assess
} from '../scripts/v12-real-two-book-test-readonly-collision-check.mjs';
function manifest(){
 return {
  schema:'wordletter-real-two-book-test-import-preflight-v1',
  status:'HOLD_PROTECTED_TEST_PREVIEW_NOT_FOR_EXECUTION',
  target_database_id:'88a817cb-23bb-4ae4-bcb8-92286c4165d4',
  source_proof_sha256:'e'.repeat(64),
  safety:{
   can_execute:false,database_writes_performed:0,
   authenticated_editorial_and_license_receipt_verified:false,
   no_user_progress_copied:true,no_entitlements_inserted:true},
  sealed_source_data:{
   categories:[{id:'cet4',slug:'cet4',title:'TEST-only',is_visible:0}],
   books:[
    {id:'real-book-abc',category_id:'cet4',title:'中文一',status:'draft'},
    {id:'real-book-xyz',category_id:'cet4',title:'中文二',status:'draft'}],
   chapters:[
    {id:'real-chapter-a',book_id:'real-book-abc',chapter_no:3,
     is_preview:0,published_at:null},
    {id:'real-chapter-b',book_id:'real-book-xyz',chapter_no:7,
     is_preview:0,published_at:null}],
   words:[{id:'old-card-a',headword:'choice'},{id:'old-card-b',headword:'choice'}],
   chapter_words:[
    {chapter_id:'real-chapter-a',word_id:'old-card-a',context_anchor:'p2:s1'},
    {chapter_id:'real-chapter-b',word_id:'old-card-b',context_anchor:'p0:s0'}]
  }
 };
}
function d1(){
 const db=new DatabaseSync(':memory:');
 for(const file of ['../db/001_schema.sql','../db/013_global_dictionary.sql',
   '../db/016_global_dictionary_lessons.sql',
   '../db/018_global_dictionary_reviewed_senses.sql',
   '../db/020_global_dictionary_sense_study.sql']){
  db.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
 }
 return db;
}
test('TEST SELECT-only SQL is generated from two sealed real-shaped book and card IDs',()=>{
 const x=sql(manifest());
 assert.equal(x.actual_writes,0);
 assert.equal(x.expected_tables,10);
 assert.equal(x.target_database_id,'88a817cb-23bb-4ae4-bcb8-92286c4165d4');
 assert.match(x.sql,/^SELECT /u);
 assert.doesNotMatch(x.sql,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/iu);
 assert.match(x.sql,/book_id_conflicts/);
});
test('exact TEST D1 schema read works on real migration SQL in disposable memory, but cannot authorize write',()=>{
 const db=d1();
 try{
  const m=manifest();
  const result=db.prepare(sql(m).sql).get();
  const r=assess(m,[{results:[result]}]);
  assert.equal(r.test_schema_ready,true);
  assert.equal(r.no_id_collisions,true);
  assert.equal(r.actual_test_db_writes,0);
  assert.equal(r.test_import_allowed,false);
  assert.ok(r.blockers.includes('FIRST_STAGE_REAL_EDITORIAL_RIGHTS_AND_OPS_RECEIPT_PENDING'));
  assert.ok(r.blockers.includes('RESTORABLE_TEST_BACKUP_AND_SEPARATE_WRITE_AUTHORIZATION_REQUIRED'));
  assert.equal(r.user_progress_or_entitlements_unchanged,true);
  assert.equal(db.prepare('SELECT count(*) n FROM books').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM entitlements').get().n,0);
 }finally{db.close()}
});
test('detects current book and old-card collisions without touching existing TEST records',()=>{
 const db=d1();const m=manifest();
 try{
  db.prepare("INSERT INTO categories(id,slug,title,is_visible) VALUES('cet4','cet4','四级',1)").run();
  db.prepare("INSERT INTO books(id,category_id,title,status) VALUES('real-book-abc','cet4','旧书','published')").run();
  db.prepare("INSERT INTO words(id,headword) VALUES('old-card-b','choice')").run();
  const result=db.prepare(sql(m).sql).get();
  const x=assess(m,[{results:[result]}]);
  assert.equal(x.no_id_collisions,false);
  assert.ok(x.blockers.includes('TEST_ID_CONFLICT_BOOK_ID_CONFLICTS'));
  assert.ok(x.blockers.includes('TEST_ID_CONFLICT_OLD_CARD_ID_CONFLICTS'));
  assert.equal(db.prepare("SELECT status FROM books WHERE id='real-book-abc'").get().status,
   'published');
 }finally{db.close()}
});
test('missing protected metadata, fake signoff or exposed chapter aborts before query generation',()=>{
 const changes=[
  x=>x.source_proof_sha256='bad',
  x=>x.status='APPROVED',
  x=>x.safety.authenticated_editorial_and_license_receipt_verified=true,
  x=>x.safety.can_execute=true,
  x=>x.sealed_source_data.books[0].status='published',
  x=>x.sealed_source_data.chapters[0].is_preview=1,
  x=>x.sealed_source_data.words[0].id=x.sealed_source_data.words[1].id,
  x=>x.sealed_source_data.chapter_words[0].word_id='fake',
  x=>x.target_database_id='PRODUCTION'
 ];
 for(const fn of changes){const m=manifest();fn(m);assert.throws(()=>sql(m))}
});
test('untrusted TEST DB result values and aliases fail closed, no false collision-free declaration',()=>{
 const m=manifest();const db=d1();
 try{
  const good=db.prepare(sql(m).sql).get();
  for(const delta of [
   {...good,book_id_conflicts:-1},
   {...good,old_card_id_conflicts:'0'},
   {...good,extras:'not authorized'},
   {...good,ready_table_count:9}
  ]){
   if(delta.ready_table_count===9){
    assert.equal(assess(m,[{results:[delta]}]).test_schema_ready,false);
   }else{
    assert.throws(()=>assess(m,[{results:[delta]}]));
   }
  }
 }finally{db.close()}
});
