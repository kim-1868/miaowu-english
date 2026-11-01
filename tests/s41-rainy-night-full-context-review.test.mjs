import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightOccurrenceReview,contextReviewCsv} from "../scripts/review-rainy-night-word-contexts.mjs";
import {buildRainyNightTeachingTrackPlan} from "../scripts/plan-rainy-night-teaching-tracks.mjs";
import {auditRainyNight} from "../scripts/audit-rainy-night-s1.mjs";
test("S41 produce one immutable reference for every real word occurrence with exact segment and gloss",()=>{
 const {bundle}=composeRainyNightSeasonDraft(),review=buildRainyNightOccurrenceReview(bundle);
 const audit=auditRainyNight(bundle);
 assert.equal(review.overview.chapterCount,12);
 assert.equal(review.overview.wordCount,188);
 assert.equal(review.overview.occurrenceCount,733);
 assert.equal(review.overview.occurrenceCount,audit.totalMentions);
 assert.equal(review.overview.unreviewed,733);
 assert.equal(review.overview.publicationAllowed,false);
 assert.equal(new Set(review.rows.map(x=>x.ref)).size,733);
 assert.equal(review.overview.perChapter.length,12);
 for(const row of review.rows){
  const ch=bundle.chapters.find(x=>x.id===row.chapterId);
  assert.ok(ch);
  const para=ch.paragraphs[row.paragraph-1];
  const seg=para.segments[row.segment-1];
  assert.equal(seg.wordId,row.wordId);
  assert.equal(seg.surface,row.word);
  assert.equal(seg.gloss,row.gloss);
  assert.ok(row.originalContext.includes(row.word));
  assert.equal(row.reviewStatus,"UNREVIEWED");
  assert.ok(row.reviewFlags.includes("POS_SENSE_CONTEXT_UNREVIEWED"));
  assert.ok(row.reviewFlags.includes("ENGLISH_CHINESE_MIX_UNREVIEWED"));
  assert.equal(row.approvedReplacement,"");
 }
});
test("S41 risk flags include actual word-sense IPA ambiguity, non-CET4 target words and overloaded paragraphs",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const review=buildRainyNightOccurrenceReview(bundle);
 const tracks=new Map(buildRainyNightTeachingTrackPlan(bundle).rows.map(x=>[x.wordId,x.track]));
 assert.ok(review.overview.flags.NON_CET4_CORE_TARGET>0);
 assert.ok(review.overview.flags.US_ARPA_VARIANT_NEEDS_SENSE_REVIEW>0);
 assert.ok(review.overview.flags.UK_IPA_NOT_IN_SOURCE>0);
 assert.ok(review.overview.flags.DENSE_WORD_PARAGRAPH>0);
 assert.ok(review.rows.filter(x=>x.reviewFlags.includes("NON_CET4_CORE_TARGET"))
  .every(x=>tracks.get(x.wordId)!=="CET4_FORM_CANDIDATE"));
 assert.ok(review.rows.filter(x=>x.reviewFlags.includes("UK_IPA_NOT_IN_SOURCE"))
  .every(x=>["blurred","discrepancy","falsify","handwriting",
   "outage","reunite","watermark"].includes(x.word)));
});
test("S41 private 733-context CSV exports editable approval columns but no fake signoff",()=>{
 const review=buildRainyNightOccurrenceReview(composeRainyNightSeasonDraft().bundle);
 const csv=contextReviewCsv(review);
 assert.ok(csv.startsWith("ref,chapter,paragraph,segment"));
 assert.ok(csv.includes("reviewStatus,approvedReplacement,editorNotes"));
 assert.ok(csv.includes("rns1-ch01:p"));
 assert.equal(csv.trim().split("\n").length,734);
 assert.ok(csv.includes("UNREVIEWED"));
 assert.ok(!csv.includes("EDITOR_APPROVED"));
});
