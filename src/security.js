// Shared security helpers for Cloudflare Workers (WebCrypto; no Node-only runtime).
export const COOKIE = "mw_session";
const encoder = new TextEncoder();
const ITERATIONS = 310000;
const SESSION_DAYS = 14;

export function asText(value) {
  return typeof value === "string" ? value : "";
}
export function normalizedUsername(raw) {
  const username = asText(raw).normalize("NFKC").trim().toLowerCase();
  return /^[\p{L}\p{N}_-]{3,24}$/u.test(username) ? username : null;
}
export function validPassword(password) {
  return typeof password === "string" && password.length >= 10 &&
    password.length <= 128 && encoder.encode(password).byteLength <= 256;
}
export function normalizeCode(value) {
  const code = asText(value).normalize("NFKC").toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z0-9]{16,80}$/.test(code) ? code : null;
}
function hex(bytes) {
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
function unhex(value) {
  if (!/^[0-9a-f]+$/.test(value) || value.length % 2 !== 0) return null;
  return Uint8Array.from(value.match(/.{2}/g), x => parseInt(x, 16));
}
export function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}
function safeCompare(a, b) {
  const aa = unhex(a);
  const bb = unhex(b);
  if (!aa || !bb || aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
export async function sha256(value) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
export async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}
export function requireSecret(env) {
  if (typeof env.ACTIVATION_PEPPER !== "string" || env.ACTIVATION_PEPPER.length < 32) {
    throw new Error("Missing strong ACTIVATION_PEPPER configuration");
  }
  return env.ACTIVATION_PEPPER;
}
export async function hashCode(code, env) {
  return hmacHex(requireSecret(env), "code:" + code);
}
export async function newPasswordHash(password) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { hash: await derive(password, salt), salt };
}
async function derive(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations: ITERATIONS
  }, key, 256);
  return "pbkdf2_sha256_" + ITERATIONS + "$" + hex(bits);
}
export async function verifyPassword(password, salt, expected) {
  if (typeof expected !== "string" || !expected.startsWith("pbkdf2_sha256_" + ITERATIONS + "$")) return false;
  const generated = await derive(password, salt);
  return safeCompare(generated.split("$")[1], expected.split("$")[1]);
}
export async function sessionData(userId) {
  const token = randomToken();
  const idHash = await sha256(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString().slice(0,19).replace("T", " ");
  return { token, idHash, userId, expires };
}
export function sessionCookie(token, request) {
  const host = new URL(request.url).hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  if (new URL(request.url).protocol !== "https:" && !local) throw new Error("HTTPS required");
  return COOKIE + "=" + token + "; HttpOnly; Path=/; SameSite=Lax; Max-Age=" + (SESSION_DAYS * 86400) +
    (local && new URL(request.url).protocol === "http:" ? "" : "; Secure");
}
export function clearSessionCookie(request) {
  return sessionCookie("", request).replace(/Max-Age=\d+/, "Max-Age=0");
}
export function readSessionCookie(request) {
  const raw = request.headers.get("cookie") || "";
  const item = raw.split(";").map(s => s.trim()).find(s => s.startsWith(COOKIE + "="));
  const token = item?.slice(COOKIE.length + 1);
  return token && /^[0-9a-f]{64}$/.test(token) ? token : null;
}
export function checkOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}
export async function throttleKey(env, route, request, username = "") {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  // Store hashes rather than raw IP addresses or usernames.
  return hmacHex(requireSecret(env), "attempt:" + route + ":" + ip + ":" + username);
}
export async function isBlocked(db, key) {
  const row = await db.prepare("SELECT attempts, reset_at FROM request_throttle WHERE key = ?").bind(key).first();
  return !!(row && row.reset_at > Math.floor(Date.now()/1000) && row.attempts >= 10);
}
export async function countFailure(db, key) {
  const reset = Math.floor(Date.now()/1000) + 900;
  await db.prepare(\`INSERT INTO request_throttle(key, attempts, reset_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET
    attempts = CASE WHEN request_throttle.reset_at <= unixepoch() THEN 1 ELSE request_throttle.attempts + 1 END,
    reset_at = CASE WHEN request_throttle.reset_at <= unixepoch() THEN excluded.reset_at ELSE request_throttle.reset_at END\`).bind(key, reset).run();
}
export async function resetFailures(db, key) {
  await db.prepare("DELETE FROM request_throttle WHERE key = ?").bind(key).run();
}
