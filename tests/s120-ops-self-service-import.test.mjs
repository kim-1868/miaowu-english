import test from "node:test";
import assert from "node:assert/strict";
import {validatePackage} from "../src/editorial-content.js";
import {planOpsBookImport,handleOpsImport} from "../src/ops-import.js";
import {buildRainyNightFullDensityReviewDraft} from "../scripts/assemble-rainy-night-high-density-review-draft.mjs";

test("S120 full 12 chapter 1892-anchor manuscripts fit production draft importer",()=>{
 const {draft}=buildRainyNightFullDensityReviewDraft();
 const valid=validatePackage(draft);
 const {summary,statements}=planOpsBookImport(valid);
 assert.equal(summary.chapters,12);
 assert.equal(summary.wordCards,188);
 assert.equal(summary.anchors,1892);
 assert.equal(summary.status,"draft");
 assert.equal(summary.published,false);
 assert.equal(summary.previews,0);
 assert.equal(summary.paid,12);
 assert.ok(statements.length<1200);
 assert.equal(statements.filter(s=>s.sql.startsWith("INSERT INTO chapters")).length,12);
 assert.ok(statements.every(s=>!/\bUPDATE\b|\bDELETE\b|\bDROP\b|\bALTER\b/i.test(s.sql)));
 assert.ok(statements.every(s=>s.params.length<=400));
 const allAnchors=statements.filter(s=>s.sql.startsWith("INSERT INTO chapter_words"));
 assert.equal(allAnchors.reduce((n,s)=>n+s.params.length/4,0),1892);
 const allWordIds=new Set(draft.words.map(w=>w.id));
 assert.ok(allAnchors.every(s=>s.params.filter((_,i)=>i%4===1).every(id=>allWordIds.has(id))));
});
test("S120 empty, test-only and unauthenticated publication requests do not create books",async()=>{
 const env={APP_ENV:"production",OPS_TOKEN_PEPPER:"a".repeat(50),DB:null};
 const req=new Request("https://example.test/api/ops/import",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
 const r=await handleOpsImport(req,env,"/api/ops/import");
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,"OPS_NOT_CONFIGURED");
 const wrong=await handleOpsImport(req,env,"/api/ops/books/rainy-night-archives-cet4-v1/publish");
 assert.equal(wrong.status,404);
});
test("S120 valid manuscripts cannot be marked published by their JSON upload",()=>{
 const {draft}=buildRainyNightFullDensityReviewDraft();
 draft.book.status="published";
 const {summary,statements}=planOpsBookImport(validatePackage(draft));
 assert.equal(summary.published,false);
 assert.equal(summary.status,"draft");
 assert.equal(statements[0].params.includes("published"),false);
});