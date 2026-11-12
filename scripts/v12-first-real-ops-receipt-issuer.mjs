// First actual publisher commercial sense: OFFLINE Ed25519 receipt issuance.
//
// This script bridges independently completed editorial review to the existing
// verified two-book commercial clearance gate. It NEVER fills rights checks,
// decides language quality, creates an OPS role, accesses D1 or publishes.
// Only a key ALREADY registered to the publisher's authenticated OPS service
// may be treated as a trusted OPS signer. Unregistered local keys are NOT OPS
// authorization. Keep originals and signing keys outside public repositories.
import assert from 'node:assert/strict';
import {
  createHash, createPrivateKey, createPublicKey, sign,
  timingSafeEqual
} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
  evaluateRealPublisherClearance,
  canonicalPublisherReviewAttestation,
  canonicalPublisherReceipt
} from './v12-real-published-commercial-rights-gate.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const ROLE='commercial-lesson-and-published-context-publisher-signoff-v1';
const TEST='88a817cb-23bb-4ae4-bcb8-92286c4165d4';
const TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u;
const HEX=/^[a-f0-9]{64}$/u;
const AUDIT=/^ops_[a-z0-9_-]{12,120}$/iu;
const n=x=>String(x??'').normalize('NFKC').trim();
const reject=(message)=>{throw Error(message)};
const publicDer=key=>createPublicKey(key).export({type:'spki',format:'der'});
function assertTrustAnchor(privateKeyPem,trustedOpsPublicKeyPem){
 assert.ok(typeof privateKeyPem==='string'&&privateKeyPem.includes('PRIVATE KEY'),
  'OPS_SIGNOFF_PRIVATE_KEY_NOT_PROVISIONED');
 assert.ok(typeof trustedOpsPublicKeyPem==='string'&&trustedOpsPublicKeyPem.includes('BEGIN PUBLIC KEY'),
  'OPS_SIGNOFF_EXTERNAL_TRUSTED_PUBLIC_KEY_REQUIRED');
 const privateKey=createPrivateKey(privateKeyPem);
 const trustedKey=createPublicKey(trustedOpsPublicKeyPem);
 assert.equal(privateKey.asymmetricKeyType,'ed25519',
  'OPS_SIGNOFF_ED25519_KEY_REQUIRED');
 assert.equal(trustedKey.asymmetricKeyType,'ed25519',
  'OPS_SIGNOFF_TRUSTED_ED25519_PUBKEY_REQUIRED');
 const actual=publicDer(privateKey),trusted=publicDer(trustedKey);
 assert.ok(actual.length===trusted.length&&timingSafeEqual(actual,trusted),
  'OPS_SIGNOFF_PRIVATE_KEY_NOT_REGISTERED_TO_TRUSTED_PUBKEY');
 return privateKey;
}
export function issueFirstRealPublisherOpsReceipt({
  packet,attestation,privateKeyPem,trustedOpsPublicKeyPem,
  opsAuditId,signedAt,authenticatedReviewerId,
  trustAnchorRegisteredInOps=false
}={}){
 assert.equal(trustAnchorRegisteredInOps,true,
  'OPS_SIGNOFF_TRUST_ANCHOR_NOT_CONFIRMED_REGISTERED');
 assert.ok(AUDIT.test(opsAuditId??'')&&!/qa|test|fake|sample|placeholder|synthetic/iu.test(opsAuditId),
  'OPS_SIGNOFF_REAL_AUDIT_ID_REQUIRED');
 assert.ok(TIME.test(signedAt??'')&&!Number.isNaN(Date.parse(signedAt)),
  'OPS_SIGNOFF_UTC_TIMESTAMP_REQUIRED');
 assert.ok(n(authenticatedReviewerId)&&
  !/qa|test|fake|sample|placeholder|synthetic/iu.test(authenticatedReviewerId),
  'OPS_SIGNOFF_AUTHENTICATED_REVIEWER_REQUIRED');
 assert.equal(authenticatedReviewerId,attestation?.reviewer_id,
  'OPS_SIGNOFF_REVIEWER_MISMATCH');
 // Without the receipt, the normal gate MUST have exactly one blocker:
 // the pending authenticated OPS receipt. Legal and content reviews are not
 // waived, silently filled or replaced by a signature on unknown material.
 const status=evaluateRealPublisherClearance({
  packet,attestation,receipt:null,trustedOpsPublicKeyPem:null
 });
 assert.equal(status.status,'HOLD_REQUIRE_VERIFIED_EDITOR_AND_RIGHTS',
  'OPS_SIGNOFF_UNEXPECTED_PRESTATE');
 assert.deepEqual(status.content_and_rights_blockers,[
  'AUTHENTICATED_OPS_TEST_SCOPE_RECEIPT_MISSING_OR_CHANGED'
 ],'OPS_SIGNOFF_EDITOR_OR_SOURCE_RIGHTS_INCOMPLETE');
 assert.equal(status.target_database_id,TEST);
 const privateKey=assertTrustAnchor(privateKeyPem,trustedOpsPublicKeyPem);
 const receipt={
  schema:'wordletter-ops-publisher-clearance-receipt-v1',
  purpose:ROLE,
  publisher_review_sha256:sha(canonicalPublisherReviewAttestation(attestation)),
  source_proof_sha256:packet.source_proof_sha256,
  candidate_sha256:attestation.candidate_sha256,
  reviewer_id:authenticatedReviewerId,
  ops_audit_id:opsAuditId,
  signed_at:signedAt,
  target_database_id:TEST
 };
 receipt.signature_b64=sign(null,Buffer.from(canonicalPublisherReceipt(receipt)),
  privateKey).toString('base64');
 const verified=evaluateRealPublisherClearance({
  packet,attestation,receipt,trustedOpsPublicKeyPem
 });
 assert.equal(verified.status,
  'AUTHENTICATED_PUBLISHER_ATTESTATION_PRESENT_STAGING_PREFLIGHT_ONLY',
  'OPS_SIGNOFF_RECEIPT_VERIFICATION_FAILED');
 assert.equal(verified.ops_signature_valid,true);
 assert.equal(verified.commercial_senses_approved_in_database,0);
 assert.equal(verified.staging_database_writes,0);
 assert.equal(verified.production_database_read_or_write,false);
 return {receipt,verification:{
  status:verified.status,
  legal_rights_evidence_count:verified.rights_evidence_count,
  editorial_evidence_count:verified.editorial_evidence_count,
  authenticated_ops_signature:true,
  registered_ops_trust_anchor_asserted:true,
  requires_live_test_source_and_entry_verification:true,
  real_test_senses_activated:0,real_test_links_created:0,
  production_or_test_d1_writes:0,
  target_test_database_id:TEST}};
}
export function verifyFirstRealPublisherOpsReceipt({
 packet,attestation,receipt,trustedOpsPublicKeyPem
}={}){
 const status=evaluateRealPublisherClearance({
  packet,attestation,receipt,trustedOpsPublicKeyPem
 });
 assert.equal(status.status,
  'AUTHENTICATED_PUBLISHER_ATTESTATION_PRESENT_STAGING_PREFLIGHT_ONLY',
  'OPS_SIGNOFF_RECEIPT_NOT_TRUSTED_OR_CONTENT_NOT_REVIEWED');
 assert.equal(status.ops_signature_valid,true);
 assert.ok(HEX.test(receipt.publisher_review_sha256||''));
 assert.equal(status.commercial_senses_approved_in_database,0);
 assert.equal(status.staging_database_writes,0);
 return {status:'SIGNED_REAL_EDITORIAL_RECEIPT_VERIFIED_TEST_PREFLIGHT_ONLY',
  receipt_sha256:sha(JSON.stringify(receipt)),
  source_proof_sha256:packet.source_proof_sha256,
  target_test_database_id:TEST,
  rights_evidence_count:status.rights_evidence_count,
  editorial_evidence_count:status.editorial_evidence_count,
  registered_ops_key_must_be_verified_out_of_band:true,
  approved_senses_in_database:0,created_legacy_links_in_database:0,
  test_d1_writes:0,prod_d1_writes:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const mode=process.argv[2];
  if(mode==='sign'&&process.argv.length===11){
   // sign packet.json attestation.json trusted-pubkey.pem
   // private-signing-key.pem OPS_AUDIT_ID UTC_ISO REVIEWER_ID output.json
   const [packetPath,attestPath,pubPath,privPath,audit,at,reviewer,out]=
    process.argv.slice(3);
   const packet=JSON.parse(readFileSync(packetPath,'utf8'));
   const attestation=JSON.parse(readFileSync(attestPath,'utf8'));
   const trustedOpsPublicKeyPem=readFileSync(pubPath,'utf8');
   const privateKeyPem=readFileSync(privPath,'utf8');
   const r=issueFirstRealPublisherOpsReceipt({packet,attestation,
    trustedOpsPublicKeyPem,privateKeyPem,
    opsAuditId:audit,signedAt:at,authenticatedReviewerId:reviewer,
    // This CLI is only for authorized publisher key holders; the configured
    // trusted public key must have been registered in OPS independently.
    trustAnchorRegisteredInOps:process.env.MIAOWU_OPS_ED25519_TRUST_ANCHOR_REGISTERED==='true'});
   writeFileSync(out,JSON.stringify(r.receipt),{flag:'wx',mode:0o600});
   console.log('OPS_REAL_PUBLISHER_RECEIPT_SIGNED_SAFE_COUNTS='+JSON.stringify(
    r.verification));
  }else if(mode==='verify'&&process.argv.length===8){
   // verify packet.json attestation.json receipt.json trusted-pubkey.pem summary.json
   const [source,attestation,receipt,pub,out]=process.argv.slice(3);
   const r=verifyFirstRealPublisherOpsReceipt({
    packet:JSON.parse(readFileSync(source,'utf8')),
    attestation:JSON.parse(readFileSync(attestation,'utf8')),
    receipt:JSON.parse(readFileSync(receipt,'utf8')),
    trustedOpsPublicKeyPem:readFileSync(pub,'utf8')});
   writeFileSync(out,JSON.stringify(r),{flag:'wx',mode:0o600});
   console.log('OPS_REAL_PUBLISHER_RECEIPT_VERIFIED_TEST_PREFLIGHT_NO_DB_WRITE');
  }else reject('OPS_REAL_PUBLISHER_RECEIPT_USAGE');
 }catch(e){
  const message=String(e?.message??'');
  console.error('OPS_REAL_PUBLISHER_RECEIPT_BLOCKED',
    /^[A-Z_0-9]+$/u.test(message)?message:'PRIVATE_LICENSE_OR_SIGNOFF_VERIFICATION_FAILED');
  process.exitCode=1;
 }
}
