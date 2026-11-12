import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('isolated staging code deployment is read-only schema safe and runs full tests',()=>{
 const wf=readFileSync('.github/workflows/v12-published-sense-staging-deploy.yml','utf8');
 for(const field of ['feature/v11-smart-vocab-preflight-20261109',
  "cfg.vars.APP_ENV,'staging'","cfg.name,'miaowu-english-staging'",
  '88a817cb-23bb-4ae4-bcb8-92286c4165d4',
  'GLOBAL_DICTIONARY_SENSE_SRS_WRITE_ENABLED',
  'GLOBAL_DICTIONARY_PUBLISHED_LEGACY_PREVIEW_ENABLED',
  'npm test','npm run check',
  'npx wrangler deploy --keep-vars --config wrangler.jsonc',
  "test \"$code\" = '401'",'PUBLISHED_SENSE_PREVIEW_OFF_BY_DEFAULT']){
  assert.ok(wf.includes(field),'missing stage guard '+field);
 }
 assert.ok(!wf.includes('deploy/production.wrangler.jsonc'));
 assert.ok(!wf.includes('CLOUDFLARE_PROD_D1_READ_TOKEN'));
 assert.doesNotMatch(wf,/d1 migrations apply|wrangler d1 execute/i);
});
