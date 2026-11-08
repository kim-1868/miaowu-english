import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRODUCTION_ASSET_ALLOWLIST,NOTICE_ASSETS,selectedProductionAssets} from "../scripts/build-production-assets.mjs";
const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("wave2: personal bookshelf is self-scoped and never bypasses paid chapter access",()=>{
 const app=file("public/app.js"),html=file("public/index.html"),server=file("src/my-bookshelf.js");
 assert.match(html,/id="myBookshelf"/);
 assert.match(html,/v11-bookshelf\.css/);
 assert.match(app,/function renderPersonalBookshelf\(/);
 assert.match(app,/function loadPersonalBookshelf\(/);
 assert.match(app,/data-cloud-bookmark/);
 assert.match(app,/\/api\/me\/bookshelf/);
 assert.match(app,/want.*reading.*finished/);
 assert.match(server,/if\(!user\)return fail\("LOGIN_REQUIRED",401\)/);
 assert.match(server,/BOOKSHELF_NOT_READY/);
 assert.match(server,/user_bookmarks/);
 assert.match(server,/WHERE b\.status='published' AND c\.is_visible=1/);
 assert.match(server,/if\(!visible\)return fail\("BOOK_NOT_AVAILABLE",404\)/);
 assert.doesNotMatch(server,/INSERT INTO entitlements|UPDATE entitlements/);
});
test("wave2: existing account is not forced into onboarding; registration is transactional",()=>{
 const server=file("src/onboarding.js"),worker=file("src/worker.js");
 const app=file("public/app.js"),html=file("public/index.html");
 assert.match(server,/eligible:!!entry/);
 assert.match(server,/pending:!!entry&&!entry\.completed_at/);
 assert.match(server,/ONBOARDING_NOT_READY/);
 assert.match(server,/INSERT INTO user_onboarding\(user_id\)/);
 assert.match(worker,/onboardingReady=await onboardingSchemaReady\(env\)/);
 assert.match(worker,/onboardingReady\?\[registrationOnboardingStatement\(env,userId\)\]/);
 assert.match(worker,/handleOnboarding/);
 assert.match(html,/id="mwWelcomeDialog"/);
 assert.match(html,/id="mwWordHint"/);
 assert.match(html,/\/onboarding\.js/);
 assert.match(app,/MiaowuOnboarding\?\.sync/);
 assert.match(app,/MiaowuOnboarding\?\.wordTapped/);
});
test("wave2: registration requires matching passwords before any network request",()=>{
 const app=file("public/app.js");
 assert.match(app,/id="rPassConfirm"/);
 assert.match(app,/两次输入的密码不一致/);
 assert.match(app,/if\(password\.value!==confirmPassword\.value\)/);
 assert.match(app,/data-password-toggle/);
 const head=app.indexOf("function showRegister(opts={})"),end=app.indexOf("function showLogin()",head);
 assert.ok(end>head);
 const text=app.slice(head,end);
 assert.ok(text.indexOf("if(password.value!==confirmPassword.value)")<text.indexOf("serverRequest('/api/auth/register'"));
});
test("wave2: dictionary lookup is entitlement-scoped and missing supplemental table is safe",()=>{
 const code=file("src/example-word-lookup.js"),dictionary=file("src/internal-dictionary.js");
 assert.match(code,/ch\.is_preview=1 OR EXISTS/);
 assert.match(code,/activation_codes v/);
 assert.match(code,/internalDictionaryLookup/);
 assert.match(dictionary,/getAuthorizedExample/);
 assert.match(dictionary,/isExampleToken/);
 assert.match(dictionary,/referenceOnly:true/);
 assert.match(dictionary,/catch\{/);
 const prod=file("src/worker.js");
 assert.match(prod,/handleExampleWordLookup/);
 assert.doesNotMatch(prod,/user_study_schedules|study-schedule-store|reviewed_sense_aliases/);
});
test("wave2: additive tables never mutate prior user or learning data",()=>{
 for(const path of ["db/009_v11_onboarding.sql","db/010_v11_my_bookshelf.sql","db/012_v11_supplemental_dictionary.sql"]){
  const sql=file(path);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS/);
  assert.doesNotMatch(sql,/DROP\s+TABLE|UPDATE\s+(users|user_words|entitlements|reading_progress)|DELETE\s+FROM\s+(users|user_words|reading_progress)/i);
 }
 const starter=file("db/013_v11_supplemental_starter.sql");
 assert.match(starter,/INSERT OR IGNORE INTO supplemental_dictionary/);
 assert.doesNotMatch(starter,/INSERT.*user_words|UPDATE.*reading_progress/);
});
test("wave2: production assets can bundle 50 only with explicit approved announcement selection",()=>{
 assert.equal(PRODUCTION_ASSET_ALLOWLIST.length,46);
 assert.equal(NOTICE_ASSETS.length,4);
 assert.equal(selectedProductionAssets().length,46);
 assert.equal(selectedProductionAssets({withAnnouncements:true}).length,50);
 for(const asset of ["onboarding.js","onboarding.css","v11-bookshelf.css"])
  assert.ok(PRODUCTION_ASSET_ALLOWLIST.includes(asset));
});
