// Protected staging access gate. First page visit uses HTTP Basic; a signed,
// HttpOnly host-only preview cookie then authenticates subsequent same-site fetches.
// Do not confuse this cookie with mw_session (the actual user-login session).
const encoder = new TextEncoder();
const noCache = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
const PREVIEW_COOKIE = "__Host-mw_preview";
const PREVIEW_TTL_SECONDS = 8 * 3600;

async function digest(s) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
}
function equalBytes(a,b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
async function validBasic(req, env) {
  const header = req.headers.get("Authorization") || "";
  let supplied = "";
  if (header.startsWith("Basic ") && header.length < 1024) {
    try {
      const decoded = atob(header.slice(6).trim());
      const colon = decoded.indexOf(":");
      if (colon !== -1 && decoded.slice(0, colon) === "reviewer") {
        supplied = decoded.slice(colon + 1);
      }
    } catch {}
  }
  return supplied.length > 0 &&
    equalBytes(await digest(supplied), await digest(env.STAGING_PREVIEW_PASSWORD));
}
async function signPreview(expiry, env) {
  const key = await crypto.subtle.importKey("raw",
    encoder.encode(env.STAGING_PREVIEW_PASSWORD),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key,
    encoder.encode("miaowu:staging-preview:v1:" + expiry));
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
}
async function validPreviewCookie(req, env) {
  const raw = (req.headers.get("Cookie") || "").split(";").map(s => s.trim())
    .find(s => s.startsWith(PREVIEW_COOKIE + "="));
  if (!raw) return false;
  const value = raw.slice(PREVIEW_COOKIE.length + 1);
  if (!/^\d{10}\.[0-9a-f]{64}$/.test(value)) return false;
  const [expiryText, signature] = value.split(".");
  const expiry = Number(expiryText);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiry) || expiry <= now ||
      expiry > now + PREVIEW_TTL_SECONDS) return false;
  const expected = await signPreview(expiryText, env);
  return equalBytes(encoder.encode(signature), encoder.encode(expected));
}
export async function stagingGate(req, env) {
  if (env.APP_ENV !== "staging") return null;
  if (typeof env.STAGING_PREVIEW_PASSWORD !== "string" || env.STAGING_PREVIEW_PASSWORD.length < 16) {
    return new Response("Staging is not ready. Set STAGING_PREVIEW_PASSWORD in Cloudflare Secrets.", {
      status: 503, headers: noCache
    });
  }
  if (await validPreviewCookie(req, env) || await validBasic(req, env)) return null;

  // Do NOT trigger the browser's modal HTTP Basic prompt for background API
  // fetches. Still challenge direct visits to the HTML site, so no privacy
  // weakening occurs. In either case the endpoint remains private.
  const api = new URL(req.url).pathname.startsWith("/api/");
  return new Response(api
    ? JSON.stringify({ error: "STAGING_ACCESS_REQUIRED" })
    : "Staging preview: credentials required.", {
    status: 401,
    headers: {
      ...noCache,
      ...(api ? { "content-type": "application/json; charset=utf-8" }
        : { "www-authenticate": 'Basic realm="Miaowu Staging", charset="UTF-8"' })
    }
  });
}
export async function stagingCookieAfterBasic(req, env) {
  if (env.APP_ENV !== "staging" || typeof env.STAGING_PREVIEW_PASSWORD !== "string" ||
      env.STAGING_PREVIEW_PASSWORD.length < 16) return null;
  if (await validPreviewCookie(req, env) || !(await validBasic(req, env))) return null;
  const expiry = String(Math.floor(Date.now() / 1000) + PREVIEW_TTL_SECONDS);
  const signature = await signPreview(expiry, env);
  return PREVIEW_COOKIE + "=" + expiry + "." + signature +
    "; Path=/; Max-Age=" + PREVIEW_TTL_SECONDS + "; HttpOnly; Secure; SameSite=Lax";
}
