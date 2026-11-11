import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifySense020Preflight} from '../scripts/verify-staging-020-post019-baseline.mjs';
const make=(extra={})=>({
 dictionary_tables:10,dictionary_guard_triggers:5,core_tables:4,
 headword_019_tables:2,headword_019_indexes:2,
 sense_020_tables:0,sense_020_indexes:0,sense_020_triggers:0,
 headword_study_rows:0,headword_events_rows:0,
 candidate_heads:61422,candidate_forms:16442,upstream_heads:61422,other_heads:0,
 upstream_forms:16442,other_forms:0,source_registry_intact:1,approved_senses:0,
 teaching_ready:0,active_sources:0,approved_lessons:0,old_books:4,
 old_chapters:20,old_words:59,old_user_words:9,old_review_events:12,
 old_entitlements:2,old_activation_codes:1,old_chapter_words:262,
 old_reading_progress:3,...extra
});
const packet=rows=>JSON.stringify([{success:true,results:rows}]);
const verify=(counts,changes={})=>verifySense020Preflight({
 countsJson:packet([counts]),fkJson:packet(changes.fk||[]),
 quickJson:packet(changes.quick||[{quick_check:'ok'}])
});
test('real remote post-019 baseline is validated by aggregate-only verifier',()=>{
 const result=verify(make());
 assert.equal(result.phase,'POST_019_PRE_020');
 assert.equal(result.headword_019_schema_present,true);
 assert.equal(result.sense_020_schema_absent,true);
 assert.equal(result.source_candidates_unapproved,true);
 assert.equal(result.legacy_counts.user_words,9);
 assert.equal(result.remote_writes,0);
});
test('refuses any 019 absence, unexpected 020, headword SRS writes or premature source approvals',()=>{
 for(const key of ['headword_019_tables','headword_019_indexes',
  'headword_study_rows','headword_events_rows','sense_020_tables',
  'sense_020_indexes','sense_020_triggers','approved_senses',
  'active_sources','candidate_heads','candidate_forms','source_registry_intact']){
   assert.throws(()=>verify(make({[key]:99})),/SENSE_020_BASELINE_DRIFT_/);
 }
 assert.throws(()=>verify(make(),{fk:[{table:'user_words'}]}),
  /SENSE_020_FOREIGN_KEY_VIOLATION/);
 assert.throws(()=>verify(make(),{quick:[{quick_check:'error'}]}),
  /SENSE_020_QUICK_NOT_OK/);
 assert.throws(()=>verify(make({old_entitlements:-1})),
  /SENSE_020_LEGACY_INVALID_/);
});
test('020 new backup and staging read-only actions require protected TEST-only environment',()=>{
 const read=readFileSync('.github/workflows/v12-sense-020-post019-readonly.yml','utf8');
 const backup=readFileSync('.github/workflows/v12-sense-020-post019-encrypted-backup.yml','utf8');
 for(const s of [read,backup]){
  assert.match(s,/staging-d1-schema-approval/);
  assert.match(s,/miaowu-english-test/);
  assert.match(s,/88a817cb-23bb-4ae4-bcb8-92286c4165d4/);
  assert.match(s,/feature\/v11-smart-vocab-preflight-20261109/);
  assert.doesNotMatch(s,/wrangler deploy|wrangler publish|d1 migrations apply/i);
 }
 assert.match(read,/--command 'PRAGMA foreign_key_check;'/);
 assert.match(read,/verify-staging-020-post019-baseline.mjs/);
 assert.match(backup,/require "SELECT COUNT\(\*\) FROM user_headword_study;" 0/);
 assert.match(backup,/require "SELECT COUNT\(\*\) FROM sqlite_master WHERE type='table' AND name IN \('user_dictionary_sense_study','user_dictionary_sense_review_events'\);" 0/);
 assert.match(backup,/--symmetric --cipher-algo AES256/);
 assert.match(backup,/sqlite3 "\$restored"/);
 assert.match(backup,/v12-staging-020-post019-encrypted-full-backup/);
});
