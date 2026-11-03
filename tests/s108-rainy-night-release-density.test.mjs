import test from "node:test";
import assert from "node:assert/strict";
import {auditRainyNightLaunchDensity} from "../scripts/audit-rainy-night-launch-density.mjs";
test("S108 Rainy Night launch density audit is grounded in the actual imported book",()=>{
 const x=auditRainyNightLaunchDensity();
 assert.equal(x.bookId,"rainy-night-archives-cet4-v1");
 assert.equal(x.chapterCount,12);
 assert.equal(x.distinctWords,188);
 assert.equal(x.totalOccurrences,733);
 assert.equal(x.chapterDetails.length,12);
 assert.ok(x.totalHan>20000);
 assert.ok(x.paragraphs>=12);
 assert.equal(x.productionD1Touched,false);
 assert.equal(x.publishingAllowed,false);
 assert.equal(x.meetsConfirmedLearningDensity,false,"This draft still needs high-density language revision.");
});
