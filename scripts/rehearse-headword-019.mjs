// One-card/one-SRS phase 6: OFFLINE rehearsal against the *existing* 013-018
// dictionary schema and the old app's real schema. Never connects to D1.
// All source data below is deliberately SYNTHETIC; owner words remain private.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {MIGRATIONS} from './rehearse-dictionary-staging-migration.mjs';

const file=name=>readFileSync(new URL('../db/'+name,import.meta.url),'utf8');
const SHA=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const protectedTables=Object.freeze([
 'users','categories','books','chapters','words','chapter_words',
 'user_words','review_events','entitlements','reading_progress',
 'activation_codes','global_dictionary_entries','global_dictionary_forms',
 'global_dictionary_sources','global_dictionary_lessons','global_dictionary_senses',
 'global_dictionary_book_bindings','global_dictionary_book_sense_bindings',
 'global_dictionary_legacy_links','global_dictionary_legacy_sense_links'
]);
const newTables=Object.freeze(['user_headword_study','user_headword_review_events']);
const newIndexes=Object.freeze(['ix_user_headword_study_due','ix_user_headword_events_user_entry']);
const head='gdict_'+'a'.repeat(24);
const senseN='gds_'+'b'.repeat(24);
const senseV='gds_'+'c'.repeat(24);
const dataRows=db=>Object.fromEntries(protectedTables.map(t=>{
 const rows=db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all();
 return [t,{count:rows.length,sha256:SHA(rows)}];
}));
const schemaSnapshot=db=>Object.fromEntries(db.prepare(
 "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index','trigger') ORDER BY type,name"
).all().filter(x=>!newTables.includes(x.name)&&!newIndexes.includes(x.name))
 .map(x=>[x.type+':'+x.name,SHA(x.sql)]));

