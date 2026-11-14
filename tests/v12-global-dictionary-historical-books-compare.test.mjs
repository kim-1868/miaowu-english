import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectHistoricalPublishedCardCandidates}
 from '../src/global-dictionary-historical-books-compare.js';
const sense=(n,head,p,zh,ids)=>({
 candidate_hash_sha256:n.toString(16).padStart(64,'0'),
 headword:head,part_of_speech:p,meaning_zh:zh,
 old_word_ids:ids,lesson_approved:false,approved_sense_id:null});
const snapshot=()=>({
 audit:'wordletter-p5-content-review-offline',
 counts:{published_chapter_word_links:9},
 books:[{book_id:'cet4-a',title:'旧四级',category:'cet4'},
  {book_id:'cet6-b',title:'旧六级',category:'cet6'}],
 cards:[
  {word_id:'old-a',headword:'record',part_of_speech:'n.',meaning_zh:'记录',
   contexts:[{book_id:'cet4-a',chapter_no:1}]},
  {word_id:'old-b',headword:'record',part_of_speech:'n.',meaning_zh:'记录',
   contexts:[{book_id:'cet6-b',chapter_no:2}]},
  {word_id:'old-c',headword:'record',part_of_speech:'v.',meaning_zh:'录制',
   contexts:[{book_id:'cet6-b',chapter_no:3}]}
 ]});
const lessons=()=>[sense(1,'record','n.','记录',['old-a','old-b']),
 sense(2,'record','v.','录制',['old-c'])];
test('archive representative contexts map every old card to strict text senses with no user-state writes',()=>{
 const input=snapshot(),original=JSON.stringify(input);
 const r=inspectHistoricalPublishedCardCandidates(input,lessons());
 assert.equal(r.summary.archive_books,2);
 assert.equal(r.summary.old_word_ids_matched,3);
 assert.equal(r.summary.representative_context_rows,3);
 assert.equal(r.summary.aggregate_chapter_word_links_from_archive,9);
 assert.equal(r.summary.all_chapter_word_links_extracted,false);
 assert.equal(r.summary.senses_shared_across_archive_books,1);
 assert.equal(r.books[0].same_sense_seen_in_other_archive_books,1);
 assert.equal(r.summary.approved_sense_ids,0);
 assert.equal(r.summary.production_d1_modified,false);
 assert.equal(JSON.stringify(input),original);
});
test('wrong old word ID sense and duplicate original IDs reject without implicit merge',()=>{
 const s=snapshot(),x=lessons();
 x[0].meaning_zh='录制';
 assert.throws(()=>inspectHistoricalPublishedCardCandidates(s,x),/NOT_EXACT/);
 const y=lessons();y[1].old_word_ids.push('old-a');
 assert.throws(()=>inspectHistoricalPublishedCardCandidates(s,y),/DUPLICATE_HISTORICAL_OLD_WORD_ID/);
});
test('missing representative book references or partial candidate queue reject',()=>{
 const s=snapshot();s.cards[0].contexts=[{book_id:'invented',chapter_no:1}];
 assert.throws(()=>inspectHistoricalPublishedCardCandidates(s,lessons()),/UNKNOWN_HISTORICAL_BOOK_CONTEXT/);
 const t=snapshot();t.cards.pop();
 assert.throws(()=>inspectHistoricalPublishedCardCandidates(t,lessons()),/NOT_FULLY_COVERED/);
});
