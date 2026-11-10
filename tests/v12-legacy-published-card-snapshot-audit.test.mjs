import test from 'node:test';
import assert from 'node:assert/strict';
import {auditLegacyPublishedCardSnapshot} from '../scripts/audit-legacy-published-cards-offline.mjs';
const card=(id,headword,part_of_speech,meaning_zh,book_id)=>({
 word_id:id,headword,part_of_speech,meaning_zh,
 phonetic_uk:'/ipa/',phonetic_us:'/ipa/',
 example_en:'An original sentence.',example_zh:'一个原创例句。',
 contexts:[{book_id,chapter_no:1,context_sentence:'不要写入报告的上下文。'}]
});
const fixture=()=>({
 audit:'wordletter-p5-content-review-offline',created_utc:'2026-11-06T00:00:00Z',
 books:[{book_id:'book-a',category:'cet4'},{book_id:'book-b',category:'cet6'}],
 cards:[
  card('old-a','record','n.','记录','book-a'),
  card('old-b','record','n.','记录','book-b'),
  card('old-c','record','v.','录制','book-b'),
  card('old-d','customer','n.','顾客','book-a'),
  card('old-e','customer','n.','消费者','book-b')]
});
test('historical published cards: exact repeated sense text is a candidate, not mastery migration',()=>{
 const s=fixture(),before=JSON.stringify(s);
 const a=auditLegacyPublishedCardSnapshot(s);
 assert.equal(a.card_rows,5);
 assert.equal(a.distinct_english_headwords,2);
 assert.equal(a.strictly_identical_text_sense_keys,4);
 assert.equal(a.duplicate_text_sense_groups,1);
 assert.equal(a.extra_cards_with_duplicate_text_senses,1);
 assert.equal(a.repeated_text_senses_spanning_books,1);
 assert.equal(a.headwords_with_multiple_text_senses,2);
 assert.equal(a.automatic_card_merge_allowed,false);
 assert.equal(a.user_learning_rows_accessed,false);
 assert.equal(a.approved_sense_ids_created,0);
 assert.equal(JSON.stringify(s),before);
 assert.ok(!JSON.stringify(a).includes('不要写入报告的上下文'));
});
test('old IDs and required teaching identity are always verified',()=>{
 const x=fixture();x.cards.push(structuredClone(x.cards[0]));
 assert.throws(()=>auditLegacyPublishedCardSnapshot(x),/INVALID_LEGACY_CARD/);
 const y=fixture();y.cards[0].meaning_zh='';
 assert.throws(()=>auditLegacyPublishedCardSnapshot(y),/INVALID_LEGACY_CARD/);
 assert.throws(()=>auditLegacyPublishedCardSnapshot({cards:[]}),/INVALID_PRIVATE/);
});
