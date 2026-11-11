// 020: local-only rehearsal of separate per-sense study identities.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {MIGRATIONS} from './rehearse-dictionary-staging-migration.mjs';

const dbfile=x=>readFileSync(new URL('../db/'+x,import.meta.url),'utf8');
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const entry='gdict_'+'a'.repeat(24);
const noun='gds_'+'b'.repeat(24),verb='gds_'+'c'.repeat(24);
const safeTables=Object.freeze([
 'users','categories','books','chapters','words','chapter_words',
 'user_words','review_events','entitlements','reading_progress','activation_codes',
 'global_dictionary_entries','global_dictionary_forms','global_dictionary_sources',
 'global_dictionary_lessons','global_dictionary_senses',
 'global_dictionary_book_bindings','global_dictionary_book_sense_bindings',
 'global_dictionary_legacy_sense_links','user_headword_study',
 'user_headword_review_events'
]);
const fingerprint=db=>Object.fromEntries(safeTables.map(t=>[
 t,sha(db.prepare('SELECT * FROM "'+t+'" ORDER BY rowid').all())
]));
const hardenSchema=sql=>{
 const body=sql.replace(/--[^\n]*/gu,'');
 for(const bad of [/\b(?:DROP|ALTER|DELETE|INSERT|UPDATE|REPLACE|ATTACH|DETACH|VACUUM)\s+(?:TABLE|FROM|INTO|user_words|review_events|entitlements)\b/iu,
                   /\bPRAGMA\s+foreign_keys\s*=\s*OFF\b/iu])
   if(bad.test(body))throw Error('SENSE_020_UNSAFE_STATEMENT');
 const creates=[...body.matchAll(/\bCREATE\s+(TABLE|INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)/giu)]
   .map(x=>x[1].toLowerCase()+':'+x[2]);
 const wanted=[
 'table:user_dictionary_sense_study',
 'index:ix_user_dictionary_sense_due',
 'table:user_dictionary_sense_review_events',
 'index:ix_user_dictionary_sense_events',
 'trigger:user_dictionary_sense_study_approved_insert',
 'trigger:user_dictionary_sense_study_approved_update',
 'trigger:user_dictionary_sense_events_approved_insert'
 ];
 if(JSON.stringify(creates)!==JSON.stringify(wanted))
   throw Error('SENSE_020_UNEXPECTED_OBJECTS');
 return {sha256:createHash('sha256').update(sql).digest('hex'),objects:creates.length};
};
function seed(db){
 db.exec("INSERT INTO categories(id,slug,title) VALUES('cet4','cet4','四级')");
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES('sample-user','suser','fake','fake')");
 for(const mark of ['a','b']){
  db.prepare('INSERT INTO books(id,category_id,title,status) VALUES(?,?,?,?)')
    .run('novel-'+mark,'cet4','合成书 '+mark,'published');
  db.prepare('INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) VALUES(?,?,?,?,?,?,?)')
    .run('ch-'+mark,'novel-'+mark,1,'第一章','{}',1,'2026-11-11 00:00:00');
 }
 db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES('legacy-record-n','record','n.','记录'),('legacy-record-v','record','v.','录制')");
 db.exec("INSERT INTO user_words(user_id,word_id,status,bookmarked) VALUES('sample-user','legacy-record-n','mastered',1),('sample-user','legacy-record-v','learning',0)");
 db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('sample-user','cet4')");
 db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES('ch-a','legacy-record-n','Keep a record.','p0:s0'),('ch-b','legacy-record-v','Record a video.','p0:s0')");
 db.exec("INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) VALUES('old-review','sample-user','legacy-record-n','ch-a','story','correct')");
 db.exec("INSERT INTO global_dictionary_sources(source_key,license_name,license_reviewed,source_sha256,imported_entries,imported_forms,imported_at,enabled) VALUES('synth','test-allowed',1,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,0,'2026-11-11 00:00:00',1)");
 db.prepare('INSERT INTO global_dictionary_entries(entry_id,headword,source_name,teaching_ready,reviewed_at) VALUES(?,?,?,?,?)')
   .run(entry,'record','synth',1,'2026-11-11');
 const senses=[
  {pos:'n.',meaningZh:'记录',exampleEn:'Keep a record.',exampleZh:'保留记录。'},
  {pos:'v.',meaningZh:'录制',exampleEn:'Record a video.',exampleZh:'录制视频。'}
 ];
 db.prepare('INSERT INTO global_dictionary_lessons(entry_id,headword,senses_json,phonetic_uk,phonetic_us,part_of_speech,meaning_zh,example_en,example_zh,collocations_json,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
   .run(entry,'record',JSON.stringify(senses),'/r/','/r/','n.','记录','Keep a record.','保留记录。','[]','editor','2026-11-11');
 for(const [id,s] of [[noun,senses[0]],[verb,senses[1]]]){
  db.prepare('INSERT INTO global_dictionary_senses(sense_id,entry_id,pos,meaning_zh,example_en,example_zh,reviewed_by,reviewed_at,approved,active) VALUES(?,?,?,?,?,?,?,?,1,1)')
   .run(id,entry,s.pos,s.meaningZh,s.exampleEn,s.exampleZh,'editor','2026-11-11');
 }
}
export function rehearseSense020({sql=dbfile('020_global_dictionary_sense_study.sql')}={}){
 const audited=hardenSchema(sql),db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(dbfile('001_schema.sql'));
  for(const name of MIGRATIONS)db.exec(dbfile(name));
  db.exec(dbfile('019_global_dictionary_headword_study.sql'));
  seed(db);
  const old=fingerprint(db);
  db.exec(sql);
  assert.deepEqual(fingerprint(db),old);
  assert.equal(db.prepare('SELECT count(*) n FROM user_dictionary_sense_study').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM user_dictionary_sense_review_events').get().n,0);
  // Reapplying migration is idempotent and never mutates existing data.
  db.exec(sql);
  assert.deepEqual(fingerprint(db),old);
  db.prepare('INSERT INTO user_dictionary_sense_study(user_id,sense_id,status,stage,bookmarked,revision) VALUES(?,?,?,?,?,?)')
   .run('sample-user',noun,'mastered',2,1,1);
  db.prepare('INSERT INTO user_dictionary_sense_study(user_id,sense_id,status,stage,due_at,revision) VALUES(?,?,?,?,?,?)')
   .run('sample-user',verb,'learning',1,'2026-11-12T00:00:00.000Z',1);
  db.prepare('INSERT INTO user_dictionary_sense_review_events(event_id,user_id,sense_id,entry_id,action,source_book_id,source_chapter_id,source_context_anchor,state_revision) VALUES(?,?,?,?,?,?,?,?,?)')
   .run('event-a','sample-user',noun,entry,'mark_mastered','novel-a','ch-a','p0:s0',1);
  db.prepare('INSERT INTO user_dictionary_sense_review_events(event_id,user_id,sense_id,entry_id,action,source_book_id,source_chapter_id,source_context_anchor,state_revision) VALUES(?,?,?,?,?,?,?,?,?)')
   .run('event-b','sample-user',verb,entry,'remembered','novel-b','ch-b','p0:s0',1);
  assert.equal(db.prepare('SELECT count(*) n FROM user_dictionary_sense_study').get().n,2);
  const nounState=db.prepare('SELECT status FROM user_dictionary_sense_study WHERE user_id=? AND sense_id=?').get('sample-user',noun);
  const verbState=db.prepare('SELECT status FROM user_dictionary_sense_study WHERE user_id=? AND sense_id=?').get('sample-user',verb);
  assert.equal(nounState.status,'mastered');
  assert.equal(verbState.status,'learning');
  assert.throws(()=>db.prepare('INSERT INTO user_dictionary_sense_study(user_id,sense_id) VALUES(?,?)').run('sample-user',noun),/UNIQUE|constraint/i);
  assert.throws(()=>db.prepare('INSERT INTO user_dictionary_sense_review_events(event_id,user_id,sense_id,entry_id,action,source_context_anchor,state_revision) VALUES(?,?,?,?,?,?,?)')
    .run('event-c','sample-user',noun,entry,'remembered','p0:s0',1),/UNIQUE|constraint/i);
  assert.throws(()=>db.prepare('INSERT INTO user_dictionary_sense_review_events(event_id,user_id,sense_id,entry_id,action,source_context_anchor,state_revision) VALUES(?,?,?,?,?,?,?)')
    .run('event-wrong-entry','sample-user',noun,'gdict_'+'e'.repeat(24),'remembered','p0:s0',2),/FOREIGN KEY|constraint/i);
  assert.deepEqual(fingerprint(db),old,'legacy rows and 019 dormant rows unchanged');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  return {status:'OFFLINE_SENSE_020_REHEARSAL_SUCCESS',
    hash:audited.sha256,new_objects:audited.objects,
    one_display_headword_multiple_independent_sense_plans:true,
    legacy_rows_preserved:true,legacy_access_preserved:true,
    production_db_writes:0,test_d1_writes:0,customer_rows_read:0};
 }finally{db.close();}
}
const main=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
 try{console.log(JSON.stringify(rehearseSense020(),null,2));}
 catch(e){console.error('OFFLINE_SENSE_020_ABORT',e.message);process.exitCode=1}
}
