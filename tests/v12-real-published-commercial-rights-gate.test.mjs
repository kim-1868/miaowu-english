import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {buildRealPublishedTwoBookEditorialIntake} from
 '../scripts/v12-real-published-two-book-editorial-intake.mjs';
import {createRealPublisherClearanceTemplate,evaluateRealPublisherClearance,
 canonicalPublisherReviewAttestation,canonicalPublisherReceipt,
 canonicalOwnerSourceRegistrationPlan,RIGHTS_KINDS,CHECK_KINDS} from
 '../scripts/v12-real-published-commercial-rights-gate.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const now='2026-11-13T04:00:00Z',digest='d'.repeat(64);
function proof(){
 const c={headword:'choice',pos:'n.',meaning_zh:'选择',
  fingerprint_sha256:'f'.repeat(64),source_book_count:2,occurrences:17,
  paired_cards:[]},r=[];
 for(let i=0;i<2;i++){
  const id='actual-book-'+i,word='previous-word-'+i;
  const paragraph=JSON.stringify({segments:[
   {text:'她做了一个'},{wordId:word,surface:'choice',gloss:'选择'},
   {text:'，人生改变了。'}]});
  const row={rank:i,book_id:id,category_id:'cet4',
   book_title:'作品'+i,chapter_id:'actual-chapter-'+i,
   chapter_no:i+1,chapter_title:'第一章',legacy_word_id:word,
   anchor:'p3:s1',old_headword:'choice',old_uk:'/tʃɔɪs/',
   old_us:'/tʃɔɪs/',old_pos:'n.',old_meaning:'选择',
   old_en:'She made a careful choice.',
   old_zh:'她做出了谨慎的选择。',old_collocations:'[]',
   paragraph_json:paragraph,segment_word_id:word,segment_gloss:'选择'};
  row.old_card_sha256=sha(JSON.stringify([
   word,'choice',row.old_uk,row.old_us,'n.','选择',
   row.old_en,row.old_zh,'[]']));
  c.paired_cards.push({book_id:id,old_word_id:word,
   phonetic_uk:row.old_uk,phonetic_us:row.old_us,
   example_en:row.old_en,example_zh:row.old_zh});
  r.push(row);
 }
 return {schema:'wordletter-real-production-2book-context-evidence-v1',
  status:'REAL_PUBLISHED_CONTEXT_EVIDENCE_ONLY_NOT_APPROVED',
  editorial_candidate:c,verified_actual_published_contexts:r,
  source_artifact_id:13911979176,approved_sense_id:null,
  commercial_license_verified:false,authenticated_ops_signoff:false,
  bound_staging_legacy_word_ids:0,production_writes:0,
  customer_study_writes:0,staging_writes:0};
}
const packet=()=>buildRealPublishedTwoBookEditorialIntake(proof());
function signed(){
 const p=packet(),a=createRealPublisherClearanceTemplate(p);
 a.reviewer_id='OPS_EDITOR_ACTUAL_PERSON';
 a.reviewed_at=now;
 for(const k of RIGHTS_KINDS)a.rights[k]={
  verified:true,legal_basis:'original',rights_holder:'PUBLISHER',
  license_reference:'publisher-private-contract-or-audit',
  evidence_sha256:digest,reviewed_by:a.reviewer_id,reviewed_at:now};
 for(const k of CHECK_KINDS)a.checks[k]={
  verified:true,evidence_sha256:digest,
  reviewer_note:'Independent reviewer checked evidence in this synthetic test'};
 a.dictionary={registration_mode:'existing_licensed',
  entry_id:'gdict_'+'a'.repeat(24),
  source_key:'owner-original',source_registry_sha256:digest,
  verified_existing_enabled_licensed_entry:true,new_source_proposal:null};
 a.publisher_rights_confirmation={
  commercial_teaching_rights:true,
  rights_authority:'published-content-rights-owner',
  supporting_contract_or_creation_record_sha256:digest};
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const receipt={schema:'wordletter-ops-publisher-clearance-receipt-v1',
  purpose:'commercial-lesson-and-published-context-publisher-signoff-v1',
  publisher_review_sha256:sha(canonicalPublisherReviewAttestation(a)),
  source_proof_sha256:p.source_proof_sha256,
  candidate_sha256:a.candidate_sha256,
  reviewer_id:a.reviewer_id,ops_audit_id:'SYNTHETIC_NOT_A_REAL_OPS_AUDIT',
  signed_at:now,
  target_database_id:'88a817cb-23bb-4ae4-bcb8-92286c4165d4'};
 receipt.signature_b64=sign(null,Buffer.from(canonicalPublisherReceipt(receipt)),
  privateKey).toString('base64');
 return {packet:p,attestation:a,receipt,privateKey,
  trustedOpsPublicKeyPem:publicKey.export({format:'pem',type:'spki'})};
}
test('first real publisher clearance always starts HOLD: 7 rights + 10 checkmarks absent',()=>{
 const p=packet(),t=createRealPublisherClearanceTemplate(p);
 assert.equal(t.schema,'wordletter-real-two-book-publisher-clearance-v1');
 assert.equal(t.is_approved,false);
 assert.equal(t.ops_signature_required,true);
 assert.equal(t.authorship_context.story.reported_origin,
  'USER_AI_GENERATED_FOR_MIAOWU');
 assert.equal(t.authorship_context.bilingual_examples.reported_origin,
  'CHATGPT_ASSISTED_DRAFTS_PREPARED_FOR_MIAOWU');
 assert.equal(t.authorship_context.bilingual_examples.per_old_card_creation_provenance_verified,false);
 assert.equal(t.authorship_context.bilingual_examples.third_party_overlap_checked,false);
 assert.equal(t.authorship_context.phonetics.uk_ipa_source,'NOT_CONFIRMED');
 assert.equal(RIGHTS_KINDS.length,7);
 assert.equal(CHECK_KINDS.length,10);
 assert.ok(RIGHTS_KINDS.every(k=>t.rights[k].verified===false));
 assert.ok(CHECK_KINDS.every(k=>t.checks[k].verified===false));
 const status=evaluateRealPublisherClearance({packet:p});
 assert.equal(status.status,'HOLD_REQUIRE_VERIFIED_EDITOR_AND_RIGHTS');
 assert.deepEqual(status.content_and_rights_blockers,
  ['NO_INDEPENDENT_COMMERCIAL_EDITORIAL_ATTESTATION']);
 assert.equal(status.staging_database_writes,0);
 assert.equal(status.commercial_senses_approved_in_database,0);
 assert.equal(status.ops_signature_valid,false);
});
test('untrusted checkbox edits or unverifiable license provenance NEVER pass',()=>{
 const x=signed();
 const missing={...x,receipt:null};
 assert.match(evaluateRealPublisherClearance(missing).content_and_rights_blockers.join(' '),
  /RECEIPT_MISSING/);
 x.attestation.rights.english_example.verified=false;
 const status=evaluateRealPublisherClearance(x);
 assert.equal(status.ops_signature_valid,false);
 assert.match(status.content_and_rights_blockers.join(' '),
  /MISSING_LICENSE_EVIDENCE_ENGLISH_EXAMPLE/);
 const y=signed();
 y.attestation.checks.story_context_semantics.verified=false;
 assert.match(evaluateRealPublisherClearance(y).content_and_rights_blockers.join(' '),
  /MISSING_EDITORIAL_EVIDENCE_STORY_CONTEXT_SEMANTICS/);
 const z=signed();
 z.attestation.dictionary.verified_existing_enabled_licensed_entry=false;
 assert.match(evaluateRealPublisherClearance(z).content_and_rights_blockers.join(' '),
  /EXISTING_LICENSED_TEST_SOURCE_NOT_VERIFIED/);
 const notOwner=signed();
 notOwner.attestation.publisher_rights_confirmation.commercial_teaching_rights=false;
 assert.match(evaluateRealPublisherClearance(notOwner).content_and_rights_blockers.join(' '),
  /PUBLISHER_COMMERCIAL_TEACHING_RIGHTS/);
});
test('signed synthetic OPS receipt only proves cryptographic gate, never database activation',()=>{
 const x=signed();
 const result=evaluateRealPublisherClearance(x);
 assert.equal(result.status,
  'AUTHENTICATED_PUBLISHER_ATTESTATION_PRESENT_STAGING_PREFLIGHT_ONLY');
 assert.equal(result.rights_evidence_count,7);
 assert.equal(result.editorial_evidence_count,10);
 assert.equal(result.ops_signature_valid,true);
 assert.equal(result.staging_database_writes,0);
 assert.equal(result.commercial_senses_approved_in_database,0);
 assert.ok(result.signed_review_attestation_not_database_activation);
 // The synthetic private key is only in this ephemeral test, not the repo.
 const forged=signed();
 assert.match(evaluateRealPublisherClearance({
  ...x,trustedOpsPublicKeyPem:forged.trustedOpsPublicKeyPem
 }).content_and_rights_blockers.join(' '),/UNTRUSTED/);
 const stale=signed();
 stale.receipt.target_database_id='649c71b3-340c-49bf-b806-3d39256851d3';
 assert.match(evaluateRealPublisherClearance(stale).content_and_rights_blockers.join(' '),
  /RECEIPT_MISSING_OR_CHANGED/);
 const tampered=signed();
 tampered.attestation.rights.english_example.license_reference='changed';
 assert.match(evaluateRealPublisherClearance(tampered).content_and_rights_blockers.join(' '),
  /RECEIPT_MISSING_OR_CHANGED/);
});
test('commercial approval claims and changed novel/old card are rejected before reviewing',()=>{
 const p=packet();
 p.review_decision.checks.same_word_sense.approved=true;
 assert.throws(()=>createRealPublisherClearanceTemplate(p),
  /PRETENDS_REVIEWED/);
 const p2=packet();
 p2.candidate.real_cards[0].example_en='new sentence';
 assert.throws(()=>createRealPublisherClearanceTemplate(p2),
  /OLD_CARD_CHANGED/);
 const p3=packet();
 p3.candidate.real_cards[1].paragraph_json='{"segments":[]}';
 assert.throws(()=>createRealPublisherClearanceTemplate(p3),
  /STORY_CONTEXT_CHANGED/);
 const p4=packet();
 p4.candidate.real_cards[0].book_id='qa-fake';
 assert.throws(()=>createRealPublisherClearanceTemplate(p4));
});
test('only private template is possible, no Cloudflare write/real automatic approval workflow',()=>{
 const workflow=readFileSync(
  '.github/workflows/v12-first-real-commercial-rights-review.yml','utf8');
 assert.match(workflow,/production-d1-readonly-approval/);
 assert.match(workflow,/13964630089/);
 assert.match(workflow,/PRODUCTION_D1_METADATA_PASSPHRASE/);
 assert.match(workflow,/actions\/upload-artifact@v4/);
 assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN|wrangler d1|wrangler deploy|d1 migrations apply/);
});

