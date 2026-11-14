import test from 'node:test';
import assert from 'node:assert/strict';
import {rehearseDictionaryRollback}
 from '../scripts/rehearse-dictionary-staging-rollback.mjs';
test('interrupted third staging dictionary migration recovers complete original data',()=>{
 const r=rehearseDictionaryRollback({failAfterStep:3});
 assert.equal(r.status,'DISPOSABLE_SQLITE_ROLLBACK_REHEARSED');
 assert.equal(r.simulated_interruption,true);
 assert.equal(r.migration_files_executed_before_restore,3);
 assert.equal(r.backup_sha256_verified,true);
 assert.equal(r.complete_original_rows_recovered,true);
 assert.equal(r.schema_reverted,true);
 assert.equal(r.foreign_keys_valid,true);
 assert.equal(r.live_d1_rollback_executed,false);
});
test('fully migrated temporary database can also revert to pre-migration snapshot',()=>{
 const r=rehearseDictionaryRollback();
 assert.equal(r.simulated_interruption,false);
 assert.equal(r.migration_files_executed_before_restore,6);
 assert.equal(r.backup_sha256_verified,true);
 assert.equal(r.cloudflare_writes,0);
});
test('invalid arbitrary interruption points are rejected',()=>{
 assert.throws(()=>rehearseDictionaryRollback({failAfterStep:7}),/INVALID_INJECTED_FAILURE/);
 assert.throws(()=>rehearseDictionaryRollback({failAfterStep:-1}),/INVALID_INJECTED_FAILURE/);
});
