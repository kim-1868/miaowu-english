import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildGlobalDictionaryIndex} from '../src/global-dictionary-matcher.js';
import {planCrossbookDictionaryPreflight}
  from '../src/global-dictionary-crossbook-batch-preflight.js';
import {producePrivateCrossbookPreflight}
  from '../scripts/preflight-crossbook-dictionary-batches.mjs';

const card=(id,headword,p,m,{ipa='/ipa/',example='An approved example.'}={})=>({
  id,headword,partOfSpeech:p,meaningZh:m,phoneticUs:ipa,
  exampleEn:example,exampleZh:example?'本地模拟例句。':''
});
const noun=()=>card('r-n','record','n.','记录');
const verb=()=>card('r-v','record','v.','录制');
const mark=(id,gloss='记录')=>({wordId:id,surface:'record',gloss});
const novel=(id,category,words,paragraphs)=>({
  version:1,book:{id,title:'模拟小说'+id,category},words,
  chapters:[{number:1,title:'一',paragraphs:paragraphs.map(segments=>({segments}))}]
});
const a=novel('story-a','cet4',[noun(),verb()],[
  [mark('r-n'),{text:'PRIVATE_SENTENCE_DO_NOT_EXPORT. 他走了。'}],
  [mark('r-v','录制')], [{text:'纯中文段落'}]
]);
const b=novel('story-b','cet4',[noun()],[mark('r-n')]);
const c=novel('story-c','cet6',[noun(),verb()],[mark('r-n'),mark('r-v','播放')]);
const d=novel('draft-d','postgrad',[noun()],[mark('r-n')]);
const exported=(category,books)=>({
 format:'miaowu-'+category+'-published-batch-v1',category,bookCount:books.length,
 atomicSnapshot:false,containsUserData:false,containsPaidStoryContent:true,
 books:books.map(p=>({bookId:p.book.id,title:p.book.title,version:2,
  chapterCount:p.chapters.length,
  sha256:createHash('sha256').update(JSON.stringify(p)).digest('hex'),
  package:p}))
});
const input=()=>({bundles:[exported('cet4',[a,b]),exported('cet6',[c])],
 postgradDrafts:[d],index:buildGlobalDictionaryIndex({entries:[
  {entry_id:'gdict_'+'a'.repeat(24),headword:'record',teaching_ready:false}
 ],forms:[]})});

