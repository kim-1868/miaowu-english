import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {classifyPublishedAggregateError} from '../scripts/classify-published-word-aggregate-error.mjs';

test('diagnostic displays only safe fixed class and does not reproduce private stderr',()=>{
 const secret='PRIVATE_BOOK_TITLE_and_secretToken_123456';
 const error='Error SQLITE_ERROR: near SELECT syntax: '+secret;
 const result=classifyPublishedAggregateError(error);
 assert.equal(result,'SQL_OR_SCHEMA_COMPATIBILITY');
 assert.ok(!result.includes(secret));
 assert.equal(classifyPublishedAggregateError('Error: authentication error 10000'),'AUTHORIZATION_OR_TOKEN_SCOPE');
 assert.equal(classifyPublishedAggregateError('Error: API rate limit exceeded'),'RATE_LIMIT_OR_TIMEOUT');
 assert.equal(classifyPublishedAggregateError('anything strange'),'UNCLASSIFIED_SAFE_LOG_REVIEW_REQUIRED');
});
test('comment-stripped one-statement SQL is executable and no raw prose gets sent',()=>{
 const raw=readFileSync('sql/published_word_identity_aggregate_readonly.sql','utf8');
 const stripped=raw.split('\n').filter(line=>!/^\s*--/.test(line)).join('\n');
 assert.ok(raw.includes('One SELECT only;'));
 assert.ok(!stripped.includes('One SELECT only;'));
 assert.equal([...stripped].filter(c=>c===';').length,1);
 assert.ok(stripped.trim().toUpperCase().startsWith('WITH'));
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE books(id TEXT PRIMARY KEY,category_id TEXT,status TEXT);
   CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,published_at TEXT);
   CREATE TABLE words(id TEXT PRIMARY KEY,headword TEXT,part_of_speech TEXT,meaning_zh TEXT,
    phonetic_uk TEXT,phonetic_us TEXT,example_en TEXT,example_zh TEXT);
   CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT,context_anchor TEXT);
   INSERT INTO books VALUES('pub','a','published'),('unpub','a','draft');
   INSERT INTO chapters VALUES('c1','pub','2026-01-01'),('c2','unpub',NULL);
   INSERT INTO words VALUES('w1','record','n.','记录','/r/','/r/','Record.','记录。'),
    ('w2','record','n.','记录','/r/','/r/','Record.','记录。');
   INSERT INTO chapter_words VALUES('c1','w1','p0:s0'),('c2','w2','p0:s0');`);
  const row=db.prepare(stripped).get();
  assert.equal(row.published_anchor_rows,1);
  assert.equal(row.distinct_old_cards,1);
  assert.equal(row.published_books_with_anchors,1);
 } finally {db.close()}
});
test('remote workflow strips comments and protects stderr',()=>{
 const w=readFileSync('.github/workflows/v12-published-word-identity-aggregate-readonly.yml','utf8');
 assert.ok(w.includes("sed '/^[[:space:]]*--/d'"));
 assert.ok(w.includes('classify-published-word-aggregate-error.mjs'));
 assert.ok(w.includes('production-d1-readonly-approval'));
 assert.ok(w.includes('CLOUDFLARE_PROD_D1_READ_TOKEN'));
 assert.doesNotMatch(w,/cat "\$private\/err"|printf.*\$private\/err|wrangler deploy|d1 migrations apply/i);
});
