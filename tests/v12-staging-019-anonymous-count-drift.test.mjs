import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync('.github/workflows/v12-headword-staging-019-readonly.yml','utf8');

test('read-only drift diagnosis separates original ECDICT cohort from later candidates',()=>{
  for(const name of ['candidate_heads','candidate_forms','upstream_heads','upstream_forms','other_heads','other_forms','original_import_source_intact'])
    assert.match(workflow,new RegExp('AS '+name+'\\b'));
  assert.match(workflow,/source_name='upstream_ecdict_unverified'/);
  assert.match(workflow,/source_key='upstream_ecdict_unverified' AND license_reviewed=0 AND enabled=0 AND imported_entries=11422 AND imported_forms=16442/);
  assert.match(workflow,/STAGING_ANONYMOUS_DICTIONARY_TOTALS/);
  assert.match(workflow,/upstream_heads\+observed\.other_heads!==observed\.candidate_heads/);
  assert.match(workflow,/upstream_forms\+observed\.other_forms!==observed\.candidate_forms/);
});

test('do not weaken the original fail-closed 019 migration readiness gate',()=>{
  for(const key of ['dictionary_tables:10','dictionary_triggers:5','core_tables:4','headword_019_tables:0',
   'candidate_heads:11422','candidate_forms:16442','upstream_heads:11422','other_heads:0',
   'upstream_forms:16442','other_forms:0','original_import_source_intact:1',
   'lessons:0','approved_senses:0','teaching_ready:0','active_sources:0'])
   assert.ok(workflow.includes(key),'missing strict invariant: '+key);
  assert.match(workflow,/STAGING_HEADWORD_BASELINE_DRIFT_/);
  assert.match(workflow,/PRAGMA foreign_key_check;/);
  assert.match(workflow,/PRAGMA quick_check;/);
  assert.match(workflow,/STAGING_REMOTE_QUICK_CHECK_FAILED/);
  assert.match(workflow,/staging-d1-schema-approval/);
  assert.match(workflow,/88a817cb-23bb-4ae4-bcb8-92286c4165d4/);
});

test('anonymous diagnostics never log token, identity, individual headword or change remote D1',()=>{
 assert.match(workflow,/observedKeys=\[/);
 assert.match(workflow,/const observed=\{\}/);
 assert.match(workflow,/JSON\.stringify\(observed\)/);
 assert.doesNotMatch(workflow,/console\.log\([^\n]*(?:headword|word_id|user_id|email|secret|token|stdout|stderr)/i);
 assert.doesNotMatch(workflow,/wrangler d1 migrations apply|wrangler d1 execute[^\n]*--file|CLOUDFLARE_STAGING_D1_WRITE_TOKEN/i);
});
