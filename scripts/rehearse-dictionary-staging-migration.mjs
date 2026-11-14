// Fail-closed OFFLINE rehearsal of the six additive dictionary schema files.
// This script cannot contact Cloudflare and must never alter an existing D1.
// The historic staging DB has no Wrangler migration ledger; DO NOT execute
// "wrangler d1 migrations apply --remote" or replay db/001..db/012.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const MIGRATIONS=Object.freeze([
 '013_global_dictionary.sql',
 '014_global_dictionary_bindings.sql',
 '015_global_dictionary_book_bindings.sql',
 '016_global_dictionary_lessons.sql',
 '017_global_dictionary_legacy_links.sql',
 '018_global_dictionary_reviewed_senses.sql'
]);
export const NEW_TABLES=Object.freeze([
 'global_dictionary_entries','global_dictionary_forms',
 'global_dictionary_sources','global_dictionary_binding_manifests',
 'global_dictionary_book_bindings','global_dictionary_lessons',
 'global_dictionary_legacy_links','global_dictionary_senses',
 'global_dictionary_legacy_sense_links','global_dictionary_book_sense_bindings'
]);
const protectedTables=[
 'users','books','chapters','words','chapter_words','user_words',
 'review_events','reading_progress','entitlements','activation_codes'
];
const initialFile=new URL('../db/001_schema.sql',import.meta.url);
const migrationsDirectory=new URL('../db/',import.meta.url);
const hash=x=>createHash('sha256').update(x).digest('hex');
const stripComments=x=>x.replace(/--[^\n]*/gu,'').replace(/\/\*[\s\S]*?\*\//gu,'');
const isCreate=/\bCREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\b/giu;
const nameTable=/\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)/giu;

export function checkMigrationStatements(filename,sql){
 if(!MIGRATIONS.includes(filename)||typeof sql!=='string'||sql.length<30)
  throw Error('UNEXPECTED_DICTIONARY_MIGRATION');
 const cleaned=stripComments(sql);
 const dangerous=[
  /\b(?:INSERT|REPLACE)\s+INTO\b/iu,
  /\b(?:DELETE)\s+FROM\b/iu,
  /\bUPDATE\s+(?!OF\b|ON\b)[A-Za-z_][A-Za-z_0-9]*\s+SET\b/iu,
  /\b(?:DROP|ALTER|ATTACH|DETACH|VACUUM|REINDEX)\b/iu,
  /\bPRAGMA\s+(?:writable_schema|foreign_keys)\b/iu,
  /\bCREATE\s+(?:TEMP|TEMPORARY|VIRTUAL)\b/iu,
  /\b(?:SAVEPOINT|ROLLBACK|COMMIT)\b|\bBEGIN\s+(?:TRANSACTION|DEFERRED|IMMEDIATE|EXCLUSIVE)\b|\bBEGIN\s*;/iu
 ];
 for(const rule of dangerous){
  if(rule.test(cleaned))throw Error('MIGRATION_IS_NOT_ADDITIVE_'+filename);
 }
 const objects=Array.from(cleaned.matchAll(isCreate));
 if(!objects.length)throw Error('MIGRATION_HAS_NO_DECLARED_OBJECTS_'+filename);
 const tables=[...cleaned.matchAll(nameTable)].map(m=>m[1]);
 if(tables.length===0||tables.some(t=>!NEW_TABLES.includes(t)))
  throw Error('UNEXPECTED_DICTIONARY_TABLE_'+filename);
 if(objects.length!==[...cleaned.matchAll(/\bCREATE\b/giu)].length)
  throw Error('UNGUARDED_CREATE_STATEMENT_'+filename);
 for(const t of protectedTables){
  if(tables.includes(t))throw Error('ATTEMPT_TO_REDEFINE_LEGACY_TABLE');
 }
 return {filename,sha256:hash(sql),new_tables:tables,object_count:objects.length};
}

