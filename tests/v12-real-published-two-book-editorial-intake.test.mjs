import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {buildRealPublishedTwoBookEditorialIntake as build}
 from '../scripts/v12-real-published-two-book-editorial-intake.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function syntheticProof(){
 const c={headword:'choice',pos:'n.',meaning_zh:'选择',
  fingerprint_sha256:'f'.repeat(64),source_book_count:2,occurrences:9,
  paired_cards:[]};
 const rows=[];
 for(const [rank,book,word] of [[0,'real-a','old-a'],[1,'real-b','old-b']]){
  const paragraph=JSON.stringify({segments:[
   {text:'The reader makes a '},{wordId:word,surface:'choice',gloss:'选择'}]});
  const row={rank,book_id:book,category_id:'cet4',book_title:'真实作品'+rank,
   chapter_id:'chapter-'+rank,chapter_no:rank+1,
   chapter_title:'第'+(rank+1)+'章',legacy_word_id:word,anchor:'p0:s1',
   old_headword:'choice',old_uk:'/tʃɔɪs/',old_us:'/tʃɔɪs/',
   old_pos:'n.',old_meaning:'选择',
   old_en:'She made a careful choice.',
   old_zh:'她做出了谨慎的选择。',old_collocations:'[]',
   paragraph_json:paragraph,segment_word_id:word,segment_gloss:'选择'};
  row.old_card_sha256=sha(JSON.stringify([
   word,row.old_headword,row.old_uk,row.old_us,row.old_pos,
   row.old_meaning,row.old_en,row.old_zh,row.old_collocations]));
  c.paired_cards.push({book_id:book,old_word_id:word,
   phonetic_uk:row.old_uk,phonetic_us:row.old_us,
   example_en:row.old_en,example_zh:row.old_zh});
  rows.push(row);
 }
 return {schema:'wordletter-real-production-2book-context-evidence-v1',
  status:'REAL_PUBLISHED_CONTEXT_EVIDENCE_ONLY_NOT_APPROVED',
  editorial_candidate:c,verified_actual_published_contexts:rows,
  source_artifact_id:13911979176,approved_sense_id:null,
  commercial_license_verified:false,authenticated_ops_signoff:false,
  bound_staging_legacy_word_ids:0,production_writes:0,
  customer_study_writes:0,staging_writes:0};
}
test('actual published two-book verified context becomes PRIVATE HOLD packet with exact SHA',()=>{
 const proof=syntheticProof(),p=build(proof);
 assert.equal(p.schema,'wordletter-real-published-two-book-editorial-intake-v1');
 assert.equal(p.source_proof_sha256,sha(JSON.stringify(proof)));
 assert.equal(p.status,'REAL_TWO_BOOKS_CONTEXT_VERIFIED_EDITORIAL_AND_RIGHTS_HOLD');
 assert.equal(p.source_encrypted_artifact_id,13963540716);
 assert.equal(p.candidate.real_cards.length,2);
 assert.notEqual(p.candidate.real_cards[0].book_id,p.candidate.real_cards[1].book_id);
 assert.notEqual(p.candidate.real_cards[0].legacy_word_id,
  p.candidate.real_cards[1].legacy_word_id);
 for(const card of p.candidate.real_cards){
  assert.equal(card.context_gloss,'选择');
  assert.match(card.context_paragraph_sha256,/^[0-9a-f]{64}$/u);
  assert.match(card.old_card_sha256,/^[0-9a-f]{64}$/u);
 }
 assert.equal(p.review_decision.action,'HOLD');
 assert.equal(p.review_decision.authenticated_ops_signoff,false);
 assert.equal(p.review_decision.dictionary_entry_id,null);
 assert.equal(p.review_decision.approved_sense_id,null);
 assert.ok(Object.values(p.review_decision.rights).every(x=>x.verified===false));
 assert.ok(Object.values(p.review_decision.checks).every(x=>x.approved===false));
 assert.equal(p.actual_legacy_links,0);
 assert.equal(p.production_d1_writes,0);
 assert.equal(p.staging_d1_writes,0);
});
test('proof cannot claim commercial approvals, remote writes, or swapped archived source',()=>{
 const p=syntheticProof();
 p.authenticated_ops_signoff=true;
 assert.throws(()=>build(p),/PRETENDS_APPROVED/);
 const t=syntheticProof();
 t.production_writes=1;
 assert.throws(()=>build(t),/PRETENDS_APPROVED/);
 const wrong=syntheticProof();
 wrong.source_artifact_id=123;
 assert.throws(()=>build(wrong),/SOURCE_SNAPSHOT_ID_CHANGED/);
});
test('proves same OLD card and exact origin chapter anchor rather than fabricated QA',()=>{
 const changes=[
  x=>{x.verified_actual_published_contexts[0].old_card_sha256='0'.repeat(64)},
  x=>{x.verified_actual_published_contexts[0].paragraph_json='{"segments":[]}'},
  x=>{x.verified_actual_published_contexts[0].segment_gloss='不能相同'},
  x=>{x.verified_actual_published_contexts[0].segment_word_id='wrong'},
  x=>{x.verified_actual_published_contexts[0].book_id='qa-fake'},
  x=>{x.verified_actual_published_contexts[1].book_id='real-a'},
  x=>{x.verified_actual_published_contexts[1].legacy_word_id='old-a'},
  x=>{x.verified_actual_published_contexts[0].old_zh='another'},
  x=>{x.verified_actual_published_contexts[0].anchor='p0:s2'},
  x=>{x.verified_actual_published_contexts[0].old_collocations='invalid JSON'},
 ];
 for(const alter of changes){
  const p=syntheticProof();alter(p);
  assert.throws(()=>build(p),'MUTATION_MUST_FAIL_CLOSED');
 }
});
test('review conversion workflow only decrypts private existing REAL artifact, no D1 token',()=>{
 const w=readFileSync(
  '.github/workflows/v12-real-published-two-book-editorial-intake.yml','utf8');
 assert.ok(w.includes('13963540716'));
 assert.ok(w.includes('production-d1-readonly-approval'));
 assert.ok(w.includes('PRODUCTION_D1_METADATA_PASSPHRASE'));
 assert.ok(w.includes('actions/upload-artifact@v4'));
 assert.ok(w.includes('REAL_PUBLISHED_EDITORIAL_INTAKE_SAFE_COUNTS='));
 assert.match(w,/gpg --batch/);
 assert.doesNotMatch(w,/CLOUDFLARE_PROD_D1_READ_TOKEN|CLOUDFLARE_PROD_D1_WRITE_TOKEN|CLOUDFLARE_STAGING_D1_WRITE_TOKEN|wrangler d1|wrangler deploy|d1 migrations apply/i);
});
