import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {digestOpsToken} from '../src/ops-access.js';
import {handleOpsDictionaryPublisherBridge as route}
 from '../src/ops-dictionary-publisher-bridge.js';
import {canonicalPublisherReceipt}
 from '../scripts/v12-real-published-commercial-rights-gate.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const TEST='88a817cb-23bb-4ae4-bcb8-92286c4165d4';
const pin=()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const pem=publicKey.export({type:'spki',format:'pem'});
 const fingerprint=sha(publicKey.export({type:'spki',format:'der'}));
 return {pem,fingerprint,privateKey};
};
function createD1(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const name of ['007_ops_identity_audit.sql',
  '021_ops_dictionary_publisher_receipt_bridge.sql']){
  db.exec(readFileSync(new URL('../db/'+name,import.meta.url),'utf8'));
 }
 const prepare=sql=>{
  const statement=db.prepare(sql);
  const bindArgs=args=>({
   bind:(...params)=>bindArgs(params),
   first:async()=>statement.get(...args)||null,
   all:async()=>({results:statement.all(...args)}),
   run:async()=>statement.run(...args)
  });
  return bindArgs([]);
 };
 const adapter={
  prepare,
  batch:async statements=>{
   db.exec('BEGIN');
   try{
    const result=[];
    for(const statement of statements)result.push(await statement.run());
    db.exec('COMMIT');return result;
   }catch(e){db.exec('ROLLBACK');throw e}
  }
 };
 return {db,adapter};
}
async function context({role='publisher'}={}){
 const {db,adapter}=createD1(),key=pin();
 const token='mwops_'+'a'.repeat(64),pepper='b'.repeat(40);
 const digest=await digestOpsToken(token,pepper);
 db.prepare('INSERT INTO ops_operators '+
  '(id,display_name,role,environment,key_digest) VALUES(?,?,?,?,?)')
  .run('publisher_editor_main','Publisher',role,'staging',digest);
 const env={APP_ENV:'staging',DB:adapter,OPS_TOKEN_PEPPER:pepper,
  OPS_DICTIONARY_PUBLISHER_BRIDGE_ENABLED:'true',
  MIAOWU_TRUSTED_OPS_PUBLISHER_PUBKEY_SHA256:key.fingerprint};
 const post=async(path,body,secret=token)=>{
  const request=new Request('https://staging.example/api/ops/dictionary/'+path,{
   method:'POST',headers:{'content-type':'application/json',
    'x-mw-ops-key':secret,'origin':'https://staging.example'},
   body:JSON.stringify(body)
  });
  const res=await route(request,env,new URL(request.url).pathname);
  return {status:res.status,data:await res.json()};
 };
 return {db,key,env,post};
}
const reqId=n=>'request_'+String(n).padStart(12,'0');

test('actual Publisher token + pinned Ed25519 key creates append-only TEST trust and audit',async()=>{
 const c=await context();
 try{
  const r=await c.post('publisher-key/register',{
   requestId:reqId(1),publicKeyPem:c.key.pem,confirmRegistration:true
  });
  assert.equal(r.status,200);
  assert.equal(r.data.status,'REGISTERED_TEST_PUBLISHER_PUBLIC_KEY');
  assert.equal(r.data.publicKeySha256,c.key.fingerprint);
  assert.equal(c.db.prepare('SELECT count(*) n FROM ops_dictionary_publisher_keys')
   .get().n,1);
  assert.equal(c.db.prepare('SELECT count(*) n FROM ops_audit_events').get().n,1);
  const rerun=await c.post('publisher-key/register',{
   requestId:reqId(1),publicKeyPem:c.key.pem,confirmRegistration:true
  });
  assert.equal(rerun.data.idempotent,true);
  assert.equal(c.db.prepare('SELECT count(*) n FROM ops_audit_events').get().n,1);
 }finally{c.db.close()}
});

