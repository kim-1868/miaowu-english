import { stagingGate, stagingCookieAfterBasic } from "./staging-gate.js";
import { productionSurfaceBlock } from "./production-surface.js";
import {createRecoveryCode,recoveryDigest} from "./recovery-code.js";
import { handleEditor } from "./editorial-admin.js";
import { handleOps } from "./ops-access.js";
import { handleOpsPublication } from "./ops-publication.js";
import { handleOpsConsole } from "./ops-console.js";
import {handleSiteAnnouncements} from "./site-announcements.js";
import { handleOpsSales } from "./ops-sales.js";
import { handleOpsCustomers } from "./ops-customers.js";
import {handleOpsVoucher} from "./ops-vouchers.js";
import { handleOpsClaims } from "./ops-claims.js";
import { handlePublicClaim } from "./self-service-claims.js";
import { handleOpsImport } from "./ops-import.js";
import {handleOpsImportPreflight} from "./ops-import-preflight.js";
import { handleOpsDraftRevision } from "./ops-draft-revision.js";
import { handleOpsLiveEdit } from "./ops-live-edit.js";
import { handleBookCover } from "./book-covers.js";
import { handleBookCoverTags } from "./book-cover-tags.js";
import { handleLearningState } from "./reading-library.js";
import {handleSmartVocab} from "./smart-vocab-api.js";
import {handleMyBookshelf} from "./my-bookshelf.js";
import {handleExampleWordLookup} from "./example-word-lookup.js";
import {onboardingSchemaReady,registrationOnboardingStatement,handleOnboarding} from "./onboarding.js";
import { annotateStudyWords } from "./study-identity.js";
import {handleEcho} from "./echo-cloud.js";
import {
  normalizedUsername, validPassword, normalizeCode, hashCode, newPasswordHash,
  verifyPassword, sha256, sessionData, sessionCookie, clearSessionCookie,
  readSessionCookie, checkOrigin, throttleKey, isBlocked, countFailure,
  resetFailures, requireSecret, hmacHex
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
// QA-safe failure stages: never expose database errors, SQL, credentials, or raw vouchers.
async function atStage(label, operation) {
  try { return await operation(); }
  catch (error) {
    const wrapped = new Error("STAGE_FAILURE");
    wrapped.stage = label;
    wrapped.cause = error;
    throw wrapped;
  }
}
function stagingErrorResponse(env, error) {
  const stage = env.APP_ENV === "staging" ? (error?.stage || "unclassified") : undefined;
  // Logs are tagged with fixed labels only, not error messages or private data.
  console.error("S1_API_FAILURE", stage || "internal");
  return json(stage ? { error: "INTERNAL_ERROR", diagnosticStage: stage }
    : { error: "INTERNAL_ERROR" }, 500);
}
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
    WHERE e.user_id=? AND e.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked') ORDER BY c.slug`, userId).all();
  return result.results || [];
}
async function register(req, env) {
  const body = await parseBody(req);
  const username = normalizedUsername(body.username);
  if (!username || !validPassword(body.password)) return reject("INVALID_USERNAME_OR_PASSWORD", 400);
  const code = normalizeCode(body.activationCode);
  if (!code) return reject("INVALID_ACTIVATION", 400);
  const db = env.DB;
  const key = await atStage("register.throttle_key", () => throttleKey(env, "register", req));
  if (await atStage("register.throttle_check", () => isBlocked(db, key))) return reject("TOO_MANY_ATTEMPTS", 429);
  const codeHash = await atStage("register.code_digest", () => hashCode(code, env));
  const redemptionNonce = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const { hash, salt } = await atStage("register.password_hash", () => newPasswordHash(body.password, env));
  const session = await atStage("register.session_token", () => sessionData(userId));
  const recovery=null; // Manual account recovery only: do not issue end-user recovery codes.
  const onboardingReady=await onboardingSchemaReady(env);
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
        session.idHash, userId, session.expires),
      ...(recovery?[dbStmt(db,`INSERT INTO account_recovery(user_id,code_hash)
        VALUES(?,?)`,userId,recovery.codeHash)]:[]),
      ...(onboardingReady?[registrationOnboardingStatement(env,userId)]:[])
    ]);
  } catch {
    await atStage("register.failed_attempt", () => countFailure(db, key));
    return json({ error: "INVALID_ACTIVATION_OR_USERNAME",
      ...(env.APP_ENV === "staging" ? { diagnosticStage: "register.transaction_rejected" } : {})
    }, 409);
  }
  await atStage("register.reset_attempts", () => resetFailures(db, key));
  const categories = await atStage("register.list_entitlements", () => userEntitlements(db, userId));
  return json({ user: { username }, categories, ...(recovery?{recoveryCode:recovery.displayCode}:{}) }, 201, { "set-cookie": sessionCookie(session.token, req) });
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
  if (user) matched = await verifyPassword(body.password, user.password_salt, user.password_hash, env);
  else await newPasswordHash(body.password, env); // Avoid fast account-enumeration timing.
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
// Authenticated password rotation. No account-recovery bypass here:
// the reader must prove knowledge of their CURRENT password.
async function changePassword(req, env, user) {
  if (!user) return reject("LOGIN_REQUIRED", 401);
  const body = await parseBody(req);
  const currentPassword = body.currentPassword;
  const nextPassword = body.newPassword;
  if (typeof currentPassword !== "string" || currentPassword.length > 128 ||
      !validPassword(nextPassword)) return reject("INVALID_PASSWORD_INPUT", 400);
  if (currentPassword === nextPassword) return reject("PASSWORD_REUSE_NOT_ALLOWED", 400);

  const db=env.DB;
  const throttle=await atStage("password_change.throttle_key",
    ()=>throttleKey(env,"password-change",req,user.id));
  if(await atStage("password_change.throttle_check",()=>isBlocked(db,throttle)))
    return reject("TOO_MANY_ATTEMPTS",429);
  const stored=await atStage("password_change.lookup",
    ()=>dbStmt(db,"SELECT password_hash,password_salt FROM users WHERE id=?",user.id).first());
  const correct=stored && await verifyPassword(currentPassword,
    stored.password_salt,stored.password_hash,env);
  if(!correct){
    await atStage("password_change.failed_attempt",()=>countFailure(db,throttle));
    return reject("INVALID_CURRENT_PASSWORD",401);
  }
  const {hash,salt}=await atStage("password_change.new_hash",
    ()=>newPasswordHash(nextPassword,env));
  const nextSession=await atStage("password_change.next_session",
    ()=>sessionData(user.id));
  const recovery=null; // Manual account recovery only: do not issue end-user recovery codes.
  try {
    // Atomic D1.batch:
    // 1) Compare-and-set password prevents stale concurrent requests.
    // 2) Revoke all old device sessions.
    // 3) Guarded INSERT rolls back the entire batch when (1) lost the race.
    // The new device keeps only a fresh, rotated HttpOnly session.
    await db.batch([
      dbStmt(db,`UPDATE users SET password_hash=?,password_salt=?
        WHERE id=? AND password_hash=? AND password_salt=?`,
        hash,salt,user.id,stored.password_hash,stored.password_salt),
      dbStmt(db,"DELETE FROM sessions WHERE user_id=?",user.id),
      dbStmt(db,`INSERT INTO sessions(id_hash,user_id,expires_at)
        VALUES(?,(SELECT id FROM users WHERE id=? AND password_hash=? AND password_salt=?),?)`,
        nextSession.idHash,user.id,hash,salt,nextSession.expires),
      ...(recovery?[dbStmt(db,`INSERT INTO account_recovery(user_id,code_hash,issued_at)
        VALUES(?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          code_hash=excluded.code_hash,issued_at=CURRENT_TIMESTAMP`,
        user.id,recovery.codeHash)]:[])
    ]);
  } catch {
    // Never leak salts, password material, internal database errors or SQL.
    return reject("PASSWORD_CHANGE_RETRY",409);
  }
  await atStage("password_change.reset_attempts",()=>resetFailures(db,throttle));
  return json({ok:true,otherSessionsRevoked:true,...(recovery?{recoveryCode:recovery.displayCode}:{})},200,
    {"set-cookie":sessionCookie(nextSession.token,req)});
}
// One-time offline account recovery. Produces a NEW one-time code, revokes
// all old login sessions, and returns the fresh session cookie. Failed codes
// cannot consume or replace the old one because D1.batch rolls back entirely.
async function recoverAccount(req,env){
 if(env.APP_ENV!=="production")return reject("NOT_FOUND",404);
 const body=await parseBody(req);
 const username=normalizedUsername(body.username);
 const digest=await recoveryDigest(body.recoveryCode,env);
 const newPassword=body.newPassword;
 if(!username||!digest||!validPassword(newPassword))
  return reject("INVALID_RECOVERY_INPUT",400);
 const db=env.DB;
 const key=await throttleKey(env,"account-recovery",req,username);
 const sourceKey=await throttleKey(env,"account-recovery-source",req);
 if(await isBlocked(db,key)||await isBlocked(db,sourceKey))
  return reject("TOO_MANY_ATTEMPTS",429);
 // Always calculate a fresh salted password hash, even for unknown username.
 const {hash,salt}=await newPasswordHash(newPassword,env);
 const replacement=await createRecoveryCode(env);
 const userRecord=await dbStmt(db,"SELECT id,username FROM users WHERE username=?",username).first();
 const nextSession=await sessionData(userRecord?.id||"nonexistent");
 try{
  await db.batch([
   dbStmt(db,`UPDATE account_recovery SET code_hash=?,issued_at=CURRENT_TIMESTAMP
     WHERE user_id=(SELECT id FROM users WHERE username=?) AND code_hash=?`,
     replacement.codeHash,username,digest),
   dbStmt(db,`UPDATE users SET password_hash=?,password_salt=?
     WHERE username=? AND EXISTS(SELECT 1 FROM account_recovery r
     WHERE r.user_id=users.id AND r.code_hash=?)`,
     hash,salt,username,replacement.codeHash),
   dbStmt(db,`DELETE FROM sessions WHERE user_id=
     (SELECT user_id FROM account_recovery WHERE code_hash=?)`,
     replacement.codeHash),
   dbStmt(db,`INSERT INTO sessions(id_hash,user_id,expires_at)
     VALUES(?,(SELECT user_id FROM account_recovery WHERE code_hash=?),?)`,
     nextSession.idHash,replacement.codeHash,nextSession.expires)
  ]);
 }catch{
  await countFailure(db,key);
  await countFailure(db,sourceKey);
  return reject("INVALID_RECOVERY_CREDENTIALS",401);
 }
 await resetFailures(db,key);
 await resetFailures(db,sourceKey);
 return json({user:{username},
   categories:await userEntitlements(db,userRecord.id),
   recoveryCode:replacement.displayCode,oldSessionsRevoked:true
 },200,{"set-cookie":sessionCookie(nextSession.token,req)});
}
// Paid-order self-service recovery requires TWO independent values:
// the user's Xiaohongshu order reference AND a strong one-time recovery key
// delivered privately with the voucher. An order number alone is never proof
// of account ownership. The legacy recovery endpoint remains disabled.
function normalizePaidOrderReference(value){
 if(typeof value!=="string")return null;
 const raw=value.normalize("NFKC").trim().toUpperCase();
 const order=raw.startsWith("ORD-")?raw:"ORD-"+raw;
 return /^ORD-[A-Z0-9][A-Z0-9_-]{5,55}$/.test(order)?order:null;
}
function normalizePaidRecoveryKey(value){
 if(typeof value!=="string")return null;
 const code=value.normalize("NFKC").toUpperCase().replace(/[\s-]/g,"");
 return /^MWREC[A-F0-9]{40}$/.test(code)?code:null;
}
async function paidRecoveryDigest(value,env){
 const key=normalizePaidRecoveryKey(value);
 return key?await hmacHex(requireSecret(env),"order-recovery:v1:"+key):null;
}
async function freshPaidRecovery(env){
 const bytes=crypto.getRandomValues(new Uint8Array(20));
 const raw=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
 const display="MW-REC-"+(raw.match(/.{8}/g)||[]).join("-");
 return {display,hash:await paidRecoveryDigest(display,env)};
}
async function recoverWithPaidOrder(req,env){
 // Mandatory feature flag ensures deploying code before the schema migration
 // cannot accidentally activate an unprepared account recovery surface.
 if(env.APP_ENV!=="production"||env.ORDER_RECOVERY_ENABLED!=="true")
  return reject("ORDER_RECOVERY_UNAVAILABLE",503);
 const body=await parseBody(req);
 const username=normalizedUsername(body.username);
 const orderReference=normalizePaidOrderReference(body.orderReference);
 const digest=await paidRecoveryDigest(body.recoveryKey,env);
 const password=body.newPassword;
 if(!username||!orderReference||!digest||!validPassword(password))
  return reject("INVALID_ORDER_RECOVERY_INPUT",400);
 const db=env.DB;
 const userThrottle=await throttleKey(env,"paid-order-recovery",req,username);
 const sourceThrottle=await throttleKey(env,"paid-order-recovery-source",req);
 if(await isBlocked(db,userThrottle)||await isBlocked(db,sourceThrottle))
  return reject("TOO_MANY_ATTEMPTS",429);
 // Same amount of expensive password work even when the lookup fails.
 const {hash,salt}=await newPasswordHash(password,env);
 const row=await dbStmt(db,`SELECT a.id AS code_id,u.id AS user_id,u.password_hash AS old_hash,
     u.password_salt AS old_salt FROM activation_codes a
     JOIN users u ON u.id=a.redeemed_by
     JOIN order_recovery_credentials r ON r.code_id=a.id
     WHERE a.order_reference=? AND a.status='redeemed'
       AND u.username=? AND r.secret_hash=?`,
     orderReference,username,digest).first();
 if(!row){
  await countFailure(db,userThrottle);await countFailure(db,sourceThrottle);
  return reject("INVALID_ORDER_RECOVERY_CREDENTIALS",401);
 }
 const fresh=await freshPaidRecovery(env);
 const session=await sessionData(row.user_id);
 try{
  // Compare-and-set key, user password, and session in one transaction.
  // A concurrent request cannot re-use the consumed key. Any failed
  // statement rolls back the key rotation and password change together.
  await db.batch([
   dbStmt(db,`UPDATE order_recovery_credentials SET secret_hash=?,last_used_at=CURRENT_TIMESTAMP,
     reset_count=reset_count+1 WHERE code_id=? AND secret_hash=?`,
     fresh.hash,row.code_id,digest),
   dbStmt(db,`UPDATE users SET password_hash=?,password_salt=?
      WHERE id=? AND password_hash=? AND password_salt=?
      AND EXISTS(SELECT 1 FROM order_recovery_credentials
       WHERE code_id=? AND secret_hash=?)`,
     hash,salt,row.user_id,row.old_hash,row.old_salt,row.code_id,fresh.hash),
   dbStmt(db,"DELETE FROM sessions WHERE user_id=?",row.user_id),
   dbStmt(db,`INSERT INTO sessions(id_hash,user_id,expires_at)
      VALUES(?,(SELECT u.id FROM users u JOIN order_recovery_credentials r
        ON r.code_id=? JOIN activation_codes a ON a.id=r.code_id
        WHERE u.id=? AND a.redeemed_by=u.id
          AND r.secret_hash=? AND u.password_hash=? AND u.password_salt=?),?)`,
      session.idHash,row.code_id,row.user_id,fresh.hash,hash,salt,session.expires)
  ]);
 }catch{
  await countFailure(db,userThrottle);await countFailure(db,sourceThrottle);
  return reject("INVALID_ORDER_RECOVERY_CREDENTIALS",401);
 }
 await resetFailures(db,userThrottle);
 // A successful reset revokes all sessions on other devices and shows
 // the replacement key once; it is never stored in browser storage.
 return json({ok:true,oldSessionsRevoked:true,recoveryKey:fresh.display,
   user:{username},categories:await userEntitlements(db,row.user_id)},200,
   {"set-cookie":sessionCookie(session.token,req)});
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
          WHERE e.user_id=? AND e.category_id=activation_codes.category_id AND e.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked'))`,
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
    const permission = await dbStmt(env.DB, `SELECT 1 AS allowed FROM entitlements e
      WHERE e.user_id=? AND e.category_id=? AND e.revoked_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked')`, user.id, row.category_id).first();
    if (!permission) return reject("PURCHASE_REQUIRED", 403);
  }
  let content;
  try { content = JSON.parse(row.content_json); }
  catch { return reject("CONTENT_UNAVAILABLE", 503); }
  return json({ id: row.id, chapterNo: row.chapter_no, title: row.title, content });
}
async function chapterVocabulary(req, env, id, user) {
  // Authorize by the same D1 check used for paid body. Word contexts are paid
  // content too; unauthorized requests must not reveal narrative sentences.
  const access = await chapterAccess(req, env, id, user);
  if (!access.ok) return access;
  const result = await dbStmt(env.DB, `SELECT cw.word_id,cw.context_sentence,cw.context_anchor,
    w.headword,w.phonetic_uk,w.phonetic_us,w.part_of_speech,w.meaning_zh,
    w.example_en,w.example_zh,w.collocations_json
    FROM chapter_words cw JOIN words w ON w.id=cw.word_id
    WHERE cw.chapter_id=? ORDER BY cw.context_anchor LIMIT 2000`, id).all();
  return json({chapterId:id, words:await annotateStudyWords(env,user?.id||null,(result.results || []).map(row=>{
    let collocations=[];
    try { const value=JSON.parse(row.collocations_json || "[]");
      if(Array.isArray(value)) collocations=value.slice(0,8); } catch {}
    const {collocations_json,...fields}=row;
    return {...fields,collocations};
  }))});
}

