import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildS86FreeChapter} from "../scripts/build-s86-free-first-chapter.mjs";
import {buildProductionAssets,PRODUCTION_ASSET_ALLOWLIST} from "../scripts/build-production-assets.mjs";

test("S86 public original chapter includes 77 English targets and no other chapters",()=>{
 const html=buildS86FreeChapter();
 assert.equal((html.match(/<strong lang="en">/g)||[]).length,77);
 assert.equal((html.match(/<article id="chapter">/g)||[]).length,1);
 assert.match(html,/重生后我不再讨好他们/);
 assert.match(html,/第一章 · 这一次，我没有签字/);
 assert.match(html,/hospital/);
 for(const next of ["被退回的方案","别人的名字","所有人都在等她认输","被偷走的不是方案","她选择自己的名字"]){
  assert.ok(!html.includes(next),"Private chapter appeared: "+next);
 }
 for(const unsafe of ["wordId","phoneticUk","phoneticUs","PRIVATE_ORIGINAL_FIRST_DRAFT_UNREVIEWED",
 "openai_api_key","[[","chapter_words","editorNotes","genre_internal"]){
  assert.ok(!html.includes(unsafe),"Unreviewed metadata appeared: "+unsafe);
 }
 assert.match(html,/词形、语境释义、音标及学习功能仍在校对/);
});
test("S86 production allowlist never includes complete manuscripts or D1 imports",()=>{
 const output=buildProductionAssets();
 assert.ok(output.assets.includes("rejected-family-second-life.html"));
 assert.ok(output.assets.includes("rainy-night.html"));
 assert.equal(output.assets.length,PRODUCTION_ASSET_ALLOWLIST.length);
 assert.ok(!output.assets.some(p=>/\.md$|\.json$|\.sql$|private|chapter-02/.test(p)));
 const live=readFileSync(new URL("../dist-production/public/rejected-family-second-life.html",import.meta.url),"utf8");
 assert.equal(live,buildS86FreeChapter());
 const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
 for(const title of ["重生后我不再讨好他们","被赶出豪门后我成了继承人","契约婚姻到期那天",
 "穿成恶毒女配后，我不演了","死对头突然开始对我好","合租室友藏了七年的秘密",
 "离婚后，前夫公司成了我的客户","替嫁当天，我撕了婚约"])
  assert.ok(app.includes(title));
 assert.ok(app.includes("href=\"'+n.sample+'\">读第一章"));
 assert.ok(!app.includes("genre_internal"));
 assert.ok(app.includes("完整版校对中 · 暂不出售"));
});
