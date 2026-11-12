import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {buildPublishedPrivateEditorialQueue as build}
 from '../scripts/build-private-published-editorial-review-queue.mjs';
const expected={books:2,anchors:4,oldCards:3,headwords:1,textualGroups:2,
 duplicateGroups:1,excessDuplicateIds:1};
const record=(book,id,pos,gloss,occurrences=1)=>({
 book_id:book,category_id:'cat-private',old_word_id:id,headword:'Record',
 pos,gloss_zh:gloss,phonetic_uk:'/rec/',phonetic_us:'/rec/',
 example_en:'Please keep a record.',example_zh:'请保留记录。',occurrences});
const source=()=>({success:true,results:[
 record('bookA','word1','n.','记录',2),
 record('bookB','word2','n.','记录',1),
 record('bookB','word3','v.','录制',1)]});
test('actual candidate groups remain HOLD, no publication or auto same-sense merging',()=>{
 const r=build(source(),{expected});
 assert.equal(r.counts.published_books,2);
 assert.equal(r.counts.published_anchor_occurrences,4);
 assert.equal(r.counts.distinct_old_word_ids,3);
 assert.equal(r.counts.duplicate_textual_sense_groups,1);
 assert.equal(r.counts.duplicate_excess_old_ids,1);
 assert.equal(r.duplicate_review_queue.length,1);
 assert.deepEqual(r.duplicate_review_queue[0].legacy_word_ids,['word1','word2']);
 assert.deepEqual(r.duplicate_review_queue[0].book_ids,['bookA','bookB']);
 assert.equal(r.duplicate_review_queue[0].editor_decision,'HOLD');
 assert.equal(r.duplicate_review_queue[0].auto_merge_allowed,false);
 assert.equal(r.duplicate_review_queue[0].approved_sense_id,null);
 assert.equal(r.other_candidate_groups[0].pos,'v.');
 assert.equal(r.production_writes,0);
});
test('duplicate legacy word in different books stays one unique ID and maintains source evidence',()=>{
 const s=source();
 s.results[1]={...s.results[0],book_id:'bookB',occurrences:1};
 const override={...expected,oldCards:2,duplicateGroups:0,excessDuplicateIds:0};
 const r=build(s,{expected:override});
 assert.equal(r.counts.duplicate_textual_sense_groups,0);
 assert.equal(r.counts.published_anchor_occurrences,4);
 assert.equal(r.counts.distinct_old_word_ids,2);
});
test('refuses stale production counts or extraneous customer or novel text fields',()=>{
 assert.throws(()=>build(source()),/EDITOR_QUEUE_PUBLISHED_SCOPE_DRIFT/);
 const x=source();
 x.results[0].user_id='private-account';
 assert.throws(()=>build(x,{expected}),/SENSITIVE_FIELDS/);
 const y=source();
 y.results[0].occurrences=0;
 assert.throws(()=>build(y,{expected}),/INVALID_OCCURRENCES/);
 const z=source();
 z.results.push(z.results[0]);
 assert.throws(()=>build(z,{expected}),/DUPLICATE_BOOK_CARD/);
});
test('the actual SQL filters published books, exports no story text, only SELECT',()=>{
 const sql=readFileSync('sql/published_32_private_editorial_wordcards_readonly.sql','utf8');
 assert.ok(sql.includes("b.status='published'"));
 assert.ok(sql.includes('ch.published_at IS NOT NULL'));
 assert.ok(!/\b(?:content_json|context_sentence|users|orders|entitlements)\b/i.test(
  sql.split('\n').filter(x=>!x.trim().startsWith('--')).join('\n')));
 assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|DROP|ALTER)\b/i);
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE books(id TEXT PRIMARY KEY,category_id TEXT,status TEXT);
   CREATE TABLE chapters(id TEXT PRIMARY KEY,book_id TEXT,published_at TEXT);
   CREATE TABLE words(id TEXT PRIMARY KEY,headword TEXT,part_of_speech TEXT,
     meaning_zh TEXT,phonetic_uk TEXT,phonetic_us TEXT,example_en TEXT,example_zh TEXT);
   CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT);
   INSERT INTO books VALUES('pub','cat','published'),('draft','cat','draft');
   INSERT INTO chapters VALUES('ch-p','pub','2026-01-01'),('ch-d','draft',NULL);
   INSERT INTO words VALUES('a','record','n.','记录','/r/','/r/','Use a record.','使用记录。'),
    ('b','draft','n.','草稿',NULL,NULL,NULL,NULL);
   INSERT INTO chapter_words VALUES('ch-p','a'),('ch-p','a'),('ch-d','b');`);
  const rows=db.prepare(sql).all();
  assert.equal(rows.length,1);
  assert.equal(rows[0].occurrences,2);
  assert.equal(rows[0].old_word_id,'a');
 }finally{db.close()}
});
test('protected workflow must encrypt before uploading and never print private queue',()=>{
 const wf=readFileSync('.github/workflows/v12-published-private-sense-editorial-queue.yml','utf8');
 for(const word of ['production-d1-readonly-approval','CLOUDFLARE_PROD_D1_READ_TOKEN',
  'PRODUCTION_D1_METADATA_PASSPHRASE','gpg --batch',
  'actions/upload-artifact@v4','retention-days: 7',
  'published_32_private_editorial_wordcards_readonly.sql']){
  assert.ok(wf.includes(word),'missing security requirement: '+word);
 }
 assert.ok(wf.indexOf('gpg --batch')<wf.indexOf('actions/upload-artifact@v4'));
 assert.doesNotMatch(wf,/wrangler deploy|d1 migrations apply/i);
});