async function chapterCatalog(env, bookId, user) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(bookId)) return reject("NOT_FOUND", 404);
  // Chapter titles are discoverable, but paid content stays exclusively in D1.
  const book = await dbStmt(env.DB, `SELECT b.id,b.title,c.slug AS category
    FROM books b JOIN categories c ON c.id=b.category_id
    WHERE b.id=? AND b.status='published' AND c.is_visible=1`, bookId).first();
  if (!book) return reject("NOT_FOUND", 404);
  const data = await dbStmt(env.DB, `SELECT ch.id,ch.chapter_no,ch.title,ch.is_preview
    FROM chapters ch WHERE ch.book_id=? AND ch.published_at IS NOT NULL
    AND ch.published_at<=CURRENT_TIMESTAMP ORDER BY ch.chapter_no LIMIT 300`, bookId).all();
  let allowed = false;
  if (user) {
    const permission = await dbStmt(env.DB, `SELECT 1 AS allowed FROM entitlements e
      JOIN categories c ON c.id=e.category_id
      WHERE e.user_id=? AND c.slug=? AND e.revoked_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked')`, user.id, book.category).first();
    allowed = !!permission;
  }
  return json({ book, chapters: (data.results || []).map(ch => ({
    id:ch.id, chapterNo:ch.chapter_no, title:ch.title,
    isPreview: !!ch.is_preview, canRead: !!ch.is_preview || allowed
  })) });
}
async function seedStagingChapterFixture(env) {
  // Fixed harmless QA data. Only reachable behind stagingGate and same-origin POST.
  if (env.APP_ENV !== "staging") return reject("NOT_FOUND",404);
  const books = [
    ["qa-cet4", "cet4", "【测试书目】四级内容权限验证"],
    ["qa-cet6", "cet6", "【测试书目】六级内容权限验证"]
  ];
  const chapters = [
    ["qa-cet4-free", "qa-cet4", 1, "【测试】四级免费试读", 1,
      ["这是仅用于测试的公开试读章节，不属于正式小说商品。", "访客可以阅读这一章，即使没有四级权限。"]],
    ["qa-cet4-paid", "qa-cet4", 2, "【测试】四级会员章节", 0,
      ["这是只保存在 Cloudflare D1 测试数据库的四级受限正文。", "如果没有四级权益，服务器必须拒绝返回这些段落。"]],
    ["qa-cet6-paid", "qa-cet6", 1, "【测试】六级会员章节", 0,
      ["这是只保存在 Cloudflare D1 测试数据库的六级受限正文。", "仅拥有四级分类，不应该能够阅读这一章。"]]
  ];
  const commands = [];
  for (const [id, category, title] of books) {
    commands.push(dbStmt(env.DB, `INSERT OR IGNORE INTO books
      (id,category_id,title,description,status,sort_order)
      VALUES(?,?,?,'仅用于测试服务器端付费章节鉴权，不代表真实商品。','published',0)`,
      id,category,title));
  }
  for (const [id, bookId, chapterNo, title, preview, paragraphs] of chapters) {
    commands.push(dbStmt(env.DB, `INSERT OR IGNORE INTO chapters
      (id,book_id,chapter_no,title,content_json,is_preview,published_at)
      VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`,id,bookId,chapterNo,title,
      JSON.stringify({ paragraphs, testOnly:true }),preview));
  }
  await env.DB.batch(commands);
  return json({ ok:true, testOnly:true, bookCount:books.length, chapterCount:chapters.length });
}

