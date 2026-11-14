import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {reconcileCanonicalStudyRows}
 from '../src/global-dictionary-study-rehearsal.js';
import {rehearseCanonicalStateFromBackup}
 from '../scripts/rehearse-global-dictionary-study-merge.mjs';

const link=(id,entry='gdict_record',approved=true)=>({
 legacy_word_id:id,entry_id:entry,reviewed:approved,
 source_approved:approved,lesson_approved:approved
});
const row=(user,word,status,bookmarked,due=null,seen=null)=>({
 user_id:user,word_id:word,status,bookmarked,due_at:due,last_seen_at:seen
});
test('B1 rehearses a single main word for different old senses without falsely mastering it',()=>{
 const links=[link('record-n'),link('record-v')];
 const progress=[
  row('user-a','record-n','mastered',1,null,'2026-11-08 10:00:00'),
  row('user-a','record-v','learning',0,'2026-11-11 10:00:00',
      '2026-11-09 10:00:00'),
  row('user-b','record-n','mastered',1),
  row('user-b','record-v','mastered',1)
 ];
 const source=structuredClone(progress);
 const report=reconcileCanonicalStudyRows({links,progress});
 assert.equal(report.status,'READ_ONLY_CANONICAL_STUDY_REHEARSAL');
 assert.equal(report.counts.records,4);
 assert.equal(report.counts.canonical_groups,2);
 assert.equal(report.counts.mastery_conflicts,1);
 assert.equal(report.counts.sense_identity_unverified_groups,2);
 assert.equal(report.unsafe_to_apply_without_sense_mapping,true);
 assert.equal(report.counts.bookmark_unions,1);
 const a=report.proposed_rows.find(x=>x.user_id==='user-a');
 const b=report.proposed_rows.find(x=>x.user_id==='user-b');
 assert.equal(a.status,'learning');
 assert.equal(a.bookmarked,true);
 assert.equal(a.due_at,'2026-11-11 10:00:00');
 assert.equal(a.last_seen_at,'2026-11-09 10:00:00');
 assert.equal(a.requires_manual_review,true);
 assert.deepEqual(a.source_legacy_word_ids,['record-n','record-v']);
 assert.equal(b.status,'mastered');
 assert.equal(b.due_at,null);
 // Even if both old senses were mastered, their meaning identities differ.
 assert.equal(a.requires_sense_identity_review,true);
 assert.equal(b.requires_sense_identity_review,true);
 assert.equal(b.requires_manual_review,true);
 assert.deepEqual(progress,source);
 assert.equal(report.migration_applied,false);
});
test('B1 never assumes a correct remembered answer means mastered; no due date is invented',()=>{
 const result=reconcileCanonicalStudyRows({
  links:[link('old-1'),link('old-2')],
  progress:[row('u','old-1','new',0),
    row('u','old-2','review_due',1,'2026-11-11 11:00:00')]
 });
 const proposed=result.proposed_rows[0];
 assert.equal(proposed.status,'review_due');
 assert.equal(proposed.due_at,'2026-11-11 11:00:00');
 assert.equal(proposed.requires_manual_review,true);
 assert.equal(result.counts.pending_due_unknown,1);
});
test('B1 refuses unreviewed links, contradictory canonical mapping, corrupt user history',()=>{
 const source=[
  link('old-1','gdict_record',true),
  link('old-2','gdict_saw',false)
 ];
 const state=[row('u','old-1','learning',1),row('u','old-2','mastered',0)];
 const audit=reconcileCanonicalStudyRows({links:source,progress:state});
 assert.equal(audit.counts.unmapped,1);
 assert.equal(audit.issues[0],'UNAPPROVED_OR_INVALID_LEGACY_LINK');
 assert.throws(()=>reconcileCanonicalStudyRows({
  links:[link('old-1','gdict_record'),link('old-1','gdict_see')]
 }),/LEGACY_ID_CANONICAL_CONFLICT/);
 assert.throws(()=>reconcileCanonicalStudyRows({
  links:[link('old-1')],progress:[row('u','old-1','remembered',1)]
 }),/INVALID_HISTORICAL_STUDY_ROW/);
 assert.throws(()=>reconcileCanonicalStudyRows({
  links:[link('old-1')],progress:[row('u','old-1','new',0),row('u','old-1','new',0)]
 }),/DUPLICATE_HISTORICAL_STUDY_RECORD/);
});
function makeDatabase(){
 const db=new DatabaseSync(':memory:');
 try{
  for(const name of ['001_schema.sql','013_global_dictionary.sql',
    '016_global_dictionary_lessons.sql','017_global_dictionary_legacy_links.sql']){
   db.exec(readFileSync(new URL('../db/'+name,import.meta.url),'utf8'));
  }
  for(const user of ['student-a','student-b']){
   db.prepare('INSERT INTO users(id,username,password_hash,password_salt) VALUES(?,?,?,?)')
    .run(user,user,'hash','salt');
  }
  for(const [id,head] of [['record-n','record'],['record-v','record'],
      ['unmapped-rare','rare']]){
   db.prepare('INSERT INTO words(id,headword) VALUES(?,?)').run(id,head);
  }
  db.prepare('INSERT INTO global_dictionary_sources '+
   '(source_key,license_name,license_reviewed,source_sha256,'+
   'imported_entries,imported_forms,imported_at,enabled) VALUES(?,?,?,?,?,?,?,?)')
   .run('owner_checked','MIT',1,'a'.repeat(64),1,0,'2026-11-10',1);
  db.prepare('INSERT INTO global_dictionary_entries '+
    '(entry_id,headword,exam_levels_json,source_name,teaching_ready,reviewed_at) '+
    'VALUES(?,?,?,?,?,?)').run('gdict_record','record','["cet4","cet6"]',
      'owner_checked',1,'2026-11-10');
  db.prepare('INSERT INTO global_dictionary_lessons '+
   '(entry_id,headword,senses_json,phonetic_uk,phonetic_us,part_of_speech,'+
   'meaning_zh,example_en,example_zh,reviewed_by,reviewed_at) '+
   'VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('gdict_record','record',
   '[{"pos":"n.","meaningZh":"记录","exampleEn":"Keep a record.",'+
   '"exampleZh":"保留记录。"}]',
   '/ˈrekɔːd/','/ˈrekɔːrd/','n./v.','记录；录制',
   'They kept a record.','他们保留记录。','editor-a','2026-11-10');
  for(const id of ['record-n','record-v']){
   db.prepare('INSERT INTO global_dictionary_legacy_links '+
    '(legacy_word_id,entry_id,reviewed_by,reviewed_at) VALUES(?,?,?,?)')
    .run(id,'gdict_record','editor-a','2026-11-10');
  }
  const progress=[
   ['student-a','record-n','mastered',1,null,'2026-11-09 18:00:00'],
   ['student-a','record-v','learning',0,'2026-11-11 10:00:00','2026-11-10 10:00:00'],
   ['student-b','record-n','mastered',1,null,null],
   ['student-b','record-v','mastered',1,null,null],
   ['student-a','unmapped-rare','new',0,null,null]
  ];
  for(const p of progress)
   db.prepare('INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at,last_seen_at) '+
     'VALUES(?,?,?,?,?,?)').run(...p);
  db.prepare('INSERT INTO review_events(id,user_id,word_id,game_type,result) VALUES(?,?,?,?,?)')
    .run('review-event-001','student-a','record-v','bookplate-flip','correct');
  return db;
 }catch(e){db.close();throw e}
}
test('B1 real SQLite backup rehearsal returns only aggregate info, preserves private study and review events',()=>{
 const db=makeDatabase();
 try{
  const before=db.prepare('SELECT total_changes() AS changes').get().changes;
  const a=rehearseCanonicalStateFromBackup(db);
  assert.equal(a.source_rows,5);
  assert.equal(a.historical_events,1);
  assert.equal(a.reviewed_links,2);
  assert.equal(a.canonical_groups,2);
  assert.equal(a.mastery_conflicts,1);
  assert.equal(a.unmapped,1);
  assert.equal(a.blocked_for_automatic_migration,true);
  assert.equal(a.personal_identifiers_exported,false);
  assert.equal(a.no_database_writes,true);
  assert.equal(JSON.stringify(a).includes('student-a'),false);
  assert.equal(JSON.stringify(a).includes('record-n'),false);
  assert.equal(db.prepare('SELECT total_changes() AS changes').get().changes,before);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_events').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_words').get().n,5);
 }finally{db.close()}
});
test('B1 loss of a licensing / source review prevents false canonical mapping',()=>{
 const db=makeDatabase();
 try{
  db.exec('UPDATE global_dictionary_sources SET enabled=0');
  const result=rehearseCanonicalStateFromBackup(db);
  assert.equal(result.approved_map_count,0);
  assert.equal(result.unmapped,result.source_rows);
  assert.equal(result.blocked_for_automatic_migration,true);
 }finally{db.close()}
});
test('B1 audit refuses pre-migration backups without mapping schema',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE words(id TEXT)');
  assert.throws(()=>rehearseCanonicalStateFromBackup(db),
    /BACKUP_SCHEMA_MISSING_user_words/);
 }finally{db.close()}
});

test('B1 single legacy sense can remain isolated; multiple old cards never auto-merge by headword alone',()=>{
 const single=reconcileCanonicalStudyRows({
  links:[link('record-n')],progress:[row('u','record-n','mastered',1)]
 });
 assert.equal(single.unsafe_to_apply_without_sense_mapping,false);
 assert.equal(single.proposed_rows[0].requires_sense_identity_review,false);
 const mixed=reconcileCanonicalStudyRows({
  links:[link('record-n'),link('record-v')],
  progress:[row('u','record-n','mastered',1),row('u','record-v','mastered',1)]
 });
 assert.equal(mixed.proposed_rows[0].status,'mastered');
 assert.equal(mixed.proposed_rows[0].requires_manual_review,true);
 assert.equal(mixed.unsafe_to_apply_without_sense_mapping,true);
 assert.deepEqual(mixed.proposed_rows[0].source_legacy_word_ids,['record-n','record-v']);
});
