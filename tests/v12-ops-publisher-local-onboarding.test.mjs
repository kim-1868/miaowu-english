import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {mkdtempSync,readFileSync,statSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,createPublicKey} from 'node:crypto';
import {
 keyFingerprint,initLocalPublisherKey,loadLocalPublisherKey,
 registerRealPublisher,signReviewedFirstRealSense
} from '../scripts/v12-ops-publisher-local-onboarding.mjs';
import {
 buildRealPublishedTwoBookEditorialIntake
} from '../scripts/v12-real-published-two-book-editorial-intake.mjs';
import {
 createRealPublisherClearanceTemplate,canonicalOwnerSourceRegistrationPlan,
 RIGHTS_KINDS,CHECK_KINDS
} from '../scripts/v12-real-published-commercial-rights-gate.mjs';
import {verifyFirstRealPublisherOpsReceipt} from
 '../scripts/v12-first-real-ops-receipt-issuer.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const UTC='2026-11-13T00:00:00Z';
const secure=()=>mkdtempSync(join(tmpdir(),'mw-publisher-offline-'));
const clean=p=>rmSync(p,{recursive:true,force:true});
function fixture(){
 const cardGroup={headword:'choice',pos:'n.',meaning_zh:'选择',
  fingerprint_sha256:'a'.repeat(64),source_book_count:2,occurrences:5,
  paired_cards:[]};
 const rows=[];
 for(let i=0;i<2;i++){
  const old='actual-old-'+i,book='published-book-'+i;
  const paragraph_json=JSON.stringify({segments:[
   {text:'她做了一个'},{wordId:old,surface:'choice',gloss:'选择'},
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
  cardGroup.paired_cards.push({book_id:book,old_word_id:old,
   phonetic_uk:row.old_uk,phonetic_us:row.old_us,
   example_en:row.old_en,example_zh:row.old_zh});
  rows.push(row);
 }
 const packet=buildRealPublishedTwoBookEditorialIntake({
  schema:'wordletter-real-production-2book-context-evidence-v1',
  status:'REAL_PUBLISHED_CONTEXT_EVIDENCE_ONLY_NOT_APPROVED',
  source_artifact_id:13911979176,editorial_candidate:cardGroup,
  verified_actual_published_contexts:rows,
  approved_sense_id:null,commercial_license_verified:false,
  authenticated_ops_signoff:false,bound_staging_legacy_word_ids:0,
  production_writes:0,customer_study_writes:0,staging_writes:0});
 const attestation=createRealPublisherClearanceTemplate(packet);
 const reviewer='publisher_editor_main',evidence='f'.repeat(64);
 attestation.reviewer_id=reviewer;
 attestation.reviewed_at=UTC;
 for(const k of RIGHTS_KINDS)attestation.rights[k]={
  verified:true,legal_basis:'original',rights_holder:'Synthetic owner ONLY',
  license_reference:'Synthetic unit test ONLY',
  evidence_sha256:evidence,reviewed_by:reviewer,reviewed_at:UTC};
 for(const k of CHECK_KINDS)attestation.checks[k]={
  verified:true,evidence_sha256:evidence,
  reviewer_note:'Synthetic test only, NEVER valid as a real rights attestation'};
 const proposal={
  license_name:'MIAOWU_OWNER_ORIGINAL_COMMERCIAL_TEACHING',
  origin_claim:'PUBLISHER_AI_ASSISTED_ORIGINAL_TEXT',
  creation_rights_evidence_sha256:evidence,
  legal_editorial_review_sha256:evidence,
  reviewed_by:reviewer,requires_live_test_collision_check:true,
  allows_direct_production_activation:false};
 attestation.dictionary={
  registration_mode:'new_owner_original_source',
  entry_id:'gdict_'+'b'.repeat(24),
  source_key:'miaowu-owner-original-curated-v1',
  verified_existing_enabled_licensed_entry:false,new_source_proposal:proposal
 };
 attestation.dictionary.source_registry_sha256=sha(
  canonicalOwnerSourceRegistrationPlan({
   entry_id:attestation.dictionary.entry_id,
   source_key:attestation.dictionary.source_key,
   headword:packet.candidate.headword,proposal
  }));
 attestation.publisher_rights_confirmation={
  commercial_teaching_rights:true,
  rights_authority:'MIAOWU_RIGHTS_OWNER',
  supporting_contract_or_creation_record_sha256:evidence
 };
 return {packet,attestation};
}
test('key init securely writes private Ed25519 PEM only outside repository',()=>{
 const root=secure();
 try{
  const dir=join(root,'vault');
  const r=initLocalPublisherKey(dir);
  const files=loadLocalPublisherKey(dir);
  assert.equal(r.fingerprint,files.fingerprint);
  assert.equal(keyFingerprint(files.trustedOpsPublicKeyPem),r.fingerprint);
  assert.equal(sha(createPublicKey(files.trustedOpsPublicKeyPem)
   .export({type:'spki',format:'der'})),r.fingerprint);
  assert.equal(statSync(join(dir,'publisher-private.pem')).mode&0o777,0o600);
  assert.equal(readFileSync(join(dir,'publisher-public-fingerprint.txt'),'utf8').trim(),
   r.fingerprint);
  assert.ok(!r.publicKeyPem.includes('PRIVATE KEY'));
  assert.throws(()=>initLocalPublisherKey(dir));
  assert.throws(()=>initLocalPublisherKey(
   new URL('../dangerous-inside-repo',import.meta.url).pathname),
   /OPS_LOCAL_PRIVATE_KEY_DIR_MUST_BE_OUTSIDE_GIT_REPOSITORY/);
 }finally{clean(root)}
});
test('register posts only public key and never private PEM to the real OPS endpoint',async()=>{
 const root=secure();
 try{
  const dir=join(root,'vault');
  const local=initLocalPublisherKey(dir);
  const calls=[];
  const result=await registerRealPublisher(dir,{
   post:async(path,payload)=>{
    calls.push({path,payload});
    return {status:'REGISTERED_TEST_PUBLISHER_PUBLIC_KEY',
     publicKeySha256:local.fingerprint,idempotent:false}
   }
  });
  assert.equal(result.noD1SenseWrites,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,'publisher-key/register');
  assert.ok(calls[0].payload.publicKeyPem.includes('BEGIN PUBLIC KEY'));
  assert.ok(!JSON.stringify(calls).includes('BEGIN PRIVATE KEY'));
 }finally{clean(root)}
});
test('synthetic ONLY: offline reviewed packet -> registered OPS -> audit -> Ed25519 -> verified receipt, no import',async()=>{
 const root=secure();
 try{
  const dir=join(root,'vault');
  const local=initLocalPublisherKey(dir);
  const {packet,attestation}=fixture();
  const packetFile=join(root,'review-private-source.json');
  const attestationFile=join(root,'review-private-attestation.json');
  writeFileSync(packetFile,JSON.stringify(packet),{mode:0o600});
  writeFileSync(attestationFile,JSON.stringify(attestation),{mode:0o600});
  const called=[];
  const post=async(path,payload)=>{
   called.push(path);
   if(path==='publisher-key/register')return {
    status:'REGISTERED_TEST_PUBLISHER_PUBLIC_KEY',
    publicKeySha256:local.fingerprint,idempotent:false};
   if(path==='publisher-review/authorize')return {
    status:'OPS_REVIEW_AUTHORIZED_FOR_OFFLINE_SIGNING',
    opsAuditId:'ops_real_editorial_owner_20261113',
    authenticatedPublisherId:'owner_main'};
   assert.equal(path,'publisher-receipt/verify');
   const verified=verifyFirstRealPublisherOpsReceipt({
    packet,attestation,receipt:payload.receipt,
    trustedOpsPublicKeyPem:loadLocalPublisherKey(dir).trustedOpsPublicKeyPem,
    registeredOpsPublicKeySha256:local.fingerprint});
   assert.equal(verified.rights_evidence_count,7);
   assert.equal(verified.editorial_evidence_count,10);
   return {status:'SIGNED_OPS_RECEIPT_TEST_PREFLIGHT_ONLY',
    receiptSha256:sha(JSON.stringify(payload.receipt)),testD1SenseWrites:0};
  };
  const result=await signReviewedFirstRealSense(dir,packetFile,attestationFile,{post});
  assert.deepEqual(called,[
   'publisher-key/register','publisher-review/authorize',
   'publisher-receipt/verify']);
  assert.equal(result.rightsEvidenceCount,7);
  assert.equal(result.editorialEvidenceCount,10);
  assert.equal(result.testSensesApproved,0);
  assert.equal(result.importAuthorized,false);
  assert.ok(readFileSync(result.receiptFile,'utf8').includes('"signature_b64"'));
  assert.equal(statSync(result.receiptFile).mode&0o777,0o600);
 }finally{clean(root)}
});
test('incomplete independent rights must fail BEFORE any OPS authorization or signing',async()=>{
 const root=secure();
 try{
  const dir=join(root,'vault');
  initLocalPublisherKey(dir);
  const {packet,attestation}=fixture();
  attestation.rights.english_example.verified=false;
  const packetFile=join(root,'private-packet.json');
  const attestFile=join(root,'private-attestation.json');
  writeFileSync(packetFile,JSON.stringify(packet));
  writeFileSync(attestFile,JSON.stringify(attestation));
  let calls=0;
  await assert.rejects(()=>signReviewedFirstRealSense(
   dir,packetFile,attestFile,{post:async()=>{calls++}}),
   /OPS_LOCAL_REAL_SOURCE_RIGHTS_OR_EDITORIAL_REVIEW_INCOMPLETE/);
  assert.equal(calls,0);
 }finally{clean(root)}
});
