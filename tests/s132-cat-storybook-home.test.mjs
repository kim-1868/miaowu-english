import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRODUCTION_ASSET_ALLOWLIST,buildProductionAssets} from "../scripts/build-production-assets.mjs";

const read=p=>readFileSync(new URL("../public/"+p,import.meta.url),"utf8");
const html=read("index.html");
const app=read("app.js");
const css=read("styles.css");

test("S132 visual: reminder uses the user's reference-style solid paw and stays dynamic",()=>{
 assert.equal((html.match(/id="reviewReminder"/g)||[]).length,1);
 assert.ok(html.indexOf('id="reviewReminder"')>html.indexOf("story-home-hero"));
 assert.ok(html.indexOf('id="reviewReminder"')<html.indexOf('class="category-row"'));
 assert.match(app,/class="solid-cat-paw"/);
 assert.match(app,/viewBox="0 0 64 64"/);
 assert.match(app,/fill="currentColor"/);
 assert.match(app,/const due=user\?cloudDue\(\):0/);
 assert.match(app,/due\?'喵呜，今天有 '/);
 assert.doesNotMatch(app,/今天有 24 个单词等你复习/);
 assert.ok(css.includes("reminder-cat.reminder-paw"));
});

test("S132 visual: distinct storybook illustrations for four category cards",()=>{
 const art=["cet4","cet6","postgrad","ielts"];
 for(const k of art){
  assert.ok(PRODUCTION_ASSET_ALLOWLIST.includes("shelf-"+k+".svg"));
  const svg=read("shelf-"+k+".svg");
  assert.match(svg,/<svg /);
  assert.ok(svg.length>300);
  assert.doesNotMatch(svg,/<script\b|<foreignObject\b|onload=|href=["']https?:/i);
 }
 assert.match(app,/\['cet4','cet6','postgrad','ielts'\]\.includes\(c\.id\)/);
 assert.match(app,/class="category-illustration"/);
 assert.match(css,/\.category-illustration\{/);
});

test("S132 visual: a unique sleepy cat banner and a cat-shaped bookmark clip are fully bundled",()=>{
 for(const name of ["cat-reading-window.svg","cat-bookmark-clip.svg"]){
  assert.ok(PRODUCTION_ASSET_ALLOWLIST.includes(name));
  const image=read(name);
  assert.ok(image.includes("<svg"));
  assert.doesNotMatch(image,/<script\b|foreignObject|onload=|xlink:href=/i);
 }
 assert.ok(html.includes('src="/cat-reading-window.svg"'));
 assert.ok(html.includes('src="/cat-bookmark-clip.svg"'));
 assert.ok(html.includes('class="home-study-card"'));
 assert.ok(css.includes("html[data-theme=\"dark\"] #view-library .story-home-hero"));
 assert.ok(css.includes("@media(max-width:540px)"));
});

test("S132 learning panel only displays real saved data and keeps clickable routes",()=>{
 for(const id of ["homeDueCount","homeSavedCount","homeMasteredCount","homeChapterCount"]){
  assert.ok(html.includes('id="'+id+'"'));
 }
 assert.match(app,/const total=cloudSaved\.size/);
 assert.match(app,/cloudProgress\.filter\(p=>Boolean\(p\.completed_at\)\)\.length/);
 assert.match(app,/cloudSaved\.values\(\)\]\.filter\(w=>w\.status==='mastered'\)/);
 assert.match(app,/\$\('homeDueStat'\)\.onclick=\(\)=>user\?navigate\('echo'\):showLogin\(\)/);
 assert.match(app,/renderHomeStudyStats\(\)/);
 assert.doesNotMatch(html,/id="homeDueCount">24/);
});

test("S132 production builds only approved SVG and customer assets",()=>{
 const report=buildProductionAssets();
 for(const f of ["cat-reading-window.svg","cat-bookmark-clip.svg",
   "shelf-cet4.svg","shelf-cet6.svg","shelf-postgrad.svg","shelf-ielts.svg"]){
  assert.ok(report.assets.includes(f));
 }
 assert.equal(report.assets.length,22);
});
