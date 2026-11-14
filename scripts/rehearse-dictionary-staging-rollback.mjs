// OFFLINE ONLY: restore a disposable SQLite test fixture after an interrupted
// dictionary schema migration. This is NOT a D1 Time Travel restore.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,copyFileSync,rmSync,mkdtempSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {MIGRATIONS,NEW_TABLES,checkMigrationStatements}
 from './rehearse-dictionary-staging-migration.mjs';
const sum=x=>createHash('sha256').update(x).digest('hex');
const core=['users','categories','books','chapters','words','entitlements','reading_progress','user_words'];
const serialized=db=>Object.fromEntries(core.map(t=>[t,db.prepare(
 'SELECT * FROM "'+t+'" ORDER BY rowid').all()]));
const tableCount=db=>db.prepare('SELECT COUNT(*) AS n FROM sqlite_master WHERE type=? AND name IN ('+
 NEW_TABLES.map(()=>'?').join(',')+')').get('table',...NEW_TABLES).n;

export function rehearseDictionaryRollback({failAfterStep=0}={}){
 if(!Number.isInteger(failAfterStep)||failAfterStep<0||
    failAfterStep>MIGRATIONS.length)throw Error('INVALID_INJECTED_FAILURE');
 const directory=mkdtempSync(join(tmpdir(),'wordletter-dictionary-rollback-'));
 const dbfile=join(directory,'owner-mock.sqlite');
 const baselinefile=join(directory,'owner-mock-pre-migration.sqlite');
 let db;
 try{
  db=new DatabaseSync(dbfile);
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON;');
  db.exec(readFileSync(new URL('../db/001_schema.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO categories(id,slug,title) VALUES('cet4','cet4','大学英语四级')");
  db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES('rollback-owner','owner','passhash','salt')");
  db.exec("INSERT INTO books(id,category_id,title,status) VALUES('old-book','cet4','原有小说','published')");
  db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview) VALUES('old-ch','old-book',1,'旧章','{}',1)");
  db.exec("INSERT INTO words(id,headword,meaning_zh) VALUES('old-word','record','记录')");
  db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('rollback-owner','cet4')");
  db.exec("INSERT INTO reading_progress(user_id,chapter_id,progress) VALUES('rollback-owner','old-ch',0.8)");
  db.exec("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES('rollback-owner','old-word','review_due',1,'2026-11-11')");
  const baseline=serialized(db);
  assert.equal(tableCount(db),0);
  db.close();db=null;
  copyFileSync(dbfile,baselinefile);
  const baselineSha=sum(readFileSync(baselinefile));
  db=new DatabaseSync(dbfile);
  db.exec('PRAGMA foreign_keys=ON;');
  let executed=0,interrupted=false;
  try{
   for(const name of MIGRATIONS){
    const sql=readFileSync(new URL('../db/'+name,import.meta.url),'utf8');
    checkMigrationStatements(name,sql);
    db.exec(sql);
    executed++;
    if(failAfterStep>0&&executed===failAfterStep)
     throw Error('SIMULATED_MIGRATION_INTERRUPTION');
   }
  }catch(error){
   if(error.message!=='SIMULATED_MIGRATION_INTERRUPTION')throw error;
   interrupted=true;
  }
  assert.equal(tableCount(db),interrupted?
    MIGRATIONS.slice(0,executed).reduce((n,name)=>n+
     (name.startsWith('013')?3:name.startsWith('018')?3:1),0):
    NEW_TABLES.length);
  // Close all SQLite handles before rollback: copy or restore only a closed DB.
  db.close();db=null;
  copyFileSync(baselinefile,dbfile);
  assert.equal(sum(readFileSync(dbfile)),baselineSha,
   'byte-for-byte restore must recover pre-migration DB state');
  db=new DatabaseSync(dbfile);
  db.exec('PRAGMA foreign_keys=ON');
  assert.equal(tableCount(db),0);
  assert.deepEqual(serialized(db),baseline);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  return {status:'DISPOSABLE_SQLITE_ROLLBACK_REHEARSED',
   migration_files_executed_before_restore:executed,
   simulated_interruption:interrupted,
   backup_sha256_verified:true,
   complete_original_rows_recovered:true,
   schema_reverted:true,foreign_keys_valid:true,
   live_d1_rollback_executed:false,cloudflare_writes:0,
   source_customer_rows_read:0};
 }finally{
  if(db){try{db.close()}catch{}}
  rmSync(directory,{recursive:true,force:true});
 }
}

const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 try{
  console.log(JSON.stringify(rehearseDictionaryRollback({failAfterStep:3}),null,2));
  console.log(JSON.stringify(rehearseDictionaryRollback(),null,2));
 }catch(e){
  console.error('OFFLINE_ROLLBACK_REHEARSAL_FAILED',e?.message||e);
  process.exitCode=1;
 }
}
