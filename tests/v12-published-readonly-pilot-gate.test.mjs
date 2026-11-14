import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPublishedReadOnlyPilot} from '../scripts/assess-published-readonly-pilot.mjs';
const good={scope:'published-only',published_books:32,published_anchor_occurrences:8444,
 approved_context_anchors:80,blocked_context_anchors:20,unmatched_context_anchors:8344,
 current_publisher_snapshot_verified:true,approved_sources_license_checked:true,
 legacy_card_sha256_verified:true,staging_readonly_entitlement_qa_passed:true,
 writes_enabled:false,production_deployed:false};
test('independently verified approved subset can pilot READ ONLY with legacy fallback',()=>{
 const x=assessPublishedReadOnlyPilot(good);
 assert.equal(x.status,'STAGING_READONLY_PILOT_ELIGIBLE_NOT_DEPLOYED');
 assert.equal(x.legacy_fallback_anchors,8364);
 assert.equal(x.enable_srs_write,false);
 assert.equal(x.enable_production,false);
 assert.equal(x.convert_legacy_study_state,false);
});
test('zero approved anchors cannot be called launched',()=>{
 const x=assessPublishedReadOnlyPilot({...good,approved_context_anchors:0,
  unmatched_context_anchors:8424});
 assert.equal(x.status,'STAGING_READONLY_PILOT_BLOCKED');
 assert.ok(x.blockers.includes('NO_APPROVED_CONTEXT_ANCHORS'));
});
test('unverified rights, context, fingerprints or QA block the read-only pilot',()=>{
 for(const key of ['current_publisher_snapshot_verified','approved_sources_license_checked',
  'legacy_card_sha256_verified','staging_readonly_entitlement_qa_passed']){
  assert.equal(assessPublishedReadOnlyPilot({...good,[key]:false}).status,
   'STAGING_READONLY_PILOT_BLOCKED');
 }
 assert.equal(assessPublishedReadOnlyPilot({...good,writes_enabled:true}).enable_srs_write,false);
 assert.equal(assessPublishedReadOnlyPilot({...good,production_deployed:true}).status,
  'STAGING_READONLY_PILOT_BLOCKED');
});
test('changed publisher baseline or malformed counts cannot silently pass',()=>{
 assert.ok(assessPublishedReadOnlyPilot({...good,published_books:31}).blockers.length);
 assert.throws(()=>assessPublishedReadOnlyPilot({...good,approved_context_anchors:81}),
  /ANCHOR_PARTITION_MISMATCH/);
 assert.throws(()=>assessPublishedReadOnlyPilot({...good,approved_context_anchors:-1}),
  /INVALID_APPROVED_CONTEXT_ANCHORS/);
});
