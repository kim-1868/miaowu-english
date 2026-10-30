import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../src/worker.js";
import { hashCode, normalizeCode, normalizedUsername, newPasswordHash, verifyPassword } from "../src/security.js";

class MemoryD1 {
  constructor() {
    this.sql = new DatabaseSync(":memory:");
    this.sql.exec(readFileSync(new URL("../db/001_schema.sql", import.meta.url), "utf8"));
    this.sql.exec(readFileSync(new URL("../db/002_s1.sql", import.meta.url), "utf8"));
    this.sql.exec(readFileSync(new URL("../db/003_public_categories.sql", import.meta.url), "utf8"));
  }
  prepare(query) {
    const db = this.sql;
    return {
      bind(...args) {
        const statement = db.prepare(query);
        return {
          async first() { return statement.get(...args) ?? null; },
          async all() { return { results: statement.all(...args) }; },
          async run() { return { success: true, meta: statement.run(...args) }; }
        };
      },
      async first() { return db.prepare(query).get() ?? null; },
      async all() { return { results: db.prepare(query).all() }; }
    };
  }
  async batch(statements) {
    this.sql.exec("BEGIN IMMEDIATE");
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      this.sql.exec("COMMIT");
      return result;
    } catch (err) {
      this.sql.exec("ROLLBACK");
      throw err;
    }
  }
  exec(sql) { this.sql.exec(sql); }
}
const origin = "https://miaowu.test";
const pepper = "demo-test-only-activation-pepper-at-least-32-bytes";
function environment() {
  return {
    DB: new MemoryD1(),
    ACTIVATION_PEPPER: pepper,
    ASSETS: { fetch: async () => new Response("demo frontend") }
  };
}
async function seedCode(env, code, category = "cet4", status = "unused") {
  const hash = await hashCode(normalizeCode(code), env);
  await env.DB.prepare("INSERT INTO activation_codes(id,code_hash,category_id,status) VALUES (?,?,?,?)")
    .bind(crypto.randomUUID(),hash,category,status).run();
}
async function call(env, path, { method = "GET", body, cookie, originHeader = origin } = {}) {
  const headers = { origin: originHeader };
  if (body) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const request = new Request(origin + path, {
    method, headers,
    body: body ? JSON.stringify(body) : (method === "POST" ? "{}" : undefined)
  });
  return worker.fetch(request,env);
}
const register = (env, username, code, password = "MyGoodPassword2026!") =>
  call(env,"/api/auth/register",{method:"POST",body:{username,password,activationCode:code}});
const login = (env, username, password = "MyGoodPassword2026!") =>
  call(env,"/api/auth/login",{method:"POST",body:{username,password}});
const cookieOf = response => response.headers.get("set-cookie")?.split(";")[0];

test("password hashing is salted, valid and non-plaintext", async () => {
  const a = await newPasswordHash("secure password 123");
  const b = await newPasswordHash("secure password 123");
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.equal(await verifyPassword("secure password 123",a.salt,a.hash),true);
  assert.equal(await verifyPassword("bad password",a.salt,a.hash),false);
  assert.equal(normalizedUsername("  小猫_01 "), "小猫_01");
});

test("misconfigured environment fails closed", async () => {
  const env = environment();
  delete env.ACTIVATION_PEPPER;
  const status = await call(env,"/api/health");
  assert.equal((await status.json()).authConfigured,false);
  assert.equal((await call(env,"/api/categories")).status,503);
});

test("register with one-time code, login, me, logout", async () => {
  const env = environment();
  const code = "MW-CET4-7A9B3C8D1E2F4A5B";
  await seedCode(env,code);
  const first = await register(env,"xiaoman",code);
  assert.equal(first.status,201,await first.text());
  const token = cookieOf(first);
  assert.match(token,/^mw_session=[a-f0-9]{64}$/);
  assert.match(first.headers.get("set-cookie"),/HttpOnly/);
  assert.match(first.headers.get("set-cookie"),/Secure/);
  assert.deepEqual((await (await call(env,"/api/auth/me",{cookie:token})).json()).categories.map(x=>x.slug),["cet4"]);

  const duplicate = await register(env,"another",code);
  assert.equal(duplicate.status,409);
  assert.equal(await env.DB.prepare("SELECT id FROM users WHERE username='another'").first(),null);
  assert.equal((await login(env,"xiaoman","wrongpassword")).status,401);
  const loggedIn = await login(env,"xiaoman");
  assert.equal(loggedIn.status,200);
  const loginCookie = cookieOf(loggedIn);
  assert.equal((await call(env,"/api/auth/me",{cookie:loginCookie})).status,200);
  assert.equal((await call(env,"/api/auth/logout",{method:"POST",cookie:loginCookie})).status,200);
  assert.equal((await call(env,"/api/auth/me",{cookie:loginCookie})).status,401);
});

