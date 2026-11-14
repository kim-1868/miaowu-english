import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeAllPublishedDuplicateSenses as audit}
 from '../scripts/audit-all532-published-duplicate-lexical-evidence.mjs';

function fixture(){
 const duplicate_review_queue=Array.from({length:532},(_,i)=>{
  const n=i<460?4:2;
  const legacy_word_ids=Array.from({length:n},(_,j)=>'old-'+i+'-'+j);
  const card_evidence=legacy_word_ids.map((old_word_id,j)=>({
   old_word_id,book_id:j%2?'book-b':'book-a',
   phonetic_uk:i===0&&j===1?'/another/':'/base/',
   phonetic_us:'/base/',
   example_en:i===1&&j===1?'The word was discussed.':'The word appeared.',
   example_zh:'这个词出现在故事中。',occurrences:1
  }));
  return {headword:'lemma'+i,pos:'n.',meaning_zh:'含义'+i,
   legacy_word_ids,book_ids:['book-a','book-b'],occurrences:n,card_evidence,
   editor_decision:'HOLD',approved_sense_id:null,auto_merge_allowed:false,
   production_writes_allowed:false};
 });
 const other_candidate_groups=Array.from({length:1449},(_,i)=>({
  headword:'other'+i,pos:'n.',meaning_zh:'其他含义'+i
 }));
 return {status:'PRIVATE_PUBLISHED_EDITORIAL_CANDIDATES_UNAPPROVED',
  all_records_private:true,created_approvals:0,production_writes:0,
  counts:{published_books:32,published_anchor_occurrences:8444,
   distinct_old_word_ids:3433,distinct_headwords:1585,
   textual_sense_candidates:1981,duplicate_textual_sense_groups:532,
   duplicate_excess_old_ids:1452},
  duplicate_review_queue,other_candidate_groups};
}
test('all 532 groups are evaluated and all remain strictly unapproved',()=>{
 const x=audit(fixture());
 assert.equal(x.counts.duplicate_textual_groups_checked,532);
 assert.equal(x.counts.extra_old_card_ids_in_duplicate_groups,1452);
 assert.equal(x.counts.groups_structurally_complete,532);
 assert.equal(x.counts.groups_structurally_blocked,0);
 assert.equal(x.counts.groups_with_any_ipa_version_difference,1);
 assert.equal(x.counts.groups_with_any_bilingual_example_difference,1);
 assert.equal(x.counts.context_semantic_approvals,0);
 assert.equal(x.counts.commercial_license_approvals,0);
 assert.equal(x.counts.customer_state_migrations,0);
 assert.equal(x.counts.production_writes,0);
 assert.equal(x.per_group_private_review.length,532);
 assert.ok(x.per_group_private_review.every(r=>r.reviewer_action==='HOLD' &&
  r.approved_sense_id===null && r.production_binding_allowed===false &&
  r.user_study_state_change_allowed===false));
});
test('other POS/gloss candidates require evidence and cannot auto merge',()=>{
 const data=fixture();
 data.other_candidate_groups[0].headword='lemma0';
 data.other_candidate_groups[0].pos='v.';
 const x=audit(data);
 assert.equal(x.counts.groups_with_other_textual_senses,1);
});
test('incomplete English/Chinese examples are blocked, not invented',()=>{
 const d=fixture();
 d.duplicate_review_queue[2].card_evidence[0].example_zh='';
 d.duplicate_review_queue[3].card_evidence[1].phonetic_us='';
 const x=audit(d);
 assert.equal(x.counts.groups_structurally_blocked,2);
 assert.equal(x.counts.groups_missing_ipa,1);
 assert.equal(x.counts.groups_missing_examples,1);
});
test('fail closed on forged approvals, stale counts, overlapping IDs and broken occurrence evidence',()=>{
 const variants=[
  d=>{d.duplicate_review_queue[0].editor_decision='APPROVED'},
  d=>{d.duplicate_review_queue[0].approved_sense_id='gds_abcdef'},
  d=>{d.counts.duplicate_excess_old_ids=1451},
  d=>{d.duplicate_review_queue[1].legacy_word_ids[0]='old-0-0'},
  d=>{d.duplicate_review_queue[3].card_evidence[1].occurrences=200},
  d=>{d.duplicate_review_queue.pop()},
  d=>{d.production_writes=1}
 ];
 for(const modify of variants){const q=fixture();modify(q);assert.throws(()=>audit(q))}
});
test('the protected workflow uses encrypted existing artifact and never Cloudflare',()=>{
 const w=readFileSync('.github/workflows/v12-all532-autonomous-evidence-review.yml','utf8');
 for(const item of ['production-d1-readonly-approval','13911979176',
  'PRODUCTION_D1_METADATA_PASSPHRASE','gpg --batch',
  'audit-all532-published-duplicate-lexical-evidence.mjs',
  'actions/upload-artifact@v4','retention-days: 7'])
  assert.ok(w.includes(item),'missing '+item);
 assert.doesNotMatch(w,/wrangler d1|CLOUDFLARE_API_TOKEN|d1 execute|wrangler deploy/);
});
