import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCrossGradeSenseReview} from '../src/global-dictionary-cross-grade-sense-review.js';
const card=(id,headword,meaningZh,partOfSpeech='n.')=>({
 id,headword,meaningZh,partOfSpeech,phoneticUs:'/ipa/',
 exampleEn:'Sample sentence.',exampleZh:'示例句子。'});
const novel=(category,id,items)=>({
 book:{id,title:id,category},words:items,
 chapters:[{number:1,paragraphs:[{segments:items.map(x=>({
 wordId:x.id,surface:x.headword,gloss:x.meaningZh
 }))}]}]});
test('same sense in CET4 and CET6 yields review candidate, never automatically merges mastery',()=>{
 const a=novel('cet4','c4',[card('old-c4','design','设计')]);
 const b=novel('cet6','c6',[card('old-c6','design','设计')]);
 const r=buildCrossGradeSenseReview([a,b]);
 assert.equal(r.across_books_shared_headwords,1);
 assert.equal(r.exact_text_sense_candidate_count,1);
 assert.equal(r.candidates[0].category_count,2);
 assert.equal(r.candidates[0].may_auto_merge,false);
 assert.equal(r.candidates[0].requires_manual_review,true);
 assert.equal(r.can_apply_study_migration,false);
 assert.equal(r.user_rows_accessed,false);
});
test('different senses on same word, including Chinese synonyms, stay independent until review',()=>{
 const a=novel('cet4','c4',[card('old-1','record','记录')]);
 const b=novel('cet6','c6',[card('old-2','record','录制','v.')]);
 const c=novel('postgrad','pg',[card('old-3','record','记载')]);
 const r=buildCrossGradeSenseReview([a,b,c]);
 assert.equal(r.different_or_translation_variant_count,1);
 assert.equal(r.exact_text_sense_candidate_count,0);
 assert.equal(r.candidates[0].candidate_sense_keys.length,3);
 assert.equal(r.candidates[0].may_auto_merge,false);
});
test('same legacy ID reused for incompatible meaning blocks entire review',()=>{
 const a=novel('cet4','c4',[card('old-1','record','记录')]);
 const b=novel('cet6','c6',[card('old-1','record','录制','v.')]);
 assert.throws(()=>buildCrossGradeSenseReview([a,b]),/CROSS_BOOK_WORD_ID_CONTENT_COLLISION/);
});
test('missing cards, unpublished unsupported categories and book duplicates fail closed',()=>{
 const a=novel('cet4','c4',[card('old-1','record','记录')]);
 assert.throws(()=>buildCrossGradeSenseReview([]),/NO_MANUSCRIPTS/);
 assert.throws(()=>buildCrossGradeSenseReview([a,a]),/DUPLICATE_CROSS_GRADE_BOOK/);
 const invalid=structuredClone(a);invalid.chapters[0].paragraphs[0].segments[0].wordId='gone';
 assert.throws(()=>buildCrossGradeSenseReview([invalid]),/MISSING_CROSS_GRADE_CARD_REFERENCE/);
 const bad=structuredClone(a);bad.book.category='unknown';
 assert.throws(()=>buildCrossGradeSenseReview([bad]),/INVALID_CROSS_GRADE_MANUSCRIPT/);
});
test('unreferenced wordcards cannot inflate cross-grade learning coverage',()=>{
 const a=novel('cet4','c4',[card('old-1','design','设计'),card('old-2','quality','质量')]);
 a.chapters[0].paragraphs[0].segments.pop();
 const b=novel('cet6','c6',[card('old-3','quality','质量')]);
 const r=buildCrossGradeSenseReview([a,b]);
 assert.equal(r.across_books_shared_headwords,0);
 assert.equal(r.unused_card_count,1);
});
