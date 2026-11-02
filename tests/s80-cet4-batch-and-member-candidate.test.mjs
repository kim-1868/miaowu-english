import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildStoryBatchPlans,planAll} from "../scripts/story-batch.mjs";
import {batchSelection,batchPreview,runBatchedPhase} from "../scripts/run-story-batch-v2.mjs";
import {prepareRainyNightMemberCandidate,MEMBER_BOOK_ID} from "../scripts/prepare-rainy-night-member-candidate.mjs";
import {validatePackage} from "../src/editorial-content.js";
import {generateSql} from "../scripts/build-content-import.mjs";
import {buildRainyNightPublicSample} from "../scripts/build-rainy-night-public-sample.mjs";

test("S80 plans eight original story titles in one CET4 private batch; genre taxonomy is internal",()=>{
 const plans=buildStoryBatchPlans();
 assert.equal(plans.length,8);
 assert.equal(new Set(plans.map(p=>p.id)).size,8);
 assert.equal(new Set(plans.map(p=>p.title)).size,8);
 assert.ok(plans.every(p=>p.chapterCount===6&&p.vocabulary.length===64));
 assert.ok(plans.every(p=>p.publicationStatus==="PRIVATE_AI_CANDIDATE"&&p.commercialApproved===false));
 assert.ok(plans.every(p=>p.vocabulary.every(w=>w.senseReviewed===false&&w.ipaReviewed===false)));
 assert.deepEqual(batchSelection(plans.slice(1,3).map(p=>p.id)).map(p=>p.id),plans.slice(1,3).map(p=>p.id));
 assert.equal(batchPreview(plans.map(p=>p.id)).estimatedStoryCalls,96);
 assert.equal(batchPreview([plans[0].id]).apiCallsMade,0);
 assert.throws(()=>batchSelection([plans[0].id,plans[0].id]),/DUPLICATE_OR_INVALID_ID/);
 assert.throws(()=>batchSelection(["unknown-story"]),/UNKNOWN_BOOK/);
});
test("S80 bounded concurrency never exceeds two simultaneous independent story batches",async()=>{
 const ids=buildStoryBatchPlans().slice(0,4).map(p=>p.id);
 let pending=0,max=0;const calls=[];
 const result=await runBatchedPhase(ids,"write",{
  concurrency:2,
  write:async(id,phase)=>{
   pending++;max=Math.max(max,pending);calls.push(id+":"+phase);
   await Promise.resolve();
   await Promise.resolve();
   pending--;
   return ["ch01","ch02","ch03","ch04","ch05","ch06"];
  }
 });
 assert.equal(max,2);
 assert.equal(result.passed,4);
 assert.equal(result.blocked,0);
 assert.equal(result.status,"PRIVATE_BATCH_STAGE_COMPLETE");
 assert.equal(result.publicationAllowed,false);
 assert.deepEqual(new Set(calls),new Set(ids.map(x=>x+":write")));
 assert.rejects(()=>runBatchedPhase(ids,"write",{concurrency:4}),/CONCURRENCY_MUST_BE/);
});
test("S80 an independent failed story does not erase successful private drafts",async()=>{
 const ids=buildStoryBatchPlans().slice(0,2).map(p=>p.id);
 const result=await runBatchedPhase(ids,"embed",{concurrency:2,
  write:async id=>{if(id===ids[0])throw Error("RATE_LIMIT_429");return ["private-candidate"];}
 });
 assert.equal(result.blocked,1);
 assert.equal(result.passed,1);
 assert.equal(result.status,"NEEDS_RETRY");
 assert.equal(result.books[0].error,"RATE_LIMIT_429");
 assert.equal(result.publicationAllowed,false);
});
test("S80 entire Rainy Night manuscript is shaped for the existing CET4 member reader but remains private and blocked",()=>{
 const {candidate,report}=prepareRainyNightMemberCandidate();
 const v=validatePackage(candidate);
 assert.equal(candidate.book.id,MEMBER_BOOK_ID);
 assert.equal(candidate.book.title,"雨夜档案");
 assert.equal(candidate.book.category,"cet4");
 assert.equal(candidate.book.coverKey,"rainy-night-cover.webp");
 assert.equal(v.chapters.length,12);
 assert.equal(v.words.length,188);
 assert.equal(v.mentionCount,733);
 assert.deepEqual(candidate.chapters.filter(x=>x.preview).map(x=>x.number),[1]);
 assert.equal(report.commercialReleaseAllowed,false);
 assert.equal(report.d1Touched,false);
 assert.equal(report.sourceGateStatus,"BLOCKED");
 assert.equal(report.review.pendingOccurrences,733);
 assert.equal(report.review.pendingEcho,36);
 const sql=generateSql(candidate);
 assert.equal(sql.summary.publication,"draft-only");
 assert.ok(!sql.sql.includes("status='published' ORDER BY"));
 assert.ok(sql.sql.includes("NULL FROM books WHERE"));
 assert.ok(!sql.sql.includes("UPDATE books SET status"));
 assert.ok(report.existingReaderEndpoints.includes("/api/chapters/:chapterId"));
});
test("S80 front-end cards omit story genre badge while preserving product ownership/status labels",()=>{
 const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
 assert.doesNotMatch(app,/<span class="pill">都市轻悬疑<\/span>/);
 assert.doesNotMatch(app,/<span class="pill">'\+safe\(b\.tag\)\+'/);
 assert.match(app,/<span class="pill">完整版筹备中 · 不出售<\/span>/);
 assert.match(app,/<span class="pill">'\+safe\(slug\.toUpperCase\(\)\)\+'/);
 const html=buildRainyNightPublicSample();
 assert.match(html,/原创故事 · 正文混合英语词汇阅读/);
 assert.doesNotMatch(html,/原创轻悬疑 · 正文混合英语词汇阅读/);
});
