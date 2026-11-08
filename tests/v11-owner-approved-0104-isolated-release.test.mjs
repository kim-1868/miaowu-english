// Clean V42 -> owner-approved 01–04 integration: production-release scope verifier.
// Does not connect to Cloudflare or D1.
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRODUCTION_ASSET_ALLOWLIST,NOTICE_ASSETS,selectedProductionAssets} from "../scripts/build-production-assets.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("01-04 isolated release: notice is directly below the top bar and before banner",()=>{
 const html=read("public/index.html");
 const nav=html.indexOf("</header>"),notice=html.indexOf('id="siteUpdateBanner"'),hero=html.indexOf('id="miaowuHomeScene"');
 assert.ok(nav>=0&&nav<notice&&notice<hero);
 assert.match(html,/id="siteUpdateDialog"/);
 assert.match(html,/site-updates\.js/);
 assert.match(read("public/ops.html"),/id="updatesAdminForm"/);
 assert.match(read("src/worker.js"),/handleSiteAnnouncements/);
 const backend=read("src/site-announcements.js");
 assert.match(backend,/OPS_ANNOUNCEMENTS_ENABLED==="true"/);
 assert.match(backend,/V11_NOTICE_RELEASE_APPROVED==="true"/);
 const prod=JSON.parse(read("deploy/production.wrangler.jsonc"));
 assert.notEqual(prod.vars.OPS_ANNOUNCEMENTS_ENABLED,"true");
 assert.equal(prod.vars.APP_ENV,"production");
 assert.equal(prod.d1_databases[0].database_name,"miaowu-english-prod");
});
test("01-04 isolated release: optional notices are opt-in, 43 standard / 47 announced assets",()=>{
 assert.equal(PRODUCTION_ASSET_ALLOWLIST.length,43);
 assert.equal(NOTICE_ASSETS.length,4);
 assert.equal(selectedProductionAssets().length,43);
 assert.equal(selectedProductionAssets({withAnnouncements:true}).length,47);
 assert.ok(!selectedProductionAssets().includes("site-updates.js"));
 assert.ok(!selectedProductionAssets().includes("ops-updates.js"));
});
test("02: phone home and install guide are present; onboarding was intentionally omitted",()=>{
 const html=read("public/index.html"),app=read("public/app.js");
 assert.match(html,/<span class="tab-icon">⌂<\/span>首页/);
 assert.match(html,/id="installGuideDialog"/);
 assert.match(html,/id="installGuideIphoneTab"/);
 assert.match(html,/id="installGuideAndroidTab"/);
 assert.match(html,/id="openInstallGuide"/);
 assert.match(html,/install-guide\.js/);
 assert.doesNotMatch(html,/src="\/onboarding\.js/);
 assert.doesNotMatch(app,/loadPersonalBookshelf|MiaowuOnboarding|readerPersonalBookshelf/);
});
test("03: reader font and fold action retain the old progress + audio implementation",()=>{
 const html=read("public/index.html"),app=read("public/app.js"),chapter=read("public/chapter-words.js"),css=read("public/v11-reader.css");
 assert.match(html,/id="readerFontSlider"/);
 assert.match(app,/Math\.min\(24,Math\.max\(12,/);
 assert.match(app,/id\)\);/); // Existing reader/word-card machinery is preserved
 assert.match(css,/\.chapter-vocab-header \.chapter-vocab-toggle/);
 assert.match(css,/border-radius:999px/);
 assert.match(css,/html\[data-theme="dark"\]/);
 assert.match(chapter,/学习本章新词/);
 assert.doesNotMatch(chapter,/自愿复习已学词|startLearnedReview/);
 assert.match(chapter,/\/api\/me\/quick-review/);
 assert.match(app,/saveReadingProgress/);
 assert.match(app,/startReading/);
});
test("04: sentence words speak only; existing user words and book access stay unchanged",()=>{
 const app=read("public/app.js"),worker=read("src/worker.js"),html=read("public/index.html");
 assert.match(app,/function renderExampleWords/);
 assert.match(app,/function pronounceExampleWord/);
 assert.match(app,/data-example-word/);
 assert.match(app,/if\(\$\('wordExampleSpeak'\)\)/);
 assert.match(html,/v11-wordbook\.css/);
 assert.doesNotMatch(worker,/handleOnboarding|handleMyBookshelf|handleExampleWordLookup|study-schedule-store/);
 assert.doesNotMatch(worker,/user_study_schedules/);
});
test("approved production code never bundles staging demo notices or migration helpers",()=>{
 const prod=read("deploy/production.wrangler.jsonc"),js=read("public/app.js");
 assert.doesNotMatch(prod,/miaowu-english-test|STAGING_PREVIEW_PASSWORD|PREVIEW_ANNOUNCEMENT_DEMO/);
 assert.doesNotMatch(js,/user_study_schedules|MiaowuOnboarding/);
 assert.match(read("src/site-announcements.js"),/APP_ENV==="production"&&env\.OPS_ANNOUNCEMENTS_ENABLED==="true"/);
});
