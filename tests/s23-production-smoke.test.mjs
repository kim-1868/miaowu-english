import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../src/worker.js";

// S23: LOCAL, synthetic production smoke checks. No Cloudflare calls, tokens,
// activation codes, live accounts, real D1 connection or production writes.
const origin = "https://production-smoke.invalid";
const pepper = "S23_FAKE_SECRET_LOCAL_ONLY_NOT_VALID_FOR_USERS";
class LocalD1 {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    for (const file of ["001_schema.sql", "002_s1.sql", "003_public_categories.sql"]) {
      this.db.exec(readFileSync(new URL("../db/" + file, import.meta.url), "utf8"));
    }
  }
  prepare(sql) {
    const db = this.db;
    const prepareWith = (args = []) => {
      const statement = db.prepare(sql);
      return {
        first: async () => statement.get(...args) ?? null,
        all: async () => ({ results: statement.all(...args) }),
        run: async () => ({ success: true, meta: statement.run(...args) })
      };
    };
    return { ...prepareWith(), bind(...args) { return prepareWith(args); } };
  }
  close() { this.db.close(); }
}
function env(db) {
  return {
    APP_ENV: "production", ACTIVATION_PEPPER: pepper, DB: db,
    ASSETS: { fetch: async () => new Response("S23_STATIC_FIXTURE") }
  };
}
async function get(path, app) {
  return worker.fetch(new Request(origin + path), app);
}

test("S23 production health stays non-sensitive and real seeded category read succeeds", async () => {
  const db = new LocalD1();
  try {
    const app = env(db);
    const health = await get("/api/health", app);
    assert.equal(health.status, 200);
    const h = await health.json();
    assert.equal(h.ok, true);
    assert.equal(h.dbBound, true);
    assert.equal(h.authConfigured, true);
    assert.equal(h.activationSecretReady, true);
    assert.equal(h.activationSecretStatus, "hidden");
    assert.equal(h.paymentIntegration, false);
    assert.equal(JSON.stringify(h).includes(pepper), false);
    const categories = await get("/api/categories", app);
    assert.equal(categories.status, 200);
    const data = await categories.json();
    assert.deepEqual(data.categories.map(x => x.slug).sort(),
      ["cet4", "cet6", "ielts", "postgrad"]);
    const emptyShelf = await get("/api/books?category=cet4", app);
    assert.equal(emptyShelf.status, 200);
    assert.deepEqual((await emptyShelf.json()).books, []);
  } finally { db.close(); }
});

test("S23 guest session is denied and staging labs stay absent in production", async () => {
  const db = new LocalD1();
  try {
    const app = env(db);
    const me = await get("/api/auth/me", app);
    assert.equal(me.status, 401);
    assert.equal((await me.json()).error, "LOGIN_REQUIRED");
    for (const route of [
      "/api/staging/diagnostics", "/api/staging/test-voucher",
      "/api/chapters/qa-fixture", "/api/books/qa-fixture/chapters",
      "/account-test.html", "/reading-test.html", "/editor.html"
    ]) {
      const r = await get(route, app);
      assert.equal(r.status, 404, "must be hidden in production: " + route);
      assert.equal((await r.text()).includes("S23_STATIC_FIXTURE"), false);
    }
    const badOrigin = await worker.fetch(new Request(origin + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "https://untrusted.invalid" },
      body: JSON.stringify({username: "test-person", password: "fake-password-123", activationCode: "NOT-A-CODE"})
    }), app);
    assert.equal(badOrigin.status, 403);
    assert.equal((await badOrigin.json()).error, "INVALID_ORIGIN");
    const home = await get("/", app);
    assert.equal(home.status, 200);
    assert.equal(await home.text(), "S23_STATIC_FIXTURE");
  } finally { db.close(); }
});
