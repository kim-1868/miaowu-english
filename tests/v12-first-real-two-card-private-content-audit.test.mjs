import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {buildRealPublishedTwoBookEditorialIntake as intake}
 from '../scripts/v12-real-published-two-book-editorial-intake.mjs';
import {createRealPublisherClearanceTemplate as worksheet}
 from '../scripts/v12-real-published-commercial-rights-gate.mjs';
import {auditRealTwoCards as audit,formatPrivateReviewerMarkdown as md}
 from '../scripts/v12-first-real-two-card-private-content-audit.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function make(){
 const g={headword:'record',pos:'n.',meaning_zh:'记录',
  fingerprint_sha256:'f'.repeat(64),source_book_count:2,occurrences:23,
  paired_cards:[]},rows=[];
 for(let i=0;i<2;i++){
  const book='real-printed-book-'+i,old='published-old-card-'+i;
  const paragraph=JSON.stringify({segments:[{text:'她保存了这份'},
   {wordId:old,surface:'record',gloss:'记录'},{text:'。'}]});
  const r={rank:i,book_id:book,category_id:'cet4',
   book_title:'私人作品'+i,chapter_id:'actual-chapter-'+i,
   chapter_no:1,chapter_title:'真实第一章',legacy_word_id:old,anchor:'p0:s1',
   old_headword:'record',old_uk:'/ˈrekɔːd/',old_us:'/ˈrekərd/',
   old_pos:'n.',old_meaning:'记录',
   old_en:'She kept a detailed record of every important decision.',
   old_zh:'她把每个重要决定都详细记录下来。',old_collocations:'[]',
   paragraph_json:paragraph,segment_word_id:old,segment_gloss:'记录'};
  r.old_card_sha256=sha(JSON.stringify([
   old,r.old_headword,r.old_uk,r.old_us,r.old_pos,r.old_meaning,
   r.old_en,r.old_zh,r.old_collocations]));
  g.paired_cards.push({book_id:book,old_word_id:old,
   phonetic_uk:r.old_uk,phonetic_us:r.old_us,
   example_en:r.old_en,example_zh:r.old_zh});
  rows.push(r);
 }
 const proof={schema:'wordletter-real-production-2book-context-evidence-v1',
  status:'REAL_PUBLISHED_CONTEXT_EVIDENCE_ONLY_NOT_APPROVED',
  source_artifact_id:13911979176,
  editorial_candidate:g,verified_actual_published_contexts:rows,
  approved_sense_id:null,commercial_license_verified:false,
  authenticated_ops_signoff:false,bound_staging_legacy_word_ids:0,
  production_writes:0,customer_study_writes:0,staging_writes:0};
 const packet=intake(proof),w=worksheet(packet);
 const register=rows.map(r=>({
  legacy_word_id:r.legacy_word_id,headword:r.old_headword,
  part_of_speech:r.old_pos,meaning_zh:r.old_meaning,
  phonetic_uk:r.old_uk,phonetic_us:r.old_us,
  example_en:r.old_en,example_zh:r.old_zh,
  origin:'historical_novel_package_snapshot',
  source_repo_paths:['content/release-packages/private-novel.json']
 }));
 return {w,register};
}
test('real two-book chapter anchors remain crypto checked, separate old IDs, history matches',()=>{
 const {w,register}=make(),r=audit({worksheet:w,registerRows:register});
 assert.equal(r.status,'PRIVATE_AUTOMATED_CONTENT_PRECHECK_HUMAN_SIGNOFF_REQUIRED');
 assert.equal(r.counts.real_books,2);
 assert.equal(r.counts.exact_old_id_register_matches,2);
 assert.equal(r.counts.historic_source_drift,0);
 assert.equal(r.counts.with_heuristic_flags,0);
 assert.equal(r.commercial_approval,false);
 assert.equal(r.counts.authentic_ops_receipts,0);
 assert.equal(r.actual_test_database_imports,0);
 assert.ok(r.private_review_cards.every(c=>c.decision==='HOLD'));
 assert.ok(Object.values(r.checklist).every(v=>v==='HOLD'));
 const s=md(r);
 assert.match(s,/record/);
 assert.match(s,/私人作品0/);
 assert.ok(s.includes('- [ ] independent_rights_and_creation_evidence'));
 assert.match(s,/不是 OPS 签名/);
});
test('missing exact historical old ID is a traceability HOLD, never guessed approval',()=>{
 const {w,register}=make();
 const r=audit({worksheet:w,registerRows:[register[0]]});
 assert.equal(r.counts.exact_old_id_register_matches,1);
 assert.equal(r.counts.old_ids_not_in_register,1);
 assert.equal(r.counts.authentic_ops_receipts,0);
 assert.equal(r.commercial_approval,false);
});
test('historical old ID with changed example is flagged, not silently used',()=>{
 const {w,register}=make();
 register[0].example_en='A different original story.';
 const r=audit({worksheet:w,registerRows:register});
 assert.equal(r.counts.historic_source_drift,1);
 assert.ok(r.private_review_cards[0].heuristic_flags.includes(
  'HISTORICAL_CARD_SOURCE_DRIFT_REQUIRES_REVIEW'));
});
test('English and Chinese model-generated example errors are flagged without auto-judgment',()=>{
 const {w,register}=make();
 // Must preserve actual old-card hash: create a malformed but internally
 // consistent evidence source to test QA, not pretend the old card changed.
 for(const c of w.review_material_private.cards){
  c.example_en='TODO.';
  c.example_zh='待补充';
  c.phonetic_us='';
  c.old_card_sha256=sha(JSON.stringify([
   c.legacy_word_id,'record',c.phonetic_uk,c.phonetic_us,
   'n.','记录',c.example_en,c.example_zh,c.collocations_json]));
 }
 const r=audit({worksheet:w,registerRows:register});
 assert.equal(r.counts.with_heuristic_flags,2);
 assert.ok(r.private_review_cards[0].heuristic_flags.includes('ENGLISH_PLACEHOLDER'));
 assert.ok(r.private_review_cards[0].heuristic_flags.includes('US_IPA_MISSING_OR_MALFORMED'));
 assert.equal(r.commercial_approval,false);
});
test('tampered published card, context or fake rights approval always stops',()=>{
 for(const change of [
  w=>{w.review_material_private.cards[0].old_card_sha256='0'.repeat(64)},
  w=>{w.review_material_private.cards[0].original_paragraph_json='{}'},
  w=>{w.review_material_private.cards[0].anchor='p0:s8'},
  w=>{w.review_material_private.cards[0].book_id='qa-fake'},
  w=>{w.review_material_private.cards[1].book_id=w.review_material_private.cards[0].book_id},
  w=>{w.rights.original_story_context.verified=true},
  w=>{w.checks.english_example.verified=true},
  w=>{w.is_approved=true}
 ]){
  const {w,register}=make();change(w);
  assert.throws(()=>audit({worksheet:w,registerRows:register}));
 }
});
test('protected real audit workflow only decrypts existing encrypted material, no remote DB',()=>{
 const wf=readFileSync(
  '.github/workflows/v12-first-real-two-card-private-content-audit.yml','utf8');
 assert.match(wf,/production-d1-readonly-approval/);
 assert.match(wf,/13967615571/);
 assert.match(wf,/PRODUCTION_D1_METADATA_PASSPHRASE/);
 assert.match(wf,/actions\/upload-artifact@v4/);
 assert.match(wf,/FIRST_REAL_TWO_CARD_CONTENT_QA_SAFE_COUNTS/);
 assert.doesNotMatch(wf,/CLOUDFLARE_API_TOKEN|CLOUDFLARE_PROD_D1_WRITE_TOKEN|wrangler d1|wrangler deploy/i);
});
