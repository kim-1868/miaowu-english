import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRODUCTION_ASSET_ALLOWLIST,buildProductionAssets} from "../scripts/build-production-assets.mjs";
const read=p=>readFileSync(new URL("../public/"+p,import.meta.url),"utf8");
const html=read("index.html"),app=read("app.js"),css=read("styles.css");

test("S134 banner has a genuine higher resolution AVIF plus fallback, without freezing dynamic text",()=>{
 const art=readFileSync(new URL("../public/cat-reading-hd.avif",import.meta.url));
 assert.ok(art.length>20_000 && art.length<160_000,"hero asset should have visible high-res detail and remain lightweight");
 assert.equal(art.toString("ascii",4,12),"ftypavif");
 assert.ok(PRODUCTION_ASSET_ALLOWLIST.includes("cat-reading-hd.avif"));
 const built=buildProductionAssets();
 assert.ok(built.assets.includes("cat-reading-hd.avif"));
 assert.equal(built.assets.length,40);
 assert.ok(html.includes('srcset="/cat-reading-hd.avif?v=20261104-v26-standard 1x, /cat-reading-tablet-2x.avif?v=20261104-v26-retina 2x"'));
 assert.ok(html.includes('src="/cat-reading-tablet-1x.webp?v=20261104-v26-standard"'));
 assert.ok(html.includes('width="1400" height="512"'));
 assert.ok(html.includes('id="reviewReminder"'));
 assert.match(app,/const due=user\?cloudDue\(\):0/);
 assert.ok(css.includes("height:clamp(375px,28vw,475px) !important"));
});

test("S134 home reminder cat paw keeps four balanced pads with clear viewBox and dark mode",()=>{
 assert.ok(app.includes('class="solid-cat-paw" viewBox="0 0 80 80"'));
 assert.equal((app.match(/<ellipse cx="/g)||[]).length>=4,true);
 assert.ok(app.includes('M39.9 35.8c-7.5'));
 assert.ok(css.includes("reminder-paw .solid-cat-paw"));
 assert.ok(css.includes("html[data-theme=\"dark\"] #view-library .story-home-hero .reminder-paw"));
});

test("S134 narration and night mode labels remain in uniform-height, single-line buttons",()=>{
 assert.ok(html.includes('id="topRead" title="朗读本章"'));
 assert.ok(html.includes('id="toggleNight" title="夜间模式"'));
 assert.ok(css.includes(".read-top .tool-row > #topRead"));
 assert.ok(css.includes(".read-top .tool-row > #toggleNight"));
 assert.ok(css.includes("width:96px !important"));
 assert.ok(css.includes("width:98px !important"));
 assert.ok(css.includes("font-size:14px !important"));
 assert.ok(css.includes("white-space:nowrap !important"));
 assert.ok(css.includes("grid-template-columns:repeat(4,minmax(0,1fr))"));
 assert.ok(app.includes("readerToggle.textContent=night?'☀ 日间':'☾ 夜间'"));
});
