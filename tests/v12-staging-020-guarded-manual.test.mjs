import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifySense020Preflight} from '../scripts/verify-staging-020-post019-baseline.mjs';
import {verifySense020After} from '../scripts/verify-staging-020-postmigration.mjs';
const wf=readFileSync('.github/workflows/v12-sense-020-staging-manual-migrate.yml','utf8');
const packet=results=>JSON.stringify([{success:true,results}]);
function row(phase='before',override={}){
 return {dictionary_tables:10,dictionary_guard_triggers:5,core_tables:4,
   headword_019_tables:2,headword_019_indexes:2,
   sense_020_tables:phase==='before'?0:2,
   sense_020_indexes:phase==='before'?0:2,
   sense_020_triggers:phase==='before'?0:3,
   sense_study_rows:0,sense_events_rows:0,
   headword_study_rows:0,headword_events_rows:0,
   candidate_heads:61422,candidate_forms:16442,
   upstream_heads:61422,other_heads:0,upstream_forms:16442,other_forms:0,
   source_registry_intact:1,approved_senses:0,teaching_ready:0,active_sources:0,approved_lessons:0,
   old_books:4,old_chapters:20,old_words:59,old_user_words:9,old_review_events:12,
   old_entitlements:2,old_activation_codes:1,old_chapter_words:262,old_reading_progress:3,
   ...override};
}
const before=verifySense020Preflight({countsJson:packet([row()]),fkJson:packet([]),
 quickJson:packet([{quick_check:'ok'}])});
const after=(changes={},fk=[],quick=[{quick_check:'ok'}])=>
 verifySense020After({countsJson:packet([row('after',changes)]),fkJson:packet(fk),
 quickJson:packet(quick),before});
test('020 exact 7-object schema and original legacy counts pass',()=>{
 const result=after();
 assert.equal(result.status,'SENSE_020_STAGING_SCHEMA_APPLIED_VERIFIED');
 assert.equal(result.new_tables,2);
 assert.equal(result.new_indexes,2);
 assert.equal(result.new_approval_triggers,3);
 assert.equal(result.legacy_aggregate_counts_preserved,true);
});
test('never accept missing objects, extra study writes, old access changes or bad FK',()=>{
 for(const [key,val] of Object.entries({sense_020_tables:1,
   sense_020_indexes:1,sense_020_triggers:2,sense_events_rows:1,
   sense_study_rows:1,old_user_words:8,old_entitlements:1,
   candidate_heads:61420,headword_study_rows:1,approved_senses:1}))
  assert.throws(()=>after({[key]:val}),/SENSE_020_/);
 assert.throws(()=>after({},[{table:'user_words'}]),/SENSE_020_POST_FK_ERROR/);
 assert.throws(()=>after({},[],[{quick_check:'error'}]),/SENSE_020_POST_INTEGRITY_ERROR/);
});
test('020 manual workflow is branch-locked test-only and requires explicit post019 encrypted backup',()=>{
 assert.match(wf,/on:\n  workflow_dispatch:/);
 assert.doesNotMatch(wf,/\n  push:|\n  pull_request:/);
 for(const required of [
  "github.repository == 'kim-1868/miaowu-english'",
  "github.actor == 'kim-1868'",
  "github.ref == 'refs/heads/feature/v11-smart-vocab-preflight-20261109'",
  "staging-d1-schema-approval","STAGING_020_SENSE_ADD_ONLY",
  "SCHEMA_ONLY_020_SENSE_SRS_DISABLED",
  "88a817cb-23bb-4ae4-bcb8-92286c4165d4",
  "ENCRYPTED_BACKUP_SAVED_OFF_GITHUB",
  "v12-sense-020-post019-encrypted-backup.yml",
  "v12-staging-020-post019-encrypted-full-backup",
  "STAGING_020_FRESH_BACKUP_REQUIRED_WITHIN_24_HOURS",
  "scripts/rehearse-sense-020.mjs",
  "scripts/verify-staging-020-postmigration.mjs before",
  "scripts/verify-staging-020-postmigration.mjs after",
  "PRAGMA foreign_key_check;","PRAGMA quick_check;",
  "--file db/020_global_dictionary_sense_study.sql",
  "d1 time-travel info miaowu-english-test",
  "NO_PRODUCTION_DEPLOYMENT_SENSE_LEVEL_ACTIVATION_STILL_BLOCKED"
 ])assert.ok(wf.includes(required),'missing exact test-only gate '+required);
 assert.equal((wf.match(/--file db\/020_global_dictionary_sense_study\.sql/g)||[]).length,1);
 assert.doesNotMatch(wf,/wrangler (?:deploy|publish)|d1 migrations apply|miaowu-english-prod/);
});
