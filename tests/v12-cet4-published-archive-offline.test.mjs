import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDictionaryDraftIndex} from '../scripts/build-global-dictionary-index.mjs';
import {buildGlobalDictionaryIndex} from '../src/global-dictionary-matcher.js';
import {auditCET4ArchivedBooks} from '../scripts/audit-cet4-published-archive-offline.mjs';
const csv='全局排名,首现层级,涉及考试,单词,音标,词性,中文释义,COCA词频frq,BNC词频,柯林斯星级,牛津星级,词形变化\n'
 +'1,四级,四级,customer,ipa,n,顾客,1,1,5,1,s:customers\n'
 +'2,四级,四级,thought,ipa,n,想法,2,2,5,1,\n'
 +'3,四级,四级,think,ipa,v,思考,3,3,5,1,p:thought\n';
const compiled=compileDictionaryDraftIndex(csv);
const index=buildGlobalDictionaryIndex({entries:compiled.entries,forms:compiled.forms});
const card=(id,head,meaning)=>({id,headword:head,partOfSpeech:'n.',meaningZh:meaning,
 phoneticUs:'/ipa/',exampleEn:'An example.',exampleZh:'一个例句。'});
const doc=(id,wordCards,ids)=>({
 book:{id,category:'cet4',title:id},words:wordCards,
 chapters:[{number:1,paragraphs:[{segments:ids.map(wordId=>{
  const w=wordCards.find(x=>x.id===wordId);
  return {wordId,surface:w?.headword??'customer',gloss:w?.meaningZh??'顾客'};
 })}]}]
});
test('realistic archived book matches do not automatically approve lessons or same-word meaning',()=>{
 const a=doc('flower',[card('one','customer','顾客')],['one']);
 const b=doc('partner',[card('two','customer','消费者'),card('three','thought','想法'),
  card('not-used','customer','顾客')],['two','three']);
 const frozen=JSON.stringify([a,b]);
 const r=auditCET4ArchivedBooks([a,b],index,{catalog:{books:[{id:'flower'},{id:'partner'}]}});
 assert.equal(r.book_count,2);
 assert.equal(r.unique_referenced_headwords,2);
 assert.equal(r.repeated_headwords,1);
 assert.equal(r.identical_sense_key_candidate_count,0);
 assert.equal(r.sense_difference_review[0].word,'customer');
 assert.equal(r.books[1].unused_wordcards,1);
 assert.equal(r.per_book_match_counts.matched,0);
 assert.equal(r.per_book_match_counts.dictionary_only,2);
 assert.equal(r.per_book_match_counts.needs_review,1);
 assert.equal(r.release_blocked,true);
 assert.equal(r.accessed_cloudflare,false);
 assert.equal(JSON.stringify([a,b]),frozen);
});
test('identical cross-book senses are candidates only, never auto-migrate learning state',()=>{
 const a=doc('a',[card('one','customer','顾客')],['one']);
 const b=doc('b',[card('two','customer','顾客')],['two']);
 const r=auditCET4ArchivedBooks([a,b],index);
 assert.equal(r.identical_sense_key_candidate_count,1);
 assert.equal(r.approved_lessons_asserted,0);
 assert.equal(r.modified_user_data,false);
});
test('stale and structurally corrupt archives fail closed',()=>{
 const a=doc('a',[card('one','customer','顾客')],['one']);
 assert.throws(()=>auditCET4ArchivedBooks([],index),/EMPTY_ARCHIVED/);
 assert.throws(()=>auditCET4ArchivedBooks([a,a],index),/DUPLICATE_ARCHIVED/);
 assert.throws(()=>auditCET4ArchivedBooks([{...a,words:[a.words[0],a.words[0]]}],index),/INVALID_OR_DUPLICATE_ARCHIVED/);
 assert.throws(()=>auditCET4ArchivedBooks([{...a,book:{...a.book,category:'cet6'}}],index),/NOT_A_CET4/);
});
test('missing IDs, incorrect Chinese gloss and empty English-learning paragraphs are visible',()=>{
 const a=doc('a',[card('one','customer','顾客')],['one']);
 a.chapters[0].paragraphs[0].segments[0].gloss='消费者';
 a.chapters[0].paragraphs[0].segments.push({wordId:'not-present',surface:'customer',gloss:'顾客'});
 a.chapters[0].paragraphs.push({segments:[{text:'纯中文段落'}]});
 const r=auditCET4ArchivedBooks([a],index);
 assert.equal(r.books[0].missing_card_references,1);
 assert.equal(r.books[0].gloss_mismatched_cards,1);
 assert.equal(r.books[0].paragraphs_without_targets,1);
 assert.equal(r.release_blocked,true);
});
