import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/global-dictionary-staging-migrate-manual.yml',import.meta.url),'utf8');
test('schema migration stays manual, staging-bound and environment gated',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/staging-d1-schema-approval/);
 assert.match(workflow,/miaowu-english-test/);
 assert.match(workflow,/88a817cb-23bb-4ae4-bcb8-92286c4165d4/);
 assert.match(workflow,/CLOUDFLARE_STAGING_D1_WRITE_TOKEN/);
 assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
});
test('remote database export is restored and checked before applying schema',()=>{
 const exportAt=workflow.indexOf('wrangler d1 export miaowu-english-test --remote');
 const restoreAt=workflow.indexOf('sqlite3 "$restored" < "$backup"');
 const integrityAt=workflow.indexOf('PRAGMA integrity_check');
 const fkAt=workflow.indexOf('PRAGMA foreign_key_check');
 const writeAt=workflow.indexOf('Apply only six explicit additive schema files');
 assert.ok(exportAt>0);
 assert.ok(restoreAt>exportAt);
 assert.ok(integrityAt>restoreAt);
 assert.ok(fkAt>integrityAt);
 assert.ok(writeAt>fkAt);
 assert.match(workflow,/EPHEMERAL_RUNNER_BACKUP_IS_NOT_DURABLE_RECOVERY/);
});