async function seedStagingWordbookFixture(env) {
  // Idempotent, harmless test chapter. Only reviewer-protected staging.
  if(env.APP_ENV!=="staging")return reject("NOT_FOUND",404);
  const book=await dbStmt(env.DB,"SELECT id,status FROM books WHERE id='qa-cet4'").first();
  if(!book||book.status!=="published")return reject("QA_BOOK_NOT_READY",409);
  const id="qa-cet4-wordbook",wordId="qa-word-promise";
  const sentence="她答应遵守这个 promise，却仍把真正的心愿藏进信里。";
  const content={version:1,testOnly:true,paragraphs:[
    {segments:[{text:"这是一章仅用于测试云端点词和收藏功能的内容，不是真正的小说作品。"}]},
    {segments:[{text:"她答应遵守这个 "},{wordId,surface:"promise",gloss:"承诺"},
      {text:"，却仍把真正的心愿藏进信里。"}]}
  ]};
  await env.DB.batch([
    dbStmt(env.DB,
      "INSERT OR IGNORE INTO words "+
      "(id,headword,phonetic_uk,phonetic_us,part_of_speech,meaning_zh,example_en,example_zh,collocations_json) "+
      "VALUES(?,?,?,?,?,?,?,?,?)",
      wordId,"promise","/ˈprɒmɪs/","/ˈprɑːmɪs/","n./v.","承诺；答应",
      "She made a promise to her sister.","她向妹妹许下了承诺。",
      JSON.stringify([{en:"keep a promise",zh:"遵守诺言"},{en:"make a promise",zh:"许下承诺"}])),
    dbStmt(env.DB,
      "INSERT OR IGNORE INTO chapters "+
      "(id,book_id,chapter_no,title,content_json,is_preview,published_at) "+
      "VALUES(?,'qa-cet4',3,?,?,1,CURRENT_TIMESTAMP)",
      id,"【测试】点词与云端收藏",JSON.stringify(content)),
    dbStmt(env.DB,
      "INSERT OR IGNORE INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) "+
      "VALUES(?,?,?,?)",id,wordId,sentence,"p1:s1")
  ]);
  return json({ok:true,testOnly:true,chapterId:id,wordId});
}

