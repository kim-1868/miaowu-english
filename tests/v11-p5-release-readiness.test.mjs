import {test} from "node:test";
import assert from "node:assert/strict";
import {checkV11ReleaseReadiness} from "../scripts/v11-release-readiness.mjs";
import {readFileSync} from "node:fs";
const sha="a".repeat(40),otherSha="b".repeat(40),digest="d".repeat(64);
function completeEvidence(){
 return {version:1,candidateSha:sha,entries:{
  real_production_backup:{databaseId:"649c71b3-340c-49bf-b806-3d39256851d3",
   backupSha256:digest,capturedAt:"2026-11-06T12:00:00Z",
   sourceVerified:true,method:"trusted_sql_export"},
  independent_real_backup_restore:{databaseId:"649c71b3-340c-49bf-b806-3d39256851d3",
   backupSha256:digest,verifiedAt:"2026-11-06T13:00:00Z",
   diskRestoreVerified:true,migrations009to013Passed:true,
   legacyRowsPreserved:true,rightsCountsPreserved:true,usedRealBackup:true},
  production_schema_and_rights_audit:{databaseId:"649c71b3-340c-49bf-b806-3d39256851d3",
   reviewedAt:"2026-11-06T13:10:00Z",schemaInspectedReadOnly:true,
   rightsExceptionsReviewed:true,publishedContentSampleReviewed:true},
  editorial_sense_review:{candidateSha:sha,reviewedAt:"2026-11-06T14:00:00Z",
   sameSenseAliasesReviewed:true,polysemyReviewed:true,legacyWordIdsPreserved:true},
  ops_order_and_activation_acceptance:{candidateSha:sha,testedAt:"2026-11-06T14:05:00Z",
   issue:true,claim:true,redeem:true,revoke:true,restore:true,recovery:true,category_entitlement:true},
  reader_cross_device_acceptance:{candidateSha:sha,testedAt:"2026-11-06T14:10:00Z",
   iphoneSafari:true,android:true,paidWall:true,crossBookMastery:true,threeReviewGames:true,audio:true},
  rollback_plan:{candidateSha:sha,preparedAt:"2026-11-06T14:20:00Z",
   previousWorkerSha:"c".repeat(40),previousPagesSha:"d".repeat(40),
   rollbackOwnerConfirmed:true,postBackupWritesRiskReviewed:true}
 }};
}
test("P5 no evidence is BLOCKED, even when staging/production config static checks pass",()=>{
 const r=checkV11ReleaseReadiness({candidateSha:sha});
 assert.equal(r.status,"BLOCKED_PRE_RELEASE");
 assert.equal(r.stagingAndProductionConfigStaticCheckPassed,true,JSON.stringify(r.blockers));
 assert.equal(r.missingOrInvalidEvidence.length,7);
 assert.equal(r.productionReleaseApproved,false);
 assert.equal(r.permissionToDeployProduction,false);
 assert.equal(r.productionDatabaseAccessed,false);
 assert.deepEqual(r.blockers.filter(x=>x.startsWith("REQUIRED_EVIDENCE_")).length,7);
});
test("P5 full metadata is still NOT an approval, a restored backup or actual signed evidence",()=>{
 const e=completeEvidence();
 const r=checkV11ReleaseReadiness({candidateSha:sha,evidence:e});
 assert.equal(r.status,"METADATA_COMPLETE_REQUIRES_INDEPENDENT_VERIFICATION");
 assert.equal(r.blockers.length,0);
 assert.equal(r.productionReleaseApproved,false);
 assert.equal(r.permissionToDeployProduction,false);
 assert.equal(r.productionDatabaseAccessed,false);
 assert.ok(Object.values(r.evidenceMetadata).every(x=>x==="METADATA_RECORDED_UNVERIFIED"));
});
test("P5 mismatch between candidate SHA and reviewed human/ops/device/rollback inputs blocks",()=>{
 const e=completeEvidence();
 e.entries.editorial_sense_review.candidateSha=otherSha;
 e.entries.reader_cross_device_acceptance.candidateSha=otherSha;
 e.entries.rollback_plan.candidateSha=otherSha;
 const r=checkV11ReleaseReadiness({candidateSha:sha,evidence:e});
 assert.equal(r.status,"BLOCKED_PRE_RELEASE");
 assert.ok(r.missingOrInvalidEvidence.includes("editorial_sense_review"));
 assert.ok(r.missingOrInvalidEvidence.includes("reader_cross_device_acceptance"));
 assert.ok(r.missingOrInvalidEvidence.includes("rollback_plan"));
});
test("P5 mismatched backup checksum, wrong DB UUID or invented ownerApproval is blocked",()=>{
 const e=completeEvidence();
 e.entries.independent_real_backup_restore.backupSha256="e".repeat(64);
 e.entries.production_schema_and_rights_audit.databaseId="88a817cb-23bb-4ae4-bcb8-92286c4165d4";
 e.ownerApproval={approved:true,candidateSha:sha};
 const r=checkV11ReleaseReadiness({candidateSha:sha,evidence:e});
 assert.ok(r.blockers.includes("APPROVAL_CANNOT_BE_GRANTED_BY_EVIDENCE_FILE"));
 assert.ok(r.missingOrInvalidEvidence.includes("independent_real_backup_restore"));
 assert.ok(r.missingOrInvalidEvidence.includes("production_schema_and_rights_audit"));
});
test("P5 release gate rejects invalid or missing SHA even when evidence has one",()=>{
 assert.equal(checkV11ReleaseReadiness({candidateSha:"latest",evidence:completeEvidence()}).status,"BLOCKED_PRE_RELEASE");
 assert.ok(checkV11ReleaseReadiness({candidateSha:null}).blockers.includes("CANDIDATE_SHA_NOT_PINNED"));
 assert.ok(checkV11ReleaseReadiness({candidateSha:sha,evidence:{...completeEvidence(),candidateSha:otherSha}}).
  blockers.includes("EVIDENCE_SCHEMA_OR_SHA_MISMATCH"));
});
test("P5 config pinning rejects staging-production D1 sharing or public Worker routing",()=>{
 const staging=JSON.parse(readFileSync(new URL("../wrangler.jsonc",import.meta.url),"utf8"));
 const prod=JSON.parse(readFileSync(new URL("../deploy/production.wrangler.jsonc",import.meta.url),"utf8"));
 staging.d1_databases[0].database_id=prod.d1_databases[0].database_id;
 const r=checkV11ReleaseReadiness({candidateSha:sha,evidence:completeEvidence(),stagingConfig:staging});
 assert.equal(r.stagingAndProductionConfigStaticCheckPassed,false);
 assert.ok(r.blockers.includes("CONFIG_STAGING_D1_MUST_BE_TEST_ONLY"));
 assert.ok(r.blockers.includes("CONFIG_STAGING_MUST_NOT_SHARE_PRODUCTION_D1"));
 const modifiedProd={...prod,workers_dev:true};
 const r2=checkV11ReleaseReadiness({candidateSha:sha,evidence:completeEvidence(),productionConfig:modifiedProd});
 assert.ok(r2.blockers.includes("CONFIG_PUBLIC_WORKERS_DEV_NOT_DISABLED"));
});
test("P5 report never emits private evidence identifiers or mistakenly grants release authority",()=>{
 const e=completeEvidence();
 e.orderReference="PRIVATE-ORDER-123";
 e.entries.ops_order_and_activation_acceptance.operatorName="SECRET-OPERATOR";
 e.entries.real_production_backup.privateStoragePath="/secret/d1-backup.sql";
 const out=JSON.stringify(checkV11ReleaseReadiness({candidateSha:sha,evidence:e}));
 assert.doesNotMatch(out,/PRIVATE-ORDER|SECRET-OPERATOR|d1-backup\.sql/);
 assert.match(out,/"productionReleaseApproved":false/);
});
test("P5 release gate source cannot request Cloudflare or execute remote migration",()=>{
 const source=readFileSync(new URL("../scripts/v11-release-readiness.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/\b(?:fetch|execSync|spawn|system|child_process)\s*\(/);
 assert.doesNotMatch(source,/\bwrangler\s+d1\b|--remote|CLOUDFLARE_API_TOKEN/);
});
