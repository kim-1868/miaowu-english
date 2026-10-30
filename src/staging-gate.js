// Whole-site staging access gate. Uses a dashboard-only Worker Secret.
// Protects the V0.3 demo and experimental API; it does not replace app authentication.
const encoder = new TextEncoder();
const noCache = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
async function digest(s) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
}
function eqDigest(a,b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
export async function stagingGate(req, env) {
  if (env.APP_ENV !== "staging") return null;
  if (typeof env.STAGING_PREVIEW_PASSWORD !== "string" || env.STAGING_PREVIEW_PASSWORD.length < 16) {
    return new Response("Staging is not ready. Set STAGING_PREVIEW_PASSWORD in Cloudflare Secrets.", {
      status: 503, headers: noCache
    });
  }
  const header = req.headers.get("Authorization") || "";
  let supplied = "";
  if (header.startsWith("Basic ") && header.length < 1024) {
    try {
      const decoded = atob(header.slice(6).trim());
      const idx = decoded.indexOf(":");
      if (idx !== -1 && decoded.slice(0, idx) === "reviewer") supplied = decoded.slice(idx + 1);
    } catch {}
  }
  const ok = supplied.length > 0 &&
    await eqDigest(await digest(supplied), await digest(env.STAGING_PREVIEW_PASSWORD));
  if (!ok) {
    return new Response("Staging preview: credentials required.", {
      status: 401,
      headers: { ...noCache, "www-authenticate": 'Basic realm="Miaowu Staging", charset="UTF-8"' }
    });
  }
  return null;
}
