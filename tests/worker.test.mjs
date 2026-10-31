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

test('staging Basic sign-in establishes a secure preview cookie for all later background API requests', async () => {
  const scoped={ ...env, APP_ENV:'staging', STAGING_PREVIEW_PASSWORD:'test-preview-password-987654' };
  const url='https://example.test';
  const basic='Basic '+Buffer.from('reviewer:'+scoped.STAGING_PREVIEW_PASSWORD).toString('base64');
  // Direct site visit continues to challenge for the private reviewer password.
  const challenge=await app.fetch(new Request(url+'/'),scoped);
  assert.equal(challenge.status,401);
  assert.match(challenge.headers.get('www-authenticate'),/Basic/);
  // Background API requests without reviewer auth must never trigger native browser dialogs.
  const apiChallenge=await app.fetch(new Request(url+'/api/health'),scoped);
  assert.equal(apiChallenge.status,401);
  assert.equal(apiChallenge.headers.get('www-authenticate'),null);
  assert.equal((await apiChallenge.json()).error,'STAGING_ACCESS_REQUIRED');

  // The single successful interactive Basic challenge creates a browser cookie.
  const page=await app.fetch(new Request(url+'/',{
    headers:{Authorization:basic}
  }),scoped);
  assert.equal(page.status,200);
  const setCookie=page.headers.get('set-cookie');
  assert.match(setCookie,/__Host-mw_preview=\d{10}\.[0-9a-f]{64}/);
  assert.match(setCookie,/HttpOnly/);
  assert.match(setCookie,/Secure/);
  assert.match(setCookie,/SameSite=Lax/);
  const preview=setCookie.split(';')[0];
  // Same-origin fetch with cookie alone succeeds without Authorization.
  const check=await app.fetch(new Request(url+'/api/health',{headers:{Cookie:preview}}),scoped);
  assert.equal(check.status,200);
  assert.equal((await check.json()).ok,true);
  assert.equal(check.headers.get('set-cookie'),null);
  const asset=await app.fetch(new Request(url+'/styles.css',{headers:{Cookie:preview}}),scoped);
  assert.equal(asset.status,200);
  const register=await app.fetch(new Request(url+'/api/auth/login',{
    method:'POST',
    headers:{Cookie:preview,'Content-Type':'application/json',Origin:url},
    body:JSON.stringify({username:'valid_reader',password:'some-password'})
  }),scoped);
  assert.equal(register.status,503); // D1 omitted in fixture; staging auth itself passed.

  // Tampering and rotation revoke the preview grant.
  const tampered=preview.slice(0,-1)+(preview.endsWith('a')?'b':'a');
  assert.equal((await app.fetch(new Request(url+'/api/health',{headers:{Cookie:tampered}}),scoped)).status,401);
  const rotated={...scoped,STAGING_PREVIEW_PASSWORD:'another-valid-preview-password-012345'};
  assert.equal((await app.fetch(new Request(url+'/api/health',{headers:{Cookie:preview}}),rotated)).status,401);
});
