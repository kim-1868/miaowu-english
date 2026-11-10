import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePublishedNovelToHistoricalWordcards}
 from '../src/global-dictionary-published-legacy-compare.js';
const snapshot=()=>({
 audit:'wordletter-p5-content-review-offline',
 books:[{book_id:'cet4-one'},{book_id:'cet6-two'}],
 cards:[
  {word_id:'old-record-a',headword:'record',part_of_speech:'n.',meaning_zh:'记录',
   phonetic_uk:'/r/1',phonetic_us:'/r/1',
   contexts:[{book_id:'cet4-one',context_sentence:'Private novel content'}]},
  {word_id:'old-record-b',headword:'record',part_of_speech:'n.',meaning_zh:'记录',
   phonetic_uk:'/r/2',phonetic_us:'/r/2',
   contexts:[{book_id:'cet6-two',context_sentence:'Private paid paragraph'}]},
  {word_id:'old-record-verb',headword:'record',part_of_speech:'v.',meaning_zh:'录制',
   phonetic_uk:'/r/2',phonetic_us:'/r/2',
   contexts:[{book_id:'cet6-two'}]}
 ]});
const novel=()=>({version:1,book:{id:'cet6-two',category:'cet6',title:'新的六级正文'},
 words:[
  {id:'old-record-b',headword:'record',partOfSpeech:'n.',meaningZh:'记录',collocations:[]},
  {id:'different-verb',headword:'record',partOfSpeech:'v.',meaningZh:'录制',collocations:[]}
 ],
 chapters:[{id:'chapter-a',number:1,title:'第一章',preview:false,paragraphs:[
  {segments:[{text:'她开始'},{wordId:'old-record-b',surface:'record',gloss:'记录'}]},
  {segments:[{text:'他决定'},{wordId:'different-verb',surface:'record',gloss:'录制'}]}
 ]}]
});
test('existing book and cross-book strict text senses can be shortlisted without merging state',()=>{
 const s=snapshot(),b=novel();
 const orig=JSON.stringify([s,b]);
 const r=comparePublishedNovelToHistoricalWordcards(s,b);
 assert.equal(r.counts.novel_word_ids,2);
 assert.equal(r.counts.exact_text_sense_candidates,2);
 assert.equal(r.counts.old_id_present_and_same_text,1);
 assert.equal(r.counts.candidates_also_in_other_books,1);
 assert.equal(r.counts.multiple_historical_old_ids_same_text,1);
 assert.equal(r.counts.ipa_variant_candidate_groups,1);
 assert.deepEqual(r.review_queue[0].legacy_candidate_ids,['old-record-a','old-record-b']);
 assert.deepEqual(r.review_queue[1].legacy_candidate_ids,['old-record-verb']);
 assert.ok(r.review_queue.every(x=>x.approved_sense_id===null&&!x.automatic_mastery_merge_allowed));
 assert.ok(!JSON.stringify(r).includes('Private paid paragraph'));
 assert.equal(JSON.stringify([s,b]),orig);
});
test('same existing ID with changed meaning demands explicit version review',()=>{
 const b=novel();b.words[0].meaningZh='档案';
 const r=comparePublishedNovelToHistoricalWordcards(snapshot(),b);
 assert.equal(r.counts.same_id_but_modified_meaning,1);
 assert.equal(r.review_queue[0].status,'OLD_WORD_ID_MEANING_DRIFT_REQUIRES_VERSIONED_REVIEW');
});
test('one novel using a genuinely new headword and another meaning stay pending',()=>{
 const b=novel();b.words[0].id='new-word';b.words[0].headword='quixotic';b.words[0].meaningZh='不切实际的';
 b.chapters[0].paragraphs[0].segments[1]={wordId:'new-word',surface:'quixotic',gloss:'不切实际的'};
 b.words[1].meaningZh='记录';b.words[1].partOfSpeech='v.';
 const r=comparePublishedNovelToHistoricalWordcards(snapshot(),b);
 assert.equal(r.counts.new_lemma_candidate,1);
 assert.equal(r.counts.same_lemma_but_new_text_sense,1);
 assert.equal(r.counts.exact_text_sense_candidates,0);
});
