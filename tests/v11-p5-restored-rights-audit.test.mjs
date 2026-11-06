import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newFixture} from "../scripts/rehearse-v11-migrations.mjs";
import {rehearseV11BackupRestore} from "../scripts/rehearse-v11-backup-restore.mjs";
import {auditRestoredRights,compareRestoredRights} from "../scripts/v11-restored-rights-audit.mjs";

const read=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");

test("P5 legacy backup without self-service table reports partial rights audit, not a false all-clear",()=>{
 const db=newFixture();
 try{
  const r=auditRestoredRights(db);
  assert.equal(r.status,"SEVEN_METRICS_CLAIMS_TABLE_NOT_PRESENT");
  assert.equal(r.claimsAuditAvailable,false);
  assert.equal(r.counts.verified_claim_on_revoked_code,null);
  assert.equal(r.manualReviewRequired,true);
  assert.equal(r.rowsOrCustomerIdentifiersReturned,false);
  assert.equal(r.productionReleaseApproved,false);
  assert.equal(Object.keys(r.counts).length,8);
 }finally{db.close()}
});
test("P5 eight rights findings show counts, never customer IDs or code hashes, and leave DB unchanged",()=>{
 const db=newFixture();
 try{
  db.exec(read("db/production/007_self_service_claims.sql"));
  db.prepare("UPDATE entitlements SET source_code_id=? WHERE user_id=?").run("code-1","old-1");
  db.prepare("UPDATE activation_codes SET status='revoked' WHERE id='code-1'").run();
  db.prepare("INSERT INTO self_service_claims(id,order_reference,code_id,category_id,requester_digest,review_status) "+
   "VALUES(?,?,?,?,?,'verified')").run("claim-test","private-order-test","code-1","cet4","ip-digest-test");
  const before=db.prepare("SELECT status FROM activation_codes WHERE id='code-1'").get();
  const grants=db.prepare("SELECT COUNT(*) n FROM entitlements").get().n;
  db.exec("PRAGMA query_only=ON");
  const result=auditRestoredRights(db);
  assert.equal(result.status,"EIGHT_METRICS_COMPLETE");
  assert.equal(result.claimsAuditAvailable,true);
  assert.equal(result.counts.active_grant_revoked_source,1);
  assert.equal(result.counts.active_grant_nonredeemed_source,1);
  assert.equal(result.counts.verified_claim_on_revoked_code,1);
  assert.equal(result.manualReviewRequired,true);
  assert.equal(result.productionDatabaseModified,false);
  assert.ok(result.reviewMetrics.includes("active_grant_revoked_source"));
  for(const forbidden of ["private-order-test","ip-digest-test","code-1","old-reader"])
   assert.ok(!JSON.stringify(result).includes(forbidden));
  assert.deepEqual(db.prepare("SELECT status FROM activation_codes WHERE id='code-1'").get(),before);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM entitlements").get().n,grants);
 }finally{db.close()}
});
test("P5 independent restore/migration confirms rights counts stable without resolving abnormalities",async()=>{
 const result=await rehearseV11BackupRestore({fixture:true});
 assert.equal(result.restoredRightsCountsPreserved,true);
 assert.equal(result.restoredRightsAudit.status,"SEVEN_METRICS_CLAIMS_TABLE_NOT_PRESENT");
 assert.equal(result.restoredRightsAudit.manualReviewRequired,true);
 assert.equal(result.realOrdersAndAccountsHumanReviewed,false);
 assert.equal(result.actualCloudflareTimeTravelRestoreVerified,false);
 assert.equal(result.productionDatabaseModified,false);
});
test("P5 flags a changed rights snapshot, refusing to call a drifted migration consistent",()=>{
 const db=newFixture();
 try{
  const a=auditRestoredRights(db);
  const b={...a,counts:{...a.counts,unused_code_with_reader:1}};
  assert.throws(()=>compareRestoredRights(a,b),/RESTORE_RIGHTS_COUNTS_CHANGED/);
  assert.equal(compareRestoredRights(a,a).rightCountsPreserved,true);
 }finally{db.close()}
});
test("P5 audit fails closed on missing core tables and keeps SQL read-only",()=>{
 const db=newFixture();
 try{
  db.exec("DROP TABLE activation_codes");
  assert.throws(()=>auditRestoredRights(db),/RIGHTS_AUDIT_REQUIRED_TABLE_MISSING_ACTIVATION_CODES/);
 }finally{db.close()}
 const sql=read("docs/v11-p5-rights-reconciliation-readonly.sql").replace(/--[^\n]*/g,"");
 assert.match(sql.trim(),/^SELECT/);
 assert.doesNotMatch(sql,/\b(?:CREATE|UPDATE|DELETE|INSERT|REPLACE|DROP|ALTER|ATTACH|PRAGMA)\b/i);
});
