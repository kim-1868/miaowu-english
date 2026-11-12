import test from 'node:test';
import assert from 'node:assert/strict';
import {triagePrivatePublishedGlossQueue as triage} from '../scripts/triage-private-published-772-gloss-evidence.mjs';
const H='a'.repeat(64);
function row(i,gloss='唱片',old='记录',id='w'+i,word='record'){
 return {review_fingerprint_sha256:H,book_id:'published-book',
  chapter_id:'chapter-1',context_anchor:'p'+i+':s0',legacy_word_id:id,
  headword:word,pos:'n.',old_card_meaning_zh:old,
  published_context_gloss_zh:gloss,published_surface:word,
  phonetic_uk:'/rek/',phonetic_us:'/rek/',
  example_en:'Please keep a record.',example_zh:'请保留记录。',
  editor_action:'HOLD',context_sense_approved:false,
  verified_commercial_rights:false,approved_sense_id:null,
  eligible_for_binding:false,eligible_for_srs_write:false};
}
const pack=rows=>({status:'PRIVATE_PUBLISHED_772_CONTEXT_GLOSS_REVIEW_HOLD',
 published_only:true,expected_real_aggregate_anchored:772,
 editorial_approvals:0,sense_links_created:0,production_db_writes:0,
 private_row_count:rows.length,review_rows:rows});
test('all 772 stay HOLD with no sense linkage or study write',()=>{
 const rows=Array.from({length:772},(_,i)=>row(i));
 const out=triage(pack(rows));
 assert.equal(out.rows_reviewed,772);
 assert.equal(out.authenticated_semantic_approvals,0);
 assert.equal(out.commercial_license_approvals,0);
 assert.equal(out.approved_sense_links,0);
 assert.equal(out.d1_writes,0);
 assert.equal(out.private_editor_queue.every(x=>x.editor_action==='HOLD'&&
  x.eligible_for_binding===false),true);
});
test('repeated legacy IDs with differing in-book gloss are top risk, not approved',()=>{
 const rows=[row(0,'唱片','记录','shared'),
  row(1,'纪录','记录','shared'),row(2,'登记','记录','other')];
 const out=triage(pack(rows),{expectedCount:3});
 assert.equal(out.rows_same_old_id_with_multiple_context_glosses,2);
 assert.equal(out.private_editor_queue[0].priority,0);
 assert.equal(out.private_editor_queue[0].sense_approved,false);
});
test('class hints are only editorial tasks, never semantic decisions',()=>{
 const rows=[row(0,'（名词）记录','记录','w0'),
  row(1,'记录簿','记录','w1'),
  row(2,'唱片','记录','w2'),
  row(3,'file','记录','w3')];
 const out=triage(pack(rows),{expectedCount:4});
 assert.equal(out.hint_counts.PARENTHETICAL_OR_SEPARATOR_VARIANT_REVIEW,1);
 assert.equal(out.hint_counts.GLOSS_CONTAINS_OTHER_REVIEW,1);
 assert.equal(out.hint_counts.CHINESE_SENSE_DIFFERENCE_REVIEW,1);
 assert.equal(out.hint_counts.TRANSLATION_OR_FORMAT_DIFFERENCE_REVIEW,1);
 assert.equal(out.authenticated_semantic_approvals,0);
});
test('rejects 771, inconsistent audit state, auto approvals, repeated anchors',()=>{
 const rows=[row(0),row(1)];
 assert.throws(()=>triage(pack(rows)),/REAL_772_COUNT_DRIFT/);
 assert.throws(()=>triage({...pack(rows),production_db_writes:1},{expectedCount:2}));
 assert.throws(()=>triage(pack([{...rows[0],editor_action:'APPROVE'},rows[1]]),
  {expectedCount:2}),/UNVERIFIED_SOURCE/);
 assert.throws(()=>triage(pack([rows[0],{...rows[0]}]),{expectedCount:2}),
  /DUPLICATE_ANCHOR/);
});
