import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../public/"+p,import.meta.url),"utf8");
const html=read("index.html"),app=read("app.js"),css=read("styles.css");

test("S137 dynamic cat reminder appears after banner and before shelf, never inside the hero",()=>{
 const start=html.indexOf('<div class="hero story-home-hero">');
 const after=html.indexOf('<aside class="home-reminder-strip"');
 const end=html.indexOf('<section class="section">',start);
 const reminder=html.indexOf('id="reviewReminder"');
 assert.ok(start>=0&&after>start&&reminder>after&&end>reminder);
 assert.equal((html.match(/id="reviewReminder"/g)||[]).length,1);
 assert.doesNotMatch(html.slice(start,after),/id="reviewReminder"/);
 assert.match(html.slice(after,end),/aria-live="polite"/);
 assert.match(app,/const due=user\?cloudDue\(\):0,seen=cloudSaved\.size/);
 assert.match(app,/seen\?'喵呜，你已收藏 '/);
 assert.match(app,/\$\('reviewReminderBtn'\)\.onclick=/);
 assert.match(css,/#view-library \.home-reminder-strip \.review-reminder\{/);
 assert.match(css,/html\[data-theme="dark"\] #view-library \.home-reminder-strip/);
});

test("S137 CET-4 and CET-6 are rendered as nonbreaking, baseline-aligned pieces",()=>{
 assert.match(app,/category-level-prefix/);
 assert.match(app,/category-level-number/);
 assert.match(app,/\^CET-\(\[46\]\)\$/);
 assert.match(app,/safe\(c\.en\.slice\(-1\)\)/);
 assert.match(css,/#view-library \.category-row \.category \.category-en\{/);
 assert.match(css,/align-items:baseline/);
 assert.match(css,/font-variant-numeric:lining-nums tabular-nums/);
 assert.match(css,/white-space:nowrap/);
 assert.match(css,/#view-library \.category-level-number/);
 assert.match(css,/@media\(max-width:540px\)/);
});

test("S137 category illustration is minimal monochrome vintage SVG line art",()=>{
 const slugs=["cet4","cet6","postgrad","ielts"];
 for(const slug of slugs){
  const art=read("shelf-"+slug+".svg");
  assert.ok(art.startsWith("<svg "));
  assert.ok(art.includes('viewBox="0 0 160 128"'));
  assert.ok(art.includes('stroke="#855247"'));
  assert.ok(art.length<900,"should remain an uncluttered sketch: "+slug);
  assert.doesNotMatch(art,/<script\b|<foreignObject\b|<image\b|data:image|xlink:href=/i);
 }
 assert.match(app,/shelf-'\+c\.id\+'\.svg\?v=20261103-home-v17/);
});

test("S137 v17 CSS/JS use cache-busted assets without affecting reader or ops",()=>{
 assert.ok(html.includes('href="/styles.css?v=20261103-home-v17"'));
 assert.ok(html.includes('src="/app.js?v=20261103-home-v17"'));
 assert.ok(html.includes('id="view-reader"'));
 assert.ok(html.includes('id="view-echo"'));
 assert.ok(html.includes('id="bookGrid"'));
 assert.ok(html.includes('id="homeDueCount"'));
});
