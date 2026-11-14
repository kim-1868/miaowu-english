import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {listApprovedReaderChapterAnchors} from '../src/global-dictionary-reader-anchors.js';
const ENTRY='gdict_'+'a'.repeat(24),SENSE='gds_'+'b'.repeat(24);
function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY);
    CREATE TABLE books(id TEXT PRIMARY KEY,status TEXT,category_id TEXT);
    CREATE TABLE categories(id TEXT PRIMARY KEY,is_visible INTEGER);
    CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,is_preview INTEGER,published_at TEXT);
    CREATE TABLE activation_codes(id TEXT PRIMARY KEY,status TEXT);
    CREATE TABLE entitlements(user_id TEXT,category_id TEXT,revoked_at TEXT,source_code_id TEXT);
    CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT,context_anchor TEXT);
    CREATE TABLE global_dictionary_entries(entry_id TEXT PRIMARY KEY,source_name TEXT,teaching_ready INTEGER,reviewed_at TEXT);
    CREATE TABLE global_dictionary_sources(source_key TEXT PRIMARY KEY,enabled INTEGER,license_reviewed INTEGER);
    CREATE TABLE global_dictionary_lessons(entry_id TEXT PRIMARY KEY,reviewed_by TEXT,reviewed_at TEXT);
    CREATE TABLE global_dictionary_senses(sense_id TEXT PRIMARY KEY,entry_id TEXT,approved INTEGER,active INTEGER,reviewed_by TEXT,reviewed_at TEXT);
    CREATE TABLE global_dictionary_book_bindings(book_id TEXT,chapter_id TEXT,context_anchor TEXT,legacy_word_id TEXT,entry_id TEXT);
    CREATE TABLE global_dictionary_book_sense_bindings(book_id TEXT,chapter_id TEXT,context_anchor TEXT,sense_id TEXT,entry_id TEXT);
  `);
  sql.exec(`INSERT INTO users VALUES('alice');INSERT INTO users VALUES('bob');
    INSERT INTO categories VALUES('cet4',1);
    INSERT INTO books VALUES('book-a','published','cet4');
    INSERT INTO chapters VALUES('c1','book-a',0,'2025-01-01 00:00:00');
    INSERT INTO activation_codes VALUES('order-a','redeemed');
    INSERT INTO entitlements VALUES('alice','cet4',NULL,'order-a');
    INSERT INTO global_dictionary_sources VALUES('mit',1,1);
    INSERT INTO global_dictionary_lessons VALUES('${ENTRY}','editor','2026-11-01');
    INSERT INTO chapter_words VALUES('c1','old-record','p0:s1');
    INSERT INTO global_dictionary_book_bindings VALUES('book-a','c1','p0:s1','old-record','${ENTRY}');
    INSERT INTO global_dictionary_book_sense_bindings VALUES('book-a','c1','p0:s1','${SENSE}','${ENTRY}');`);
  sql.prepare('INSERT INTO global_dictionary_entries VALUES(?,?,?,?)').run(ENTRY,'mit',1,'2026-11-01');
  sql.prepare('INSERT INTO global_dictionary_senses VALUES(?,?,?,?,?,?)').run(SENSE,ENTRY,1,1,'editor','2026-11-01');
  const db={prepare(query){return {bind(...params){return {async all(){return {results:sql.prepare(query).all(...params)}}}}}}};
  return {sql,db,close:()=>sql.close()};
}
async function anchors(f,userId='alice',chapterId='c1'){
 return listApprovedReaderChapterAnchors(f.db,{userId,chapterId});
}
test('verified published paid chapter returns only one approved word anchor',async()=>{
 const f=fixture();try{
  const x=await anchors(f);
  assert.equal(x.approved_only,true);assert.equal(x.d1_writes,0);
  assert.deepEqual(x.anchors,[{anchor:'p0:s1',entry_id:ENTRY}]);
 }finally{f.close()}
});
test('another user and revoked voucher cannot access a paid word anchor',async()=>{
 const f=fixture();try{
  assert.equal((await anchors(f,'bob')).anchors.length,0);
  f.sql.exec("UPDATE activation_codes SET status='revoked' WHERE id='order-a'");
  assert.equal((await anchors(f)).anchors.length,0);
  f.sql.exec('UPDATE chapters SET is_preview=1');
  assert.equal((await anchors(f,'bob')).anchors.length,1);
 }finally{f.close()}
});
test('draft, unpublished, hidden category and unapproved sense all produce no anchors',async()=>{
 const f=fixture();try{
  for(const sql of [
    "UPDATE books SET status='draft'", "UPDATE chapters SET published_at=NULL",
    'UPDATE categories SET is_visible=0',
    `UPDATE global_dictionary_senses SET approved=0 WHERE sense_id='${SENSE}'`,
    "UPDATE global_dictionary_sources SET license_reviewed=0",
    "UPDATE global_dictionary_entries SET teaching_ready=0"
  ]){
    const fresh=fixture();try{fresh.sql.exec(sql);assert.equal((await anchors(fresh)).anchors.length,0)}finally{fresh.close()}
  }
 }finally{f.close()}
});
test('orphaned legacy anchor or mismatched canonical entry is not listed',async()=>{
 const f=fixture();try{
  f.sql.exec("DELETE FROM chapter_words");
  assert.equal((await anchors(f)).anchors.length,0);
  f.sql.exec("INSERT INTO chapter_words VALUES('c1','different','p0:s1')");
  assert.equal((await anchors(f)).anchors.length,0);
 }finally{f.close()}
});
test('source and syntax tampering rejected; no access by a free-form word',async()=>{
 const f=fixture();try{
  await assert.rejects(()=>anchors(f,'alice','../'),/INVALID_REVIEWED_READER_ANCHOR_REQUEST/);
  await assert.rejects(()=>anchors(f,'','c1'),/INVALID_REVIEWED_READER_ANCHOR_REQUEST/);
  assert.equal((await anchors(f,'alice','not-my-chapter')).anchors.length,0);
  f.sql.exec("UPDATE chapter_words SET context_anchor='p0:unverified'");
  assert.equal((await anchors(f)).anchors.length,0);
 }finally{f.close()}
});