import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../public/v11-wordbook.css",import.meta.url),"utf8");
const demo=app.slice(app.indexOf("const sampleBookplateWords=["),app.indexOf("function renderWords(){"));
test("staging demo only on exact worker hostname, absent from production UI",()=>{
 assert.match(demo,/location\.hostname==='miaowu-english-staging\.kim10086a\.workers\.dev'/);
 assert.doesNotMatch(demo,/pages\.dev/);
 assert.match(demo,/if\(!previewBookplateAllowed\(\)\|\|!user\)return/);
 assert.match(app,/if\(typeof wordbookDemo!=='undefined'&&wordbookDemo&&previewBookplateAllowed\(\)&&user\)/);
});
test("36 distinct in-memory sample words, 12/page and filtering work without mutating D1",()=>{
 const words=demo.match(/'approach','benefit',[\s\S]*'review','story'/)?.[0];
 assert.ok(words,"36 example words are present");
 const all=[...words.matchAll(/'([a-z]+)'/g)].map(m=>m[1]);
 assert.equal(all.length,36);
 assert.equal(new Set(all).size,36);
 assert.match(demo,/wordbookDemoPage=1/);
 assert.match(demo,/Math\.ceil\(list\.length\/12\)/);
 assert.match(demo,/list\.slice\(\(page-1\)\*12,page\*12\)/);
 assert.match(demo,/data-bookplate-demo/);
 assert.match(demo,/bookplateDemoExit/);
 assert.doesNotMatch(demo,/serverRequest\(|\.DB\.|saveCloudWord\(|setPersonalBookmark\(/);
 assert.match(demo,/不可保存 · 不影响真实学习/);
});
test("preview CSS works with phone and dark mode, real pages remain intact",()=>{
 assert.match(css,/bookplate-preview-entry/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/html\[data-theme="dark"\]/);
 assert.match(html,/app\.js\?v=20261109-favorites-wordbook12-demo/);
 assert.match(html,/v11-wordbook\.css\?v=20261109-wordbook12-demo/);
 assert.match(app,/wordbookPage=next;if\(!previewEnabled\)wordbookData=null;renderWords\(\)/)===false; // Existing server-side pager remains independent.
 assert.match(app,/if\(!previewBookplateAllowed\(\)\|\|!user\)\{wordbookDemo=false;return;\}/);
});
