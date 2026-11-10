import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkMigrationStatements,rehearseDictionaryAdditiveMigrations,
 MIGRATIONS,NEW_TABLES} from '../scripts/rehearse-dictionary-staging-migration.mjs';
const files=()=>MIGRATIONS.map(filename=>({
 filename,content:readFileSync(new URL('../db/'+filename,import.meta.url),'utf8')
}));
test('six explicit dictionary migrations only add allowed tables and preserve old user rights',()=>{
 const result=rehearseDictionaryAdditiveMigrations(files());
 assert.equal(result.status,'SAFE_OFFLINE_DICTIONARY_SCHEMA_013_TO_018_REHEARSED');
 assert.equal(result.migrated_tables,10);
 assert.equal(result.migrations.length,6);
 assert.equal(result.legacy_rows_preserved,true);
 assert.equal(result.foreign_keys_valid,true);
 assert.equal(result.integrity_valid,true);
 assert.equal(result.idempotence_checked,true);
 assert.equal(result.cloudflare_write_performed,false);
 assert.equal(result.can_run_wrangler_migrations_apply_remote,false);
 assert.deepEqual(new Set(result.migrations.flatMap(m=>m.new_tables)),new Set(NEW_TABLES));
});
test('unsafe migration input fails closed against DELETE, UPDATE, and old schema rewrites',()=>{
 const base=files()[0];
 for(const bad of [
  "DELETE FROM user_words;",
  "UPDATE entitlements SET category_id='x';",
  "ALTER TABLE words ADD COLUMN new_col TEXT;",
  "DROP TABLE review_events;",
  "BEGIN TRANSACTION; CREATE TABLE IF NOT EXISTS accidental (id TEXT); COMMIT;",
  "CREATE TABLE IF NOT EXISTS users (id TEXT);",
  "CREATE TABLE global_dictionary_unreviewed (id TEXT);",
  "CREATE VIRTUAL TABLE IF NOT EXISTS global_dictionary_fake USING fts5(x);"
 ]){
  assert.throws(()=>checkMigrationStatements(base.filename,base.content+'\n'+bad),
   /NOT_ADDITIVE|UNEXPECTED|UNGUARDED/);
 }
});
test('version drift and missing migration are rejected rather than proceeding remotely',()=>{
 const items=files();
 assert.throws(()=>rehearseDictionaryAdditiveMigrations(items.slice(1)),/INVALID_MIGRATION/);
 const reversed=[...items].reverse();
 assert.throws(()=>rehearseDictionaryAdditiveMigrations(reversed),/MIGRATION_ORDER_DRIFT/);
 const duplicate=[...items];duplicate[5]={...duplicate[4]};
 assert.throws(()=>rehearseDictionaryAdditiveMigrations(duplicate),/MIGRATION_ORDER_DRIFT/);
});
