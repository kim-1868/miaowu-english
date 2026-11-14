import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {prepareLegacyDictionaryWorklist}
 from '../src/global-dictionary-legacy-worklist.js';
import {auditLegacyDictionaryReviewQueue}
 from '../scripts/build-global-dictionary-legacy-worklist.mjs';

const entry=(id,headword,senses,approved=true)=>({
 entry_id:id,headword,source_approved:approved,teaching_ready:approved,
 lesson_approved:approved,senses_json:JSON.stringify(senses)
});
const sense=meaningZh=>({pos:'v.',meaningZh,exampleEn:'Example.',
 exampleZh:'示例。'});
test('B1.2 groups old noun/verb records into one reviewed main dictionary card without autoapproving',()=>{
 const result=prepareLegacyDictionaryWorklist({
  words:[
   {id:'old-record-n',headword:'record',meaning_zh:'记录'},
   {id:'old-record-v',headword:'record',meaning_zh:'录制'},
   {id:'old-saw',headword:'saw',meaning_zh:'看见'},
   {id:'old-rare',headword:'quixotic',meaning_zh:'不切实际'}
  ],
  entries:[
   entry('gdict_record','record',[sense('记录'),sense('录制')]),
   entry('gdict_saw','saw',[sense('锯子')])
  ]
 });
 assert.equal(result.counts.candidate,2);
 assert.equal(result.counts.manual,1);
 assert.equal(result.counts.missing,1);
 assert.deepEqual(result.records.slice(0,2).map(x=>x.proposed_entry_id),
  ['gdict_record','gdict_record']);
 assert.equal(result.records[2].reason,'HISTORICAL_MEANING_NEEDS_REVIEW');
 assert.equal(result.records.every(x=>x.verified_for_automatic_migration===false),true);
 assert.equal(result.new_reviewed_links_created,0);
});
test('B1.2 never assumes an ECDICT raw translation proves the teaching lesson was approved',()=>{
 const result=prepareLegacyDictionaryWorklist({
  words:[{id:'old-record',headword:'record',meaning_zh:'记录'}],
  entries:[entry('gdict_record','record',[sense('记录')],false)]
 });
 assert.equal(result.counts.blocked,1);
 assert.equal(result.records[0].requires_human_signoff,true);
});
test('B1.2 stale or contradictory previously approved legacy identity is not silently reused',()=>{
 const input={
  words:[{id:'old-record',headword:'record',meaning_zh:'录制'}],
  entries:[entry('gdict_record','record',[sense('录制')])],
  approvedLinks:[{legacy_word_id:'old-record',entry_id:'gdict_record'}]
 };
 assert.equal(prepareLegacyDictionaryWorklist(input).counts.already_approved,1);
 assert.throws(()=>prepareLegacyDictionaryWorklist({
  ...input,approvedLinks:[{legacy_word_id:'old-record',entry_id:'gdict_see'}]
 }),/APPROVED_LEGACY_LINK_CONFLICT/);
 assert.equal(prepareLegacyDictionaryWorklist({
  ...input,entries:[entry('gdict_record','record',[sense('录制')],false)]
 }).records[0].reason,'PREVIOUS_LINK_NO_LONGER_QUALIFIED');
});
test('B1.2 isolated SQLite audit reads exact words but cannot write accounts or study events',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(readFileSync(new URL('../db/001_schema.sql',import.meta.url),'utf8'));
  for(const file of ['013_global_dictionary.sql','016_global_dictionary_lessons.sql',
     '017_global_dictionary_legacy_links.sql'])
   db.exec(readFileSync(new URL('../db/'+file,import.meta.url),'utf8'));
  db.prepare('INSERT INTO words(id,headword,meaning_zh) VALUES(?,?,?)')
   .run('old-record','record','记录');
  db.prepare('INSERT INTO global_dictionary_sources(source_key,license_name,'+
   'license_reviewed,source_sha256,imported_entries,imported_forms,imported_at,enabled) '+
   'VALUES(?,?,?,?,?,?,?,?)').run('owner_checked','MIT',1,'a'.repeat(64),1,0,'2026-11-10',1);
  db.prepare('INSERT INTO global_dictionary_entries '+
   '(entry_id,headword,exam_levels_json,source_name,teaching_ready,reviewed_at) '+
   'VALUES(?,?,?,?,?,?)').run('gdict_record','record','["cet4","cet6"]','owner_checked',1,
   '2026-11-10');
  db.prepare('INSERT INTO global_dictionary_lessons '+
   '(entry_id,headword,senses_json,phonetic_uk,phonetic_us,part_of_speech,'+
   'meaning_zh,example_en,example_zh,reviewed_by,reviewed_at) '+
   'VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('gdict_record','record',
    JSON.stringify([sense('记录')]),'/ˈrekɔːd/','/ˈrekɔːrd/','n.','记录',
    'Keep a record.','做好记录。','reviewer','2026-11-10');
  const before=db.prepare('SELECT total_changes() AS n').get().n;
  const result=auditLegacyDictionaryReviewQueue(db);
  assert.equal(result.counts.candidate,1);
  assert.equal(result.records[0].proposed_entry_id,'gdict_record');
  assert.equal(result.records[0].requires_human_signoff,true);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,before);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_words').get().n,0);
 }finally{db.close()}
});
