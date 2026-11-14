import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {verifyPublishedContextGlossAggregate as verify}
 from '../scripts/verify-published-context-gloss-aggregate.mjs';
const sql=readFileSync('sql/published_32_context_gloss_aggregate_readonly.sql','utf8');
test('real SQLite JSON path detects correct wordId, Chinese gloss and changed annotation',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE books(id TEXT PRIMARY KEY,status TEXT);
   CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,published_at TEXT,content_json TEXT);
   CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT,context_anchor TEXT);
   CREATE TABLE words(id TEXT PRIMARY KEY,headword TEXT,part_of_speech TEXT,meaning_zh TEXT);
   INSERT INTO books VALUES('a','published'),('b','published'),('unpublished','draft');
   INSERT INTO words VALUES('w1','record','n.','记录'),('w2','Record','n.','记录'),
    ('w3','record','v.','录制'),('secret','record','n.','记录');
   INSERT INTO chapters VALUES
   ('ca','a','2026-11-01',json_object('paragraphs',json_array(
    json_object('segments',json_array(
     json_object('wordId','w1','surface','record','gloss','记录'),
     json_object('wordId','w3','surface','record','gloss','录制')))))),
   ('cb','b','2026-11-01',json_object('paragraphs',json_array(
    json_object('segments',json_array(
     json_object('wordId','w2','surface','record','gloss','写下')))))),
   ('cx','unpublished',NULL,'{"paragraphs":[]}');
   INSERT INTO chapter_words VALUES('ca','w1','p0:s0'),('ca','w3','p0:s1'),
    ('cb','w2','p0:s0'),('cx','secret','p0:s0');`);
  const row=db.prepare(sql).get();
  assert.equal(row.published_books,2);
  assert.equal(row.published_anchors,3);
  assert.equal(row.all_distinct_old_ids,3);
  assert.equal(row.duplicate_candidate_groups,1);
  assert.equal(row.duplicate_candidate_old_ids,2);
  assert.equal(row.duplicate_candidate_anchors,2);
  assert.equal(row.confirmed_matching_wordid_anchors,3);
  assert.equal(row.duplicate_gloss_equal_anchors,1);
  assert.equal(row.duplicate_gloss_mismatch_anchors,1);
  assert.equal(row.missing_context_segments,0);
 } finally {db.close()}
});
test('only anonymous aggregate columns permitted, source count drift blocks',()=>{
 const keys=['published_anchors','published_books','all_distinct_old_ids',
 'duplicate_candidate_anchors','duplicate_candidate_old_ids','duplicate_candidate_groups',
 'invalid_chapter_json_anchors','missing_context_segments',
 'confirmed_matching_wordid_anchors','mismatched_wordid_anchors',
 'missing_context_gloss_anchors','duplicate_gloss_equal_anchors',
 'duplicate_gloss_mismatch_anchors','duplicate_missing_surface_anchors'];
 const expected={published_anchors:8444,published_books:32,all_distinct_old_ids:3433,
  duplicate_candidate_anchors:5507,duplicate_candidate_old_ids:1984,
  duplicate_candidate_groups:532,invalid_chapter_json_anchors:0,
  missing_context_segments:0,confirmed_matching_wordid_anchors:8444,
  mismatched_wordid_anchors:0,missing_context_gloss_anchors:0,
  duplicate_gloss_equal_anchors:5507,duplicate_gloss_mismatch_anchors:0,
  duplicate_missing_surface_anchors:0};
 assert.deepEqual(Object.keys(expected).sort(),keys.sort());
 const packet=r=>[{success:true,results:[r]}];
 assert.equal(verify(packet(expected)).scope.duplicate_group_anchors,5507);
 assert.throws(()=>verify(packet({...expected,headword:'record'})),/UNEXPECTED_PRIVATE_FIELDS/);
 assert.throws(()=>verify(packet({...expected,published_books:31})),/SNAPSHOT_DRIFT/);
 assert.throws(()=>verify(packet({...expected,confirmed_matching_wordid_anchors:8443})),/PARTITION_INCONSISTENT/);
});
test('protected query is single SELECT restricted to published, no raw text or writes',()=>{
 const q=sql.split('\n').filter(x=>!x.trim().startsWith('--')).join('\n');
 assert.match(q,/b\.status='published'/);
 assert.match(q,/ch\.published_at IS NOT NULL/);
 assert.match(q,/json_extract\(ch\.content_json/);
 assert.match(q,/segment_gloss/);
 assert.ok(q.trim().toUpperCase().startsWith('WITH'));
 assert.equal((q.match(/;/g)||[]).length,1);
 assert.doesNotMatch(q,/\b(?:UPDATE|INSERT|DELETE|DROP|ALTER|PRAGMA|orders|user_words)\b/i);
 const wf=readFileSync('.github/workflows/v12-production-published-context-gloss-readonly.yml','utf8');
 for(const flag of ['production-d1-readonly-approval',
  'CLOUDFLARE_PROD_D1_READ_TOKEN','sql/published_32_context_gloss_aggregate_readonly.sql',
  'verify-published-context-gloss-aggregate.mjs'])
  assert.ok(wf.includes(flag),'missing '+flag);
 assert.doesNotMatch(wf,/wrangler deploy|d1 migrations apply/i);
});

test('malformed segment JSON or absent context produces a safe count not leaked text',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE books(id TEXT,status TEXT);
   CREATE TABLE chapters(id TEXT,book_id TEXT,published_at TEXT,content_json TEXT);
   CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT,context_anchor TEXT);
   CREATE TABLE words(id TEXT,headword TEXT,part_of_speech TEXT,meaning_zh TEXT);
   INSERT INTO books VALUES('a','published'),('b','published');
   INSERT INTO chapters VALUES('a1','a','2026-11-01','{"paragraphs":[{"segments":["not a segment object"]}]}'),
   ('b1','b','2026-11-01','{"paragraphs":[{"segments":[{"wordId":"w2","surface":"record","gloss":"记录"}]}]}');
   INSERT INTO words VALUES('w1','record','n.','记录'),('w2','record','n.','记录');
   INSERT INTO chapter_words VALUES('a1','w1','p0:s0'),('b1','w2','p0:s0');`);
  const result=db.prepare(sql).get();
  assert.equal(result.published_anchors,2);
  assert.equal(result.duplicate_candidate_groups,1);
  assert.equal(result.mismatched_wordid_anchors,1);
  assert.equal(result.confirmed_matching_wordid_anchors,1);
 }finally{db.close()}
});