async function seedStagingEchoFixture(env) {
  // Safe, fixed staging-only Chapter 4 of an existing QA book.
  if(env.APP_ENV!=="staging")return reject("NOT_FOUND",404);
  const ready=await dbStmt(env.DB,"SELECT id FROM books WHERE id='qa-cet4' AND status='published'").first();
  if(!ready)return reject("QA_BOOK_NOT_READY",409);
  const words=[
    ["qa-echo-contract","contract","合同；契约","/ˈkɒntrækt/","她把 contract 放到桌上，等待最后的决定。"],
    ["qa-echo-evidence","evidence","证据","/ˈevɪdəns/","这封旧信将成为最关键的 evidence。"],
    ["qa-echo-identity","identity","身份","/aɪˈdentəti/","照片揭开了她隐藏多年的 identity。"],
    ["qa-echo-confirm","confirm","确认","/kənˈfɜːm/","她决定先 confirm 信件的来源。"]
  ];
  const paragraphs=[{segments:[{text:"这是为测试真实剧情回声三种玩法准备的原创无害练习片段，并非付费小说。"}]},
    ...words.map(w=>({segments:[
      {text:w[4].split(w[1])[0]}, {wordId:w[0],surface:w[1],gloss:w[2]},
      {text:w[4].split(w[1]).slice(1).join(w[1])}
    ]}))];
  const statements=[];
  for(const w of words){
    statements.push(dbStmt(env.DB,
      "INSERT OR IGNORE INTO words(id,headword,meaning_zh,phonetic_uk,phonetic_us,"+
      "part_of_speech,example_en,example_zh,collocations_json) "+
      "VALUES(?,?,?,?,?,?,?,?,?)",w[0],w[1],w[2],w[3],w[3],"n./v.",
      "The reader remembered the "+w[1]+".","读者记住了这个单词。",
      JSON.stringify([{en:w[1]+" in context",zh:"在语境中使用单词"},{en:"remember "+w[1],zh:"记住单词"}])));
  }
  statements.push(dbStmt(env.DB,
    "INSERT OR IGNORE INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) "+
    "VALUES('qa-cet4-echo','qa-cet4',4,?,?,1,CURRENT_TIMESTAMP)",
    "【测试】真实剧情回声 · 四词练习",JSON.stringify({version:1,testOnly:true,paragraphs})));
  words.forEach((w,i)=>statements.push(dbStmt(env.DB,
    "INSERT OR IGNORE INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) "+
    "VALUES('qa-cet4-echo',?,?,?)",w[0],w[4],"p"+(i+1)+":s1")));
  await env.DB.batch(statements);
  return json({ok:true,testOnly:true,chapterId:"qa-cet4-echo",wordCount:4});
}

