import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../src/worker.js";
import {hashCode,normalizeCode} from "../src/security.js";

// All test data is fabricated, local and discarded after execution.
// This test does not call Cloudflare, generate real saleable activation
// codes, or access personal user accounts.
const origin="https://miaowu-production-test.invalid";
const pepper="S12_TEST_ONLY_NOT_A_PRODUCTION_SECRET_2026";
class LocalD1{
 constructor(){
  this.db=new DatabaseSync(":memory:");
  this.db.exec(readFileSync(new URL("../db/001_schema.sql",import.meta.url),"utf8"));
  this.db.exec(readFileSync(new URL("../db/002_s1.sql",import.meta.url),"utf8"));
  this.db.exec(readFileSync(new URL("../db/003_public_categories.sql",import.meta.url),"utf8"));
  this.db.exec(readFileSync(new URL("../db/production/002_account_recovery_codes.sql",import.meta.url),"utf8"));
  this.db.exec(`
    INSERT INTO books(id,category_id,title,status)
    VALUES ('book-cet4','cet4','Private CET4 QA Fixture','published'),
           ('book-cet6','cet6','Private CET6 QA Fixture','published');
    INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at)
    VALUES ('chapter-cet4','book-cet4',1,'Private A','{"paragraphs":["FOUR_SECRET"]}',0,CURRENT_TIMESTAMP),
           ('chapter-cet6','book-cet6',1,'Private B','{"paragraphs":["SIX_SECRET"]}',0,CURRENT_TIMESTAMP);
  `);
 }
 prepare(sql){
  const db=this.db;
  const bound=(args=[])=>{
    const statement=db.prepare(sql);
    return {
      first:async()=>statement.get(...args)??null,
      all:async()=>({results:statement.all(...args)}),
      run:async()=>({success:true,meta:statement.run(...args)})
    };
  };
  return {...bound(),bind(...args){return bound(args)}};
 }
 async batch(statements){
  this.db.exec("BEGIN IMMEDIATE");
  try{const results=[];for(const statement of statements)results.push(await statement.run());
   this.db.exec("COMMIT");return results;
  }catch(error){this.db.exec("ROLLBACK");throw error}
 }
 async voucher(code,id,category){
  const hash=await hashCode(normalizeCode(code),{ACTIVATION_PEPPER:pepper});
  this.db.prepare("INSERT INTO activation_codes(id,code_hash,category_id,status) VALUES(?,?,?,'unused')")
   .run(id,hash,category);
 }
 codeState(id){return this.db.prepare("SELECT status,redeemed_by FROM activation_codes WHERE id=?").get(id)}
}
function request(path,method="GET",body,cookie){
 const headers={Origin:origin,Accept:"application/json"};
 if(body!==undefined)headers["Content-Type"]="application/json";
 if(cookie)headers.Cookie=cookie;
 return new Request(origin+path,{method,headers,
  ...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
const env=db=>({
  APP_ENV:"production",DB:db,ACTIVATION_PEPPER:pepper,
  ASSETS:{fetch:async()=>new Response("PUBLIC_UI")}
});
function session(response){
 const setCookie=response.headers.get("set-cookie")||"";
 const match=setCookie.match(/\bmw_session=([0-9a-f]{64})\b/);
 assert.ok(match,"Server must issue a real HttpOnly session");
 assert.match(setCookie,/HttpOnly/);
 assert.match(setCookie,/Secure/);
 assert.match(setCookie,/SameSite=Lax/);
 return "mw_session="+match[1];
}
const codeA="MW-CET4-11111111-22222222-33333333-44444444";
const codeB="MW-CET6-55555555-66666666-77777777-88888888";
const codeC="MW-CET4-99999999-AAAAAAAA-BBBBBBBB-CCCCCCCC";
const codeD="MW-CET4-DDDDDDDD-EEEEEEEE-FFFFFFFF-00000000";
const pass="local-TEST-password-only-2026";

test("S12 registered accounts cannot double-redeem a code or read another category",async()=>{
 const db=new LocalD1();
 await db.voucher(codeA,"voucher-a","cet4");
 await db.voucher(codeB,"voucher-b","cet6");
 const app=env(db);
 const guest=await worker.fetch(request("/api/chapters/chapter-cet4"),app);
 assert.equal(guest.status,401);
 assert.equal((await guest.json()).error,"LOGIN_REQUIRED");
 const a=await worker.fetch(request("/api/auth/register","POST",{
  username:"alice-example",password:pass,activationCode:codeA
 }),app);
 assert.equal(a.status,201);
 const aliceCookie=session(a);
 assert.deepEqual((await a.json()).categories.map(x=>x.slug),["cet4"]);
 assert.equal(db.codeState("voucher-a").status,"redeemed");
 const a4=await worker.fetch(request("/api/chapters/chapter-cet4","GET",undefined,aliceCookie),app);
 assert.equal(a4.status,200);
 assert.match(JSON.stringify(await a4.json()),/FOUR_SECRET/);
 const a6=await worker.fetch(request("/api/chapters/chapter-cet6","GET",undefined,aliceCookie),app);
 assert.equal(a6.status,403);
 assert.equal((await a6.json()).error,"PURCHASE_REQUIRED");
 const reuse=await worker.fetch(request("/api/auth/register","POST",{
  username:"mallory-example",password:pass,activationCode:codeA
 }),app);
 assert.equal(reuse.status,409);
 assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM users").get().n,1);
 assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM entitlements").get().n,1);
 const b=await worker.fetch(request("/api/auth/register","POST",{
  username:"bob-example",password:pass,activationCode:codeB
 }),app);
 assert.equal(b.status,201);
 const bobCookie=session(b);
 assert.deepEqual((await b.json()).categories.map(x=>x.slug),["cet6"]);
 const b4=await worker.fetch(request("/api/chapters/chapter-cet4","GET",undefined,bobCookie),app);
 assert.equal(b4.status,403);
 const b6=await worker.fetch(request("/api/chapters/chapter-cet6","GET",undefined,bobCookie),app);
 assert.equal(b6.status,200);
 assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM users").get().n,2);
 db.db.close();
});

test("S12 extra vouchers only grant to the current account, duplicate category does not consume code",async()=>{
 const db=new LocalD1();
 await db.voucher(codeA,"voucher-a","cet4");
 await db.voucher(codeB,"voucher-b","cet6");
 await db.voucher(codeC,"voucher-c","cet4");
 await db.voucher(codeD,"voucher-d","cet4");
 const app=env(db);
 const alice=await worker.fetch(request("/api/auth/register","POST",{
  username:"alice-example",password:pass,activationCode:codeA
 }),app);
 const aliceCookie=session(alice);
 const bob=await worker.fetch(request("/api/auth/register","POST",{
  username:"bob-example",password:pass,activationCode:codeB
 }),app);
 const bobCookie=session(bob);
 const extra=await worker.fetch(request("/api/activate","POST",{activationCode:codeC},bobCookie),app);
 assert.equal(extra.status,200);
 assert.deepEqual((await extra.json()).categories.map(x=>x.slug),["cet4","cet6"]);
 assert.equal(db.codeState("voucher-c").status,"redeemed");
 const secondOwner=await worker.fetch(request("/api/activate","POST",{activationCode:codeC},aliceCookie),app);
 assert.equal(secondOwner.status,409);
 const duplicate=await worker.fetch(request("/api/activate","POST",{activationCode:codeD},aliceCookie),app);
 assert.equal(duplicate.status,409);
 assert.equal(db.codeState("voucher-d").status,"unused");
 const aliceAgain=await worker.fetch(request("/api/auth/me","GET",undefined,aliceCookie),app);
 assert.deepEqual((await aliceAgain.json()).categories.map(x=>x.slug),["cet4"]);
 assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM entitlements").get().n,3);
 db.db.close();
});

test("S12 each customer's cloud reading data stays separated and logout revokes session",async()=>{
 const db=new LocalD1();
 await db.voucher(codeA,"voucher-a","cet4");
 await db.voucher(codeB,"voucher-b","cet6");
 const app=env(db);
 const alice=await worker.fetch(request("/api/auth/register","POST",{
  username:"alice-example",password:pass,activationCode:codeA
 }),app);
 const aCookie=session(alice);
 const bob=await worker.fetch(request("/api/auth/register","POST",{
  username:"bob-example",password:pass,activationCode:codeB
 }),app);
 const bCookie=session(bob);
 const aID=db.db.prepare("SELECT id FROM users WHERE username='alice-example'").get().id;
 db.db.prepare("INSERT INTO reading_progress(user_id,chapter_id,progress,completed_at) VALUES(?,?,1,CURRENT_TIMESTAMP)")
  .run(aID,"chapter-cet4");
 const readA=await worker.fetch(request("/api/me/progress","GET",undefined,aCookie),app);
 assert.equal(readA.status,200);
 const aData=await readA.json();
 assert.match(JSON.stringify(aData),/chapter-cet4/);
 const readB=await worker.fetch(request("/api/me/progress","GET",undefined,bCookie),app);
 assert.equal(readB.status,200);
 assert.doesNotMatch(JSON.stringify(await readB.json()),/chapter-cet4/);
 const logout=await worker.fetch(request("/api/auth/logout","POST",{},aCookie),app);
 assert.equal(logout.status,200);
 const after=await worker.fetch(request("/api/auth/me","GET",undefined,aCookie),app);
 assert.equal(after.status,401);
 const stillBob=await worker.fetch(request("/api/auth/me","GET",undefined,bCookie),app);
 assert.equal(stillBob.status,200);
 db.db.close();
});

test("category entitlement automatically covers another published novel added later to the same category",async()=>{
 const db=new LocalD1();
 await db.voucher(codeA,"voucher-a","cet4");
 await db.voucher(codeB,"voucher-b","cet6");
 const app=env(db);
 const alice=await worker.fetch(request("/api/auth/register","POST",{
  username:"alice-category",password:pass,activationCode:codeA
 }),app);
 const aCookie=session(alice);
 const bob=await worker.fetch(request("/api/auth/register","POST",{
  username:"bob-category",password:pass,activationCode:codeB
 }),app);
 const bCookie=session(bob);
 // The new book comes AFTER the user's original category purchase.
 db.db.prepare("INSERT INTO books(id,category_id,title,status) VALUES (?,?,?,'published')")
  .run("book-cet4-next","cet4","A New CET4 Mystery");
 db.db.prepare("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) "+
  "VALUES (?,?,?,?,?,0,CURRENT_TIMESTAMP)")
  .run("chapter-cet4-next","book-cet4-next",1,"New Chapter",
   JSON.stringify({paragraphs:["NEW_CET4_STORY_PRIVATE"]}));
 const readAlice=await worker.fetch(request("/api/chapters/chapter-cet4-next","GET",undefined,aCookie),app);
 assert.equal(readAlice.status,200);
 assert.match(JSON.stringify(await readAlice.json()),/NEW_CET4_STORY_PRIVATE/);
 const readBob=await worker.fetch(request("/api/chapters/chapter-cet4-next","GET",undefined,bCookie),app);
 assert.equal(readBob.status,403);
 assert.doesNotMatch(JSON.stringify(await readBob.json()),/NEW_CET4_STORY_PRIVATE/);
 assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM entitlements").get().n,2);
 db.db.close();
});

test("future high-school and zhuanshengben classifications work without rebuilding the user entitlement schema",async()=>{
 const db=new LocalD1();
 db.db.prepare("INSERT INTO categories(id,slug,title,is_visible) VALUES(?,?,?,1)")
  .run("high-school","high-school","高中英语");
 db.db.prepare("INSERT INTO categories(id,slug,title,is_visible) VALUES(?,?,?,1)")
  .run("zhuanshengben","zhuanshengben","专升本英语");
 db.db.prepare("INSERT INTO books(id,category_id,title,status) VALUES (?,?,?,'published')")
  .run("future-hs-book","high-school","高中英语小说");
 db.db.prepare("INSERT INTO books(id,category_id,title,status) VALUES (?,?,?,'published')")
  .run("future-zsb-book","zhuanshengben","专升本英语小说");
 for(const [id,bookId,secret] of [
  ["future-hs-chapter","future-hs-book","PRIVATE_HIGH_SCHOOL"],
  ["future-zsb-chapter","future-zsb-book","PRIVATE_ZHUANSHENGBEN"]]){
  db.db.prepare("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) "+
   "VALUES (?,?,?,?,?,0,CURRENT_TIMESTAMP)")
   .run(id,bookId,1,"测试新类目章节",JSON.stringify({paragraphs:[secret]}));
 }
 const hsCode="MW-HIGH-11111111-22222222-33333333-44444444";
 const zsbCode="MW-ZSB-55555555-66666666-77777777-88888888";
 await db.voucher(hsCode,"future-voucher-high","high-school");
 await db.voucher(zsbCode,"future-voucher-zsb","zhuanshengben");
 const app=env(db);
 const registered=await worker.fetch(request("/api/auth/register","POST",{
  username:"future-learner",password:pass,activationCode:hsCode
 }),app);
 assert.equal(registered.status,201);
 const cookie=session(registered);
 assert.deepEqual((await registered.json()).categories.map(x=>x.slug),["high-school"]);
 const zsbDenied=await worker.fetch(request("/api/chapters/future-zsb-chapter","GET",undefined,cookie),app);
 assert.equal(zsbDenied.status,403);
 const hsOpen=await worker.fetch(request("/api/chapters/future-hs-chapter","GET",undefined,cookie),app);
 assert.equal(hsOpen.status,200);
 const added=await worker.fetch(request("/api/activate","POST",{activationCode:zsbCode},cookie),app);
 assert.equal(added.status,200);
 assert.deepEqual((await added.json()).categories.map(x=>x.slug),
  ["high-school","zhuanshengben"]);
 const zsbOpen=await worker.fetch(request("/api/chapters/future-zsb-chapter","GET",undefined,cookie),app);
 assert.equal(zsbOpen.status,200);
 const cate=await worker.fetch(request("/api/categories"),app);
 assert.equal(cate.status,200);
 assert.ok((await cate.json()).categories.some(x=>x.slug==="high-school"));
 db.db.close();
});

test("S14 password change validates current password, rotates current cookie and revokes other devices",async()=>{
 const db=new LocalD1();
 await db.voucher(codeA,"voucher-a","cet4");
 const app=env(db);
 const registered=await worker.fetch(request("/api/auth/register","POST",{
  username:"password-learner",password:pass,activationCode:codeA
 }),app);
 assert.equal(registered.status,201);
 const originalCookie=session(registered);
 const oldDevice=await worker.fetch(request("/api/auth/login","POST",{
  username:"password-learner",password:pass
 }),app);
 assert.equal(oldDevice.status,200);
 const oldDeviceCookie=session(oldDevice);
 assert.notEqual(originalCookie,oldDeviceCookie);

 const denied=await worker.fetch(request("/api/auth/change-password","POST",{
  currentPassword:"incorrect-but-long-2026",newPassword:"new-only-pass-2026-STRONG"
 },originalCookie),app);
 assert.equal(denied.status,401);
 assert.equal((await denied.json()).error,"INVALID_CURRENT_PASSWORD");
 const previousBefore=await worker.fetch(request("/api/auth/me","GET",undefined,oldDeviceCookie),app);
 assert.equal(previousBefore.status,200);
 const unchanged=await worker.fetch(request("/api/auth/change-password","POST",{
  currentPassword:pass,newPassword:pass
 },originalCookie),app);
 assert.equal(unchanged.status,400);
 assert.equal((await unchanged.json()).error,"PASSWORD_REUSE_NOT_ALLOWED");

 const change=await worker.fetch(request("/api/auth/change-password","POST",{
  currentPassword:pass,newPassword:"new-only-pass-2026-STRONG"
 },originalCookie),app);
 assert.equal(change.status,200);
 const changedPasswordResponse=await change.json();
 assert.equal(changedPasswordResponse.ok,true);
 assert.equal(changedPasswordResponse.otherSessionsRevoked,true);
 assert.match(changedPasswordResponse.recoveryCode,/^[0-9a-f]{8}(?:-[0-9a-f]{8}){7}$/);
 const freshCookie=session(change);
 assert.notEqual(freshCookie,originalCookie);
 const sessionRows=db.db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n;
 assert.equal(sessionRows,1);
 for(const cookie of [originalCookie,oldDeviceCookie]){
  const stale=await worker.fetch(request("/api/auth/me","GET",undefined,cookie),app);
  assert.equal(stale.status,401);
 }
 const stillLogged=await worker.fetch(request("/api/auth/me","GET",undefined,freshCookie),app);
 assert.equal(stillLogged.status,200);
 assert.deepEqual((await stillLogged.json()).categories.map(x=>x.slug),["cet4"]);
 const read=await worker.fetch(request("/api/chapters/chapter-cet4","GET",undefined,freshCookie),app);
 assert.equal(read.status,200);
 assert.match(JSON.stringify(await read.json()),/FOUR_SECRET/);
 const oldLogin=await worker.fetch(request("/api/auth/login","POST",{
  username:"password-learner",password:pass
 }),app);
 assert.equal(oldLogin.status,401);
 const newLogin=await worker.fetch(request("/api/auth/login","POST",{
  username:"password-learner",password:"new-only-pass-2026-STRONG"
 }),app);
 assert.equal(newLogin.status,200);
 db.db.close();
});

test("S14 password endpoint rejects unauthenticated and wrong-origin requests without changing data",async()=>{
 const db=new LocalD1();
 await db.voucher(codeA,"voucher-a","cet4");
 const app=env(db);
 const registered=await worker.fetch(request("/api/auth/register","POST",{
  username:"origin-learner",password:pass,activationCode:codeA
 }),app);
 const validCookie=session(registered);
 const noLogin=await worker.fetch(request("/api/auth/change-password","POST",{
  currentPassword:pass,newPassword:"another-private-pass-2026"
 }),app);
 assert.equal(noLogin.status,401);
 assert.equal((await noLogin.json()).error,"LOGIN_REQUIRED");
 const foreignRequest=new Request(origin+"/api/auth/change-password",{
  method:"POST",headers:{"Origin":"https://attacker.invalid","Content-Type":"application/json",
   Cookie:validCookie},body:JSON.stringify({
    currentPassword:pass,newPassword:"another-private-pass-2026"
   })
 });
 const forged=await worker.fetch(foreignRequest,app);
 assert.equal(forged.status,403);
 assert.equal((await forged.json()).error,"INVALID_ORIGIN");
 const stillOld=await worker.fetch(request("/api/auth/login","POST",{
  username:"origin-learner",password:pass
 }),app);
 assert.equal(stillOld.status,200);
 db.db.close();
});

test("S14 invalid new password does not revoke any sessions or overwrite password",async()=>{
 const db=new LocalD1();
 await db.voucher(codeA,"voucher-a","cet4");
 const app=env(db);
 const registered=await worker.fetch(request("/api/auth/register","POST",{
  username:"format-learner",password:pass,activationCode:codeA
 }),app);
 const cookie=session(registered);
 for(const nextPassword of ["short","x".repeat(129)]){
  const res=await worker.fetch(request("/api/auth/change-password","POST",{
   currentPassword:pass,newPassword:nextPassword
  },cookie),app);
  assert.equal(res.status,400);
 }
 const preserved=await worker.fetch(request("/api/auth/me","GET",undefined,cookie),app);
 assert.equal(preserved.status,200);
 db.db.close();
});


test("S18 paid-category account recovers with a single-use code and rejects old devices",async()=>{
 const db=new LocalD1();
 await db.voucher(codeA,"recovery-a","cet4");
 const app=env(db);
 const signup=await worker.fetch(request("/api/auth/register","POST",{
   username:"recover-owner",password:pass,activationCode:codeA
 }),app);
 assert.equal(signup.status,201);
 const signed=await signup.json();
 assert.match(signed.recoveryCode,/^[0-9a-f]{8}(?:-[0-9a-f]{8}){7}$/);
 const previousCookie=session(signup);
 const otherDevice=await worker.fetch(request("/api/auth/login","POST",{
  username:"recover-owner",password:pass
 }),app);
 assert.equal(otherDevice.status,200);
 const oldSecond=session(otherDevice);
 const records=db.db.prepare("SELECT code_hash FROM account_recovery").all();
 assert.equal(records.length,1);
 assert.ok(!records[0].code_hash.includes(signed.recoveryCode.replaceAll("-","")));
 const wrong=await worker.fetch(request("/api/auth/recover","POST",{
  username:"recover-owner",recoveryCode:"A".repeat(64),newPassword:"new-recovery-password-2026"
 }),app);
 assert.equal(wrong.status,401);
 assert.equal((await wrong.json()).error,"INVALID_RECOVERY_CREDENTIALS");
 const reset=await worker.fetch(request("/api/auth/recover","POST",{
  username:"recover-owner",recoveryCode:signed.recoveryCode,
  newPassword:"new-recovery-password-2026"
 }),app);
 assert.equal(reset.status,200);
 const outcome=await reset.json();
 assert.equal(outcome.oldSessionsRevoked,true);
 assert.notEqual(outcome.recoveryCode,signed.recoveryCode);
 assert.deepEqual(outcome.categories.map(x=>x.slug),["cet4"]);
 const fresh=session(reset);
 assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,1);
 for(const cookie of [previousCookie,oldSecond]){
  const stale=await worker.fetch(request("/api/auth/me","GET",undefined,cookie),app);
  assert.equal(stale.status,401);
 }
 assert.equal((await worker.fetch(request("/api/auth/me","GET",undefined,fresh),app)).status,200);
 assert.equal((await worker.fetch(request("/api/chapters/chapter-cet4","GET",undefined,fresh),app)).status,200);
 const replay=await worker.fetch(request("/api/auth/recover","POST",{
  username:"recover-owner",recoveryCode:signed.recoveryCode,
  newPassword:"account-stolen-password-2026"
 }),app);
 assert.equal(replay.status,401);
 const oldLogin=await worker.fetch(request("/api/auth/login","POST",{
  username:"recover-owner",password:pass
 }),app);
 assert.equal(oldLogin.status,401);
 const currentLogin=await worker.fetch(request("/api/auth/login","POST",{
  username:"recover-owner",password:"new-recovery-password-2026"
 }),app);
 assert.equal(currentLogin.status,200);
 db.db.close();
});

test("S18 logged-in password change invalidates the former offline recovery credential",async()=>{
 const db=new LocalD1();
 await db.voucher(codeA,"recovery-b","cet4");
 const app=env(db);
 const signup=await worker.fetch(request("/api/auth/register","POST",{
  username:"recover-rotator",password:pass,activationCode:codeA
 }),app);
 const oldCode=(await signup.json()).recoveryCode;
 const previousCookie=session(signup);
 const change=await worker.fetch(request("/api/auth/change-password","POST",{
  currentPassword:pass,newPassword:"after-change-only-password-2026"
 },previousCookie),app);
 assert.equal(change.status,200);
 const changed=await change.json();
 assert.match(changed.recoveryCode,/^[0-9a-f]{8}(?:-[0-9a-f]{8}){7}$/);
 assert.notEqual(changed.recoveryCode,oldCode);
 const failed=await worker.fetch(request("/api/auth/recover","POST",{
  username:"recover-rotator",recoveryCode:oldCode,
  newPassword:"BAD_ACTOR_PASSWORD_2026"
 }),app);
 assert.equal(failed.status,401);
 const works=await worker.fetch(request("/api/auth/recover","POST",{
  username:"recover-rotator",recoveryCode:changed.recoveryCode,
  newPassword:"legit-final-password-2026"
 }),app);
 assert.equal(works.status,200);
 assert.equal((await works.json()).categories[0].slug,"cet4");
 db.db.close();
});

test("S18 recovery only in production and requires same-origin proof for state-changing operations",async()=>{
 const db=new LocalD1();
 const staging=env(db);staging.APP_ENV="staging";
 const denied=await worker.fetch(request("/api/auth/recover","POST",{
  username:"guest-user",recoveryCode:"a".repeat(64),
  newPassword:"some-test-password-2026"
 }),staging);
 // The existing staging preview guard runs before account endpoints.
 // Without a preview password the staging API safely fails closed at 503.
 assert.equal(denied.status,503);
 const forged=new Request(origin+"/api/auth/recover",{
  method:"POST",headers:{"Origin":"https://malicious.invalid",
   "Content-Type":"application/json"},body:JSON.stringify({
   username:"guest-user",recoveryCode:"a".repeat(64),
   newPassword:"some-test-password-2026"
  })
 });
 const mismatch=await worker.fetch(forged,env(db));
 assert.equal(mismatch.status,403);
 const malformed=await worker.fetch(request("/api/auth/recover","POST",{
  username:"guest-user",recoveryCode:"missing",newPassword:"some-test-password-2026"
 }),env(db));
 assert.equal(malformed.status,400);
 db.db.close();
});
