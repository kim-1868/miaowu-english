import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPublicKey,generateKeyPairSync} from 'node:crypto';
import {buildRealPublishedTwoBookEditorialIntake} from
 '../scripts/v12-real-published-two-book-editorial-intake.mjs';
import {
 createRealPublisherClearanceTemplate,
 canonicalOwnerSourceRegistrationPlan,
 RIGHTS_KINDS,CHECK_KINDS
} from '../scripts/v12-real-published-commercial-rights-gate.mjs';
import {
 issueFirstRealPublisherOpsReceipt as issue,
 verifyFirstRealPublisherOpsReceipt as verify
} from '../scripts/v12-first-real-ops-receipt-issuer.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const UTC='2026-11-13T00:00:00Z';
function proof(){
 const g={headword:'choice',pos:'n.',meaning_zh:'选择',
  fingerprint_sha256:'a'.repeat(64),source_book_count:2,
  occurrences:5,paired_cards:[]};
 const rows=[];
 for(let i=0;i<2;i++){
  const old='actual-old-'+i,book='published-book-'+i;
  const paragraph_json=JSON.stringify({segments:[
   {text:'她做了一个'}, {wordId:old,surface:'choice',gloss:'选择'},
   {text:'。'}]});
  const row={rank:i,book_id:book,category_id:'cet4',book_title:'小说'+i,
   chapter_id:'chapter-'+i,chapter_no:i+1,chapter_title:'第'+(i+1)+'章',
   legacy_word_id:old,anchor:'p0:s1',old_headword:'choice',
   old_uk:'/tʃɔɪs/',old_us:'/tʃɔɪs/',old_pos:'n.',
   old_meaning:'选择',old_en:'She made a careful choice today.',
   old_zh:'她今天认真做了选择。',old_collocations:'[]',
   paragraph_json,segment_word_id:old,segment_gloss:'选择'};
  row.old_card_sha256=sha(JSON.stringify([old,row.old_headword,
   row.old_uk,row.old_us,row.old_pos,row.old_meaning,
   row.old_en,row.old_zh,row.old_collocations]));
  g.paired_cards.push({book_id:book,old_word_id:old,
   phonetic_uk:row.old_uk,phonetic_us:row.old_us,
   example_en:row.old_en,example_zh:row.old_zh});
  rows.push(row);
 }
 return buildRealPublishedTwoBookEditorialIntake({
  schema:'wordletter-real-production-2book-context-evidence-v1',
  status:'REAL_PUBLISHED_CONTEXT_EVIDENCE_ONLY_NOT_APPROVED',
  source_artifact_id:13911979176,editorial_candidate:g,
  verified_actual_published_contexts:rows,
  approved_sense_id:null,commercial_license_verified:false,
  authenticated_ops_signoff:false,bound_staging_legacy_word_ids:0,
  production_writes:0,customer_study_writes:0,staging_writes:0});
}
function caseData(){
 const packet=proof(),attestation=createRealPublisherClearanceTemplate(packet);
 const reviewer='publisher_editor_main',evidence='f'.repeat(64);
 attestation.reviewer_id=reviewer;
 attestation.reviewed_at=UTC;
 for(const k of RIGHTS_KINDS)attestation.rights[k]={
  verified:true,legal_basis:'original',rights_holder:'Miaowu rights owner',
  license_reference:'private original creation evidence',
  evidence_sha256:evidence,reviewed_by:reviewer,reviewed_at:UTC};
 for(const k of CHECK_KINDS)attestation.checks[k]={
  verified:true,evidence_sha256:evidence,
  reviewer_note:'Synthetic unit test only, real editor must independently review'};
 const proposal={
  license_name:'MIAOWU_OWNER_ORIGINAL_COMMERCIAL_TEACHING',
  origin_claim:'PUBLISHER_AI_ASSISTED_ORIGINAL_TEXT',
  creation_rights_evidence_sha256:evidence,
  legal_editorial_review_sha256:evidence,
  reviewed_by:reviewer,
  requires_live_test_collision_check:true,
  allows_direct_production_activation:false};
 attestation.dictionary={
  registration_mode:'new_owner_original_source',
  entry_id:'gdict_'+'b'.repeat(24),
  source_key:'miaowu-owner-original-curated-v1',
  verified_existing_enabled_licensed_entry:false,
  new_source_proposal:proposal};
 attestation.dictionary.source_registry_sha256=sha(canonicalOwnerSourceRegistrationPlan({
  entry_id:attestation.dictionary.entry_id,
  source_key:attestation.dictionary.source_key,
  headword:packet.candidate.headword,proposal}));
 attestation.publisher_rights_confirmation={
  commercial_teaching_rights:true,rights_authority:'MIAOWU_RIGHTS_OWNER',
  supporting_contract_or_creation_record_sha256:evidence};
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const privateKeyPem=privateKey.export({type:'pkcs8',format:'pem'});
 const trustedOpsPublicKeyPem=publicKey.export({type:'spki',format:'pem'});
 const registeredOpsPublicKeySha256=sha(createPublicKey(trustedOpsPublicKeyPem)
  .export({format:'der',type:'spki'}));
 return {packet,attestation,privateKeyPem,trustedOpsPublicKeyPem,
  registeredOpsPublicKeySha256,
  opsAuditId:'ops_real_editorial_owner_20261113',
  signedAt:UTC,authenticatedReviewerId:reviewer,
  trustAnchorRegisteredInOps:true};
}
test('trusted OPS key issues one source-locked real-style two-book receipt, no D1 writes',()=>{
 const data=caseData(),r=issue(data);
 assert.equal(r.receipt.schema,'wordletter-ops-publisher-clearance-receipt-v1');
 assert.equal(r.receipt.target_database_id,'88a817cb-23bb-4ae4-bcb8-92286c4165d4');
 assert.equal(r.receipt.source_proof_sha256,data.packet.source_proof_sha256);
 assert.equal(r.receipt.reviewer_id,data.attestation.reviewer_id);
 assert.ok(r.receipt.signature_b64.length>=86);
 assert.equal(r.verification.ops_ed25519_signature_verified,true);
 assert.equal(r.verification.registered_ops_trust_anchor_fingerprint_matched,true);
 assert.equal(r.verification.independent_ops_role_and_audit_service_check_still_required,true);
 assert.equal(r.verification.real_test_senses_activated,0);
 assert.equal(r.verification.production_or_test_d1_writes,0);
 const verified=verify({...data,receipt:r.receipt});
 assert.equal(verified.status,'SIGNED_REAL_EDITORIAL_RECEIPT_VERIFIED_TEST_PREFLIGHT_ONLY');
 assert.equal(verified.rights_evidence_count,7);
 assert.equal(verified.editorial_evidence_count,10);
 assert.equal(verified.approved_senses_in_database,0);
 assert.equal(verified.test_d1_writes,0);
});
test('the output cannot be issued from unreviewed AI cards or unchecked rights',()=>{
 const x=caseData();x.attestation.rights.english_example.verified=false;
 assert.throws(()=>issue(x),/OPS_SIGNOFF_EDITOR_OR_SOURCE_RIGHTS_INCOMPLETE/);
 const y=caseData();y.attestation.checks.uk_ipa.verified=false;
 assert.throws(()=>issue(y),/OPS_SIGNOFF_EDITOR_OR_SOURCE_RIGHTS_INCOMPLETE/);
 const z=caseData();z.attestation.publisher_rights_confirmation.commercial_teaching_rights=false;
 assert.throws(()=>issue(z),/OPS_SIGNOFF_EDITOR_OR_SOURCE_RIGHTS_INCOMPLETE/);
});
test('private signing key alone is not permission: actual registered OPS trust anchor is required',()=>{
 const x=caseData();x.trustAnchorRegisteredInOps=false;
 assert.throws(()=>issue(x),/OPS_SIGNOFF_TRUST_ANCHOR_NOT_CONFIRMED_REGISTERED/);
 const mismatch=caseData();
 const foreign=caseData();
 mismatch.trustedOpsPublicKeyPem=foreign.trustedOpsPublicKeyPem;
 assert.throws(()=>issue(mismatch),
  /OPS_SIGNOFF_PUBLIC_KEY_NOT_IN_INDEPENDENT_REGISTRY/);
 mismatch.registeredOpsPublicKeySha256=foreign.registeredOpsPublicKeySha256;
 assert.throws(()=>issue(mismatch),
  /OPS_SIGNOFF_PRIVATE_KEY_NOT_REGISTERED_TO_TRUSTED_PUBKEY/);
 const claimed=caseData();claimed.authenticatedReviewerId='pretend_other_person';
 assert.throws(()=>issue(claimed),/OPS_SIGNOFF_REVIEWER_MISMATCH/);
 const badFingerprint=caseData();
 badFingerprint.registeredOpsPublicKeySha256='f'.repeat(64);
 assert.throws(()=>issue(badFingerprint),
  /OPS_SIGNOFF_PUBLIC_KEY_NOT_IN_INDEPENDENT_REGISTRY/);
 const missing=caseData();missing.opsAuditId='ops_fake';
 assert.throws(()=>issue(missing),/OPS_SIGNOFF_REAL_AUDIT_ID_REQUIRED/);
});
test('signature cannot be reused after changing actual editorial/rights evidence',()=>{
 const x=caseData(),receipt=issue(x).receipt;
 const copied=caseData();
 assert.throws(()=>verify({...copied,receipt}),/OPS_SIGNOFF_RECEIPT_NOT_TRUSTED/);
 const changed=structuredClone(x.attestation);
 changed.rights.chinese_example.license_reference='different';
 assert.throws(()=>verify({...x,attestation:changed,receipt}),
  /OPS_SIGNOFF_RECEIPT_NOT_TRUSTED/);
 const forged={...receipt,target_database_id:'649c71b3-340c-49bf-b806-3d39256851d3'};
 assert.throws(()=>verify({...x,receipt:forged}),/OPS_SIGNOFF_RECEIPT_NOT_TRUSTED/);
});
test('both sign and verify keep original books, all previous word-study records untouched',()=>{
 const source=caseData();
 const before=JSON.stringify(source.packet);
 const r=issue(source);
 const check=verify({...source,receipt:r.receipt});
 assert.equal(JSON.stringify(source.packet),before);
 assert.equal(check.prod_d1_writes,0);
 assert.equal(check.created_legacy_links_in_database,0);
 assert.equal(check.registered_ops_key_fingerprint_matched,true);
 assert.equal(check.ops_role_and_audit_event_must_be_verified_against_server,true);
});
