import test from 'node:test';
import assert from 'node:assert/strict';
import {planExamFirstPrivateEditorialQueue} from '../src/global-dictionary-exam-first-review.js';
const hash=(n)=>n.toString(16).padStart(64,'0');
const entry=(n)=>'gdict_'+n.toString(16).padStart(24,'0');
const target=(i,word,tier='四级新增',matched=true)=>({
  priority_order:i,headword:word,target_tier:tier,
  status:matched?'exact_unreviewed_candidate':'missing_abbreviation_or_token',
  entry_id:matched?entry(i):null,upstream_exam_tags:matched?['cet4'] :[],
  teaching_sense_approved:false,publication_ready:false
});
const row=(i,word,ids,rank,lane='低冲突·快速初审',phase=true)=>({
  candidate_hash_sha256:hash(i),headword:word,entry_id:entry(i),
  target_tier_from_owner_list:'四级新增',first_phase_target:phase,
  old_word_ids:ids,old_word_id_count:ids.length,books_count:ids.length,
  review_priority_rank:rank,review_priority_lane:lane,
  approved_sense_id:null,publisher_approved:false
});
const draft=(item)=>({
  candidate_hash_sha256:item.candidate_hash_sha256,
  entry_id:item.entry_id,headword:item.headword,
  status:'DRAFT_EDITORIAL_SUGGESTION_ONLY',
  original_example_en_draft:'She read the message carefully.',
  original_example_zh_draft:'她认真阅读了那条消息。',
  reviewer_approved:false,publisher_approved:false,approved_sense_id:null
});
test('realistic owner multi-level target plan preserves old cards and prioritizes only unreviewed senses',()=>{
 const t=[target(1,'cat'),target(2,'record'),target(3,'mr.','基础',false)];
 const a=row(1,'cat',['book-a-cat','book-b-cat'],2),
       b=row(2,'record',['book-a-record'],3),
       c={...row(4,'record',['book-b-record'],1,'跨书高复用·优先人工确认'),
         entry_id:entry(2)};
 const result=planExamFirstPrivateEditorialQueue({
   targets:t,historicalSenses:[a,b,c],draftSuggestions:[draft(a)],batchSize:2
 });
 assert.equal(result.summary.target_headwords,3);
 assert.equal(result.summary.index_candidate_matches,2);
 assert.equal(result.summary.abbreviation_gaps,1);
 assert.equal(result.summary.historical_candidate_senses,3);
 assert.equal(result.summary.historical_old_ids_preserved,4);
 assert.equal(result.summary.headwords_with_historical_senses,2);
 assert.equal(result.summary.headwords_without_historical_senses,1);
 assert.equal(result.summary.multi_sense_headwords,1);
 assert.equal(result.summary.editorial_drafts_unreviewed,1);
 assert.equal(result.summary.publisher_approved_senses,0);
 assert.deepEqual(result.review_queue.map(x=>x.candidate_hash_sha256),
  [c,b,a].map(x=>x.candidate_hash_sha256));
 assert.equal(result.missing_content_queue[0].reason,'ABBREVIATION_PENDING_MANUAL_REVIEW');
 assert.deepEqual(result.batches.map(x=>x.size),[2,1]);
 assert.equal(result.remote_d1_writes,0);
});
test('reject duplicated target, incorrect approved flags, fake alias and old ID collisions',()=>{
 const t=[target(1,'cat'),target(2,'record')];
 const a=row(1,'cat',['old-cat'],1);
 assert.throws(()=>planExamFirstPrivateEditorialQueue({targets:[t[0],t[0]]}),/INVALID_EXAM_FIRST_TARGET/);
 assert.throws(()=>planExamFirstPrivateEditorialQueue({targets:[{...t[0],publication_ready:true}]}),/INVALID_EXAM_FIRST_TARGET/);
 assert.throws(()=>planExamFirstPrivateEditorialQueue({targets:[target(1,'mr.','基础',true)]}),/TARGET_SOURCE_INDEX_UNVERIFIED|INVALID_EXAM_FIRST_TARGET/);
 assert.throws(()=>planExamFirstPrivateEditorialQueue({targets:t,historicalSenses:[a,{...row(2,'record',['old-cat'],2)}]}),/DUPLICATE_LEGACY_WORD_ID/);
 assert.throws(()=>planExamFirstPrivateEditorialQueue({targets:t,historicalSenses:[{...a,approved_sense_id:'gds_fake'}]}),/INVALID_UNREVIEWED_HISTORICAL_SENSE/);
});
test('reject attempts to falsely attach drafts or mark them reviewed',()=>{
 const t=[target(1,'cat')],a=row(1,'cat',['old'],1);
 assert.throws(()=>planExamFirstPrivateEditorialQueue({
  targets:t,historicalSenses:[a],draftSuggestions:[{...draft(a),publisher_approved:true}]
 }),/DRAFT_NOT_SAFE_OR_MISMATCHED/);
 assert.throws(()=>planExamFirstPrivateEditorialQueue({
  targets:t,historicalSenses:[a],draftSuggestions:[{...draft(a),headword:'record'}]
 }),/DRAFT_CANDIDATE_IDENTITY_MISMATCH/);
 assert.throws(()=>planExamFirstPrivateEditorialQueue({
  targets:t,historicalSenses:[a],draftSuggestions:[draft(a),draft(a)]
 }),/DRAFT_NOT_SAFE_OR_MISMATCHED/);
});
test('forbidden cross-scope promotion is blocked while separate deferred historical senses are tracked',()=>{
 const t=[target(1,'cat')],a=row(1,'cat',['old'],1),d={...row(3,'watch',['outside'],2),first_phase_target:false};
 assert.equal(planExamFirstPrivateEditorialQueue({targets:t,historicalSenses:[a,d]}).summary.deferred_candidate_senses,1);
 assert.throws(()=>planExamFirstPrivateEditorialQueue({
  targets:t,historicalSenses:[a,{...d,first_phase_target:true}]
 }),/HISTORICAL_SCOPE_MISMATCH/);
});
