import test from 'node:test';
import assert from 'node:assert/strict';
import {planCrossbookDictionaryPreflight} from '../src/global-dictionary-crossbook-batch-preflight.js';
import {planCrossbookEditorialActions} from '../src/global-dictionary-crossbook-review-action-plan.js';
const card=(id,head,pos,meaning,ipa='/a/')=>({id,headword:head,partOfSpeech:pos,
 meaningZh:meaning,phoneticUs:ipa,exampleEn:'Original example.',
 exampleZh:'原创例句。'});
const book=(id,category,words,segments)=>({book:{id,title:'测试'+id,category},words,
 chapters:[{number:1,paragraphs:segments.map(items=>({segments:items}))}]});
const n=()=>card('a','record','n.','记录','');
const v=()=>card('b','record','v.','录制');
const target=(id,gloss)=>({wordId:id,surface:'record',gloss});
const fixtures=()=>[
 book('a','cet4',[n(),v()],[[target('a','记录'),{text:'Record a video.'}],
  [target('b','录制')]]),
 book('b','cet4',[n()],[[target('a','记录')],[{text:'纯中文段落'}]]),
 book('c','cet6',[v()],[[target('b','录制')]]),
 book('d','postgrad',[n()],[[target('a','记录')]])
];
const plan=()=>planCrossbookDictionaryPreflight({postgradDrafts:fixtures().slice(3),
 bundles:[],index:null});
function combined(){
 const x=fixtures();
 const synthetic=planCrossbookDictionaryPreflight({postgradDrafts:[x[3]]});
 // Original validated report structure; construct separately scoped inputs for
 // CET4/CET6 without fabricating actual publisher export metadata.
 const report=structuredClone(synthetic);
 const cet4=planCrossbookDictionaryPreflight({postgradDrafts:[
  {...x[0],book:{...x[0].book,category:'postgrad'}},
  {...x[1],book:{...x[1].book,category:'postgrad'}}
 ]});
 const parts=planCrossbookDictionaryPreflight({postgradDrafts:[
  {...x[2],book:{...x[2].book,category:'postgrad'}}
 ]});
 const samples=[
  {book_id:'a',category:'cet4',title:'a',...cet4.books[0]},
  {book_id:'b',category:'cet4',title:'b',...cet4.books[1]},
  {book_id:'c',category:'cet6',title:'c',...parts.books[0]},
  report.books[0]
 ].map((x,i)=>({...x,book_id:['a','b','c','d'][i],
   category:['cet4','cet4','cet6','postgrad'][i]}));
 report.books=samples;
 report.summary.grades=['cet4','cet6','postgrad'];
 report.review_queue=[
  {headword:'record',part_of_speech:'n.',meaning_zh:'记录',
    strict_sense_candidate:true,source_book_ids:['cet4:a','cet4:b','postgrad:d'],
    exam_categories:['cet4','postgrad'],review_flags:['IPA_REVIEW_NEEDED'],
    dictionary_lookup_status:'dictionary_only',occurrences:3,
    historical_card_count:3,historical_card_ids:['cet4:a:a','cet4:b:a','postgrad:d:a'],
    other_sense_candidates_same_spelling:1,
    approved_sense_id:null,commercially_approved:false,cross_book_mastery_merge_allowed:false},
  {headword:'record',part_of_speech:'v.',meaning_zh:'录制',
    strict_sense_candidate:true,source_book_ids:['cet4:a','cet6:c'],
    exam_categories:['cet4','cet6'],review_flags:['SAME_SPELLING_DIFFERENT_SENSES'],
    dictionary_lookup_status:'dictionary_only',occurrences:2,
    historical_card_count:2,historical_card_ids:['cet4:a:b','cet6:c:b'],
    other_sense_candidates_same_spelling:1,
    approved_sense_id:null,commercially_approved:false,cross_book_mastery_merge_allowed:false}
 ];
 report.unmarked_discovery_queue=[{headword:'video',occurrences:1,
   source_book_ids:['cet4:a'],occurrences_by_book:{'cet4:a':1},
   exam_categories:['cet4'],dictionary_lookup_status:'missing',
   approved_sense_id:null,automatically_bound:false,
   automatic_publication_allowed:false,requires_context_sense_review:true}];
 report.summary.approved_senses_created=0;
 report.summary.user_study_rows_written=0;
 report.summary.remote_d1_writes=0;
 return report;
}
test('cross grade editorial tasks prioritize repeated senses and keep meanings separate',()=>{
 const source=combined(),before=JSON.stringify(source);
 const x=planCrossbookEditorialActions(source,{perGradeLimit:20});
 assert.equal(x.status,'PRIVATE_EDITORIAL_ACTION_PLAN_REQUIRES_REVIEW');
 assert.equal(x.summary.approved_senses,0);
 assert.equal(x.summary.customer_study_rows_written,0);
 assert.equal(x.by_grade.cet4.total_tasks>0,true);
 assert.equal(x.by_grade.cet6.total_tasks>0,true);
 assert.equal(x.by_grade.postgrad.total_tasks>0,true);
 assert.equal(x.batches.cet4.filter(t=>t.lane==='EXISTING_SENSE_REVIEW').length,2);
 assert.ok(x.batches.cet4.some(t=>t.lane==='UNMARKED_CONTEXT_REVIEW'));
 assert.ok(x.batches.cet4.some(t=>t.lane==='BOOK_CONTENT_REPAIR'));
 assert.ok(x.batches.cet4.every(t=>t.approved_sense_id===null&&
   t.approval===false&&t.publish_allowed===false));
 assert.equal(JSON.stringify(source),before);
});
test('deterministic limited batches preserve reproducible priority',()=>{
 const r=combined(),a=planCrossbookEditorialActions(r,{perGradeLimit:2}),
 b=planCrossbookEditorialActions(r,{perGradeLimit:2});
 assert.deepEqual(a,b);
 assert.equal(a.batches.cet4.length,2);
 assert.ok(a.by_grade.cet4.remaining_tasks>0);
 assert.ok(a.batches.cet4[0].priority>=a.batches.cet4[1].priority);
});
test('unsafe approval source and forged binding proposals fail closed',()=>{
 const r=combined();
 r.review_queue[0].approved_sense_id='gds_fake';
 assert.throws(()=>planCrossbookEditorialActions(r),/ALREADY_APPROVED_OR_INVALID/);
 const q=combined();q.release_blocked=false;
 assert.throws(()=>planCrossbookEditorialActions(q),/UNTRUSTED_OR_ALREADY_APPROVED/);
 const b=combined();b.unmarked_discovery_queue[0].automatically_bound=true;
 assert.throws(()=>planCrossbookEditorialActions(b),/ALREADY_BOUND_OR_INVALID/);
});
test('published story prose and customer personal state are never included',()=>{
 const r=combined(),x=planCrossbookEditorialActions(r);
 assert.equal(x.source_paid_story_text_copied,false);
 assert.equal(x.publisher_authenticated_signoff,false);
 assert.equal(x.automatic_publication_allowed,false);
 assert.equal(JSON.stringify(x).includes('Record a video.'),false);
});