function openBaseline(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 db.exec(readFileSync(initialFile,'utf8'));
 return db;
}
const count=(db,table)=>db.prepare('SELECT COUNT(*) AS n FROM "'+table+'"').get().n;
const snapshot=db=>Object.fromEntries(protectedTables.map(t=>[t,count(db,t)]));
const tables=db=>new Set(db.prepare(
 "SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));

function assertSchema(db){
 const seen=tables(db);
 for(const t of NEW_TABLES)assert.ok(seen.has(t),'missing '+t);
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM global_dictionary_entries').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM global_dictionary_senses').get().n,0);
 const triggers=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map(x=>x.name));
 for(const name of ['global_dictionary_bindings_draft_guard',
  'global_dictionary_sense_identity_guard',
  'global_dictionary_legacy_sense_link_guard',
  'global_dictionary_legacy_sense_link_no_repoint',
  'global_dictionary_book_sense_guard']){
  assert.ok(triggers.has(name),'required SQL safety trigger '+name+' missing');
 }
}
export function rehearseDictionaryAdditiveMigrations(files){
 if(!Array.isArray(files)||files.length!==MIGRATIONS.length)
  throw Error('INVALID_MIGRATION_FILE_SET');
 const plans=files.map(({filename,content},i)=>{
  if(filename!==MIGRATIONS[i])throw Error('MIGRATION_ORDER_DRIFT');
  return checkMigrationStatements(filename,content);
 });
 const declared=plans.flatMap(p=>p.new_tables);
 if(declared.length!==NEW_TABLES.length||
    new Set(declared).size!==NEW_TABLES.length)
  throw Error('EXPECTED_SCHEMA_OBJECT_SET_DRIFT');
 for(const n of NEW_TABLES)if(!declared.includes(n))
  throw Error('NEW_DICTIONARY_TABLE_MISSING_'+n);
 const db=openBaseline();
 try{
  db.exec("INSERT INTO categories(id,slug,title) VALUES('cet4','cet4','四级')");
  db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES('test-user','runner','hash','salt')");
  db.exec("INSERT INTO books(id,category_id,title,status) VALUES('test-book','cet4','示例','draft')");
  db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview) VALUES('test-ch','test-book',1,'第一章','{}',1)");
  db.exec("INSERT INTO words(id,headword,meaning_zh) VALUES('test-word','record','记录')");
  db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('test-user','cet4')");
  db.exec("INSERT INTO reading_progress(user_id,chapter_id,progress) VALUES('test-user','test-ch',0.4)");
  db.exec("INSERT INTO user_words(user_id,word_id,status,bookmarked) VALUES('test-user','test-word','learning',1)");
  const prior=snapshot(db);
  const protectedRows={};
  for(const name of ['user_words','reading_progress','entitlements']){
   protectedRows[name]=db.prepare('SELECT * FROM "'+name+'"').all();
  }
  // Verify apply on disposable memory DB; do not silently partially change the base.
  for(const migration of files)db.exec(migration.content);
  assertSchema(db);
  assert.deepEqual(snapshot(db),prior);
  for(const [name,rows] of Object.entries(protectedRows))
   assert.deepEqual(db.prepare('SELECT * FROM "'+name+'"').all(),rows);
  // Deliberately replay only those idempotent additive SQL files, never 001..012.
  for(const migration of files)db.exec(migration.content);
  assertSchema(db);
  assert.deepEqual(snapshot(db),prior);
  assert.equal(tables(db).has('d1_migrations'),false,
   'do not create or mutate Wrangler historical migration ledger');
  return {status:'SAFE_OFFLINE_DICTIONARY_SCHEMA_013_TO_018_REHEARSED',
   migrated_tables:NEW_TABLES.length,
   migrations:plans,
   legacy_rows_preserved:true,
   foreign_keys_valid:true,integrity_valid:true,
   idempotence_checked:true,uses_remote_database:false,
   can_run_wrangler_migrations_apply_remote:false,
   customer_data_accessed:false,
   cloudflare_write_performed:false};
 }finally{db.close();}
}

const main=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
 try{
  const files=MIGRATIONS.map(filename=>({
   filename,content:readFileSync(new URL(filename,migrationsDirectory),'utf8')
  }));
  const result=rehearseDictionaryAdditiveMigrations(files);
  console.log(JSON.stringify(result,null,2));
 }catch(error){
  console.error('DICTIONARY_SCHEMA_REHEARSAL_FAILED',String(error?.message||error));
  process.exitCode=1;
 }
}