test('CET4/CET6 authenticated snapshots + local postgrad draft produce one private review queue',()=>{
 const x=input(),frozen=JSON.stringify(x.bundles),r=planCrossbookDictionaryPreflight(x);
 assert.equal(r.status,'PRIVATE_BATCH_CROSSBOOK_SENSE_CANDIDATES_ONLY');
 assert.equal(r.summary.books,4);
 assert.deepEqual(r.summary.grades,['cet4','cet6','postgrad']);
 assert.equal(r.summary.publisher_exported_books,3);
 assert.equal(r.summary.local_postgrad_drafts,1);
 assert.equal(r.summary.annotated_occurrences,6);
 assert.equal(r.summary.distinct_headwords,1);
 assert.equal(r.summary.strict_text_sense_candidate_groups,2);
 assert.equal(r.summary.exact_text_sense_shared_across_books,2);
 assert.equal(r.summary.same_spelling_different_sense_headwords,1);
 assert.equal(r.summary.paragraphs_without_targets,1);
 assert.equal(r.summary.context_gloss_mismatches,1);
 assert.equal(r.shared_exact_sense_candidates[0].book_count,4);
 assert.deepEqual(r.shared_exact_sense_candidates[0].exam_categories,['cet4','cet6','postgrad']);
 assert.equal(r.review_queue[0].dictionary_lookup_status,'dictionary_only');
 assert.ok(r.review_queue.every(x=>x.approved_sense_id===null&&!x.cross_book_mastery_merge_allowed));
 assert.ok(r.release_blocked&&r.all_candidates_unapproved);
 assert.equal(JSON.stringify(x.bundles),frozen);
});
test('one word card can have two meanings while study remains distinct per sense',()=>{
 const r=planCrossbookDictionaryPreflight(input());
 const cards=r.review_queue.filter(x=>x.headword==='record');
 assert.equal(cards.length,2);
 assert.ok(cards.some(x=>x.meaning_zh==='记录'));
 assert.ok(cards.some(x=>x.meaning_zh==='录制'));
 assert.equal(cards.filter(x=>x.source_book_ids.length>1).length,2);
 assert.ok(cards.every(x=>x.review_flags.includes('SAME_SPELLING_DIFFERENT_SENSES')));
});
test('no paid story sentences or user identities leak into crossbook report',()=>{
 const r=planCrossbookDictionaryPreflight(input());
 const text=JSON.stringify(r);
 assert.ok(!text.includes('PRIVATE_SENTENCE_DO_NOT_EXPORT'));
 assert.ok(!text.includes('他走了'));
 assert.equal(r.paid_story_sentences_in_report,false);
 assert.equal(r.user_data_read,false);
 assert.equal(r.cloudflare_accessed,false);
 assert.equal(r.summary.user_study_rows_written,0);
});
test('missing IPA, examples, POS and referenced cards remain explicit audit blockers',()=>{
 const q=novel('bad','postgrad',[
  card('broken','camera','','镜头',{ipa:'',example:''}),
  card('unused','desk','n.','书桌')
 ],[[{wordId:'broken',surface:'camera',gloss:'摄像机'},
     {wordId:'unknown',surface:'unknown',gloss:'未知'}]]);
 const r=planCrossbookDictionaryPreflight({postgradDrafts:[q]});
 assert.equal(r.summary.missing_card_references,1);
 assert.equal(r.summary.cards_missing_ipa,1);
 assert.equal(r.summary.cards_missing_examples,1);
 assert.equal(r.summary.context_gloss_mismatches,1);
 assert.equal(r.summary.incomplete_sense_identity_candidates,1);
 assert.equal(r.books[0].unused_cards,1);
 assert.equal(r.books[0].cards_missing_part_of_speech,1);
 assert.equal(r.review_queue[0].strict_sense_candidate,false);
 assert.equal(r.review_queue[0].dictionary_lookup_status,'NOT_CHECKED');
});
test('no accidental use of unverified live exports or corrupted packages',()=>{
 const x=input();
 assert.throws(()=>planCrossbookDictionaryPreflight({}),/CROSSBOOK_NO_SOURCE_BOOKS/);
 const clone=structuredClone(x.bundles[0]);clone.books[0].package.words[0].meaningZh='改变';
 assert.throws(()=>planCrossbookDictionaryPreflight({bundles:[clone]}),
  /PRIVATE_CET4_EXPORT_CHECKSUM_MISMATCH/);
 assert.throws(()=>planCrossbookDictionaryPreflight({
   bundles:[x.bundles[0],x.bundles[0]]
 }),/CROSSBOOK_DUPLICATE_OR_UNSUPPORTED_EXPORT/);
 const dup=novel('bad','postgrad',[noun(),noun()],[[mark('r-n')]]);
 assert.throws(()=>planCrossbookDictionaryPreflight({postgradDrafts:[dup]}),
  /CROSSBOOK_INVALID_OR_DUPLICATE_WORDCARD/);
 assert.throws(()=>planCrossbookDictionaryPreflight({postgradDrafts:[
   novel('dup','postgrad',[noun()],[[mark('r-n')]]),
   novel('dup','postgrad',[noun()],[[mark('r-n')]])
 ]}),/CROSSBOOK_DUPLICATE_BOOK_ID/);
 const changed=novel('wrong','ielts',[noun()],[[mark('r-n')]]);
 assert.throws(()=>planCrossbookDictionaryPreflight({postgradDrafts:[changed]}),
  /CROSSBOOK_POSTGRAD_DRAFT_SHAPE_INVALID/);
});
test('offline CLI may accept verified bundles as in-memory data, never mark approval',()=>{
 const out=producePrivateCrossbookPreflight({
   cet4Batch:exported('cet4',[a]),cet6Batch:exported('cet6',[c]),postgradDrafts:[d]
 });
 assert.equal(out.summary.books,3);
 assert.equal(out.summary.approved_senses_created,0);
 assert.equal(out.release_blocked,true);
});
