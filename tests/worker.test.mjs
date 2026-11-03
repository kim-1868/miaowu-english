import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/worker.js';

const env = { ASSETS: { fetch: async () => new Response('static site', { status: 200 }) } };

test('health response is no-store and auth is not ready', async () => {
  const r = await app.fetch(new Request('https://example.test/api/health'), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const data = await r.json();
  assert.equal(data.ok, true);
  assert.equal(data.authReady, false);
});

test('unimplemented private APIs fail closed', async () => {
  for (const path of ['/api/register','/api/login','/api/activate','/api/chapters/private']) {
    const r = await app.fetch(new Request('https://example.test' + path), env);
    assert.equal(r.status, 501);
  }
});

test('static paths delegate to ASSETS', async () => {
  const r = await app.fetch(new Request('https://example.test/'), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'static site');
});
