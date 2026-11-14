import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateHistoricalLessonDrafts}
 from '../scripts/build-private-historical-lesson-drafts.mjs';
const c=(id,headword,pos,meaning,book,ipa='/IPA/')=>({
 word_id:id,headword,part_of_speech:pos,meaning_zh:meaning,
 phonetic_uk:ipa,phonetic_us:ipa,example_en:'I recorded the result.',
 example_zh:'我记录了结果。',
 contexts:[{book_id:book,context_sentence:'private copyright text'}]
});
const source=()=>({audit:'wordletter-p5-content-review-offline',
 created_utc:'2026-11-06T08:00:42Z',
 books:[{book_id:'book-a'},{book_id:'book-b'}],
 cards:[
  c('old1','record','n.','记录','book-a'),
  c('old2','record','n.','记录','book-b','/different/'),
  c('old3','record','v.','录制','book-a'),
  c('old4','customer','n.','顾客','book-b')]
});
test('historical card reuse builds per-headword display lessons and per-sense drafts without guessing signoff',()=>{
 const r=buildPrivateHistoricalLessonDrafts(source());
 assert.equal(r.summary.source_card_ids,4);
 assert.equal(r.summary.headwords,2);
 assert.equal(r.summary.sense_candidates,3);
 assert.equal(r.summary.legacy_word_ids,4);
 assert.equal(r.summary.ipa_conflicting_senses,1);
 assert.equal(r.summary.lesson_drafts_with_multiple_senses,1);
 const record=r.lessons.find(x=>x.headword==='record');
 assert.equal(record.senses.length,2);
 assert.equal(record.entry_id.length,30);
 assert.equal(record.phonetic_us,null);
 assert.equal(record.senses.find(x=>x.meaning_zh==='记录').old_word_ids.length,2);
 assert.ok(r.lessons.every(x=>!x.teaching_ready&&!x.lesson_approved&&!x.auto_publish_allowed));
 assert.ok(!JSON.stringify(r).includes('private copyright text'));
});
test('canonical IDs are stable per headword even with reordered old cards; different senses remain separate',()=>{
 const first=buildPrivateHistoricalLessonDrafts(source());
 const x=source();x.cards.reverse();
 const second=buildPrivateHistoricalLessonDrafts(x);
 assert.equal(first.lessons.find(x=>x.headword==='record').entry_id,
  second.lessons.find(x=>x.headword==='record').entry_id);
 assert.equal(second.summary.sense_candidates,3);
});
