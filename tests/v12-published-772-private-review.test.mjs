import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {buildPrivatePublishedGlossMismatchQueue as build}
 from '../scripts/build-private-published-gloss-mismatch-review.mjs';
const sql=readFileSync('sql/published_32_private_772_context_gloss_mismatch_readonly.sql','utf8');
const row=(i=0)=>({
 book_id:'published-a',chapter_id:'published-a-ch1',context_anchor:'p'+i+':s0',
 legacy_word_id:'legacy-1',headword:'record',pos:'n.',old_gloss:'记录',
 context_gloss:'唱片',surface:'records',phonetic_uk:'/rek/',phonetic_us:'/rek/',
 example_en:'Keep a record.',example_zh:'保留记录。'
});
const packet=rows=>[{success:true,results:rows}];
test('private result maintains exact 772 HOLD decisions without any approval',()=>{
 const rows=Array.from({length:772},(_,i)=>row(i));
 const report=build(packet(rows));
 assert.equal(report.private_row_count,772);
 assert.equal(report.review_rows.length,772);
 assert.equal(report.editorial_approvals,0);
 assert.equal(report.production_db_writes,0);
 assert.equal(report.sense_links_created,0);
 assert.equal(report.review_rows.every(x=>x.editor_action==='HOLD'&&
  x.approved_sense_id===null&&!x.eligible_for_binding),true);
 assert.equal(report.counts.form_variant_candidates,772);
 assert.match(report.review_rows[0].review_fingerprint_sha256,/^[a-f0-9]{64}$/);
});
test('fail closed on drift, injected user fields, duplicate anchors, or equal gloss',()=>{
 assert.throws(()=>build(packet([row()])) ,/REAL_COUNT_DRIFT/);
 assert.throws(()=>build(packet([{...row(),user_id:'secret'}]),{expected:1}),
  /EXTRA_FIELDS/);
 assert.throws(()=>build(packet([row(),row()]),{expected:2}),/DUPLICATED_LOCATION/);
 assert.throws(()=>build(packet([{...row(),context_gloss:'记录'}]),{expected:1}),
  /NOT_REAL_DIFFERENCE/);
 assert.throws(()=>build(packet([{...row(),context_anchor:'bad'}]),{expected:1}),
  /INVALID_ANCHOR/);
});
test('actual SQLite SELECT returns only published duplicate gloss mismatches',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE books(id TEXT PRIMARY KEY,status TEXT);
   CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,published_at TEXT,content_json TEXT);
   CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT,context_anchor TEXT);
   CREATE TABLE words(id TEXT PRIMARY KEY,headword TEXT,part_of_speech TEXT,
    meaning_zh TEXT,phonetic_uk TEXT,phonetic_us TEXT,example_en TEXT,example_zh TEXT);
   INSERT INTO books VALUES('published-a','published'),('draft','draft');
   INSERT INTO words VALUES
   ('legacy-1','record','n.','记录','/rek/','/rek/','Keep record.','留下记录。'),
   ('legacy-2','Record','n.','记录','/rek/','/rek/','Another example.','另一例句。'),
   ('legacy-3','record','v.','录制','/rek/','/rek/','Record a show.','录制节目。');
   INSERT INTO chapters VALUES
   ('ch-a','published-a','2026-11-01',json_object('paragraphs',json_array(
      json_object('segments',json_array(
       json_object('wordId','legacy-1','surface','record','gloss','唱片'),
       json_object('wordId','legacy-2','surface','record','gloss','记录'),
       json_object('wordId','legacy-3','surface','record','gloss','录制')))))),
   ('draft-ch','draft',NULL,'{"paragraphs":[]}');
   INSERT INTO chapter_words VALUES
   ('ch-a','legacy-1','p0:s0'),('ch-a','legacy-2','p0:s1'),
   ('ch-a','legacy-3','p0:s2'),('draft-ch','legacy-2','p0:s0');`);
  const values=db.prepare(sql).all();
  assert.equal(values.length,1);
  assert.equal(values[0].legacy_word_id,'legacy-1');
  assert.equal(values[0].context_gloss,'唱片');
  const report=build(packet(values),{expected:1});
  assert.equal(report.counts.gloss_mismatch_positions,1);
 }finally{db.close()}
});
test('fixed protected SELECT cannot return full chapters or customer rows',()=>{
 const clean=sql.split('\n').filter(x=>!x.trim().startsWith('--')).join('\n');
 assert.match(clean,/^\s*WITH\b/u);
 assert.match(clean,/b\.status='published'/u);
 assert.match(clean,/ch\.published_at IS NOT NULL/u);
 assert.match(clean,/json_extract\(ch\.content_json/u);
 assert.equal((clean.match(/;/g)||[]).length,1);
 assert.doesNotMatch(clean,/\b(?:UPDATE|INSERT|DELETE|DROP|ALTER|PRAGMA|users|orders|entitlements|context_sentence)\b/iu);
 assert.doesNotMatch(clean,/SELECT\s+\*/iu);
});
