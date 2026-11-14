import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {prepareHistoricalSenseReview} from '../src/global-dictionary-historical-sense-worklist.js';
import {prepareHashedHistoricalSenseReview} from '../scripts/build-private-historical-sense-worklist.mjs';
const card=(id,headword,part_of_speech,meaning_zh,book_id)=>({
 word_id:id,headword,part_of_speech,meaning_zh,
 phonetic_uk:'/IPA/',phonetic_us:'/IPA/',
 example_en:'They wrote a record.',example_zh:'他们写了一份记录。',
 contexts:[{book_id,chapter_no:1,context_sentence:'private commercial sentence'}]
});
const source=()=>({
 audit:'wordletter-p5-content-review-offline',
 books:[{book_id:'book-a'},{book_id:'book-b'}],
 cards:[
  card('old-a','record','n.','记录','book-a'),
  card('old-b','record','n.','记录','book-b'),
  card('old-c','record','v.','录制','book-a'),
  card('old-d','customer','n.','顾客','book-b'),
  card('old-e','customer','n.','消费者','book-a')]
});
test('strict same-text duplicates become reviewed candidates but never collapse n/v or near-synonyms',()=>{
 const input=source(),before=JSON.stringify(input);
 const r=prepareHistoricalSenseReview(input);
 assert.equal(r.summary.old_word_id_count,5);
 assert.equal(r.summary.sense_text_candidate_groups,4);
 assert.equal(r.summary.duplicate_text_groups,1);
 assert.equal(r.summary.repeated_old_word_ids,1);
 assert.equal(r.summary.headwords_with_multiple_senses,2);
 assert.equal(r.candidates[0].referenced_legacy_card_count,2);
 assert.ok(r.candidates.every(x=>x.approved_sense_id===null&&!x.may_auto_merge));
 assert.equal(r.study_merge_performed,false);
 assert.equal(r.paid_story_context_in_output,false);
 assert.ok(!JSON.stringify(r).includes('private commercial sentence'));
 assert.equal(before,JSON.stringify(input));
 assert.equal(prepareHashedHistoricalSenseReview(input).candidates[0].review_candidate_hash.length,64);
});
test('bad old IDs or absent meanings fail closed',()=>{
 const x=source();x.cards.push(structuredClone(x.cards[0]));
 assert.throws(()=>prepareHistoricalSenseReview(x),/INVALID_OR_DUPLICATE_HISTORICAL_CARD/);
 const y=source();y.cards[0].meaning_zh='';
 assert.throws(()=>prepareHistoricalSenseReview(y),/INVALID_OR_DUPLICATE_HISTORICAL_CARD/);
});
test('018 schema protects approved sense identity and links only licensed reviewed senses',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON;');
  for(const version of ['001_schema.sql','013_global_dictionary.sql',
    '014_global_dictionary_bindings.sql','015_global_dictionary_book_bindings.sql',
    '016_global_dictionary_lessons.sql','018_global_dictionary_reviewed_senses.sql'])
   db.exec(readFileSync(new URL('../db/'+version,import.meta.url),'utf8'));
  db.prepare('INSERT INTO global_dictionary_sources '+
   '(source_key,license_name,license_reviewed,source_sha256,imported_entries,imported_forms,imported_at,enabled) '+
   'VALUES(?,?,?,?,?,?,?,?)')
   .run('approved_source','MIT',1,'a'.repeat(64),1,0,'2026-11-10',1);
  db.prepare('INSERT INTO global_dictionary_entries(entry_id,headword,source_name,teaching_ready,reviewed_at) '+
   'VALUES(?,?,?,?,?)').run('gdict_record','record','approved_source',1,'2026-11-10');
  db.prepare('INSERT INTO global_dictionary_lessons '+
   '(entry_id,headword,senses_json,phonetic_uk,phonetic_us,part_of_speech,meaning_zh,example_en,example_zh,reviewed_by,reviewed_at) '+
   'VALUES(?,?,?,?,?,?,?,?,?,?,?)')
   .run('gdict_record','record','[{"pos":"n.","meaningZh":"记录","exampleEn":"Keep a record.","exampleZh":"留下记录。"}]',
     '/IPA/','/IPA/','n.','记录','Keep a record.','留下记录。','editor','2026-11-10');
  db.prepare('INSERT INTO words(id,headword,meaning_zh) VALUES(?,?,?)')
   .run('legacy-record','record','记录');
  const a='gds_'+'a'.repeat(24),b='gds_'+'b'.repeat(24);
  const insert='INSERT INTO global_dictionary_senses '+
   '(sense_id,entry_id,pos,meaning_zh,example_en,example_zh,reviewed_by,reviewed_at,approved,active) '+
   'VALUES(?,?,?,?,?,?,?,?,?,?)';
  db.prepare(insert).run(a,'gdict_record','n.','记录','Keep a record.','留下记录。','editor','2026-11-10',1,1);
  db.prepare(insert).run(b,'gdict_record','v.','录制','Record the event.','录制活动。','editor','2026-11-10',0,0);
  assert.throws(()=>db.prepare(insert).run('gds_'+'z'.repeat(24),'gdict_record','n.','错误','Test.','测试。','editor','2026-11-10',0,0),/CHECK constraint failed/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM global_dictionary_senses').get().n,2);
  assert.throws(()=>db.prepare('UPDATE global_dictionary_senses SET pos=? WHERE sense_id=?').run('v.',a),/REVIEWED_SENSE_IDENTITY_IMMUTABLE/);
  const link='INSERT INTO global_dictionary_legacy_sense_links '+
    '(legacy_word_id,sense_id,old_card_sha256,reviewed_by,reviewed_at) VALUES(?,?,?,?,?)';
  assert.throws(()=>db.prepare(link).run('legacy-record',b,'a'.repeat(64),'editor','2026-11-10'),/UNAPPROVED_LEGACY_SENSE_LINK/);
  db.prepare(link).run('legacy-record',a,'a'.repeat(64),'editor','2026-11-10');
  assert.throws(()=>db.prepare('UPDATE global_dictionary_legacy_sense_links SET sense_id=? WHERE legacy_word_id=?').run(b,'legacy-record'),/LEGACY_SENSE_LINK_IMMUTABLE/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM global_dictionary_legacy_sense_links').get().n,1);
 }finally{db.close()}
});