async function issueStagingVoucher(req, env) {
  // QA only. Never expose a voucher minting endpoint on live customer environments.
  // The global stagingGate must have authenticated the reviewer before this runs.
  if (env.APP_ENV !== "staging") return reject("NOT_FOUND", 404);
  const body = await parseBody(req);
  const slug = body.category;
  if (!["cet4", "cet6"].includes(slug)) return reject("INVALID_CATEGORY", 400);
  const cat = await dbStmt(env.DB,
    "SELECT id FROM categories WHERE slug=? AND is_visible=1", slug).first();
  if (!cat) return reject("CATEGORY_NOT_CONFIGURED", 409);
  const limiter = await throttleKey(env, "staging-voucher", req);
  if (await isBlocked(env.DB, limiter)) return reject("TOO_MANY_ATTEMPTS", 429);
  const total = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM activation_codes WHERE order_reference='STAGING_QA_ONLY'").first();
  if (Number(total?.n || 0) >= 20) return reject("STAGING_VOUCHER_LIMIT_REACHED", 429);
  // Unpredictable 160-bit one-time voucher. Never stored in plaintext.
  const random = crypto.getRandomValues(new Uint8Array(20));
  const plain = Array.from(random, v => v.toString(16).padStart(2,"0")).join("").toUpperCase();
  const code = "MW-" + slug.toUpperCase() + "-" + plain.match(/.{1,8}/g).join("-");
  const normalized = normalizeCode(code);
  const digest = await hashCode(normalized, env);
  const id = crypto.randomUUID();
  await dbStmt(env.DB, `INSERT INTO activation_codes
    (id,code_hash,category_id,status,order_reference) VALUES (?, ?, ?, 'unused', 'STAGING_QA_ONLY')`,
    id,digest,cat.id).run();
  return json({ activationCode: code, category: slug, testOnly: true }, 201);
}

