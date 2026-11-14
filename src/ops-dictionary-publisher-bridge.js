// P0A-1: real OPS Publisher identity -> auditable, TEST-only Ed25519 receipt bridge.
// This never approves lexical content, imports a sense, deploys, or reads paid prose.
// The private key stays with the signing Publisher; only its public SPKI hash is stored.
// Source rights + editorial verification STILL happen independently in the signed packet.
import {authenticateOperator,hasOpsRole} from './ops-access.js';

const TEST='88a817cb-23bb-4ae4-bcb8-92286c4165d4';
const ROLE='commercial-lesson-and-published-context-publisher-signoff-v1';
const HEX=/^[a-f0-9]{64}$/u;
const REQUEST=/^[A-Za-z0-9_-]{8,100}$/u;
const ID=/^[a-z][a-z0-9_-]{2,79}$/u;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u;
const PATHS=new Set([
 '/api/ops/dictionary/publisher-key/register',
 '/api/ops/dictionary/publisher-review/authorize',
 '/api/ops/dictionary/publisher-receipt/verify'
]);
const headers={'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const error=(code,status=400)=>response({error:code},status);
const sha=async bytes=>Array.from(new Uint8Array(
 await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const utf8=new TextEncoder();
const shaText=async text=>sha(utf8.encode(text));
const auditId=()=>('ops_'+crypto.randomUUID().replaceAll('-',''));
// Lock the exact source, candidate and reviewer to each OPS audit event.
// The signed receipt MUST reproduce these values, not only the review SHA.
const reviewBinding=({publisher_review_sha256,source_proof_sha256,
 candidate_sha256,reviewer_id})=>JSON.stringify({
 schema:'wordletter-ops-publisher-review-binding-v1',
 publisher_review_sha256,source_proof_sha256,candidate_sha256,reviewer_id,
 target_database_id:TEST
});
const publisherReviewBinding=async({publisherReviewSha256,sourceProofSha256,
 candidateSha256,reviewerId})=>shaText(reviewBinding({
 publisher_review_sha256:publisherReviewSha256,
 source_proof_sha256:sourceProofSha256,
 candidate_sha256:candidateSha256,reviewer_id:reviewerId}));

const canonicalReceipt=r=>JSON.stringify({
 schema:r.schema,purpose:r.purpose,
 publisher_review_sha256:r.publisher_review_sha256,
 source_proof_sha256:r.source_proof_sha256,
 candidate_sha256:r.candidate_sha256,reviewer_id:r.reviewer_id,
 ops_audit_id:r.ops_audit_id,signed_at:r.signed_at,
 target_database_id:r.target_database_id
});
function spkiFromPem(pem){
 if(typeof pem!=='string'||pem.length>2000)throw Error('OPS_PUBLISHER_INVALID_PUBLIC_KEY');
 const m=/^-----BEGIN PUBLIC KEY-----\s+([A-Za-z0-9+\/=\s]+?)\s+-----END PUBLIC KEY-----$/u.exec(pem.trim());
 if(!m)throw Error('OPS_PUBLISHER_INVALID_PUBLIC_KEY');
 let raw;
 try{raw=atob(m[1].replace(/\s+/gu,''))}
 catch{throw Error('OPS_PUBLISHER_INVALID_PUBLIC_KEY')}
 const bytes=Uint8Array.from(raw,x=>x.charCodeAt(0));
 if(bytes.length!==44)throw Error('OPS_PUBLISHER_INVALID_ED25519_SPKI');
 return bytes;
}
async function digestTrustedPublicKey(pem,pinned){
 const der=spkiFromPem(pem),fingerprint=await sha(der);
 if(!HEX.test(pinned||'')||fingerprint!==pinned)
  throw Error('OPS_PUBLISHER_KEY_NOT_IN_INDEPENDENT_TRUST_CONFIG');
 const key=await crypto.subtle.importKey('spki',der,{name:'Ed25519'},false,['verify']);
 return {fingerprint,key};
}
async function bodyOf(req){
 if(!/^application\/json(?:;|$)/iu.test(req.headers.get('content-type')||''))
  throw Error('OPS_PUBLISHER_JSON_REQUIRED');
 if(Number(req.headers.get('content-length')||0)>14000)
  throw Error('OPS_PUBLISHER_BODY_TOO_LARGE');
 const raw=await req.text();
 if(utf8.encode(raw).length>14000)throw Error('OPS_PUBLISHER_BODY_TOO_LARGE');
 let b;try{b=JSON.parse(raw)}catch{throw Error('OPS_PUBLISHER_INVALID_JSON')}
 if(!b||typeof b!=='object'||Array.isArray(b)||
    !REQUEST.test(b.requestId||''))throw Error('OPS_PUBLISHER_INVALID_REQUEST');
 return b;
}
async function activeKey(db,operatorId,fingerprint){
 return db.prepare('SELECT public_key_sha256 FROM ops_dictionary_publisher_keys '+
 'WHERE operator_id=? AND public_key_sha256=? AND is_active=1 AND revoked_at IS NULL')
 .bind(operatorId,fingerprint).first();
}
async function auditRequest(db,kind,requestId){
 return db.prepare('SELECT id,actor_id,resource_id,content_fingerprint '+
  'FROM ops_audit_events WHERE event_type=? AND request_id=?')
  .bind(kind,requestId).first();
}
function expectIdentity(actor){
 if(!ID.test(actor?.id||'')||!hasOpsRole(actor,'publisher'))
  throw Error('OPS_PUBLISHER_ROLE_REQUIRED');
}
async function registerKey(db,actor,b,pinned){
 if(b.confirmRegistration!==true)throw Error('OPS_PUBLISHER_EXPLICIT_REGISTRATION_REQUIRED');
 const {fingerprint}=await digestTrustedPublicKey(b.publicKeyPem,pinned);
 const old=await activeKey(db,actor.id,fingerprint);
 if(old)return {status:'REGISTERED_TEST_PUBLISHER_PUBLIC_KEY',idempotent:true,
  publicKeySha256:fingerprint,productionWrites:0};
 const exists=await db.prepare(
  'SELECT operator_id FROM ops_dictionary_publisher_keys WHERE public_key_sha256=?')
  .bind(fingerprint).first();
 if(exists)throw Error('OPS_PUBLISHER_KEY_ALREADY_OWNED_OR_REVOKED');
 const id=auditId();
 const audit=db.prepare('INSERT INTO ops_audit_events '+
 '(id,actor_id,event_type,resource_type,resource_id,request_id,content_fingerprint,reason_code) '+
 'VALUES(?,?,?,?,?,?,?,?)').bind(id,actor.id,'dictionary.publisher_key_registered',
 'dictionary_key',fingerprint,b.requestId,fingerprint,'STAGING_TRUST_PIN_CONFIRMED');
 const registration=db.prepare('INSERT INTO ops_dictionary_publisher_keys '+
 '(public_key_sha256,operator_id,registration_audit_id,is_active) VALUES(?,?,?,1)')
 .bind(fingerprint,actor.id,id);
 await db.batch([audit,registration]);
 return {status:'REGISTERED_TEST_PUBLISHER_PUBLIC_KEY',idempotent:false,
  publicKeySha256:fingerprint,productionWrites:0};
}
async function authorizeReview(db,actor,b,pinned){
 if(b.confirmReviewed!==true||!HEX.test(b.publisherReviewSha256||'')||
    !HEX.test(b.sourceProofSha256||'')||!HEX.test(b.candidateSha256||'')||
    !ID.test(b.reviewerId||''))
  throw Error('OPS_PUBLISHER_REVIEW_ATTESTATION_REQUIRED');
 if(!HEX.test(pinned||'')||!await activeKey(db,actor.id,pinned))
  throw Error('OPS_PUBLISHER_TRUSTED_REGISTRATION_REQUIRED');
 const event='dictionary.publisher_review_authorized';
 const boundHash=await publisherReviewBinding(b);
 const prior=await auditRequest(db,event,b.requestId);
 if(prior){
  if(prior.actor_id!==actor.id||prior.resource_id!==b.publisherReviewSha256||
     prior.content_fingerprint!==boundHash)
   throw Error('OPS_PUBLISHER_REQUEST_ID_CONFLICT');
  return {status:'OPS_REVIEW_AUTHORIZED_FOR_OFFLINE_SIGNING',idempotent:true,
   opsAuditId:prior.id,authenticatedPublisherId:actor.id,
   publisherReviewSha256:b.publisherReviewSha256,
   targetTestDatabaseId:TEST,productionWrites:0};
 }
 const id=auditId();
 await db.prepare('INSERT INTO ops_audit_events '+
  '(id,actor_id,event_type,resource_type,resource_id,request_id,content_fingerprint,reason_code) '+
  'VALUES(?,?,?,?,?,?,?,?)').bind(id,actor.id,event,'dictionary_review',
  b.publisherReviewSha256,b.requestId,boundHash,
  'COMMERCIAL_REVIEW_CONFIRMED_FOR_SIGNING').run();
 return {status:'OPS_REVIEW_AUTHORIZED_FOR_OFFLINE_SIGNING',
  idempotent:false,opsAuditId:id,authenticatedPublisherId:actor.id,
  publisherReviewSha256:b.publisherReviewSha256,
  reviewerId:b.reviewerId,targetTestDatabaseId:TEST,productionWrites:0};
}
function checkReceipt(r){
 if(!r||typeof r!=='object'||Array.isArray(r)||
    r.schema!=='wordletter-ops-publisher-clearance-receipt-v1'||
    r.purpose!==ROLE||r.target_database_id!==TEST||
    ![r.publisher_review_sha256,r.source_proof_sha256,r.candidate_sha256]
     .every(x=>HEX.test(x||''))||!ID.test(r.reviewer_id||'')||
    !/^ops_[a-z0-9_-]{12,120}$/iu.test(r.ops_audit_id||'')||
    !ISO.test(r.signed_at||'')||Number.isNaN(Date.parse(r.signed_at))||
    typeof r.signature_b64!=='string'||
    !/^[A-Za-z0-9+/]{86}==$/u.test(r.signature_b64))
  throw Error('OPS_PUBLISHER_RECEIPT_INVALID');
 // Reject unknown keys so that the fingerprint covers precisely what is verified.
 const allowed=['schema','purpose','publisher_review_sha256','source_proof_sha256',
  'candidate_sha256','reviewer_id','ops_audit_id','signed_at',
  'target_database_id','signature_b64'];
 if(Object.keys(r).some(x=>!allowed.includes(x)))
  throw Error('OPS_PUBLISHER_RECEIPT_UNEXPECTED_FIELDS');
}
async function verifyReceipt(db,actor,b,pinned){
 const r=b.receipt;checkReceipt(r);
 const {fingerprint,key}=await digestTrustedPublicKey(b.publicKeyPem,pinned);
 if(!await activeKey(db,actor.id,fingerprint))
  throw Error('OPS_PUBLISHER_TRUSTED_REGISTRATION_REQUIRED');
 const audit=await db.prepare('SELECT actor_id,event_type,resource_type,resource_id,'+
  'content_fingerprint FROM ops_audit_events WHERE id=?')
  .bind(r.ops_audit_id).first();
 if(!audit||audit.actor_id!==actor.id||
    audit.event_type!=='dictionary.publisher_review_authorized'||
    audit.resource_type!=='dictionary_review'||
    audit.resource_id!==r.publisher_review_sha256||
    audit.content_fingerprint!==await shaText(reviewBinding(r)))
  throw Error('OPS_PUBLISHER_REAL_AUDIT_NOT_FOUND');
 const signature=Uint8Array.from(atob(r.signature_b64),c=>c.charCodeAt(0));
 if(signature.length!==64||
    !await crypto.subtle.verify('Ed25519',key,signature,
      utf8.encode(canonicalReceipt(r))))
  throw Error('OPS_PUBLISHER_SIGNATURE_INVALID');
 const fingerprintReceipt=await shaText(JSON.stringify(r));
 const prior=await db.prepare('SELECT receipt_sha256,operator_id '+
  'FROM ops_dictionary_publisher_receipts WHERE receipt_sha256=?')
  .bind(fingerprintReceipt).first();
 if(prior){
  if(prior.operator_id!==actor.id)throw Error('OPS_PUBLISHER_RECEIPT_OWNER_CONFLICT');
  return {status:'SIGNED_OPS_RECEIPT_TEST_PREFLIGHT_ONLY',idempotent:true,
   receiptSha256:fingerprintReceipt,approvedSenses:0,testD1SenseWrites:0,
   productionWrites:0};
 }
 const id=auditId();
 const event=db.prepare('INSERT INTO ops_audit_events '+
  '(id,actor_id,event_type,resource_type,resource_id,request_id,content_fingerprint,reason_code) '+
  'VALUES(?,?,?,?,?,?,?,?)').bind(id,actor.id,
  'dictionary.publisher_receipt_verified','dictionary_receipt',
  fingerprintReceipt,b.requestId,fingerprintReceipt,'SIGNED_REVIEW_TEST_PREFLIGHT_ONLY');
 const save=db.prepare('INSERT INTO ops_dictionary_publisher_receipts '+
  '(receipt_sha256,authorization_audit_id,verification_audit_id,operator_id,'+
  'public_key_sha256,review_sha256,source_proof_sha256,candidate_sha256,reviewer_id,signed_at) '+
  'VALUES(?,?,?,?,?,?,?,?,?,?)').bind(fingerprintReceipt,r.ops_audit_id,id,actor.id,
  fingerprint,r.publisher_review_sha256,r.source_proof_sha256,r.candidate_sha256,
  r.reviewer_id,r.signed_at);
 await db.batch([event,save]);
 return {status:'SIGNED_OPS_RECEIPT_TEST_PREFLIGHT_ONLY',idempotent:false,
  receiptSha256:fingerprintReceipt,approvedSenses:0,testD1SenseWrites:0,
  productionWrites:0};
}
export async function handleOpsDictionaryPublisherBridge(req,env,path){
 if(!PATHS.has(path)||req.method!=='POST'||env?.APP_ENV!=='staging')
  return error('NOT_FOUND',404);
 if(env.OPS_DICTIONARY_PUBLISHER_BRIDGE_ENABLED!=='true')
  return error('OPS_PUBLISHER_BRIDGE_DISABLED',503);
 if(!HEX.test(env.MIAOWU_TRUSTED_OPS_PUBLISHER_PUBKEY_SHA256||''))
  return error('OPS_PUBLISHER_TRUST_CONFIG_REQUIRED',503);
 const auth=await authenticateOperator(req,env);
 if(auth.response)return auth.response;
 try{
  expectIdentity(auth.operator);
  if(!env.DB?.batch||!env.DB?.prepare)throw Error('OPS_PUBLISHER_SCHEMA_REQUIRED');
  const b=await bodyOf(req);
  const pinned=env.MIAOWU_TRUSTED_OPS_PUBLISHER_PUBKEY_SHA256;
  let result;
  if(path.endsWith('/register'))result=await registerKey(env.DB,auth.operator,b,pinned);
  else if(path.endsWith('/authorize'))result=await authorizeReview(env.DB,auth.operator,b,pinned);
  else result=await verifyReceipt(env.DB,auth.operator,b,pinned);
  return response(result);
 }catch(e){
  const reason=String(e?.message||'');
  const safe=/^OPS_PUBLISHER_[A-Z0-9_]+$/u.test(reason) ? reason :
    'OPS_PUBLISHER_BACKEND_OR_SCHEMA_UNAVAILABLE';
  return error(safe, safe.endsWith('ROLE_REQUIRED')?403:
    safe.includes('BACKEND_OR_SCHEMA')?503:400);
 }
}
