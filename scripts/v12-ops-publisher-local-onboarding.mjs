// P0: local, owner-controlled real Publisher Ed25519 onboarding.
// No signing key, OPS token, preview credential, real novel or attestation is
// sent to GitHub or printed. Never use this tool to fabricate editorial signoff.
// Node 22+. Private key files MUST live OUTSIDE this repository.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,createPublicKey,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,sep,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 canonicalPublisherReviewAttestation,evaluateRealPublisherClearance
} from './v12-real-published-commercial-rights-gate.mjs';
import {issueFirstRealPublisherOpsReceipt}
 from './v12-first-real-ops-receipt-issuer.mjs';

const REPO=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const HOST='https://miaowu-english-staging.kim10086a.workers.dev';
const HEX=/^[a-f0-9]{64}$/u;
const TEST='88a817cb-23bb-4ae4-bcb8-92286c4165d4';
const sha=x=>createHash('sha256').update(x).digest('hex');
const requestId=()=>('req_'+randomUUID());
const stop=msg=>{throw Error(msg)};
function secureLocation(dir){
 assert.ok(typeof dir==='string'&&dir.length>0,'OPS_LOCAL_DIR_REQUIRED');
 const out=resolve(dir);
 assert.ok(out!==REPO&&!out.startsWith(REPO+sep),
  'OPS_LOCAL_PRIVATE_KEY_DIR_MUST_BE_OUTSIDE_GIT_REPOSITORY');
 return out;
}
export function keyFingerprint(publicKeyPem){
 const key=createPublicKey(publicKeyPem);
 assert.equal(key.asymmetricKeyType,'ed25519','OPS_LOCAL_ED25519_REQUIRED');
 return sha(key.export({type:'spki',format:'der'}));
}
export function initLocalPublisherKey(dir){
 const target=secureLocation(dir);
 mkdirSync(target,{recursive:false,mode:0o700});
 const keys=generateKeyPairSync('ed25519');
 const privateKeyPem=keys.privateKey.export({type:'pkcs8',format:'pem'});
 const publicKeyPem=keys.publicKey.export({type:'spki',format:'pem'});
 const fingerprint=keyFingerprint(publicKeyPem);
 writeFileSync(join(target,'publisher-private.pem'),privateKeyPem,{flag:'wx',mode:0o600});
 writeFileSync(join(target,'publisher-public.pem'),publicKeyPem,{flag:'wx',mode:0o600});
 writeFileSync(join(target,'publisher-public-fingerprint.txt'),fingerprint+'\n',
  {flag:'wx',mode:0o600});
 return {path:target,fingerprint,publicKeyPem,
  privateKeyWrittenOnlyToUserMachine:true,
  registeredInOps:false,sensesApproved:0};
}
export function loadLocalPublisherKey(dir){
 const target=secureLocation(dir);
 const privateKeyPem=readFileSync(join(target,'publisher-private.pem'),'utf8');
 const trustedOpsPublicKeyPem=readFileSync(join(target,'publisher-public.pem'),'utf8');
 const fingerprint=keyFingerprint(trustedOpsPublicKeyPem);
 const fileFingerprint=readFileSync(join(target,'publisher-public-fingerprint.txt'),'utf8').trim();
 assert.equal(fingerprint,fileFingerprint,'OPS_LOCAL_PUBLIC_KEY_FINGERPRINT_MISMATCH');
 assert.ok(privateKeyPem.includes('PRIVATE KEY'),'OPS_LOCAL_PRIVATE_KEY_MISSING');
 return {target,privateKeyPem,trustedOpsPublicKeyPem,fingerprint};
}
function credentialHeaders(env){
 const token=env.MIAOWU_OPS_PUBLISHER_TOKEN;
 const preview=env.MIAOWU_STAGING_PREVIEW_PASSWORD;
 if(!/^mwops_[a-f0-9]{64}$/u.test(token||'')||
    typeof preview!=='string'||preview.length<16)
  stop('OPS_LOCAL_STAGING_PRIVATE_CREDENTIALS_REQUIRED');
 return {
  'authorization':'Basic '+Buffer.from('reviewer:'+preview).toString('base64'),
  'x-mw-ops-key':token,'content-type':'application/json',
  'origin':HOST
 };
}
export async function opsPost(path,payload,{env=process.env,fetchImpl=fetch}={}){
 const paths=new Set(['publisher-key/register','publisher-review/authorize',
  'publisher-receipt/verify']);
 if(!paths.has(path))stop('OPS_LOCAL_UNSUPPORTED_API');
 const res=await fetchImpl(HOST+'/api/ops/dictionary/'+path,{
  method:'POST',redirect:'error',headers:credentialHeaders(env),
  body:JSON.stringify(payload)
 });
 let result;try{result=await res.json()}catch{
  stop('OPS_LOCAL_STAGING_NONJSON_RESPONSE')}
 if(!res.ok)stop('OPS_LOCAL_STAGING_REQUEST_FAILED_'+res.status+'_'+
  String(result?.error||'UNKNOWN').replace(/[^A-Z0-9_]/giu,'').slice(0,90));
 return result;
}
export async function registerRealPublisher(dir,opts={}){
 const {trustedOpsPublicKeyPem,fingerprint}=loadLocalPublisherKey(dir);
 const result=await (opts.post||opsPost)('publisher-key/register',{
  requestId:requestId(),publicKeyPem:trustedOpsPublicKeyPem,
  confirmRegistration:true
 },opts);
 assert.equal(result.status,'REGISTERED_TEST_PUBLISHER_PUBLIC_KEY',
  'OPS_LOCAL_REAL_OPS_REGISTRATION_FAILED');
 assert.equal(result.publicKeySha256,fingerprint,
  'OPS_LOCAL_SERVER_REGISTERED_DIFFERENT_PUBLIC_KEY');
 return {status:result.status,publicKeySha256:fingerprint,
  idempotent:result.idempotent===true,noD1SenseWrites:true};
}
export async function signReviewedFirstRealSense(dir,packetPath,attestationPath,opts={}){
 const {target,privateKeyPem,trustedOpsPublicKeyPem,fingerprint}=
  loadLocalPublisherKey(dir);
 const packet=JSON.parse(readFileSync(packetPath,'utf8'));
 const attestation=JSON.parse(readFileSync(attestationPath,'utf8'));
 // Local signing is forbidden until a genuine independent legal/editorial
 // review satisfies all 7 rights + 10 editing checks. The owner MUST manually
 // inspect the true private source; this script never fills these fields.
 const status=evaluateRealPublisherClearance({packet,attestation,receipt:null});
 assert.equal(status.target_database_id,TEST);
 assert.deepEqual(status.content_and_rights_blockers,
  ['AUTHENTICATED_OPS_TEST_SCOPE_RECEIPT_MISSING_OR_CHANGED'],
  'OPS_LOCAL_REAL_SOURCE_RIGHTS_OR_EDITORIAL_REVIEW_INCOMPLETE');
 const registration=await registerRealPublisher(dir,opts);
 assert.equal(registration.publicKeySha256,fingerprint);
 const reviewSha=sha(canonicalPublisherReviewAttestation(attestation));
 const post=opts.post||opsPost;
 const auth=await post('publisher-review/authorize',{
  requestId:requestId(),
  publisherReviewSha256:reviewSha,
  sourceProofSha256:packet.source_proof_sha256,
  candidateSha256:attestation.candidate_sha256,
  reviewerId:attestation.reviewer_id,
  confirmReviewed:true
 },opts);
 assert.equal(auth.status,'OPS_REVIEW_AUTHORIZED_FOR_OFFLINE_SIGNING',
  'OPS_LOCAL_REAL_AUDIT_AUTHORIZATION_FAILED');
 assert.ok(/^ops_[a-z0-9_-]{12,120}$/iu.test(auth.opsAuditId||''),
  'OPS_LOCAL_REAL_AUDIT_ID_INVALID');
 const signed=issueFirstRealPublisherOpsReceipt({
  packet,attestation,privateKeyPem,trustedOpsPublicKeyPem,
  authenticatedReviewerId:attestation.reviewer_id,
  signedAt:new Date().toISOString(),opsAuditId:auth.opsAuditId,
  registeredOpsPublicKeySha256:fingerprint,trustAnchorRegisteredInOps:true
 });
 assert.equal(signed.verification.ops_ed25519_signature_verified,true);
 const validated=await post('publisher-receipt/verify',{
  requestId:requestId(),publicKeyPem:trustedOpsPublicKeyPem,
  receipt:signed.receipt
 },opts);
 assert.equal(validated.status,'SIGNED_OPS_RECEIPT_TEST_PREFLIGHT_ONLY',
  'OPS_LOCAL_REAL_SERVER_RECEIPT_VALIDATION_FAILED');
 const localFile=join(target,'receipt-'+validated.receiptSha256+'.json');
 assert.ok(HEX.test(validated.receiptSha256||''),'OPS_LOCAL_RECEIPT_SHA_INVALID');
 writeFileSync(localFile,JSON.stringify(signed.receipt,null,2),
  {flag:'wx',mode:0o600});
 return {status:validated.status,receiptFile:localFile,
  receiptSha256:validated.receiptSha256,
  rightsEvidenceCount:signed.verification.legal_rights_evidence_count,
  editorialEvidenceCount:signed.verification.editorial_evidence_count,
  testSensesApproved:0,importAuthorized:false,productionWrites:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const [mode,dir,...args]=process.argv.slice(2);
  if(mode==='init'&&args.length===0){
   const r=initLocalPublisherKey(dir);
   console.log('LOCAL_ED25519_PUBLISHER_KEY_CREATED_NO_SERVER_WRITES');
   console.log('PUBLIC_FINGERPRINT_SHA256='+r.fingerprint);
   console.log('PRIVATE_FILE_STORED_ONLY_IN='+r.path);
   console.log('NEXT_DEPLOY_STAGING_WITH_PUBLIC_FINGERPRINT_AND_PROTECTED_APPROVAL');
  }else if(mode==='register'&&args.length===0){
   const r=await registerRealPublisher(dir);
   console.log('REAL_OPS_PUBLISHER_KEY_REGISTERED_TEST_ONLY='+JSON.stringify(r));
  }else if(mode==='sign-reviewed'&&args.length===2){
   const r=await signReviewedFirstRealSense(dir,args[0],args[1]);
   console.log('REAL_OPS_PUBLISHER_RECEIPT_VERIFIED_NO_CONTENT_IMPORT='+JSON.stringify(r));
  }else stop('OPS_LOCAL_USAGE_INIT_REGISTER_SIGN_REVIEWED');
 }catch(e){
  const m=String(e?.message||'');
  console.error('OPS_LOCAL_ONBOARDING_BLOCKED',
   /^OPS_LOCAL_[A-Z0-9_]+$/u.test(m)?m:'SEE_LOCAL_FAILURE_KEEP_PRIVATE');
  process.exitCode=1;
 }
}
