import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateNovelBindingReview} from '../src/global-dictionary-private-novel-binding-review.js';
const hash='a'.repeat(64),entry='gdict_'+'b'.repeat(24);
const old={old_word_id:'word-a',entry_id:entry,candidate_hash_sha256:hash,
 headword:'record',part_of_speech:'n.',meaning_zh:'记录',
 historical_book_ids:['book-a','book-b'],
 candidate_strict_text_match:true,editorial_sense_approved:false,
 stable_approved_sense_id:null};
const doc=(id)=>({
 book:{id,category:'cet4',title:'Synthetic'},
 words:[{id:'word-a',headword:'record',partOfSpeech:'n.',meaningZh:'记录',
  phoneticUs:'/record/',exampleEn:'A record.',exampleZh:'一条记录。'}],
 chapters:[{number:1,paragraphs:[
  {segments:[{text:'Private paid story hidden.'},{wordId:'word-a',surface:'record',gloss:'记录'}]},
  {segments:[{text:'纯中文段落'}]}]}]
});
test('same reviewed text sense candidate produces per-novel independent context review rows, NO auto approval',()=>{
 const x=createPrivateNovelBindingReview({documents:[doc('book-a'),doc('book-b')],
  historicalCandidates:[old]});
 assert.equal(x.summary.books,2);
 assert.equal(x.summary.candidate_occurrences,2);
 assert.equal(x.summary.reviewable_occurrences,2);
 assert.equal(x.summary.no_study_targets,2);
 assert.equal(x.summary.actual_approved_context_bindings,0);
 assert.equal(x.review_rows[0].candidate_entry_id,entry);
 assert.equal(x.review_rows[0].candidate_hash_sha256,hash);
 assert.equal(x.review_rows[0].approved_sense_id,null);
 assert.equal(x.review_rows[0].editor_action,'hold');
 assert.equal(x.review_rows[0].eligible_for_study_write,false);
 assert.notEqual(x.review_rows[0].review_id,x.review_rows[1].review_id);
 assert.ok(!JSON.stringify(x).includes('Private paid story hidden'));
});
test('context gloss differences never silently normalize into approved meaning',()=>{
 const other=doc('book-a');other.chapters[0].paragraphs[0].segments[1].gloss='磁带';
 const x=createPrivateNovelBindingReview({documents:[other],historicalCandidates:[old]});
 assert.equal(x.summary.context_gloss_discrepancies,1);
 assert.equal(x.review_rows[0].issues.includes('CONTEXT_GLOSS_DIFFERS'),true);
 assert.equal(x.books[0].unresolved,1);
});
test('tampered historical identity and deleted wordcard never produce approved binding',()=>{
 const other=doc('book-a');other.words[0].partOfSpeech='v.';
 const x=createPrivateNovelBindingReview({documents:[other],historicalCandidates:[old]});
 assert.equal(x.summary.mismatched_pos,1);
 assert.equal(x.review_rows[0].issues.includes('CANDIDATE_PART_OF_SPEECH_CHANGED'),true);
 assert.throws(()=>createPrivateNovelBindingReview({documents:[doc('book-a')],
   historicalCandidates:[{...old,editorial_sense_approved:true}]}),/INVALID_OR_APPROVED_HISTORY/);
 const noCard=doc('book-a');noCard.words=[];
 const y=createPrivateNovelBindingReview({documents:[noCard],historicalCandidates:[old]});
 assert.equal(y.summary.invalid_card_ref,1);
 assert.equal(y.review_rows[0].eligible_for_auto_publish,false);
});
test('same exact book and duplicate historical identity fail closed',()=>{
 assert.throws(()=>createPrivateNovelBindingReview({
  documents:[doc('book-a'),doc('book-a')],historicalCandidates:[old]
 }),/DUPLICATE_BOOK_ID/);
 assert.throws(()=>createPrivateNovelBindingReview({
  documents:[doc('book-a')],historicalCandidates:[old,{...old,entry_id:'gdict_'+'c'.repeat(24)}]
 }),/CONFLICTING_HISTORY_ID/);
});