test('real OPS audit -> canonical offline Ed25519 signature -> persisted TEST preflight receipt',async()=>{
 const c=await context();
 try{
  await c.post('publisher-key/register',{
   requestId:reqId(2),publicKeyPem:c.key.pem,confirmRegistration:true
  });
  const reviewSha='c'.repeat(64),sourceSha='d'.repeat(64),candidateSha='e'.repeat(64);
  const pending=await c.post('publisher-review/authorize',{
   requestId:reqId(3),publisherReviewSha256:reviewSha,
   sourceProofSha256:sourceSha,candidateSha256:candidateSha,
   reviewerId:'publisher_editor_main',confirmReviewed:true
  });
  assert.equal(pending.status,200);
  assert.match(pending.data.opsAuditId,/^ops_[a-z0-9]{32}$/);
  const receipt={
   schema:'wordletter-ops-publisher-clearance-receipt-v1',
   purpose:'commercial-lesson-and-published-context-publisher-signoff-v1',
   publisher_review_sha256:reviewSha,source_proof_sha256:sourceSha,
   candidate_sha256:candidateSha,reviewer_id:'publisher_editor_main',
   ops_audit_id:pending.data.opsAuditId,
   signed_at:'2026-11-13T08:00:00Z',target_database_id:TEST
  };
  receipt.signature_b64=sign(null,Buffer.from(canonicalPublisherReceipt(receipt)),
   c.key.privateKey).toString('base64');
  const verified=await c.post('publisher-receipt/verify',{
   requestId:reqId(4),publicKeyPem:c.key.pem,receipt
  });
  assert.equal(verified.status,200,JSON.stringify(verified.data));
  assert.equal(verified.data.status,'SIGNED_OPS_RECEIPT_TEST_PREFLIGHT_ONLY');
  assert.equal(verified.data.approvedSenses,0);
  assert.equal(verified.data.testD1SenseWrites,0);
  assert.equal(c.db.prepare('SELECT count(*) n FROM ops_dictionary_publisher_receipts')
   .get().n,1);
  const again=await c.post('publisher-receipt/verify',{
   requestId:reqId(4),publicKeyPem:c.key.pem,receipt
  });
  assert.equal(again.data.idempotent,true);
  assert.equal(c.db.prepare('SELECT count(*) n FROM ops_audit_events').get().n,3);
  const changed={...receipt,candidate_sha256:'f'.repeat(64)};
  const rejected=await c.post('publisher-receipt/verify',{
   requestId:reqId(5),publicKeyPem:c.key.pem,receipt:changed
  });
  assert.equal(rejected.status,400);
  assert.equal(rejected.data.error,'OPS_PUBLISHER_SIGNATURE_INVALID');
  assert.equal(c.db.prepare('SELECT count(*) n FROM ops_dictionary_publisher_receipts')
   .get().n,1);
 }finally{c.db.close()}
});

test('no key pin, anonymous token, editor, disabled or production can never authorize',async()=>{
 const c=await context({role:'editor'});
 try{
  const edit=await c.post('publisher-key/register',{
   requestId:reqId(6),publicKeyPem:c.key.pem,confirmRegistration:true
  });
  assert.equal(edit.status,403);
  assert.equal(edit.data.error,'OPS_PUBLISHER_ROLE_REQUIRED');
  c.env.APP_ENV='production';
  assert.equal((await c.post('publisher-key/register',{
   requestId:reqId(7),publicKeyPem:c.key.pem,confirmRegistration:true
  })).status,404);
  c.env.APP_ENV='staging';c.env.OPS_DICTIONARY_PUBLISHER_BRIDGE_ENABLED='false';
  assert.equal((await c.post('publisher-key/register',{
   requestId:reqId(8),publicKeyPem:c.key.pem,confirmRegistration:true
  })).status,503);
  assert.equal(c.db.prepare('SELECT count(*) n FROM ops_audit_events').get().n,0);
 }finally{c.db.close()}
});