test('two incomplete senses with same spelling and missing POS remain distinct tasks',()=>{
 const r=combined();
 r.review_queue=[
  {...r.review_queue[0],part_of_speech:null,strict_sense_candidate:false,
   historical_card_count:1,historical_card_ids:['cet4:a:old-n'],source_book_ids:['cet4:a']},
  {...r.review_queue[0],part_of_speech:null,strict_sense_candidate:false,
   historical_card_count:1,historical_card_ids:['cet4:a:old-v'],source_book_ids:['cet4:a']}
 ];
 const result=planCrossbookEditorialActions(r);
 const reviews=result.batches.cet4.filter(x=>x.lane==='EXISTING_SENSE_REVIEW');
 assert.equal(reviews.length,2);
 assert.notEqual(reviews[0].task_id,reviews[1].task_id);
 assert.ok(reviews.every(x=>x.reasons.includes('SENSE_IDENTITY_INCOMPLETE')));
 assert.equal(result.summary.customer_study_rows_written,0);
});
test('unmarked occurrence counts are partitioned across CET4 CET6 and postgrad',()=>{
 const r=combined();
 r.unmarked_discovery_queue=[{...r.unmarked_discovery_queue[0],
   occurrences:9,source_book_ids:['cet4:a','cet6:c','postgrad:d'],
   exam_categories:['cet4','cet6','postgrad'],
   occurrences_by_book:{'cet4:a':2,'cet6:c':3,'postgrad:d':4}
 }];
 const result=planCrossbookEditorialActions(r);
 assert.equal(result.batches.cet4.find(x=>x.lane==='UNMARKED_CONTEXT_REVIEW').issue_count,2);
 assert.equal(result.batches.cet6.find(x=>x.lane==='UNMARKED_CONTEXT_REVIEW').issue_count,3);
 assert.equal(result.batches.postgrad.find(x=>x.lane==='UNMARKED_CONTEXT_REVIEW').issue_count,4);
});
test('per-book occurrence totals cannot be forged or silently double-counted',()=>{
 const r=combined();
 r.unmarked_discovery_queue[0].occurrences_by_book={'cet4:a':2};
 assert.throws(()=>planCrossbookEditorialActions(r),/REVIEW_PLAN_UNMARKED_ALREADY_BOUND_OR_INVALID/);
});
