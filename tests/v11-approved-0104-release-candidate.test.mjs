// Owner-selected first batch: 01 notice, 02 mobile/install, 03 reader, 04 wordbook.
// This checks production package candidates without touching remote D1 or deploying.
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {plannedProductionAssets,PRODUCTION_ASSET_ALLOWLIST,APPROVED_ANNOUNCEMENT_ASSETS}
 from "../scripts/build-production-assets.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("Approved 01-04: ordinary production bundle remains 46 assets with notices removed",()=>{
 const baseline=plannedProductionAssets();
 assert.deepEqual(baseline,[...PRODUCTION_ASSET_ALLOWLIST]);
 assert.equal(baseline.length,46);
 assert.ok(!baseline.includes("updates.html"));
 assert.ok(!baseline.includes("ops-updates.js"));
});
test("Approved 01-04: opt-in bundle adds only four reviewed notice assets",()=>{
 const included=plannedProductionAssets({includeAnnouncements:true});
 assert.equal(included.length,50);
 assert.deepEqual(included.slice(46),APPROVED_ANNOUNCEMENT_ASSETS);
 for(const file of ["site-updates.css","site-updates.js","updates.html","ops-updates.js"]){
  assert.equal(included.filter(x=>x===file).length,1,file);
 }
});
test("Approved 01-04: notice must sit immediately beneath navigation and above hero",()=>{
 const html=read("public/index.html");
 const nav=html.indexOf("</header>");
 const banner=html.indexOf('id="siteUpdateBanner"');
 const hero=html.indexOf('id="miaowuHomeScene"');
 assert.ok(nav>=0&&nav<banner&&banner<hero,
  "Navigation / announcement / homepage hero order must remain stable");
 const op=read("public/ops.html");
 assert.match(op,/id="updatesFold"/);
 assert.match(op,/id="updatesAdminForm"/);
 const backend=read("src/site-announcements.js");
 assert.match(backend,/OPS_ANNOUNCEMENTS_ENABLED/);
 assert.match(backend,/APP_ENV==="production"/);
 assert.match(backend,/APP_ENV==="staging"/);
});
test("Approved 01-04: mobile onboarding, reading tools and wordbook remain wired",()=>{
 const html=read("public/index.html");
 for(const resource of ["install-guide.css","install-guide.js","onboarding.js","v11-reader.css",
   "v11-responsive.css","v11-wordbook.css"]){
  assert.ok(html.includes("/"+resource),resource);
  assert.ok(plannedProductionAssets().includes(resource),resource);
 }
 assert.match(html,/id="installGuideIphoneTab"/);
 assert.match(html,/id="installGuideAndroidTab"/);
 assert.match(html,/id="siteUpdateDialog"/);
 const reader=read("public/v11-reader.css");
 assert.ok(reader.length>100);
 const wordbook=read("public/v11-wordbook.css");
 assert.match(wordbook,/example/i);
});
