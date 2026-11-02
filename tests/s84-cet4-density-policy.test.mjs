import {test} from "node:test";
import assert from "node:assert/strict";
import {buildS82DraftBundles} from "../scripts/build-six-original-story-packages.mjs";
import {DENSITY,auditChapterDensity,buildDensityReport} from "../scripts/audit-cet4-word-density.mjs";
import {auditStoryChapter,buildStoryBatchPlans} from "../scripts/story-batch.mjs";

test("S84 computes per-chapter density using Chinese characters rather than paragraphs or word list size",()=>{
 const [first]=buildS82DraftBundles();
 const revised=auditChapterDensity(first.bundle.chapters[0]);
 assert.ok(revised.occurrences>=16);
 assert.ok(revised.occurrencesPer100Han>=DENSITY.minimum);
 assert.equal(revised.passedDensity,true);
 assert.equal(revised.readingQualityReviewRequired,true);
 assert.equal(revised.additionalOccurrencesNeeded,0);
});
test("S84 reports existing weak-density chapters explicitly without falsely marking them for sale",()=>{
 const report=buildDensityReport(buildS82DraftBundles());
 assert.equal(report.books.length,8);
 assert.equal(report.chaptersReviewed,48);
 assert.ok(report.chaptersPassing>=1);
 assert.ok(report.chaptersPassing<36);
 assert.ok(report.missingOccurrences>100);
 assert.equal(report.editorApproval,false);
 assert.equal(report.canPublish,false);
 assert.equal(report.productionDbTouched,false);
 assert.equal(report.status,"DENSITY_REVISION_REQUIRED");
 assert.ok(report.books.every(b=>b.publicationAllowed===false));
});
test("S84 generated manuscripts reject density under 2.2 anchors per 100 Han",()=>{
 const plan=buildStoryBatchPlans()[0],word=plan.vocabulary[0].headword;
 const clean=Array.from({length:16},()=> "她知道这段关系里藏着太多误会，却决定先离开这座城，整理自己的生活与选择。".repeat(2));
 const tooFew=clean.map((p,i)=>i<12?p+"[["+word+"]]":p);
 assert.throws(()=>auditStoryChapter(plan,tooFew,"embedded",clean),/EMBEDDING_DENSITY_INVALID/);
 const okay=clean.map(p=>p+("[["+word+"]]").repeat(5));
 const good=auditStoryChapter(plan,okay,"embedded",clean);
 assert.ok(good.occurrencesPer100Han>=DENSITY.minimum);
 assert.ok(good.occurrencesPer100Han<=DENSITY.hardMaximum);
 assert.equal(good.anchors,80);
});