async function stagingDbDiagnostics(env) {
  // Reviewer-only health check: no user identities, password hashes, voucher digests or raw codes.
  const expected = {
    users: ["id","username","password_hash","password_salt"],
    activation_codes: ["id","code_hash","category_id","status","redeemed_by","redemption_nonce","order_reference"],
    entitlements: ["user_id","category_id","source_code_id","revoked_at"],
    sessions: ["id_hash","user_id","expires_at","revoked_at"],
    request_throttle: ["key","attempts","reset_at"],
    categories: ["id","slug","title","is_visible"]
  };
  const missing = {};
  for (const [table, fields] of Object.entries(expected)) {
    const result = await atStage("diagnostics.schema_" + table,
      () => env.DB.prepare("PRAGMA table_info(" + table + ")").all());
    const names = new Set((result.results || []).map(x => x.name));
    const absent = fields.filter(field => !names.has(field));
    if (absent.length) missing[table] = absent;
  }
  const counts = {};
  for (const [name, query] of Object.entries({
    users: "SELECT COUNT(*) AS n FROM users",
    vouchersUnused: "SELECT COUNT(*) AS n FROM activation_codes WHERE order_reference='STAGING_QA_ONLY' AND status='unused'",
    vouchersRedeemed: "SELECT COUNT(*) AS n FROM activation_codes WHERE order_reference='STAGING_QA_ONLY' AND status='redeemed'",
    entitlements: "SELECT COUNT(*) AS n FROM entitlements"
  })) {
    const row = await atStage("diagnostics.count_" + name,
      () => env.DB.prepare(query).first());
    counts[name] = Number(row?.n || 0);
  }
  const editorialMissing = {};
  for (const [table, fields] of Object.entries({
    content_packages: ["id","book_id","source_digest","source_label","imported_at"],
    word_categories: ["word_id","category_id","proficiency_note"]
  })) {
    const info = await atStage("diagnostics.editorial_" + table,
      () => env.DB.prepare("PRAGMA table_info(" + table + ")").all());
    const names = new Set((info.results || []).map(row=>row.name));
    const absent = fields.filter(field=>!names.has(field));
    if(absent.length) editorialMissing[table]=absent;
  }
  return json({ databaseSchemaReady: Object.keys(missing).length === 0,
    missingColumnsByTable: missing, qaCounts: counts,
    s3: { editorialSchemaReady: Object.keys(editorialMissing).length===0,
      missingColumnsByTable: editorialMissing },
    note: "Only schema information and test aggregate counts; no personal data or secrets." });
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
  // Independent S9 operator identity is never a customer session or S3 staging key.
  // Only /api/ops/me GET exists; mutations remain disabled until S9-B review.
  if (path.startsWith("/api/ops/")) {
    if (["POST","PUT","PATCH","DELETE"].includes(req.method) && !checkOrigin(req)) return reject("INVALID_ORIGIN",403);
    if(path==="/api/ops/me")return handleOps(req,env,path);
    if(path==="/api/ops/updates"||path.startsWith("/api/ops/updates/"))
      return handleSiteAnnouncements(req,env,path);
    if(/^\/api\/ops\/books\/[a-zA-Z0-9_-]{1,80}\/cover$/.test(path))
      return handleBookCover(req,env,path);
    if(/^\/api\/ops\/books\/[a-zA-Z0-9_-]{1,80}\/tags$/.test(path))
      return handleBookCoverTags(req,env,path);
    if(path.startsWith("/api/ops/sales/"))return handleOpsSales(req,env,path);
    if(path==="/api/ops/customers/query")return handleOpsCustomers(req,env,path);
    if(path==="/api/ops/customers/voucher-action")return handleOpsVoucher(req,env,path);
    if(path.startsWith("/api/ops/claims/"))return handleOpsClaims(req,env,path);
    if(path==="/api/ops/import/preflight")return handleOpsImportPreflight(req,env,path);
    if(path==="/api/ops/import"||path==="/api/ops/lexicon")return handleOpsImport(req,env,path);
    if(path==="/api/ops/import/revise")return handleOpsDraftRevision(req,env,path);
    if(/^\/api\/ops\/books\/[a-z][a-z0-9_-]{2,79}\/live-editor(?:\/|$)/.test(path))
      return handleOpsLiveEdit(req,env,path);
    if(path==="/api/ops/books"||path.endsWith("/withdraw-readiness")||
       path.endsWith("/withdraw")||path.endsWith("/audit"))
      return handleOpsConsole(req,env,path);
    return handleOpsPublication(req,env,path);
  }
  if(path==="/api/updates"||path==="/api/updates/latest"||/^\/api\/updates\/[a-f0-9-]{36}$/i.test(path))
    return handleSiteAnnouncements(req,env,path);
  if(path.startsWith("/api/claim/"))return handlePublicClaim(req,env,path);
  if (!env.DB || !env.ACTIVATION_PEPPER || env.ACTIVATION_PEPPER.length < 32) {
    return reject("SERVICE_NOT_CONFIGURED", 503);
  }
  if(/^\/api\/covers\/[a-zA-Z0-9_-]{1,80}$/.test(path))
    return handleBookCover(req,env,path);
  if (["POST","PUT","PATCH","DELETE"].includes(req.method) && !checkOrigin(req)) return reject("INVALID_ORIGIN", 403);
  if (path.startsWith("/api/staging/editor/")) {
    return handleEditor(req,env,path);
  }
  if (path === "/api/staging/diagnostics" && req.method === "GET" && env.APP_ENV === "staging") {
    return stagingDbDiagnostics(env);
  }
  if (path === "/api/staging/seed-chapter-fixtures" && req.method === "POST") {
    return seedStagingChapterFixture(env);
  }
  if (path === "/api/staging/seed-wordbook-fixture" && req.method === "POST") {
    return seedStagingWordbookFixture(env);
  }
  if(path==="/api/staging/seed-echo-fixture" && req.method==="POST"){
    return seedStagingEchoFixture(env);
  }
  if (path === "/api/staging/test-voucher" && req.method === "POST") {
    return issueStagingVoucher(req, env);
  }
  const user = await atStage("api.session_lookup", () => currentUser(req, env.DB));
  if(path==="/api/me/onboarding")return handleOnboarding(req,env,user);
  if(path==="/api/me/smart-vocab"||path==="/api/me/smart-vocab/status"||path==="/api/me/smart-vocab/answer"||path==="/api/me/smart-vocab/bookmark")
    return handleSmartVocab(req,env,path,user);
  if(path==="/api/lexicon/lookup")return handleExampleWordLookup(req,env,user);
  if(path==="/api/me/bookshelf"||path.startsWith("/api/me/bookshelf/"))return handleMyBookshelf(req,env,user);
  if(path==="/api/me/echo/available" || path==="/api/me/echo/answer" || path==="/api/me/echo/stats"){
    return handleEcho(req,env,path,user);
  }
  if (path === "/api/me/quick-review" || path === "/api/me/progress" || path === "/api/me/words" || path === "/api/me/wordbook" || path === "/api/me/flashcards" || path === "/api/me/flashcards/answer" || /^\/api\/me\/words\//.test(path)) {
    return handleLearningState(req,env,path,user);
  }
  if (path === "/api/auth/register" && req.method === "POST") return register(req, env);
  if (path === "/api/auth/login" && req.method === "POST") return login(req, env);
  // Password recovery is handled by verified staff; the legacy recovery-code endpoint is disabled.
  if (path === "/api/auth/recover" && req.method === "POST") return reject("MANUAL_RECOVERY_REQUIRED", 403);
  if (path === "/api/auth/recover-by-order" && req.method === "POST") return recoverWithPaidOrder(req,env);
  if (path === "/api/auth/logout" && req.method === "POST") return logout(req, env);
  if (path === "/api/auth/change-password" && req.method === "POST") return changePassword(req, env, user);
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
    const params = new URL(req.url).searchParams;
    const slug = params.get("category");
    if (!slug || !/^[a-z0-9-]{2,36}$/.test(slug)) return reject("INVALID_CATEGORY", 400);
    // Keep older API clients compatible; the customer bookshelf explicitly
    // requests numbered 9-book pages so all published books remain reachable.
    const requestedPage=params.get("page");
    const paged=requestedPage!==null;
    if(paged&&!/^[1-9][0-9]{0,5}$/.test(requestedPage))
      return reject("INVALID_PAGE",400);
    const page=paged?Number(requestedPage):1;
    const pageSize=9;
    const offset=(page-1)*pageSize;
    const total=paged?
      Number((await dbStmt(env.DB,"SELECT COUNT(*) AS total FROM books b "+
        "JOIN categories c ON c.id=b.category_id WHERE c.slug=? "+
        "AND c.is_visible=1 AND b.status='published'",slug).first())?.total||0):null;
    const data = await dbStmt(env.DB, `SELECT b.id,b.title,b.description,b.cover_key,b.sort_order,
      (SELECT COUNT(*) FROM chapters ch WHERE ch.book_id=b.id
        AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP) AS chapter_count
      FROM books b JOIN categories c ON c.id=b.category_id WHERE c.slug=?
      AND c.is_visible=1 AND b.status='published'
      ORDER BY b.sort_order,b.id LIMIT ${paged?pageSize:100} OFFSET ${paged?offset:0}`, slug).all();

    const books=data.results||[];
    if(books.length){
      // Cosmetic tags are optional metadata: an un-migrated deployment must
      // not break the reader shelf or expose draft titles.
      try{
        const ids=books.map(x=>x.id);
        const rows=await env.DB.prepare("SELECT book_id,label,color FROM book_cover_tags "+
          "WHERE book_id IN ("+ids.map(()=>"?").join(",")+") ORDER BY sort_order,rowid")
          .bind(...ids).all();
        const tags=new Map();
        for(const row of rows.results||[]){
          if(!tags.has(row.book_id))tags.set(row.book_id,[]);
          tags.get(row.book_id).push({label:row.label,color:row.color});
        }
        for(const item of books)item.cover_tags=tags.get(item.id)||[];
      }catch{
        for(const item of books)item.cover_tags=[];
      }
    }
    return json(paged?
      {books,pagination:{page,pageSize,total,totalPages:Math.ceil(total/pageSize)}}:
      {books});
  }
  const bookChaptersMatch = path.match(/^\/api\/books\/([^/]+)\/chapters$/);
  if (bookChaptersMatch && req.method === "GET") {
    return chapterCatalog(env, bookChaptersMatch[1], user);
  }
  const chapterWordsMatch = path.match(/^\/api\/chapters\/([^/]+)\/words$/);
  if (chapterWordsMatch && req.method === "GET") {
    return chapterVocabulary(req, env, chapterWordsMatch[1], user);
  }
  const chapterMatch = path.match(/^\/api\/chapters\/([^/]+)$/);
  if (chapterMatch && req.method === "GET") return chapterAccess(req, env, chapterMatch[1], user);
  return reject("NOT_FOUND", 404);
}
function attachPreviewCookie(response, previewCookie) {
  if (!previewCookie) return response;
  const h = new Headers(response.headers);
  // Set-Cookie must be appended, not joined with an existing real-user session cookie.
  h.append("Set-Cookie", previewCookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}
export default {
  async fetch(request, env) {
    const forbidden=productionSurfaceBlock(request,env);
    if(forbidden)return forbidden;
    // Staging gate applies to both public files and API routes.
    // Wrangler assets.run_worker_first MUST remain true for this to work.
    const blocked = await stagingGate(request, env);
    if (blocked) return blocked;
    const previewCookie = await stagingCookieAfterBasic(request, env);
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/")) {
      const opsAsset=["/ops.html","/ops-console.js","/ops-console.css","/ops-updates.js"].includes(path);
      if(opsAsset&&env.OPS_CONSOLE_ENABLED!=="true")
        return attachPreviewCookie(new Response("Not found",{status:404}),previewCookie);
      const response = await env.ASSETS.fetch(request);
      if(opsAsset){
        const h=new Headers(response.headers);
        h.set("cache-control","private, no-store");
        h.set("x-content-type-options","nosniff");
        h.set("referrer-policy","no-referrer");
        h.set("x-frame-options","DENY");
        h.set("content-security-policy",
          "default-src 'none'; script-src 'self'; style-src 'self'; "+
          "connect-src 'self'; img-src 'self' blob:; form-action 'none'; "+
          "base-uri 'none'; frame-ancestors 'none'");
        return attachPreviewCookie(
          new Response(response.body,{status:response.status,headers:h}),previewCookie);
      }
      if (env.APP_ENV !== "staging") return attachPreviewCookie(response, previewCookie);
      const headers = new Headers(response.headers);
      headers.set("cache-control", "private, no-store");
      return attachPreviewCookie(new Response(response.body, { status: response.status, headers }), previewCookie);
    }
    try {
      const host = new URL(request.url).hostname;
      if (new URL(request.url).protocol !== "https:" && host !== "localhost" && host !== "127.0.0.1") {
        return attachPreviewCookie(reject("HTTPS_REQUIRED", 403), previewCookie);
      }
      return attachPreviewCookie(await api(request, env), previewCookie);
    } catch (err) {
      if (["CONTENT_TYPE", "TOO_LARGE", "INVALID_JSON"].includes(err?.message)) return attachPreviewCookie(reject(err.message, 400), previewCookie);
      // The browser only receives a stable stage label in the reviewer-protected staging environment.
      return attachPreviewCookie(stagingErrorResponse(env, err), previewCookie);
    }
  }
};