import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/worker.js';

const env = { ASSETS: { fetch: async () => new Response('static site', { status: 200 }) } };

test('health reports configuration without exposing secrets', async () => {
  const r = await app.fetch(new Request('https://example.test/api/health'), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const data = await r.json();
  assert.equal(data.ok, true);
  assert.equal(data.authConfigured, false);
});

test('unconfigured protected APIs reject requests safely', async () => {
  for (const path of ['/api/auth/register','/api/auth/login','/api/activate','/api/chapters/private']) {
    const r = await app.fetch(new Request('https://example.test' + path), env);
    assert.equal(r.status, 503);
  }
});

test('static paths delegate to ASSETS', async () => {
  const r = await app.fetch(new Request('https://example.test/'), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'static site');
});

test('staging fails closed before a preview password is set', async () => {
  const scoped = { ...env, APP_ENV: 'staging' };
  const r = await app.fetch(new Request('https://example.test/'), scoped);
  assert.equal(r.status, 503);
});

test('staging protects static assets and health API, then allows authorized reviewer', async () => {
  const scoped = { ...env, APP_ENV: 'staging', STAGING_PREVIEW_PASSWORD: 'test-preview-password-987654' };
  const unauth = await app.fetch(new Request('https://example.test/'), scoped);
  assert.equal(unauth.status, 401);
  assert.match(unauth.headers.get('www-authenticate'), /Basic/);
  assert.equal((await app.fetch(new Request('https://example.test/api/health'), scoped)).status,401);
  const wrong = new Request('https://example.test/', { headers: {
    authorization: 'Basic ' + Buffer.from('reviewer:not-the-password').toString('base64')
  }});
  assert.equal((await app.fetch(wrong,scoped)).status,401);
  const correct = 'Basic ' + Buffer.from('reviewer:test-preview-password-987654').toString('base64');
  const asset = await app.fetch(new Request('https://example.test/', { headers: { authorization: correct } }),scoped);
  assert.equal(asset.status,200);
  assert.equal(asset.headers.get('cache-control'),'private, no-store');
  const check = await app.fetch(new Request('https://example.test/api/health', { headers: { authorization: correct } }),scoped);
  assert.equal(check.status,200);
});

test('staging health safely distinguishes absent, too-short and valid activation secrets', async () => {
  const auth = 'Basic ' + Buffer.from('reviewer:test-preview-password-987654').toString('base64');
  const req = new Request('https://example.test/api/health', { headers: { authorization: auth } });
  const base = { ...env, APP_ENV: 'staging', STAGING_PREVIEW_PASSWORD: 'test-preview-password-987654' };
  const missing = await (await app.fetch(req, base)).json();
  assert.equal(missing.activationSecretStatus, 'missing');
  const tooShort = await (await app.fetch(req, { ...base, ACTIVATION_PEPPER: 'abc' })).json();
  assert.equal(tooShort.activationSecretStatus, 'too_short');
  const ready = await (await app.fetch(req, { ...base, ACTIVATION_PEPPER: '0123456789'.repeat(4) })).json();
  assert.equal(ready.activationSecretStatus, 'ready');
  assert.equal(ready.authConfigured, false); // No DB binding in the fixture.
  assert.equal(JSON.stringify(ready).includes('0123456789'), false);
});
