import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('P5 rights reconciliation is an aggregate read-only report and flags legacy anomalies',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const file of ['db/001_schema.sql','db/002_s1.sql',
   'db/003_public_categories.sql','db/007_ops_identity_audit.sql',
   'db/production/007_self_service_claims.sql'])db.exec(read(file));
  db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES"+
   "('u1','reader-a','fakehash','fakesalt'),('u2','reader-b','fakehash','fakesalt')");
  db.exec("INSERT INTO activation_codes(id,code_hash,category_id,status,redeemed_by) VALUES"+
   "('a1','fakehash1','cet4','revoked','u1'),"+
   "('a2','fakehash2','cet6','redeemed','u1'),"+
   "('a3','fakehash3','cet4','unused','u1'),"+
   "('a4','fakehash4','cet6','redeemed',NULL)");
  db.exec("INSERT INTO entitlements(user_id,category_id,source_code_id) VALUES"+
   "('u1','cet4','a1'),('u1','cet6','a2'),('u2','cet6','a3')");
  db.exec("INSERT INTO self_service_claims(id,order_reference,code_id,category_id,requester_digest,review_status) VALUES"+
   "('claim-1','ORDER-PRIVATE','a1','cet4','test-ip-hash','verified')");
  const original={
   codes:db.prepare('SELECT COUNT(*) n FROM activation_codes').get().n,
   grants:db.prepare('SELECT COUNT(*) n FROM entitlements').get().n,
   claims:db.prepare('SELECT COUNT(*) n FROM self_service_claims').get().n
  };
  const sql=read('docs/v11-p5-rights-reconciliation-readonly.sql');
  const found=Object.fromEntries(db.prepare(sql).all().map(x=>[x.metric,x.affected]));
  assert.deepEqual(found,{
   active_grant_revoked_source:1,
   active_grant_nonredeemed_source:2,
   grant_owner_mismatch:1,
   grant_category_mismatch:1,
   redeemed_code_without_live_matching_grant:0,
   redeemed_code_without_reader:1,
   unused_code_with_reader:1,
   verified_claim_on_revoked_code:1
  });
  const serialized=JSON.stringify(found);
  for(const secret of ['ORDER-PRIVATE','fakehash','reader-a','reader-b','test-ip-hash'])
   assert.ok(!serialized.includes(secret));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM activation_codes').get().n,original.codes);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM entitlements').get().n,original.grants);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM self_service_claims').get().n,original.claims);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close()}
});

test('P5 rights report returns zero anomalies for a consistent one-order-one-grant scenario',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const file of ['db/001_schema.sql','db/002_s1.sql','db/003_public_categories.sql',
   'db/007_ops_identity_audit.sql','db/production/007_self_service_claims.sql'])db.exec(read(file));
  db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES('u1','ok-reader','x','y')");
  db.exec("INSERT INTO activation_codes(id,code_hash,category_id,status,redeemed_by) VALUES"+
   "('ok1','hash-ok','cet4','redeemed','u1')");
  db.exec("INSERT INTO entitlements(user_id,category_id,source_code_id) VALUES('u1','cet4','ok1')");
  const data=db.prepare(read('docs/v11-p5-rights-reconciliation-readonly.sql')).all();
  assert.ok(data.length>=7);
  assert.ok(data.every(r=>r.affected===0),JSON.stringify(data));
 }finally{db.close()}
});
