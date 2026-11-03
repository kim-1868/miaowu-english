// Review UI is intentionally offline and not copied to the public Pages assets.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {join} from "node:path";
const root=new URL("../tools/",import.meta.url);
const pages=["rainy-night-ipa-offline-review.html","rainy-night-story-offline-review.html"];
test("S117 offline editorial reviewers parse and contain no network/file upload behavior",()=>{
 for(const page of pages){
  const raw=readFileSync(new URL(page,root),"utf8");
  const match=raw.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match,"Missing JS reviewer: "+page);
  assert.doesNotThrow(()=>new Script(match[1],{filename:page}));
  assert.match(raw,/connect-src 'none'/);
  assert.match(raw,/default-src 'none'/);
  assert.doesNotMatch(match[1],/(?:window\.)?fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|eval\s*\(/);
  for(const [,id] of match[1].matchAll(/\$\("([^"]+)"\)/g))
   assert.match(raw,new RegExp('id="'+id+'"'),"Missing editor field "+id+" in "+page);
  assert.match(raw,/type="file"/);
  assert.match(raw,/new Blob\(/);
 }
});
test("S117 IPA signoff UI never auto-stamps editors or source license checkboxes",()=>{
 const raw=readFileSync(new URL(pages[0],root),"utf8");
 assert.match(raw,/commercialUseConfirmed=false/);
 assert.match(raw,/r.reviewedBy=reviewer/);
 assert.match(raw,/r.reviewedAt=new Date\(\)\.toISOString\(\)/);
 assert.match(raw,/INDEPENDENT_TRANSCRIPTION/);
 assert.match(raw,/ukSourceCandidates\.length===0/);
});
test("S117 story QA notes are tied to manuscript version instead of granting publication status",()=>{
 const raw=readFileSync(new URL(pages[1],root),"utf8");
 assert.match(raw,/n.sourceDigest!==b.sourceDigest/);
 assert.match(raw,/PRIVATE_LANGUAGE_NOTES_NOT_APPROVAL_TO_PUBLISH/);
 assert.doesNotMatch(raw,/"published"|publishAvailable\s*=/);
});
