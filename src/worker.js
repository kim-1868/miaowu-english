import { stagingGate } from "./staging-gate.js";
import {
  normalizedUsername, validPassword, normalizeCode, hashCode, newPasswordHash,
  verifyPassword, sha256, sessionData, sessionCookie, clearSessionCookie,
  readSessionCookie, checkOrigin, throttleKey, isBlocked, countFailure,
  resetFailures, requireSecret
} from "./security.js";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'"
};
function json(data, status = 200, additional = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, ...additional } });
}
const reject = (message, status = 400) => json({ error: message }, status);
const dbStmt = (db, sql, ...params) => db.prepare(sql).bind(...params);
async function parseBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers.get("content-type") || "")) throw new Error("CONTENT_TYPE");
  const length = +(req.headers.get("content-length") || 0);
  if (length > 8192) throw new Error("TOO_LARGE");
  const body = await req.text();
  if (new TextEncoder().encode(body).byteLength > 8192) throw new Error("TOO_LARGE");
  try {
    const value = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new Error("INVALID_JSON"); }
}
async function currentUser(req, db) {
  const raw = readSessionCookie(req);
  if (!raw) return null;
  const idHash = await sha256(raw);
  const user = await dbStmt(db, `SELECT u.id, u.username FROM sessions s
      JOIN users u ON u.id=s.user_id
      WHERE s.id_hash=? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP`, idHash).first();
  return user || null;
}
async function userEntitlements(db, userId) {
  const result = await dbStmt(db, `SELECT c.id, c.slug, c.title
    FROM entitlements e JOIN categories c ON c.id=e.category_id
    WHERE e.user_id=? AND e.revoked_at IS NULL ORDER BY c.slug`, userId).all();
  return result.results || [];
}
async function register(req, env) {
  const body = await parseBody(req);
  const username = normalizedUsername(body.username);
  if (!username || !validPassword(body.password)) return reject("INVALID_USERNAME_OR_PASSWORD", 400);
  const code = normalizeCode(body.activationCode);
  if (!code) return reject("INVALID_ACTIVATION", 400);
  const db = env.DB;
  const key = await throttleKey(env, "register", req); // Global per-source-IP limit across usernames.
  if (await isBlocked(db, key)) return reject("TOO_MANY_ATTEMPTS", 429);
  const codeHash = await hashCode(code, env);
  const redemptionNonce = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const { hash, salt } = await newPasswordHash(body.password);
  const session = await sessionData(userId);
  try {
    // D1.batch is transactional: an invalid or used code causes the NOT NULL
    // entitlement insert to fail, rolling back user and session creation.
    await db.batch([
      dbStmt(db, `INSERT INTO users(id, username, password_hash, password_salt)
        VALUES(?,?,?,?)`, userId, username, hash, salt),
      dbStmt(db, `UPDATE activation_codes SET status='redeemed', redeemed_by=?,
        redeemed_at=CURRENT_TIMESTAMP, redemption_nonce=? WHERE code_hash=? AND status='unused'
        AND EXISTS(SELECT 1 FROM categories c WHERE c.id=activation_codes.category_id AND c.is_visible=1)`, userId, redemptionNonce, codeHash),
      dbStmt(db, `INSERT INTO entitlements(user_id, category_id, source_code_id)
        VALUES (?, (SELECT category_id FROM activation_codes WHERE code_hash=? AND redeemed_by=? AND redemption_nonce=? AND status='redeemed'),
          (SELECT id FROM activation_codes WHERE code_hash=? AND redeemed_by=? AND redemption_nonce=? AND status='redeemed'))`,
          userId, codeHash, userId, redemptionNonce, codeHash, userId, redemptionNonce),
      dbStmt(db, `INSERT INTO sessions(id_hash,user_id,expires_at) VALUES(?,?,?)`,
        session.idHash, userId, session.expires)
    ]);
  } catch {
    await countFailure(db, key);
    return reject("INVALID_ACTIVATION_OR_USERNAME", 409);
  }
  await resetFailures(db, key);
  const categories = await userEntitlements(db, userId);
  return json({ user: { username }, categories }, 201, { "set-cookie": sessionCookie(session.token, req) });
}
async function login(req, env) {
  const body = await parseBody(req);
  const username = normalizedUsername(body.username);
  if (!username || typeof body.password !== "string" || body.password.length > 128) {
    return reject("INVALID_CREDENTIALS", 401);
  }
  const db = env.DB;
  const key = await throttleKey(env, "login", req, username);
  const sourceKey = await throttleKey(env, "login-source", req);
  if (await isBlocked(db, key) || await isBlocked(db, sourceKey)) return reject("TOO_MANY_ATTEMPTS", 429);
  const user = await dbStmt(db, `SELECT id,username,password_hash,password_salt FROM users WHERE username=?`, username).first();
  let matched = false;
  if (user) matched = await verifyPassword(body.password, user.password_salt, user.password_hash);
  else await newPasswordHash(body.password); // Avoid fast account-enumeration timing.
  if (!matched) {
    await countFailure(db, sourceKey);
    await countFailure(db, key);
    return reject("INVALID_CREDENTIALS", 401);
  }
  await resetFailures(db, key);
  const session = await sessionData(user.id);
  await dbStmt(db, `INSERT INTO sessions(id_hash,user_id,expires_at) VALUES(?,?,?)`,
    session.idHash, user.id, session.expires).run();
  return json({ user: { username: user.username }, categories: await userEntitlements(db, user.id) },
    200, { "set-cookie": sessionCookie(session.token, req) });
}
async function logout(req, env) {
  const token = readSessionCookie(req);
  if (token) await dbStmt(env.DB, "DELETE FROM sessions WHERE id_hash=?", await sha256(token)).run();
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie(req) });
}
async function redeem(req, env, user) {
  const body = await parseBody(req);
  const code = normalizeCode(body.activationCode);
  if (!code) return reject("INVALID_ACTIVATION", 400);
  const db = env.DB;
  const key = await throttleKey(env, "redeem", req, user.id);
  if (await isBlocked(db, key)) return reject("TOO_MANY_ATTEMPTS", 429);
  const codeHash = await hashCode(code, env);
  const redemptionNonce = crypto.randomUUID();
  try {
    // Batch checks "unused" and that user does not already own this category.
    // An empty UPDATE makes the following INSERT fail (non-null FK); full rollback.
    await db.batch([
      dbStmt(db, `UPDATE activation_codes SET status='redeemed', redeemed_by=?, redeemed_at=CURRENT_TIMESTAMP, redemption_nonce=?
        WHERE code_hash=? AND status='unused'
        AND EXISTS(SELECT 1 FROM categories c WHERE c.id=activation_codes.category_id AND c.is_visible=1)
        AND NOT EXISTS(SELECT 1 FROM entitlements e
          WHERE e.user_id=? AND e.category_id=activation_codes.category_id AND e.revoked_at IS NULL)`,
        user.id, redemptionNonce, codeHash, user.id),
      dbStmt(db, `INSERT INTO entitlements(user_id,category_id,source_code_id)
        VALUES(?, (SELECT category_id FROM activation_codes WHERE code_hash=? AND redeemed_by=? AND redemption_nonce=? AND status='redeemed'),
          (SELECT id FROM activation_codes WHERE code_hash=? AND redeemed_by=? AND redemption_nonce=? AND status='redeemed'))
        ON CONFLICT(user_id,category_id) DO UPDATE SET
          source_code_id=excluded.source_code_id,
          scope_version='launch', revoked_at=NULL, granted_at=CURRENT_TIMESTAMP`,
        user.id, codeHash, user.id, redemptionNonce, codeHash, user.id, redemptionNonce)
    ]);
  } catch {
    await countFailure(db, key);
    return reject("INVALID_OR_ALREADY_OWNED", 409);
  }
  await resetFailures(db, key);
  return json({ ok: true, categories: await userEntitlements(db, user.id) });
}
async function chapterAccess(req, env, id, user) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return reject("NOT_FOUND", 404);
  // Unpublished chapters and categories are not accessible, even to buyers.
  const row = await dbStmt(env.DB, `SELECT ch.id,ch.title,ch.chapter_no,ch.content_json,ch.is_preview,
    b.category_id FROM chapters ch
    JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id
    WHERE ch.id=? AND ch.published_at IS NOT NULL AND ch.published_at <= CURRENT_TIMESTAMP
    AND b.status='published' AND c.is_visible=1`, id).first();
  if (!row) return reject("NOT_FOUND", 404);
  if (!row.is_preview) {
    if (!user) return reject("LOGIN_REQUIRED", 401);
    const permission = await dbStmt(env.DB, `SELECT 1 AS allowed FROM entitlements
      WHERE user_id=? AND category_id=? AND revoked_at IS NULL`, user.id, row.category_id).first();
    if (!permission) return reject("PURCHASE_REQUIRED", 403);
  }
  let content;
  try { content = JSON.parse(row.content_json); }
  catch { return reject("CONTENT_UNAVAILABLE", 503); }
  return json({ id: row.id, chapterNo: row.chapter_no, title: row.title, content });
}
async function api(req, env) {
  const path = new URL(req.url).pathname;
  if (path === "/api/health" && req.method === "GET") {
    return json({ ok: true, app: "miaowu-english", stage: "s1-dev",
      dbBound: !!env.DB,
      activationSecretReady: typeof env.ACTIVATION_PEPPER === "string" && env.ACTIVATION_PEPPER.length >= 32,
      // Only disclose a coarse status in password-protected staging. Never return the secret or its length.
      activationSecretStatus: env.APP_ENV === "staging"
        ? (env.ACTIVATION_PEPPER == null ? "missing"
          : typeof env.ACTIVATION_PEPPER !== "string" ? "invalid_type"
          : env.ACTIVATION_PEPPER.length < 32 ? "too_short" : "ready")
        : "hidden",
      authConfigured: !!env.DB && typeof env.ACTIVATION_PEPPER === "string" && env.ACTIVATION_PEPPER.length >= 32,
      paymentIntegration: false });
  }
  if (!env.DB || !env.ACTIVATION_PEPPER || env.ACTIVATION_PEPPER.length < 32) {
    return reject("SERVICE_NOT_CONFIGURED", 503);
  }
  if (req.method === "POST" && !checkOrigin(req)) return reject("INVALID_ORIGIN", 403);
  const user = await currentUser(req, env.DB);
  if (path === "/api/auth/register" && req.method === "POST") return register(req, env);
  if (path === "/api/auth/login" && req.method === "POST") return login(req, env);
  if (path === "/api/auth/logout" && req.method === "POST") return logout(req, env);
  if (path === "/api/auth/me" && req.method === "GET") {
    if (!user) return reject("LOGIN_REQUIRED", 401);
    return json({ user: { username: user.username }, categories: await userEntitlements(env.DB, user.id) });
  }
  if (path === "/api/activate" && req.method === "POST") {
    if (!user) return reject("LOGIN_REQUIRED", 401);
    return redeem(req, env, user);
  }
  if (path === "/api/categories" && req.method === "GET") {
    const data = await env.DB.prepare("SELECT id,slug,title FROM categories WHERE is_visible=1 ORDER BY slug").all();
    return json({ categories: data.results || [] });
  }
  if (path === "/api/books" && req.method === "GET") {
    const slug = new URL(req.url).searchParams.get("category");
    if (!slug || !/^[a-z0-9-]{2,36}$/.test(slug)) return reject("INVALID_CATEGORY", 400);
    const data = await dbStmt(env.DB, `SELECT b.id,b.title,b.description,b.cover_key,b.sort_order
      FROM books b JOIN categories c ON c.id=b.category_id WHERE c.slug=?
      AND c.is_visible=1 AND b.status='published' ORDER BY b.sort_order LIMIT 100`, slug).all();
    return json({ books: data.results || [] });
  }
  const chapterMatch = path.match(/^\/api\/chapters\/([^/]+)$/);
  if (chapterMatch && req.method === "GET") return chapterAccess(req, env, chapterMatch[1], user);
  return reject("NOT_FOUND", 404);
}
export default {
  async fetch(request, env) {
    // Staging gate applies to both public files and API routes.
    // Wrangler assets.run_worker_first MUST remain true for this to work.
    const blocked = await stagingGate(request, env);
    if (blocked) return blocked;
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/")) {
      const response = await env.ASSETS.fetch(request);
      if (env.APP_ENV !== "staging") return response;
      const headers = new Headers(response.headers);
      headers.set("cache-control", "private, no-store");
      return new Response(response.body, { status: response.status, headers });
    }
    try {
      const host = new URL(request.url).hostname;
      if (new URL(request.url).protocol !== "https:" && host !== "localhost" && host !== "127.0.0.1") {
        return reject("HTTPS_REQUIRED", 403);
      }
      return await api(request, env);
    } catch (err) {
      if (["CONTENT_TYPE", "TOO_LARGE", "INVALID_JSON"].includes(err?.message)) return reject(err.message, 400);
      // Do not reveal SQL errors, credentials or activation information to clients.
      return reject("INTERNAL_ERROR", 500);
    }
  }
};