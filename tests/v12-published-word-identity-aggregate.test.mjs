import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {verifyPublishedIdentityAggregate as verify} from '../scripts/verify-published-word-identity-aggregate.mjs';
const sql=readFileSync('sql/published_word_identity_aggregate_readonly.sql','utf8');
function fixture(){
 const d=new DatabaseSync(':memory:');
 d.exec(`CREATE TABLE books(id TEXT PRIMARY KEY,status TEXT,category_id TEXT);
 CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,published_at TEXT);
 CREATE TABLE words(id TEXT PRIMARY KEY,headword TEXT,part_of_speech TEXT,meaning_zh TEXT,
 phonetic_uk TEXT,phonetic_us TEXT,example_en TEXT,example_zh TEXT);
 CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT,context_anchor TEXT);`);
 d.exec(`INSERT INTO books VALUES ('a','published','cet4'),('b','published','cet4'),('draft','draft','cet4');
 INSERT INTO chapters VALUES ('ca','a','2026-01-01'),('cb','b','2026-01-01'),('cd','draft',NULL);
 INSERT INTO words VALUES
 ('word-a','Record','n.','记录','/rek/','/rek/','I made a record.','我做了记录。'),
 ('word-b','record','n.','记录',NULL,'/rek/','I kept a record.','我保留了记录。'),
 ('word-c','record','v.','录制','/ri/','/ri/','Record a video.','录制视频。'),
 ('draft-word','record','n.','记录',NULL,NULL,NULL,NULL);
 INSERT INTO chapter_words VALUES
 ('ca','word-a','p0:s0'),('cb','word-b','p0:s0'),
 ('cb','word-c','p0:s1'),('cd','draft-word','p0:s0');`);
 return d;
}
test('read-only fixed SQL detects same headword across books and distinct sense',()=>{
 const d=fixture();try{
  const before=d.prepare('SELECT count(*) n FROM chapter_words').get().n;
  const row=d.prepare(sql).get();
  assert.equal(row.published_anchor_rows,3);
  assert.equal(row.published_books_with_anchors,2);
  assert.equal(row.distinct_old_cards,3);
  assert.equal(row.distinct_headwords,1);
  assert.equal(row.headwords_with_multiple_old_ids,1);
  assert.equal(row.headwords_repeated_between_books,1);
  assert.equal(row.textual_sense_candidates,2);
  assert.equal(row.textual_sense_groups_with_multiple_old_ids,1);
  assert.equal(row.old_ids_shared_between_books,0);
  assert.equal(row.cards_missing_either_ipa,1);
  assert.equal(d.prepare('SELECT count(*) n FROM chapter_words').get().n,before);
 }finally{d.close()}
});
test('validator rejects stale snapshot, leaked fields or impossible values',()=>{
 const d=fixture();try{
  const x=d.prepare(sql).get(),packet=val=>JSON.stringify([{success:true,results:[val]}]);
  assert.throws(()=>verify(packet(x)),/SNAPSHOT_DRIFT/);
  assert.throws(()=>verify(packet({...x,leaked_headword:'record'})),/UNEXPECTED_FIELD/);
  assert.throws(()=>verify(packet({...x,published_anchor_rows:8444,published_books_with_anchors:32,distinct_old_cards:-1})),/INVALID_COUNT/);
  assert.throws(()=>verify('[{"success":false,"results":[]}]'),/QUERY_FAILED/);
 }finally{d.close()}
});
test('fixed SQL cannot read drafts, mutate data or print dictionary contents',()=>{
 assert.match(sql,/b\.status='published'/);
 assert.match(sql,/ch\.published_at IS NOT NULL/);
 assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|DROP|ALTER|PRAGMA)\b/iu);
 assert.doesNotMatch(sql,/SELECT\s+\*/iu);
 const w=readFileSync('.github/workflows/v12-published-word-identity-aggregate-readonly.yml','utf8');
 for(const literal of ['workflow_dispatch:','production-d1-readonly-approval',
 'CLOUDFLARE_PROD_D1_READ_TOKEN','649c71b3-340c-49bf-b806-3d39256851d3',
 'sql/published_word_identity_aggregate_readonly.sql','feature/v11-smart-vocab-preflight-20261109']){
   assert.ok(w.includes(literal),'missing guard: '+literal);
 }
 assert.doesNotMatch(w,/wrangler deploy|d1 migrations apply|wrangler d1 export/i);
});

test('protected push creates an approval gate without manual form or default-branch D1 access',()=>{
 const w=readFileSync('.github/workflows/v12-published-word-identity-aggregate-readonly.yml','utf8');
 assert.match(w,/push:\\n    branches: \[feature\\/v11-smart-vocab-preflight-20261109\]/);
 assert.match(w,/github.event_name == 'workflow_dispatch' \\|\\| github.event_name == 'push'/);
 assert.match(w,/if: github.event_name == 'workflow_dispatch'/);
 assert.match(w,/production-d1-readonly-approval/);
 assert.match(w,/github.actor == 'kim-1868'/);
 assert.doesNotMatch(w,/wrangler deploy|d1 migrations apply|UPDATE user_words/i);
});