function signedNewSource(){
 const x=signed();
 const a=x.attestation;
 const proposal={
  license_name:'MIAOWU_OWNER_ORIGINAL_COMMERCIAL_TEACHING',
  origin_claim:'PUBLISHER_AI_ASSISTED_ORIGINAL_TEXT',
  creation_rights_evidence_sha256:sha('protected-original-ai-content-evidence'),
  legal_editorial_review_sha256:sha('protected-real-editorial-review'),
  reviewed_by:a.reviewer_id,
  requires_live_test_collision_check:true,
  allows_direct_production_activation:false
 };
 const dictionary={
  registration_mode:'new_owner_original_source',
  entry_id:'gdict_'+'b'.repeat(24),
  source_key:'miaowu-owner-original-curated-v1',
  verified_existing_enabled_licensed_entry:false,
  new_source_proposal:proposal
 };
 dictionary.source_registry_sha256=sha(canonicalOwnerSourceRegistrationPlan({
  entry_id:dictionary.entry_id,source_key:dictionary.source_key,
  headword:x.packet.candidate.headword,proposal
 }));
 a.dictionary=dictionary;
 x.receipt.publisher_review_sha256=sha(canonicalPublisherReviewAttestation(a));
 x.receipt.signature_b64=sign(null,Buffer.from(canonicalPublisherReceipt(x.receipt)),
  x.privateKey).toString('base64');
 return x;
}
test('new owner-original TEST source may be signed before it exists but NEVER claimed activated',()=>{
 const x=signedNewSource();
 const result=evaluateRealPublisherClearance(x);
 assert.equal(result.status,'AUTHENTICATED_PUBLISHER_ATTESTATION_PRESENT_STAGING_PREFLIGHT_ONLY');
 assert.equal(result.dictionary_registration_mode,'new_owner_original_source');
 assert.equal(result.new_test_source_registration_still_required,true);
 assert.equal(result.live_test_dictionary_source_or_entry_verified,false);
 assert.equal(result.commercial_senses_approved_in_database,0);
 assert.equal(result.staging_database_writes,0);
 assert.equal(result.ops_signature_valid,true);
});
test('new source must bind original creation proof, exact headword, source hash and independent reviewer',()=>{
 const mutations=[
  x=>{x.attestation.dictionary.new_source_proposal.creation_rights_evidence_sha256='bad'},
  x=>{x.attestation.dictionary.new_source_proposal.legal_editorial_review_sha256='bad'},
  x=>{x.attestation.dictionary.new_source_proposal.reviewed_by='forged-editor'},
  x=>{x.attestation.dictionary.new_source_proposal.allows_direct_production_activation=true},
  x=>{x.attestation.dictionary.new_source_proposal.requires_live_test_collision_check=false},
  x=>{x.attestation.dictionary.source_key='qa-mismatched-source'},
  x=>{x.attestation.dictionary.source_registry_sha256='a'.repeat(64)},
  x=>{x.attestation.dictionary.verified_existing_enabled_licensed_entry=true},
  x=>{x.attestation.dictionary.new_source_proposal.license_name='UNLICENSED'},
  x=>{x.attestation.dictionary.new_source_proposal.origin_claim='UNTRUSTED_EXTERNAL'}
 ];
 for(const mutate of mutations){
  const x=signedNewSource();mutate(x);
  const r=evaluateRealPublisherClearance(x);
  assert.equal(r.status,'HOLD_REQUIRE_VERIFIED_EDITOR_AND_RIGHTS');
  assert.equal(r.ops_signature_valid,false);
  assert.ok(r.content_and_rights_blockers.some(b=>/NEW_OWNER|APPROVED_DICTIONARY/.test(b)));
 }
});
test('publisher-reviewed new dictionary source requires real OPS signature and TEST database scope',()=>{
 const x=signedNewSource();
 x.receipt.target_database_id='649c71b3-340c-49bf-b806-3d39256851d3';
 const r=evaluateRealPublisherClearance(x);
 assert.equal(r.ops_signature_valid,false);
 assert.match(r.content_and_rights_blockers.join(' '),/AUTHENTICATED_OPS/);
 const unsigned=signedNewSource();
 unsigned.receipt.signature_b64='';
 assert.equal(evaluateRealPublisherClearance(unsigned).ops_signature_valid,false);
});
