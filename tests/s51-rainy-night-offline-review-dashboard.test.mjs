import {test} from "node:test";
import assert from "node:assert/strict";
import {existsSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightOfflineReviewDashboard} from "../scripts/build-rainy-night-review-dashboard.mjs";

test("S51 private review dashboard covers all 188 word cards, 733 occurrences and 36 Echo prompts",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const {summary,html}=buildRainyNightOfflineReviewDashboard(bundle);
 assert.deepEqual(summary,{
  status:"PRIVATE_EDITORIAL_NOT_APPROVED",wordCards:188,contexts:733,
  echoQuestions:36,reviewedWords:0,reviewedContexts:0,
  reviewedQuestions:0,published:false,productionDbTouched:false
 });
 assert.equal((html.match(/data-kind="word"/g)||[]).length,188);
 assert.equal((html.match(/data-kind="context"/g)||[]).length,733);
 assert.equal((html.match(/data-kind="echo"/g)||[]).length,36);
 assert.ok(html.includes("rns1-ch01:p"));
 assert.ok(html.includes("EDITORIAL_NOT_APPROVED"));
 assert.ok(html.includes("connect-src &#39;none&#39;"));
 assert.ok(html.includes("src")==false||!html.includes("<script src="));
 assert.ok(!html.includes("https://api.cloudflare.com"));
});

test("S51 story and word fields are HTML-escaped, so manuscript text cannot execute embedded scripts",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 bundle.words[0].exampleEn='<script>alert("injected")</script>';
 const {html}=buildRainyNightOfflineReviewDashboard(bundle);
 assert.ok(html.includes("&lt;script&gt;alert(&quot;injected&quot;)&lt;/script&gt;"));
 assert.ok(!html.includes('<script>alert("injected")</script>'));
});

test("S51 local-only dashboard refuses previously promoted book identity",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 bundle.book.id="public-story";
 assert.throws(()=>buildRainyNightOfflineReviewDashboard(bundle),
  /S51_REVIEW_DASHBOARD_REQUIRES_UNAPPROVED_12_CHAPTER_DRAFT/);
});

test("S51 summary cannot write private manuscript; explicit flag writes only into gitignored private-output",()=>{
 const temp=mkdtempSync(join(tmpdir(),"miaowu-s51-"));
 const script=fileURLToPath(new URL("../scripts/build-rainy-night-review-dashboard.mjs",import.meta.url));
 try{
  const normal=spawnSync(process.execPath,[script,"--summary"],{cwd:temp,encoding:"utf8"});
  assert.equal(normal.status,0,normal.stderr);
  assert.equal(existsSync(join(temp,"private-output")),false);
  const written=spawnSync(process.execPath,[script,"--write-private"],{cwd:temp,encoding:"utf8"});
  assert.equal(written.status,0,written.stderr);
  const path=join(temp,"private-output","rainy-night-s1-PRIVATE-UNREVIEWED.html");
  assert.equal(existsSync(path),true);
  assert.ok(readFileSync(path,"utf8").includes("离线审校台"));
  assert.equal(existsSync(join(temp,"public")),false);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
