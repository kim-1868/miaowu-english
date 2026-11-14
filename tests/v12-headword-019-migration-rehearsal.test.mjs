import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectAddOnly019,rehearseHeadword019} from '../scripts/rehearse-headword-019.mjs';
const sql=readFileSync(new URL('../db/019_global_dictionary_headword_study.sql',import.meta.url),'utf8');
test('019 on real existing SQL 001+013-018 preserves prior words, study, rights and bindings',()=>{
 const x=rehearseHeadword019();
 assert.equal(x.status,'OFFLINE_019_REHEARSAL_SUCCESS');
 assert.equal(x.old_dictionary_tables_preserved,10);
 assert.equal(x.new_tables,2);assert.equal(x.new_indexes,2);
 assert.equal(x.old_row_checksums_preserved,true);
 assert.equal(x.old_schema_checksums_preserved,true);
 assert.equal(x.one_user_entry_cross_book_schedule,true);
 assert.equal(x.publisher_approved_cards_created,0);
 assert.equal(x.d1_remote_writes,0);
});
test('019 SQL must only add exactly the approved tables and indexes',()=>{
 const x=inspectAddOnly019(sql);
 assert.deepEqual(x.tables,['user_headword_study','user_headword_review_events']);
 assert.deepEqual(x.indexes,['ix_user_headword_study_due','ix_user_headword_events_user_entry']);
});
test('refuse old learning reset and other unsafe schema drift',()=>{
 for(const suffix of [
  'DELETE FROM user_words;',
  "UPDATE entitlements SET revoked_at='today';",
  'ALTER TABLE users ADD COLUMN extra TEXT;',
  'DROP TABLE review_events;',
  'INSERT INTO global_dictionary_senses VALUES(1);',
  'PRAGMA foreign_keys=OFF;',
  'CREATE TABLE IF NOT EXISTS user_words(id TEXT);',
  'CREATE TRIGGER IF NOT EXISTS erase_old AFTER INSERT ON user_headword_study BEGIN DELETE FROM user_words; END;',
  'CREATE TABLE data_leak(secret TEXT);',
 ])assert.throws(()=>inspectAddOnly019(sql+'\n'+suffix),/HEADWORD_019_/);
});
test('refuse a changed 019 object name or empty schema',()=>{
 assert.throws(()=>inspectAddOnly019(''),/HEADWORD_019_INVALID/);
 assert.throws(()=>inspectAddOnly019(sql.replace('user_headword_study (','user_words (')),/HEADWORD_019_SCHEMA_OBJECT_DRIFT/);
});