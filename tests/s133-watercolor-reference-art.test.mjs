import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRODUCTION_ASSET_ALLOWLIST,buildProductionAssets} from "../scripts/build-production-assets.mjs";

const text=p=>readFileSync(new URL("../public/"+p,import.meta.url),"utf8");
const binary=p=>readFileSync(new URL("../public/"+p,import.meta.url));
const pictures=[
  ["cat-reading-watercolor.webp",620,194],
  ["shelf-cet4-watercolor.webp",135,126],
  ["shelf-cet6-watercolor.webp",135,126],
  ["shelf-postgrad-watercolor.webp",135,126],
  ["shelf-ielts-watercolor.webp",135,126],
];
test("S133 watercolor assets are real standalone WebP resources shipped in production",()=>{
 const result=buildProductionAssets();
 for(const [file,width,height] of pictures){
  assert.ok(PRODUCTION_ASSET_ALLOWLIST.includes(file),file);
  assert.ok(result.assets.includes(file),file);
  const bytes=binary(file);
  assert.ok(bytes.length>1000,file);
  assert.ok(bytes.length<35000,file);
  assert.equal(bytes.toString("ascii",0,4),"RIFF");
  assert.equal(bytes.toString("ascii",8,12),"WEBP");
 }
 assert.equal(result.assets.length,31);
});
test("S133 homepage uses watermark-free image crops without fake account stats",()=>{
 const html=text("index.html");
 const app=text("app.js");
 const css=text("styles.css");
 assert.ok(html.includes('src="/cat-reading-tablet-1x.webp?v=20261104-v26-standard"'));
 assert.ok(html.includes('srcset="/cat-reading-hd.avif?v=20261104-v26-standard 1x, /cat-reading-tablet-2x.avif?v=20261104-v26-retina 2x"'));
 assert.ok(html.includes('href="/styles.css?v=20261104-v26-retina-banner"'));
 assert.ok(html.includes('src="/app.js?v=20261104-v24-resume-reading"'));
 assert.match(app,/shelf-'\+c\.id\+'\.svg\?v=20261103-home-v17/);
 assert.ok(app.includes('const due=user?cloudDue():0'));
 assert.ok(app.includes('renderHomeStudyStats()'));
 for(const id of ["homeDueCount","homeMasteredCount","homeChapterCount"])
  assert.ok(html.includes('id="'+id+'"'));
 assert.ok(css.includes("mask-image: radial-gradient"));
 assert.ok(css.includes("@media (max-width:540px)"));
 assert.ok(css.includes("html[data-theme=\"dark\"] #view-library .category"));
});
test("S133 original components and paid account routes stay intact",()=>{
 const html=text("index.html"),app=text("app.js");
 assert.ok(html.includes('id="reviewReminder"'));
 assert.ok(html.includes('id="bookGrid"'));
 assert.ok(html.includes('id="homeStudyCard"')||html.includes('class="home-study-card"'));
 assert.ok(app.includes("data-category"));
 assert.ok(app.includes("已解锁"));
 assert.ok(app.includes("navigate('echo')"));
 assert.ok(app.includes("renderReminder()"));
});
