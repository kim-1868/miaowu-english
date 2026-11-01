import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {auditRainyNight} from "../scripts/audit-rainy-night-s1.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";

const sources=[
 "../content/drafts/rainy-night-s1-ch03-ch06.mjs",
 "../content/drafts/rainy-night-s1-ch07-ch09.mjs",
 "../content/drafts/rainy-night-s1-ch10-ch12.mjs"
].map(path=>readFileSync(new URL(path,import.meta.url),"utf8"));

test("S44 revises seven demonstrable verb-object and sense mismatches in private story",()=>{
 const all=sources.join("\n");
 const banned=[
 "被别人 [[replace]] 在新的信纸上",
 "把一张旧记录 [[replace]] 成新的影印件",
 "纸曾被雨水 [[damage]]",
 "愿意作 [[testimony]]",
 "配合 [[maintain]] 材料清单",
 "原始第47页继续 [[retain]] 在馆内",
 "公开说明尽可能 [[transparent]]"
 ];
 for(const awkward of banned)
  assert.equal(all.includes(awkward),false,"Previously identified mismatch still exists: "+awkward);
 const expected=[
 "用一封新信 [[replace]] 原件",
 "用一张新的影印件 [[replace]] 旧记录",
 "雨水曾 [[damage]] 那张纸",
 "愿意提供 [[testimony]]",
 "开始 [[maintain]] 一份材料清单",
 "资料馆继续 [[retain]] 第47页原件",
 "尽可能保持 [[transparent]]"
 ];
 for(const natural of expected)
  assert.ok(all.includes(natural),"Evidence of explicit rewrite missing: "+natural);
});
test("S44 semantic revisions preserve all words, contexts, book preview and draft status",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const audit=auditRainyNight(bundle),review=buildRainyNightOccurrenceReview(bundle);
 assert.equal(audit.totalMentions,733);
 assert.equal(review.overview.occurrenceCount,733);
 assert.equal(bundle.words.length,188);
 assert.equal(bundle.chapters.length,12);
 assert.equal(bundle.chapters.filter(x=>x.preview).length,1);
 assert.match(bundle.book.id,/^draft-/);
 assert.match(bundle.book.title,/测试/);
 assert.equal(audit.releaseStatus,"BLOCKED_FOR_EDITORIAL_REVIEW");
 assert.ok(audit.chapters.every(x=>x.hanCharacters>=3000&&x.hanCharacters<=3500));
});
