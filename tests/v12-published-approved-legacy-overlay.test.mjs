import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fingerprintLegacyWordCard,listPublishedApprovedLegacySenseAnchors,
 handlePublishedLegacySensePreview} from '../src/global-dictionary-published-approved-legacy-overlay.js';
const E='gdict_'+'a'.repeat(24),S='gds_'+'b'.repeat(24);
const record=(anchor,word)=>({
 anchor,legacy_word_id:word,stored_segment_word_id:word,
 stored_segment_gloss:'记录',old_headword:'record',old_uk:'/rek/',
 old_us:'/rek/',old_pos:'n.',old_meaning:'记录',
 old_en:'Keep a record of the event.',old_zh:'记录这次事件。',
 old_collocations:'[]',old_card_sha256:'',
 link_reviewed_by:'publisher-editor',link_reviewed_at:'2026-11-12T12:00:00Z',
 sense_id:S,entry_id:E,pos:'n.',meaning_zh:'记录',
 example_en:'Please keep a record.',example_zh:'请保留记录。',
 dictionary_headword:'record',lesson_uk:'/rek/',lesson_us:'/rek/',
 senses_json:JSON.stringify([{pos:'n.',meaningZh:'记录',
  exampleEn:'Please keep a record.',exampleZh:'请保留记录。'}])
});
const db=(data)=>({
 lastSql:'',args:null,
 prepare(sql){
  this.lastSql=sql;
  return {bind:(...args)=>{this.args=args;return {
   all:async()=>({results:data})};}};
 }
});
const run=(db,chapterId='chapter-A')=>listPublishedApprovedLegacySenseAnchors(db,{
 chapterId,userId:'user-1'});
test('two distinct approved old IDs can safely resolve to identical sense in read-only published preview',async()=>{
 const a=record('p0:s0','word-A'),b=record('p0:s1','word-B');
 a.old_card_sha256=await fingerprintLegacyWordCard(a);
 b.old_card_sha256=await fingerprintLegacyWordCard(b);
 const d=db([a,b]);
 const r=await run(d);
 assert.deepEqual(r.anchors,[{anchor:'p0:s0',entry_id:E,sense_id:S},
  {anchor:'p0:s1',entry_id:E,sense_id:S}]);
 assert.equal(r.d1_writes,0);
 assert.equal(r.user_study_rows_written,0);
 assert.equal(r.book_content_changed,false);
 assert.deepEqual(d.args,['chapter-A','user-1']);
 assert.match(d.lastSql,/b\.status='published'/);
 assert.match(d.lastSql,/source\.license_reviewed=1|src\.license_reviewed=1/);
 assert.match(d.lastSql,/owned\.user_id=\?/);
 assert.match(d.lastSql,/ch\.published_at<=CURRENT_TIMESTAMP/);
});
test('old card version changes and unreviewed meanings never grant a sense ID',async()=>{
 const a=record('p0:s0','word-A');
 a.old_card_sha256=await fingerprintLegacyWordCard(a);
 const changed={...a,old_meaning:'另一个意思',stored_segment_gloss:'另一个意思'};
 const invalid={...a,anchor:'p0:s1',old_card_sha256:'0'.repeat(64)};
 const r=await run(db([changed,invalid]));
 assert.equal(r.anchors.length,0);
 assert.equal(r.blockedCounts.mismatched_or_missing_lesson,1);
 assert.equal(r.blockedCounts.legacy_card_digest_mismatch,1);
});
test('real published sentence wordId or gloss mismatch must not surface approved sense',async()=>{
 const approved=record('p0:s0','word-A');approved.old_card_sha256=await fingerprintLegacyWordCard(approved);
 const wrongGloss={...approved,anchor:'p0:s1',stored_segment_gloss:'唱片'};
 const wrongId={...approved,anchor:'p0:s2',stored_segment_word_id:'another-id'};
 const missingGloss={...approved,anchor:'p0:s3',stored_segment_gloss:null};
 const x=await run(db([approved,wrongGloss,wrongId,missingGloss]));
 assert.deepEqual(x.anchors,[{anchor:'p0:s0',entry_id:E,sense_id:S}]);
 assert.equal(x.blockedCounts.published_context_mismatch,3);
 const sql=db([]);await run(sql);
 assert.match(sql.lastSql,/stored_segment_word_id/);
 assert.match(sql.lastSql,/stored_segment_gloss/);
 assert.match(sql.lastSql,/json_valid\(ch\.content_json\)/);
});
test('duplicate anchors fail closed and no ambiguous approved identity is leaked',async()=>{
 const a=record('p0:s0','word-A');a.old_card_sha256=await fingerprintLegacyWordCard(a);
 await assert.rejects(()=>run(db([a,{...a}])),/ANCHOR_CONFLICT/);
 await assert.rejects(()=>run(db([a]),'bad chapter/'),/INVALID_AUTHORIZED_REQUEST/);
});
test('HTTP preview stays off by default, production 404, and requires session',async()=>{
 const path='/api/me/dictionary/chapters/chapter-A/published-legacy-sense-preview';
 const req=new Request('https://test.invalid'+path,{method:'GET'});
 const env={APP_ENV:'staging',GLOBAL_DICTIONARY_PUBLISHED_LEGACY_PREVIEW_ENABLED:'true',
  DB:db([])};
 assert.equal((await handlePublishedLegacySensePreview(req,{...env,APP_ENV:'production'},path,{id:'u'})).status,404);
 assert.equal((await handlePublishedLegacySensePreview(req,{...env,GLOBAL_DICTIONARY_PUBLISHED_LEGACY_PREVIEW_ENABLED:'false'},path,{id:'u'})).status,503);
 assert.equal((await handlePublishedLegacySensePreview(req,env,path,null)).status,401);
 const response=await handlePublishedLegacySensePreview(req,env,path,{id:'u'});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal((await response.json()).anchors.length,0);
});
test('original draft-only binding and production study routes remain unmodified',()=>{
 const worker=readFileSync('src/worker.js','utf8');
 assert.match(worker,/handlePublishedLegacySensePreview/);
 assert.match(worker,/published-legacy-sense-preview/);
 const senseApi=readFileSync('src/global-dictionary-sense-study-api.js','utf8');
 assert.match(senseApi,/if\(env\?\.APP_ENV!=='staging'\)/);
 const db=readFileSync('db/018_global_dictionary_reviewed_senses.sql','utf8');
 assert.match(db,/BOOK_SENSE_BINDING_DRAFT_ONLY/);
});
