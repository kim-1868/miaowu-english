import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const path='.github/workflows/v12-headword-staging-019-encrypted-backup.yml';
const workflow=readFileSync(path,'utf8');

test('019 fresh backup is restricted to test D1 and human-protected branch',()=>{
  for(const item of [
    "github.repository == 'kim-1868/miaowu-english'",
    "github.ref == 'refs/heads/feature/v11-smart-vocab-preflight-20261109'",
    "staging-d1-schema-approval",
    "cfg.name,'miaowu-english-staging'",
    "cfg.vars.APP_ENV,'staging'",
    "cfg.d1_databases[0].database_name,'miaowu-english-test'",
    "88a817cb-23bb-4ae4-bcb8-92286c4165d4",
    'CLOUDFLARE_STAGING_D1_WRITE_TOKEN',
    'STAGING_D1_BACKUP_PASSPHRASE'
  ])assert.ok(workflow.includes(item),'missing backup guard: '+item);
  assert.match(workflow,/test "\\$\{#BACKUP_PASSPHRASE\}" -ge 32/);
});

test('backup is full, encrypted, restored independently and uploaded only encrypted',()=>{
  for(const item of [
    'd1 export miaowu-english-test --remote',
    'gpg --batch --yes --pinentry-mode loopback',
    '--symmetric --cipher-algo AES256',
    'cmp -s "$raw" "$replay"',
    'sqlite3 "$restored" < "$replay"',
    'PRAGMA integrity_check;',
    'PRAGMA foreign_key_check;',
    "trap 'rm -rf \"$private\"' EXIT",
    'v12-staging-019-encrypted-full-backup',
    'retention-days: 30',
    'if-no-files-found: error',
    'run: rm -f "$RUNNER_TEMP/v12-019-staging-d1-full-backup.gpg"'
  ])assert.ok(workflow.includes(item),'missing independent backup check: '+item);
  assert.doesNotMatch(workflow,/trap[^\n]*rm -f "\$encrypted"/);
  assert.match(workflow,/path:\s*\$\{\{ runner\.temp \}\}\/v12-019-staging-d1-full-backup\.gpg/);
});

test('restore must match actual 61,422 heads + prior schema, not old pre-013 checks',()=>{
  for(const [value,label] of [
    [10,'DICTIONARY_TABLES'],[5,'DICTIONARY_TRIGGERS'],[4,'OLD_CORE_TABLES'],
    [0,'HEADWORD_019_NOT_APPLIED'],[61422,'CANDIDATE_HEADS'],[16442,'CANDIDATE_FORMS'],
    [61422,'CANDIDATE_SOURCE'],[0,'UNEXPECTED_SOURCES'],[0,'UNEXPECTED_FORMS'],
    [1,'ORIGINAL_SOURCE_REGISTRY'],[0,'APPROVED_LESSONS'],[0,'APPROVED_SENSES'],
    [0,'READY_WORDS'],[0,'PUBLISHABLE_SOURCES']
  ])assert.ok(workflow.includes(' '+value+' '+label),'missing strict baseline '+label);
  assert.match(workflow,/imported_entries=11422 AND imported_forms=16442/);
  assert.doesNotMatch(workflow,/STAGING_PRE_MIGRATION_DICTIONARY_TABLES_0/);
});

test('backup cannot remotely write, log private SQL or deploy',()=>{
  assert.doesNotMatch(workflow,/d1 execute|d1 migrations apply|wrangler deploy|wrangler publish|--execute-test-only/i);
  assert.match(workflow,/NO_D1_WRITES_ZERO_DEPLOYMENTS/);
  assert.match(workflow,/export-stdout" 2>"\$private\/export-stderr"/);
  assert.match(workflow,/Upload ONLY encrypted full snapshot/);
});
