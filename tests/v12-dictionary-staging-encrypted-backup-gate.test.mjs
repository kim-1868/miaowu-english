import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const backup=readFileSync(new URL('../.github/workflows/global-dictionary-staging-durable-encrypted-backup.yml',import.meta.url),'utf8');
const migration=readFileSync(new URL('../.github/workflows/global-dictionary-staging-migrate-manual.yml',import.meta.url),'utf8');
test('durable backup never writes remote data, never uploads plaintext',()=>{
 assert.match(backup,/environment:\s*\n\s*name: staging-d1-schema-approval/);
 assert.match(backup,/CLOUDFLARE_STAGING_D1_WRITE_TOKEN/);
 assert.match(backup,/STAGING_D1_BACKUP_PASSPHRASE/);
 assert.match(backup,/wrangler d1 export miaowu-english-test --remote --skip-confirmation/);
 assert.match(backup,/gpg --batch --yes --pinentry-mode loopback/);
 assert.match(backup,/cmp "\$backup" "\$decrypted"/);
 assert.match(backup,/PRAGMA integrity_check/);
 assert.match(backup,/PRAGMA foreign_key_check/);
 assert.match(backup,/actions\/upload-artifact@v4/);
 assert.match(backup,/path: \$\{\{ runner.temp \}\}\/miaowu-staging-d1-encrypted-backup.gpg/);
 assert.doesNotMatch(backup,/d1 execute .*--remote|d1 time-travel restore/);
});
test('manual migration requires durable verified encrypted backup run',()=>{
 assert.match(migration,/encrypted_backup_run_id:/);
 assert.match(migration,/actions: read/);
 const gate=migration.indexOf('Require successful persisted encrypted backup artifact before ANY D1 mutation');
 const write=migration.indexOf('Apply only six explicit additive schema files');
 assert.ok(gate>0&&write>gate);
 assert.match(migration,/\.conclusion=="success"/);
 assert.match(migration,/\.expired==false and \.size_in_bytes>0/);
 assert.match(migration,/PERSISTED_ENCRYPTED_BACKUP_ARTIFACT_MISSING/);
});

test('backup workflow identity accepts exact GitHub API path and repository-prefixed path, no other workflow',()=>{
 const condition='(.path==".github/workflows/global-dictionary-staging-durable-encrypted-backup.yml" or (.path | endswith("/.github/workflows/global-dictionary-staging-durable-encrypted-backup.yml")))';
 assert.ok(migration.includes(condition),'path check must match both GitHub API representations');
 assert.match(migration,/\.head_branch=="feature\/v11-smart-vocab-preflight-20261109"/);
 assert.match(migration,/\.conclusion=="success"/);
 assert.match(migration,/\.status=="completed"/);
});

test('invalid staging inputs fail as explicit pre-write step rather than silently skipped job',()=>{
 assert.match(migration,/Fail closed with clear diagnostics for all confirmation inputs/);
 const preflight=migration.indexOf('Fail closed with clear diagnostics for all confirmation inputs');
 const exportStep=migration.indexOf('Verify full test D1 export and independent local SQLite replay');
 const writeStep=migration.indexOf('Apply only six explicit additive schema files');
 assert.ok(preflight>0 && exportStep>preflight && writeStep>exportStep);
 for(const marker of ['STAGING_TARGET_CONFIRMATION_MISMATCH','STAGING_UUID_CONFIRMATION_MISMATCH','STAGING_APPROVAL_TEXT_MISMATCH','BACKUP_RUN_ID_MUST_BE_NUMERIC'])
  assert.ok(migration.includes(marker),marker);
 const jobGate=migration.split('    environment:')[0];
 assert.doesNotMatch(jobGate,/inputs\.confirm_target\s*==/);
 assert.doesNotMatch(jobGate,/inputs\.confirmation\s*==/);
});
