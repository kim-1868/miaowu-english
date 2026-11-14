import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyStagingD1Failure,sanitizedDiagnostic} from '../scripts/staging-019-readonly-diagnostics.mjs';

test('only fixed diagnostic categories; never include arbitrary token or private payload',()=>{
 const secret='AKIA_PRIVATE_RANDOM_SECRET_DO_NOT_LOG_abcdef';
 for(const [raw,code] of [
  ['Authentication error, code: 10000', 'READ_TOKEN_AUTHENTICATION_FAILED'],
  ['Cloudflare API: permission denied / Forbidden', 'READ_TOKEN_PERMISSION_DENIED'],
  ['D1_ERROR: no such table: global_dictionary_entries','TEST_D1_SCHEMA_OR_DATABASE_MISSING'],
  ['Wrangler: unknown option --json','WRANGLER_CLI_OPTIONS_UNSUPPORTED'],
  ['PRAGMA integrity_check unsupported','REMOTE_PRAGMA_UNSUPPORTED'],
  ['Error: 429 Too Many Requests','D1_RATE_LIMIT_OR_QUOTA'],
  ['Error: fetch failed ECONNRESET','CLOUDFLARE_NETWORK_OR_SERVICE_UNAVAILABLE'],
  ['D1_ERROR: SQL execution error','D1_QUERY_REJECTED'],
  ['undocumented failure','UNKNOWN_READONLY_QUERY_FAILURE']
 ]){
  const result=sanitizedDiagnostic('COUNTS',raw+' '+secret);
  assert.equal(result,'STAGING_019_READONLY_COUNTS_'+code);
  assert.equal(result.includes(secret),false);
  assert.equal(result.includes('global_dictionary_entries'),false);
 }
});
test('supports all three read-only query steps but no arbitrary labels',()=>{
 for(const k of ['COUNTS','FK','INTEGRITY']){
  assert.equal(sanitizedDiagnostic(k,'unrecognized'), 'STAGING_019_READONLY_'+k+'_UNKNOWN_READONLY_QUERY_FAILURE');
 }
 assert.throws(()=>sanitizedDiagnostic('WRITE','x'),/INVALID_READONLY_STEP/);
});
test('classification is deterministic even when Wrangler error only occurs in stdout',()=>{
 assert.equal(classifyStagingD1Failure('','Error: authentication error: Invalid API Token'),'READ_TOKEN_AUTHENTICATION_FAILED');
});
