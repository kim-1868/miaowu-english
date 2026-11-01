import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,existsSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightReviewLedger,validateRainyNightReviewLedger} from
 "../scripts/build-rainy-night-review-ledger.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const bundle=composeRainyNightSeasonDraft().bundle;
const clone=x=>JSON.parse(JSON.stringify(x));
const file=fileURLToPath(new URL("../scripts/build-rainy-night-review-ledger.mjs",import.meta.url));

test("S66 ledger gives exactly one source-anchored pending record for every editorial unit",()=>{
 const led=buildRainyNightReviewLedger(bundle);
 assert.equal(led.rows.length,957);
 assert.equal(led.rows.filter(x=>x.kind==="word").length,188);
 assert.equal(led.rows.filter(x=>x.kind==="context").length,733);
 assert.equal(led.rows.filter(x=>x.kind==="echo").length,36);
 assert.equal(new Set(led.rows.map(x=>x.id)).size,957);
 assert.equal(led.rows.filter(x=>x.decision!=="PENDING").length,0);
 assert.ok(led.rows.every(x=>/^[a-f0-9]{64}$/.test(x.sourceHash)));
 assert.ok(led.rows.every(x=>x.reviewer===""&&x.reviewedAt===""&&
  x.note===""&&x.evidenceRef===""));
 assert.equal(validateRainyNightReviewLedger(bundle,clone(led)).valid,true);
});

test("S66 offline validator can count a separately recorded human decision but never release it",()=>{
 const led=buildRainyNightReviewLedger(bundle);
 const word=led.rows.find(x=>x.kind==="word");
 word.decision="REVIEWED_OK";
 word.reviewer="editor-a";
 word.reviewedAt="2026-11-02T01:23:45.000Z";
 word.note="Reviewed the current context and the source list with supporting materials.";
 word.evidenceRef="offline-review-log-A1";
 const res=validateRainyNightReviewLedger(bundle,led);
 assert.equal(res.valid,true,JSON.stringify(res.failures));
 assert.equal(res.reviewed,1);
 assert.equal(res.pending,956);
 assert.equal(res.publicationAllowed,false);
 assert.equal(evaluateRainyNightPublicationGate(bundle).status,"BLOCKED");
});

test("S66 validator rejects made-up signs, forged source fields, missing and duplicate records",()=>{
 const base=buildRainyNightReviewLedger(bundle);
 const bad=clone(base);
 bad.rows[0].decision="REVIEWED_OK";
 bad.rows[0].reviewer="bot";
 assert.ok(validateRainyNightReviewLedger(bundle,bad).failures.some(x=>
  x.startsWith("HUMAN_REVIEW_EVIDENCE_MISSING")));
 const stolen=clone(base);
 stolen.rows[0].sourceHash="0".repeat(64);
 assert.ok(validateRainyNightReviewLedger(bundle,stolen).failures.some(x=>
  x.startsWith("SOURCE_FIELD_CHANGED")));
 const missing=clone(base);
 missing.rows.pop();
 assert.equal(validateRainyNightReviewLedger(bundle,missing).valid,false);
 const duplicated=clone(base);
 duplicated.rows[7]=clone(duplicated.rows[0]);
 assert.ok(validateRainyNightReviewLedger(bundle,duplicated).failures.some(x=>
  x.startsWith("DUPLICATE_ID")));
 const altered=clone(base);
 altered.rows[10].preview+=" changed";
 assert.equal(validateRainyNightReviewLedger(bundle,altered).valid,false);
 const unexplained=clone(base);
 unexplained.rows[0].note="looks good";
 assert.ok(validateRainyNightReviewLedger(bundle,unexplained).failures.some(x=>
  x.startsWith("PENDING_ROW_HAS_FAKE_SIGNOFF")));
});

test("S66 ledger fails closed when manuscript changes, including single-source wording",()=>{
 const saved=buildRainyNightReviewLedger(bundle);
 const changed=clone(bundle);
 const first=changed.chapters[0].paragraphs[0].segments[0];
 first.text+="修订";
 const result=validateRainyNightReviewLedger(changed,saved);
 assert.equal(result.valid,false);
 assert.ok(result.failures.includes("MANUSCRIPT_CHANGED_REGENERATE_AND_RECHECK"));
 assert.ok(result.failures.some(x=>x.startsWith("SOURCE_FIELD_CHANGED")));
 const wrong=clone(saved);
 wrong.bookId="draft-other-book";
 assert.ok(validateRainyNightReviewLedger(bundle,wrong).failures.includes("BOOK_MISMATCH"));
});

test("S66 CLI exports ONLY on explicit write, refuses overwrite, validates local-only",()=>{
 const temp=mkdtempSync(join(tmpdir(),"miaowu-s66-"));
 try{
  const summary=spawnSync(process.execPath,[file,"--summary"],{cwd:temp,encoding:"utf8"});
  assert.equal(summary.status,0,summary.stderr);
  assert.equal(existsSync(join(temp,"private-output")),false);
  const written=spawnSync(process.execPath,[file,"--write-private"],{cwd:temp,encoding:"utf8"});
  assert.equal(written.status,0,written.stderr);
  const path=join(temp,"private-output","rainy-night-s1-HUMAN-REVIEW-LEDGER.json");
  assert.equal(existsSync(path),true);
  const body=JSON.parse(readFileSync(path,"utf8"));
  assert.equal(body.rows.length,957);
  assert.ok(body.rows.every(r=>r.decision==="PENDING"));
  const validated=spawnSync(process.execPath,[file,"--validate-private",path],{cwd:temp,encoding:"utf8"});
  assert.equal(validated.status,0,validated.stderr);
  assert.equal(JSON.parse(validated.stdout).valid,true);
  const refused=spawnSync(process.execPath,[file,"--write-private"],{cwd:temp,encoding:"utf8"});
  assert.notEqual(refused.status,0);
  body.rows[0].sourceHash="e".repeat(64);
  writeFileSync(path,JSON.stringify(body),"utf8");
  const invalid=spawnSync(process.execPath,[file,"--validate-private",path],{cwd:temp,encoding:"utf8"});
  assert.notEqual(invalid.status,0);
  assert.equal(JSON.parse(invalid.stdout).valid,false);
  assert.equal(existsSync(join(temp,"public")),false);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
