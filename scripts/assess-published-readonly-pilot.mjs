// No DB access or private manuscript input. Decide whether an anonymized
// published-book verification report supports a staging read-only pilot.
// This tool deliberately NEVER authorizes SRS writes or production rollout.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const nat=(value,name)=>{
 assert.ok(Number.isSafeInteger(value)&&value>=0,`INVALID_${name}`);
 return value;
};
export function assessPublishedReadOnlyPilot(input){
 assert.equal(input?.scope,'published-only');
 const books=nat(input.published_books,'PUBLISHED_BOOKS');
 const anchors=nat(input.published_anchor_occurrences,'PUBLISHED_ANCHORS');
 const approved=nat(input.approved_context_anchors,'APPROVED_CONTEXT_ANCHORS');
 const blocked=nat(input.blocked_context_anchors,'BLOCKED_CONTEXT_ANCHORS');
 const unmatched=nat(input.unmatched_context_anchors,'UNMATCHED_CONTEXT_ANCHORS');
 assert.equal(approved+blocked+unmatched,anchors,'ANCHOR_PARTITION_MISMATCH');
 const baseVerified=books===32&&anchors===8444;
 const freshSnapshot=input.current_publisher_snapshot_verified===true;
 const licenseVerified=input.approved_sources_license_checked===true;
 const currentCardHashes=input.legacy_card_sha256_verified===true;
 const readOnlyRegression=input.staging_readonly_entitlement_qa_passed===true;
 const noWrites=input.writes_enabled===false&&input.production_deployed===false;
 const accepted=baseVerified&&freshSnapshot&&licenseVerified&&currentCardHashes&&
  readOnlyRegression&&noWrites&&approved>0;
 const blockers=[];
 if(!baseVerified)blockers.push('PUBLISHER_BASELINE_CHANGED_REAUDIT');
 if(!freshSnapshot)blockers.push('CURRENT_PUBLISHER_CONTEXT_NOT_VERIFIED');
 if(!licenseVerified)blockers.push('COMMERCIAL_LICENSE_NOT_VERIFIED');
 if(!currentCardHashes)blockers.push('LEGACY_CARD_FINGERPRINT_NOT_VERIFIED');
 if(!readOnlyRegression)blockers.push('STAGING_ENTITLEMENT_READONLY_QA_NOT_PASSED');
 if(!noWrites)blockers.push('WRITE_OR_PRODUCTION_STATE_UNSAFE');
 if(!approved)blockers.push('NO_APPROVED_CONTEXT_ANCHORS');
 return Object.freeze({
  status:accepted?'STAGING_READONLY_PILOT_ELIGIBLE_NOT_DEPLOYED':'STAGING_READONLY_PILOT_BLOCKED',
  published_books:books,published_anchor_occurrences:anchors,
  approved_context_anchors:approved,blocked_context_anchors:blocked,
  legacy_fallback_anchors:blocked+unmatched,
  approved_coverage_percent:Number((100*approved/(anchors||1)).toFixed(2)),
  blockers,
  // Never infer permission to change live data from an aggregate report.
  enable_production:false,enable_srs_write:false,convert_legacy_study_state:false,
  editorial_approval_created:0,remote_db_writes:0
 });
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 try{
  assert.equal(process.argv.length,3,'USAGE_NODE_SCRIPT_REPORT_JSON');
  const result=assessPublishedReadOnlyPilot(JSON.parse(readFileSync(process.argv[2],'utf8')));
  console.log(JSON.stringify(result));
  if(result.blockers.length)process.exitCode=2;
 }catch(error){console.error('PUBLISHED_PILOT_GATE_REJECTED',error.message);process.exitCode=1}
}
