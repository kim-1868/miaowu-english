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
