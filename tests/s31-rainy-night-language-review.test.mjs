import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {auditRainyNight} from "../scripts/audit-rainy-night-s1.mjs";
import {createVocabularyReviewQueue,reviewCsv} from "../scripts/prepare-rainy-night-vocabulary-review.mjs";

const manuscripts=[
 "../content/drafts/rainy-night-s1-ch03-ch06.mjs",
 "../content/drafts/rainy-night-s1-ch07-ch09.mjs",
 "../content/drafts/rainy-night-s1-ch10-ch12.mjs"
].map(p=>readFileSync(new URL(p,import.meta.url),"utf8"));

test("S31 previously found noun/adjective/verb code-switch errors stay corrected",()=>{
 const full=manuscripts.join("\n");
 for(const bad of [
  "做了一次 [[reverse]] 比对","被这两种日期彻底 [[confuse]]",
  "对老旧线路的 [[predict]]","故意 [[missing]] 记录",
  "书 [[missing]] 一页","针对证人信息的 [[threaten]]",
  "[[threaten]] 要把反映问题的居民名单",
  "物资 [[distribute]] 的记录","作 [[proof]]"
 ]){
  assert.equal(full.includes(bad),false,"Unnatural grammatical placement remains: "+bad);
 }
 assert.match(manuscripts[0],/先 \[\[reverse\]\] 图像方向/);
 assert.match(manuscripts[0],/来 \[\[predict\]\] 下一次停电/);
 assert.match(manuscripts[2],/来 \[\[threaten\]\] 她/);
});
test("S31 the contact-request dialog precedes the letter written for delivery",()=>{
 const ch7=manuscripts[1];
 const ask=ch7.indexOf("“你能不能帮我 [[contact]] 她？”");
 const letter=ch7.indexOf("她写了很久，最后只写下");
 assert.ok(ask>0&&letter>ask,"Reader must ask for contact before drafting a letter");
});
test("S31 vocabulary QA queue covers all actual 188 manuscript words, including risks",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const audit=auditRainyNight(bundle);
 const queue=createVocabularyReviewQueue(bundle);
 assert.equal(queue.rows.length,188);
 assert.equal(queue.overview.totalWords,188);
 assert.equal(queue.overview.totalMentions,audit.totalMentions);
 assert.equal(queue.overview.flaggedForIpa,188);
 assert.equal(queue.overview.flaggedForLevel,188);
 assert.equal(queue.overview.oneMentionWords,25);
 assert.equal(queue.overview.singleChapterWords,97);
 assert.equal(queue.overview.ukCandidatesFound,181);
 assert.equal(queue.overview.ukCandidatesMissing,7);
 assert.equal(queue.overview.ukVariantsNeedingReview,14);
 assert.equal(queue.overview.ukCandidateLicence,"MIT");
 assert.equal(queue.rows.filter(r=>r.sourceUkCandidatesCount>0).length,181);
 assert.ok(queue.rows.every(r=>r.phoneticUk===""&&r.phoneticUs===""));
 assert.ok(queue.rows.every(r=>r.sourceUkProvenance.includes("JoseLlarena/Britfone")));
 assert.equal(queue.overview.acrossTwoOrMore,audit.repeatedAcrossChapters);
 assert.equal(queue.overview.notPublished,true);
 assert.ok(queue.rows.some(w=>w.mentions>=6&&w.chapterCount>=2));
 assert.ok(queue.rows.every(w=>w.reviewDecision==="UNREVIEWED"&&!w.verifiedCET4));
 assert.ok(queue.rows.every(w=>w.reviewFlags.includes("IPA_NOT_VERIFIED")&&
  w.reviewFlags.includes("CET4_NOT_VERIFIED")));
 const csv=reviewCsv(queue);
 assert.ok(csv.startsWith("wordId,headword"));
 assert.equal(csv.trim().split("\n").length,189);
 assert.ok(csv.includes("firstContext"));
 assert.ok(!csv.includes("PAID_CONTENT_PUBLISHED"));
});
test("S31 audited manuscript remains private and cannot be silently represented as approved",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const audit=auditRainyNight(bundle);
 assert.match(bundle.book.id,/^draft-/);
 assert.match(bundle.book.title,/测试/);
 assert.equal(audit.releaseStatus,"BLOCKED_FOR_EDITORIAL_REVIEW");
 assert.equal(audit.wordsWithoutIpa,188);
 assert.equal(audit.wordsWithoutVerifiedLevel,188);
});