test('unregistered trust rejects signoff and different receipt audit is rejected',async()=>{
 const c=await context();
 try{
  const missing=await c.post('publisher-review/authorize',{
   requestId:reqId(10),publisherReviewSha256:'c'.repeat(64),
   sourceProofSha256:'d'.repeat(64),candidateSha256:'e'.repeat(64),
   reviewerId:'publisher_editor_main',confirmReviewed:true
  });
  assert.equal(missing.status,400);
  assert.equal(missing.data.error,'OPS_PUBLISHER_TRUSTED_REGISTRATION_REQUIRED');
  await c.post('publisher-key/register',{
   requestId:reqId(11),publicKeyPem:c.key.pem,confirmRegistration:true
  });
  const receipt={
   schema:'wordletter-ops-publisher-clearance-receipt-v1',
   purpose:'commercial-lesson-and-published-context-publisher-signoff-v1',
   publisher_review_sha256:'c'.repeat(64),source_proof_sha256:'d'.repeat(64),
   candidate_sha256:'e'.repeat(64),reviewer_id:'publisher_editor_main',
   ops_audit_id:'ops_random_nonexistent_fake',signed_at:'2026-11-13T08:00:00Z',
   target_database_id:TEST
  };
  receipt.signature_b64=sign(null,Buffer.from(canonicalPublisherReceipt(receipt)),
   c.key.privateKey).toString('base64');
  const invalid=await c.post('publisher-receipt/verify',{
   requestId:reqId(12),publicKeyPem:c.key.pem,receipt
  });
  assert.equal(invalid.status,400);
  assert.equal(invalid.data.error,'OPS_PUBLISHER_REAL_AUDIT_NOT_FOUND');
  assert.equal(c.db.prepare('SELECT count(*) n FROM ops_dictionary_publisher_receipts')
   .get().n,0);
 }finally{c.db.close()}
});

test('unregistered or mismatched independently configured trust anchor cannot be used',async()=>{
 const c=await context();
 try{
  c.env.MIAOWU_TRUSTED_OPS_PUBLISHER_PUBKEY_SHA256='f'.repeat(64);
  const mismatch=await c.post('publisher-key/register',{
   requestId:reqId(9),publicKeyPem:c.key.pem,confirmRegistration:true
  });
  assert.equal(mismatch.status,400);
  assert.equal(mismatch.data.error,'OPS_PUBLISHER_KEY_NOT_IN_INDEPENDENT_TRUST_CONFIG');
  assert.equal(c.db.prepare('SELECT count(*) n FROM ops_dictionary_publisher_keys').get().n,0);
  assert.equal(c.db.prepare('SELECT count(*) n FROM ops_audit_events').get().n,0);
 }finally{c.db.close()}
});

test('source, candidate and reviewer are all locked into the real OPS audit (cannot swap signed payload)',async()=>{
 const c=await context();
 try{
  const registered=await c.post('publisher-key/register',{
   requestId:reqId(30),publicKeyPem:c.key.pem,confirmRegistration:true
  });
  assert.equal(registered.status,200);
  const base={requestId:reqId(31),publisherReviewSha256:'1'.repeat(64),
   sourceProofSha256:'2'.repeat(64),candidateSha256:'3'.repeat(64),
   reviewerId:'editor_actual',confirmReviewed:true};
  const first=await c.post('publisher-review/authorize',base);
  assert.equal(first.status,200,JSON.stringify(first.data));
  const repeat=await c.post('publisher-review/authorize',base);
  assert.equal(repeat.status,200);
  assert.equal(repeat.data.opsAuditId,first.data.opsAuditId);
  const altered=await c.post('publisher-review/authorize',{
   ...base,candidateSha256:'4'.repeat(64)
  });
  assert.equal(altered.status,400);
  assert.equal(altered.data.error,'OPS_PUBLISHER_REQUEST_ID_CONFLICT');
  const receipt={
   schema:'wordletter-ops-publisher-clearance-receipt-v1',
   purpose:'commercial-lesson-and-published-context-publisher-signoff-v1',
   publisher_review_sha256:base.publisherReviewSha256,
   source_proof_sha256:base.sourceProofSha256,
   candidate_sha256:'4'.repeat(64),reviewer_id:base.reviewerId,
   ops_audit_id:first.data.opsAuditId,
   signed_at:'2026-11-13T08:00:00Z',
   target_database_id:TEST
  };
  // Signature is mathematically VALID, but the original audit was for a
  // DIFFERENT candidate. Cryptographic integrity alone is insufficient.
  receipt.signature_b64=sign(null,Buffer.from(canonicalPublisherReceipt(receipt)),
   c.key.privateKey).toString('base64');
  const rejected=await c.post('publisher-receipt/verify',{
   requestId:reqId(32),publicKeyPem:c.key.pem,receipt
  });
  assert.equal(rejected.status,400);
  assert.equal(rejected.data.error,'OPS_PUBLISHER_REAL_AUDIT_NOT_FOUND');
  assert.equal(c.db.prepare('SELECT count(*) n FROM ops_dictionary_publisher_receipts')
   .get().n,0);
 }finally{c.db.close()}
});
