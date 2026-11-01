import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {auditRainyNight,reportMarkdown} from "../scripts/audit-rainy-night-s1.mjs";
test("manuscript audit is derived from 12 actual private chapters, not fabricated marketing numbers",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const audit=auditRainyNight(bundle);
 assert.equal(audit.chapterCount,12);
 assert.equal(audit.targetWords,bundle.words.length);
 assert.equal(audit.totalMentions,
  bundle.chapters.flatMap(c=>c.paragraphs.flatMap(p=>p.segments))
    .filter(s=>typeof s.wordId==="string").length);
 assert.ok(audit.chapters.every(c=>c.wordMentions>=1&&c.hanCharacters>0));
 assert.equal(audit.wordsWithNoMentions,0);
 assert.ok(audit.wordsOnlyOnce+audit.repeatedAcrossChapters<=audit.targetWords);
 assert.ok(audit.repeatedAcrossChapters>=20,"At least 20 core words recur in later chapters");
 assert.equal(audit.crossChapterReuseGap,
  Math.max(0,audit.crossChapterReusePlanningTarget-audit.repeatedAcrossChapters));
 assert.ok(audit.repeatedAcrossChapters>=audit.crossChapterReusePlanningTarget,
  "At least 30% of candidate words now recur across separate chapters");
 assert.equal(audit.wordsWithoutIpa,audit.targetWords);
 assert.equal(audit.wordsWithoutVerifiedLevel,audit.targetWords);
 assert.equal(audit.wordsWithoutTranslations,0);
 assert.equal(audit.releaseStatus,"BLOCKED_FOR_EDITORIAL_REVIEW");
 assert.match(reportMarkdown(audit),/英美音标/);
});
test("repeat detection counts appearances in multiple chapters rather than duplicated mentions only",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const first=bundle.chapters[0].paragraphs.flatMap(p=>p.segments)
  .find(s=>typeof s.wordId==="string");
 assert.ok(first);
 // Original text is not mutated; this is only an in-memory copy.
 const manipulated=structuredClone(bundle);
 manipulated.chapters[1].paragraphs[0].segments.push({
  wordId:first.wordId,surface:first.surface,gloss:first.gloss
 });
 const before=auditRainyNight(bundle),after=auditRainyNight(manipulated);
 assert.equal(after.totalMentions,before.totalMentions+1);
 assert.ok(after.repeatedAcrossChapters>=before.repeatedAcrossChapters);
 assert.equal(after.wordsWithNoMentions,0);
});
test("quality report never marks an unreviewed story ready for commerce",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const report=auditRainyNight(bundle);
 assert.match(bundle.book.id,/^draft-/);
 assert.ok(report.findings.some(x=>x.code==="CET4_LEVEL_UNVERIFIED"));
 assert.ok(report.findings.some(x=>x.code==="IPA_UNVERIFIED"));
 assert.notEqual(report.releaseStatus,"READY_FOR_SALE");
});
