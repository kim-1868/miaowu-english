import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {collectPublishedExamBatch} from '../public/ops-cet4-export.js';
import {buildGlobalDictionaryIndex} from '../src/global-dictionary-matcher.js';
import {auditExamArchivedBooks,unpackAndVerifyExamLiveBatch}
 from '../scripts/audit-cet4-published-archive-offline.mjs';
const catalog=[{id:'cet6-tram-sample',title:'末班车模拟样本',status:'published',
 category_id:'cet6',chapter_count:1},
 {id:'cet4-book',title:'四级',status:'published',category_id:'cet4',chapter_count:1}];
const w=(id,word,meaning)=>({id,headword:word,meaningZh:meaning,
 partOfSpeech:'n.',phoneticUs:'/a/',exampleEn:'A sample example.',exampleZh:'一个模拟例句。'});
const book=(wordCards=[w('card-a','safety','安全；安全性')])=>({
 version:1,book:{id:'cet6-tram-sample',title:'末班车模拟样本',category:'cet6'},
 words:wordCards,chapters:[{id:'chapter-1',number:1,title:'第一章',paragraphs:[
 {segments:[{wordId:'card-a',surface:'safety',gloss:'安全'},{text:'文字'}]},
 {segments:[{text:'无词卡中文段落'}]}]}]
});
const run=()=>({category:'cet6',catalog,
 fetchExport:async()=>({version:5,package:book()}),
 fetchOverview:async()=>({version:5,book:{id:'cet6-tram-sample',title:'末班车模拟样本'},chapterCount:1}),
 refreshCatalog:async()=>catalog,
 hash:async s=>createHash('sha256').update(s).digest('hex'),
 capturedAt:()=> '2026-11-10T10:30:00Z'
});
const index=buildGlobalDictionaryIndex({entries:[{
 entry_id:'gdict_safety',headword:'safety',teaching_ready:false}],forms:[]});
test('CET6 accepted through authorized existing GET exporter; CET4 remains out of batch',async()=>{
 const result=await collectPublishedExamBatch(run());
 assert.equal(result.category,'cet6');
 assert.equal(result.format,'miaowu-cet6-published-batch-v1');
 assert.equal(result.bookCount,1);
 assert.equal(result.books[0].bookId,'cet6-tram-sample');
 assert.equal(unpackAndVerifyExamLiveBatch(result,{category:'cet6'}).length,1);
 assert.throws(()=>unpackAndVerifyExamLiveBatch(result,{category:'cet4'}),/INVALID_PRIVATE_CET4_EXPORT_FORMAT/);
});
test('CET6 export stops when one book version changes; never uses six-word state',async()=>{
 await assert.rejects(collectPublishedExamBatch({...run(),
  fetchOverview:async()=>({version:6,book:{id:'cet6-tram-sample',title:'末班车模拟样本'},chapterCount:1})
 }),/LIVE_CET6_VERSION_OR_CONTENT_DRIFT/);
 await assert.rejects(collectPublishedExamBatch({...run(),category:'ielts'}),/UNSUPPORTED_EXAM_LEVEL/);
});
test('CET6 read-only content audit separates source tier, gloss variants, and missing-learning paragraphs',()=>{
 const source=new Map([['safety','高考']]);
 const a=auditExamArchivedBooks([book()],index,{category:'cet6',firstTierByHeadword:source});
 assert.equal(a.book_count,1);
 assert.equal(a.exam_category,'cet6');
 assert.equal(a.books[0].first_tier_target_count,0);
 assert.equal(a.books[0].first_tier_used_counts['高考'],1);
 assert.equal(a.books[0].gloss_possible_variants,1);
 assert.equal(a.books[0].gloss_semantic_review_cards,0);
 assert.equal(a.books[0].paragraphs_without_targets,1);
 assert.equal(a.books[0].matches.dictionary_only,1);
 assert.equal(a.release_blocked,true);
});
test('different gloss not covered by old sense requires editorial review, not automatic mastered',()=>{
 const d=book();d.chapters[0].paragraphs[0].segments[0].gloss='放心';
 const a=auditExamArchivedBooks([d],index,{category:'cet6'});
 assert.equal(a.books[0].gloss_semantic_review_cards,1);
 assert.equal(a.approved_lessons_asserted,0);
 assert.equal(a.modified_user_data,false);
});
