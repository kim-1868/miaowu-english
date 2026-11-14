import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verify019Aggregate} from '../scripts/verify-staging-019-remote-aggregate.mjs';

const workflow=readFileSync('.github/workflows/v12-headword-staging-019-manual-migrate.yml','utf8');
const counted=(after=false,changes={})=>({
 dictionary_tables:10,dictionary_triggers:5,core_tables:4,
 headword_tables:after?2:0,headword_indexes:after?2:0,
 candidate_heads:61422,candidate_forms:16442,
 upstream_heads:61422,other_heads:0,upstream_forms:16442,other_forms:0,
 source_original_intact:1,approved_senses:0,teaching_ready:0,active_sources:0,
 approved_lessons:0,old_books:4,old_chapters:20,old_words:59,old_user_words:9,
 old_review_events:12,old_entitlements:2,old_activation_codes:1,
 old_chapter_words:262,old_reading_progress:3,...changes
});
const wrap=results=>JSON.stringify([{success:true,results}]);
const fk=wrap([]),quick=wrap([{quick_check:'ok'}]);
const check=(c,after=false,previous=null)=>verify019Aggregate({
 countJson:wrap([c]),fkJson:fk,quickJson:quick,after,previous
});
test('strict remote 61,422 candidate count and legacy aggregates are lossless',()=>{
 const pre=check(counted());
 assert.equal(pre.candidate_heads,61422);
 const post=check(counted(true),true,{legacy:pre.legacy});
 assert.equal(post.old_core_preserved,true);
 assert.equal(post.phase,'POST_019');
});
test('refuse invisible source/teaching publish or missing 019 and changed historical rows',()=>{
 const pre=check(counted());
 for(const field of ['candidate_heads','candidate_forms','dictionary_triggers',
 'source_original_intact','approved_senses','teaching_ready','active_sources',
 'approved_lessons','headword_tables']){
   const changed=counted(false,{[field]:999});
   assert.throws(()=>check(changed),/STAGING_019_/);
 }
 assert.throws(()=>check(counted(true,{old_user_words:8}),true,{legacy:pre.legacy}),
  /STAGING_019_LEGACY_AGGREGATES_CHANGED/);
 assert.throws(()=>check(counted(true,{old_entitlements:1}),true,{legacy:pre.legacy}),
  /STAGING_019_LEGACY_AGGREGATES_CHANGED/);
 assert.throws(()=>verify019Aggregate({countJson:wrap([counted()]),
  fkJson:wrap([{table:'user_words'}]),quickJson:quick}),
  /STAGING_019_FOREIGN_KEY_VIOLATIONS/);
});
test('manual-only, protected environment and exact staging DB guard',()=>{
 assert.match(workflow,/on:\n  workflow_dispatch:/);
 assert.doesNotMatch(workflow,/\n  push:|\n  pull_request:/);
 for(const required of [
 "github.repository == 'kim-1868/miaowu-english'",
 "github.actor == 'kim-1868'",
 "github.ref == 'refs/heads/feature/v11-smart-vocab-preflight-20261109'",
 "github.event_name == 'workflow_dispatch'",
 "staging-d1-schema-approval","STAGING_019_ADD_ONLY",
 "88a817cb-23bb-4ae4-bcb8-92286c4165d4",
 "ENCRYPTED_BACKUP_SAVED_OFF_GITHUB","SCHEMA_ONLY_SENSE_SRS_DISABLED",
 "v12-headword-staging-019-encrypted-backup.yml",
 "v12-staging-019-encrypted-full-backup",
 "STAGING_019_BACKUP_COMMIT_NOT_ANCESTOR",
 'compare/$backup_sha...$GITHUB_SHA',
 "STAGING_019_FRESH_BACKUP_REQUIRED_WITHIN_24_HOURS",
 "assert.notEqual(cfg.vars.GLOBAL_DICTIONARY_HEADWORD_SRS_ENABLED,'true')",
 "assert.notEqual(cfg.vars.GLOBAL_DICTIONARY_HEADWORD_SRS_WRITE_ENABLED,'true')",
 "scripts/rehearse-headword-019.mjs",
 "scripts/verify-staging-019-remote-aggregate.mjs before",
 "scripts/verify-staging-019-remote-aggregate.mjs after",
 "PRAGMA foreign_key_check;","PRAGMA quick_check;",
 "d1 time-travel info miaowu-english-test",
 "--file db/019_global_dictionary_headword_study.sql",
 "NO_PRODUCTION_DEPLOYMENT_SENSE_LEVEL_ACTIVATION_STILL_BLOCKED"
 ])assert.ok(workflow.includes(required),'Missing protected manual migration gate: '+required);
});
test('no production deploy or legacy table overwrite in manual file',()=>{
 assert.doesNotMatch(workflow,/wrangler (?:deploy|publish)|d1 migrations apply|D1_PROD|miaowu-english-prod|--file db\/001_schema/);
 assert.equal((workflow.match(/--file db\/019_global_dictionary_headword_study\.sql/g)||[]).length,1);
 assert.match(workflow,/NO user data migration/);
});
