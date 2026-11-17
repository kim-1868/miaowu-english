import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRODUCTION_ASSET_ALLOWLIST,buildProductionAssets} from "../scripts/build-production-assets.mjs";
const read=p=>readFileSync(new URL("../public/"+p,import.meta.url),"utf8");
test("S135: the four categories use independent, crisp vintage SVG line drawings",()=>{
 const app=read("app.js");
 for(const id of ["cet4","cet6","postgrad","ielts"]){
  const name="shelf-"+id+".svg";
  assert.ok(PRODUCTION_ASSET_ALLOWLIST.includes(name));
  const svg=read(name);
  assert.match(svg,/viewBox="0 0 160 128"/);
  assert.match(svg,/stroke=/);
  assert.doesNotMatch(svg,/data:image\/webp|<image\b|<script\b|<foreignObject\b/);
 }
 assert.ok(app.includes("c.id+'.svg?v=20261103-home-v17\""));
 assert.ok(!app.includes("'-watercolor.webp?v=20261103-watercolor'"));
 const build=buildProductionAssets();
 for(const id of ["cet4","cet6","postgrad","ielts"])
  assert.ok(build.assets.includes("shelf-"+id+".svg"));
});
test("S135: English course levels share one stable row and baseline",()=>{
 const css=read("styles.css"),app=read("app.js");
 assert.match(css,/\.category-row \.category\{\s*grid-template-columns:[\s\S]*?grid-template-rows:54px 24px 24px;/);
 assert.match(css,/\.category-row \.category \.category-en\{[\s\S]*?grid-column:2;grid-row:2;/);
 assert.match(css,/\.category-row \.category strong\{[\s\S]*?grid-column:2;grid-row:1;/);
 assert.match(css,/\.category-row \.category \.category-illustration\{[\s\S]*?mask-image:none;/);
 assert.match(css,/@media \(max-width:540px\)\{[\s\S]*?\.category-row \.category\{[\s\S]*?grid-template-rows:92px 47px 23px 24px;/);
 for(const en of ["CET-4","CET-6","POSTGRAD","IELTS"])assert.ok(app.includes("en:'"+en+"'"));
});
test("S135: banner, live book data, and paid gating are unchanged",()=>{
 const app=read("app.js"),html=read("index.html");
 assert.ok(html.includes("cat-reading-hd.avif"));
 assert.ok(html.includes("href=\"/styles.css?v=20261104-v28-night-selection\""));
 assert.ok(html.includes("src=\"/app.js?v=20261109-favorites-wordbook12\""));
 assert.ok(app.includes("data-category"));
 assert.ok(app.includes("has(c.id)?'✓ 已解锁'"));
 assert.ok(app.includes("renderHomeStudyStats()"));
});


test("CET-4 homepage category copy describes the full vocabulary collection",()=>{
 const app=read("app.js"),html=read("index.html");
 assert.match(app,/id:'cet4',en:'CET-4',name:'大学英语四级',sub:'词汇学习 · 故事精选'/);
 assert.doesNotMatch(app,/核心词 · 故事精选/);
 assert.match(html,/id="selectedCategoryTitle">四级 · 故事精选<\/h2>/);
 assert.doesNotMatch(html,/四级核心词/);
 assert.match(app,/\$\('selectedCategoryTitle'\)\.textContent=picked\.name\+' · 故事书架'/);
});
