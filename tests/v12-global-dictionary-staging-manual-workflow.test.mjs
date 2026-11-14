import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertTestD1Configuration,assertGitHubManualApproval,readScalarResult,stageSchemaMigration}
 from '../scripts/execute-staging-dictionary-schema.mjs';
const valid=()=>({name:'miaowu-english-staging',vars:{APP_ENV:'staging'},
 d1_databases:[{database_name:'miaowu-english-test',database_id:'88a817cb-23bb-4ae4-bcb8-92286c4165d4'}]});
test('explicit staging identity with exact Cloudflare UUID required',()=>{
 assert.equal(assertTestD1Configuration(valid()),true);
 const prod=valid();prod.d1_databases[0].database_name='miaowu-english-prod';
 assert.throws(()=>assertTestD1Configuration(prod),/MISMATCH/);
});
test('without explicit owner GitHub approval the remote executor cannot run',()=>{
 const env={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'kim-1868/miaowu-english',
  GITHUB_ACTOR:'kim-1868',GITHUB_REF:'refs/heads/feature/v11-smart-vocab-preflight-20261109',
  MIAOWU_STAGING_SCHEMA_APPROVAL:'STAGING_013_018_ADD_ONLY',
  MIAOWU_STAGING_TARGET:'miaowu-english-test',MIAOWU_STAGING_UUID:'88a817cb-23bb-4ae4-bcb8-92286c4165d4',
  CLOUDFLARE_API_TOKEN:'test-placeholder',CLOUDFLARE_ACCOUNT_ID:'test-placeholder'};
 assert.equal(assertGitHubManualApproval(env),true);
 for(const key of ['GITHUB_ACTOR','GITHUB_REF','MIAOWU_STAGING_SCHEMA_APPROVAL',
  'MIAOWU_STAGING_UUID','CLOUDFLARE_API_TOKEN']){
  const bad={...env,[key]:''};
  assert.throws(()=>assertGitHubManualApproval(bad),/APPROVAL_OR_SECRET_REQUIRED/);
 }
});
test('remote scalar JSON accepts only one unambiguous numeric result',()=>{
 assert.equal(readScalarResult('[{"results":[{"n":0}]}]','n'),0);
 assert.throws(()=>readScalarResult('[]','n'),/SCALAR_UNEXPECTED/);
 assert.throws(()=>readScalarResult('not-json','n'),/UNRECOGNIZED/);
});
test('manual-only workflow has no push trigger and no production D1 target',()=>{
 const w=readFileSync(new URL('../.github/workflows/global-dictionary-staging-migrate-manual.yml',import.meta.url),'utf8');
 assert.match(w,/workflow_dispatch:/);
 assert.doesNotMatch(w,/^\s+push:/m);
 assert.match(w,/name: staging-d1-schema-approval/);
 assert.match(w,/CLOUDFLARE_STAGING_D1_WRITE_TOKEN/);
 assert.doesNotMatch(w,/secrets\.CLOUDFLARE_API_TOKEN/);
 assert.doesNotMatch(w,/d1 migrations apply|d1 time-travel restore/);
 const dry=stageSchemaMigration();
 assert.equal(dry.cloudflare_writes,0);
 assert.equal(dry.migrations,6);
});