test("invalid code cannot create orphan user or consume another code", async () => {
  const env = environment();
  await seedCode(env,"MW-CET4-AAAABBBBCCCCDDDD");
  assert.equal((await register(env,"orphan","MW-CET4-EEEEFFFFGGGGHHHH")).status,409);
  assert.equal(await env.DB.prepare("SELECT id FROM users WHERE username='orphan'").first(),null);
  assert.equal((await register(env,"realuser","MW-CET4-AAAABBBBCCCCDDDD")).status,201);
});

test("redeem a second category, reject a duplicate and preserve first right", async () => {
  const env=environment();
  await seedCode(env,"MW-CET4-AAAABBBBCCCCDDDD");
  await seedCode(env,"MW-CET6-1111222233334444","cet6");
  const first=await register(env,"reader","MW-CET4-AAAABBBBCCCCDDDD");
  const cookie=cookieOf(first);
  const granted=await call(env,"/api/activate",{method:"POST",cookie,body:{activationCode:"MW-CET6-1111222233334444"}});
  assert.equal(granted.status,200);
  assert.deepEqual((await granted.json()).categories.map(x=>x.slug),["cet4","cet6"]);
  const second=await call(env,"/api/activate",{method:"POST",cookie,body:{activationCode:"MW-CET6-1111222233334444"}});
  assert.equal(second.status,409);
  const rights=(await (await call(env,"/api/auth/me",{cookie})).json()).categories.map(x=>x.slug);
  assert.deepEqual(rights,["cet4","cet6"]);
});

test("paywall protects content; free preview stays public", async () => {
  const env=environment();
  env.DB.exec(`INSERT INTO books(id,category_id,title,status) VALUES
     ('cet4-book','cet4','四级样章','published'),('cet6-book','cet6','六级样章','published');
     INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at)
     VALUES ('free','cet4-book',1,'试读','{"text":"公开样章"}',1,'2026-10-20 00:00:00'),
     ('paid4','cet4-book',2,'正式内容','{"text":"四级秘密正文"}',0,'2026-10-20 00:00:00'),
     ('paid6','cet6-book',1,'六级内容','{"text":"六级秘密正文"}',0,'2026-10-20 00:00:00');`);
  assert.equal((await call(env,"/api/chapters/free")).status,200);
  assert.equal((await call(env,"/api/chapters/paid4")).status,401);
  await seedCode(env,"MW-CET4-AAAABBBBCCCCDDDD");
  const cookie=cookieOf(await register(env,"student","MW-CET4-AAAABBBBCCCCDDDD"));
  assert.equal((await call(env,"/api/chapters/paid4",{cookie})).status,200);
  assert.equal((await call(env,"/api/chapters/paid6",{cookie})).status,403);
  const catalog=await (await call(env,"/api/books?category=cet6")).text();
  assert.equal(catalog.includes("六级秘密正文"),false);
});

test("POST requires same-origin browser request", async () => {
  const env=environment();
  await seedCode(env,"MW-CET4-AAAABBBBCCCCDDDD");
  const forged=await call(env,"/api/auth/register",{
    method:"POST",originHeader:"https://wrong.example",
    body:{username:"intruder",password:"MyGoodPassword2026!",activationCode:"MW-CET4-AAAABBBBCCCCDDDD"}
  });
  assert.equal(forged.status,403);
  assert.equal(await env.DB.prepare("SELECT id FROM users WHERE username='intruder'").first(),null);
});
