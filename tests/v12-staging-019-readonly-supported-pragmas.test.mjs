// Synthetic-only guard: Cloudflare D1 explicitly supports PRAGMA quick_check,
// whereas a remote integrity_check is rejected by our staging read-only scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root=process.cwd();
const workflow=readFileSync(join(root,'.github/workflows/v12-headword-staging-019-readonly.yml'),'utf8');

test('read-only workflow uses supported quick_check, never rejected integrity_check',()=>{
 assert.match(workflow,/readonly_query INTEGRITY 'PRAGMA quick_check;' "\$integrity"/u);
 assert.doesNotMatch(workflow,/--command 'PRAGMA integrity_check|readonly_query INTEGRITY 'PRAGMA integrity_check/u);
 assert.match(workflow,/integrity\[0\]\?\.quick_check!=='ok'/u);
 assert.match(workflow,/STAGING_REMOTE_QUICK_CHECK_FAILED/u);
});
test('quick-check does not waive mandatory backup and later full verification',()=>{
 assert.match(workflow,/FULL_INTEGRITY_CHECK_REQUIRES_SEPARATE_FRESH_BACKUP_LOCAL_RESTORE/u);
 assert.match(workflow,/STAGING_FK_QUICK_CHECK_READONLY_PASSED_NO_PERSONAL_ROWS_EXPORTED/u);
 assert.match(workflow,/READ_TOKEN/u);
 assert.doesNotMatch(workflow,/wrangler d1 migrations apply|wrangler d1 execute .*--file|CLOUDFLARE_STAGING_D1_WRITE_TOKEN/u);
});
test('the remote stage remains protected and targets only test D1',()=>{
 assert.match(workflow,/staging-d1-schema-approval/u);
 assert.match(workflow,/miaowu-english-test/u);
 assert.match(workflow,/88a817cb-23bb-4ae4-bcb8-92286c4165d4/u);
 assert.match(workflow,/APP_ENV,'staging'/u);
});