export function inspectAddOnly019(sql){
 if(typeof sql!=='string'||sql.length<400)throw Error('HEADWORD_019_INVALID_SQL');
 const body=sql.replace(/--[^\n]*/gu,'').replace(/\/\*[\s\S]*?\*\//gu,'');
 const banned=[
  /\b(?:DELETE|UPDATE|INSERT|REPLACE|DROP|ALTER|ATTACH|DETACH|VACUUM|REINDEX)\b/iu,
  /\bPRAGMA\b|\b(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/iu,
  /\bCREATE\s+(?:TEMP|TEMPORARY|VIRTUAL)\b/iu,
  /\b(?:CREATE\s+TRIGGER|CREATE\s+VIEW)\b/iu,
 ];
 for(const re of banned)if(re.test(body))throw Error('HEADWORD_019_NOT_ADD_ONLY');
 const creates=[...body.matchAll(/\bCREATE\s+(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+([A-Za-z_][A-Za-z_0-9]*)\s*/giu)];
 const all=[...body.matchAll(/\bCREATE\b/giu)];
 if(creates.length!==4||all.length!==4)throw Error('HEADWORD_019_UNGUARDED_CREATE');
 const tables=creates.filter(m=>m[1].toUpperCase()==='TABLE').map(m=>m[2]);
 const indexes=creates.filter(m=>m[1].toUpperCase()==='INDEX').map(m=>m[2]);
 if(JSON.stringify(tables)!==JSON.stringify(newTables)||
    JSON.stringify(indexes)!==JSON.stringify(newIndexes))
  throw Error('HEADWORD_019_SCHEMA_OBJECT_DRIFT');
 // Strict SQL statement terminators, avoiding surprise standalone DML.
 const statements=body.split(';').map(x=>x.trim()).filter(Boolean);
 if(statements.length!==4||!statements.every(s=>/^CREATE\s+(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\b/iu.test(s)))
  throw Error('HEADWORD_019_UNEXPECTED_STATEMENT');
 return {tables,indexes,migration_sha256:createHash('sha256').update(sql).digest('hex')};
}

function seed(db){
 db.exec("INSERT INTO categories(id,slug,title) VALUES('cet4','cet4','四级'),('cet6','cet6','六级')");
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES('synthetic-reader','synthetic','fake','fake'),('synthetic-other','other','fake','fake')");
 for(const [id,grade] of [['a','cet4'],['b','cet6']]){
  db.prepare('INSERT INTO books(id,category_id,title,status) VALUES(?,?,?,?)').run('synthetic-book-'+id,grade,'合成小说 '+id,'published');
  db.prepare('INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) VALUES(?,?,?,?,?,?,?)')
    .run('synthetic-ch-'+id,'synthetic-book-'+id,1,'合成章','{}',1,'2026-11-10 00:00:00');
 }
 db.exec("INSERT INTO words(id,headword,meaning_zh) VALUES('old-record-n','record','记录'),('old-record-v','record','录制')");
 db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('synthetic-reader','cet4'),('synthetic-reader','cet6')");
 db.exec("INSERT INTO reading_progress(user_id,chapter_id,progress) VALUES('synthetic-reader','synthetic-ch-a',0.4)");
 db.exec("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES('synthetic-reader','old-record-n','mastered',1,NULL),('synthetic-reader','old-record-v','learning',0,'2026-11-12')");
 db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES('synthetic-ch-a','old-record-n','Keep a record.','p0:s0'),('synthetic-ch-b','old-record-v','Record a video.','p0:s0')");
 db.exec("INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) VALUES('old-event','synthetic-reader','old-record-n','synthetic-ch-a','story','correct')");
 db.exec("INSERT INTO global_dictionary_sources(source_key,license_name,source_sha256,imported_entries,imported_forms,enabled) VALUES('synthetic-ecd','synthetic-example','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',11422,16442,0)");
 db.prepare('INSERT INTO global_dictionary_entries(entry_id,headword,source_name,teaching_ready) VALUES(?,?,?,0)').run(head,'record','synthetic-ecd');
 db.prepare('INSERT INTO global_dictionary_forms(form,entry_id,source_name,reviewed) VALUES(?,?,?,0)').run('records',head,'synthetic-ecd');
 // These remain strictly UNAPPROVED and are only synthetic schema fixtures.
 db.prepare('INSERT INTO global_dictionary_senses(sense_id,entry_id,pos,meaning_zh,example_en,example_zh,reviewed_by,reviewed_at,approved,active) VALUES(?,?,?,?,?,?,?,?,0,0)')
 .run(senseN,head,'n.','记录','Keep a record.','保留记录。','synthetic-editor','2026-11-11');
 db.prepare('INSERT INTO global_dictionary_senses(sense_id,entry_id,pos,meaning_zh,example_en,example_zh,reviewed_by,reviewed_at,approved,active) VALUES(?,?,?,?,?,?,?,?,0,0)')
 .run(senseV,head,'v.','录制','Record a video.','录制视频。','synthetic-editor','2026-11-11');
}

export function rehearseHeadword019({schema=file('019_global_dictionary_headword_study.sql')}={}){
 const audited=inspectAddOnly019(schema);
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(file('001_schema.sql'));
  for(const name of MIGRATIONS)db.exec(file(name));
  seed(db);
  const previous=dataRows(db),previousSchema=schemaSnapshot(db);
  const oldMainTables=db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'global_dictionary_%'").get().n;
  assert.equal(oldMainTables,10);
  db.exec(schema);
  let rows=dataRows(db),presentSchema=schemaSnapshot(db);
  assert.deepEqual(rows,previous);
  assert.deepEqual(presentSchema,previousSchema);
  const seen=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
  for(const t of newTables)assert.ok(seen.has(t),'missing '+t);
  assert.equal(db.prepare('SELECT count(*) n FROM user_headword_study').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM user_headword_review_events').get().n,0);
  // Applying the add-only schema twice must not rewrite or reset any old state.
  db.exec(schema);
  assert.deepEqual(dataRows(db),previous);
  assert.deepEqual(schemaSnapshot(db),previousSchema);
  const event='00000001-1234-4234-8234-123456789abc';
  db.prepare('INSERT INTO user_headword_study(user_id,entry_id,status,stage,remembered_count,due_at,revision) VALUES(?,?,?,?,?,?,?)')
    .run('synthetic-reader',head,'learning',1,1,'2026-11-12',1);
  db.prepare('INSERT INTO user_headword_review_events(event_id,user_id,entry_id,action,source_book_id,source_chapter_id,source_context_anchor,state_revision) VALUES(?,?,?,?,?,?,?,?)')
    .run(event,'synthetic-reader',head,'remembered','synthetic-book-a','synthetic-ch-a','p0:s0',1);
  const beforeUpdate=db.prepare('SELECT revision FROM user_headword_study WHERE user_id=? AND entry_id=?').get('synthetic-reader',head);
  assert.equal(beforeUpdate.revision,1);
  db.prepare('UPDATE user_headword_study SET stage=2,remembered_count=2,due_at=?,revision=2 WHERE user_id=? AND entry_id=? AND revision=1')
    .run('2026-11-14','synthetic-reader',head);
  db.prepare('INSERT INTO user_headword_review_events(event_id,user_id,entry_id,action,source_book_id,source_chapter_id,source_context_anchor,state_revision) VALUES(?,?,?,?,?,?,?,?)')
    .run('00000002-1234-4234-8234-123456789abc','synthetic-reader',head,'remembered','synthetic-book-b','synthetic-ch-b','p0:s0',2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM user_headword_study').get().n,1,
    'cross-book encounters must share one SRS');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM user_headword_review_events').get().n,2);
  assert.throws(()=>db.prepare('INSERT INTO user_headword_review_events(event_id,user_id,entry_id,action,source_context_anchor,state_revision) VALUES(?,?,?,?,?,?)').run(
    '00000003-1234-4234-8234-123456789abc','synthetic-reader',head,'remembered','p0:s0',2),/UNIQUE|constraint/i);
  assert.deepEqual(dataRows(db),previous,'old study and access tables must be byte-for-byte equivalent row serialization');
  assert.deepEqual(schemaSnapshot(db),previousSchema,'old schema SQL must be unchanged');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  return {status:'OFFLINE_019_REHEARSAL_SUCCESS',
    migration_sha256:audited.migration_sha256,
    old_dictionary_tables_preserved:oldMainTables,
    new_tables:newTables.length,new_indexes:newIndexes.length,
    old_row_checksums_preserved:true,old_schema_checksums_preserved:true,
    legacy_user_words_preserved:2,legacy_review_events_preserved:1,
    one_user_entry_cross_book_schedule:true,unique_event_revision_guards:true,
    publisher_approved_cards_created:0,d1_remote_writes:0,production_data_accessed:false};
 }finally{db.close();}
}
const main=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){try{console.log(JSON.stringify(rehearseHeadword019(),null,2));}
catch(e){console.error('OFFLINE_HEADWORD_019_ABORT',e.message);process.exitCode=1;}}