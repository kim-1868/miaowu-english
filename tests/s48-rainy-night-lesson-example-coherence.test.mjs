import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {auditRainyNight} from "../scripts/audit-rainy-night-s1.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";

const words=new Map(composeRainyNightSeasonDraft().bundle.words.map(x=>[x.headword,x]));
test("S48 examples reflect the narrative chronology and explain English senses accurately",()=>{
 const mechanism=words.get("mechanism");
 assert.equal(mechanism.exampleEn,"A spring mechanism controlled the box.");
 assert.equal(mechanism.exampleZh,"一个弹簧装置控制着这个箱子。");
 const switchWord=words.get("switch");
 assert.equal(switchWord.exampleEn,"The system switched to the backup server at midnight.");
 assert.ok(switchWord.exampleZh.includes("备用服务器"));
 const interrupt=words.get("interrupt");
 assert.equal(interrupt.exampleZh,"暴雨中断了录音。");
 const recording=words.get("recording");
 assert.equal(recording.exampleEn,"The recording lasted about two minutes.");
 assert.ok(recording.exampleZh.includes("两分钟"));
 const consent=words.get("consent");
 assert.equal(consent.exampleEn,"They obtained her consent before recording the interview.");
 assert.ok(consent.exampleZh.includes("征得了她的同意"));
});
test("S48 collocations are meaningful phrases instead of grammatical fragments or redundant tautologies",()=>{
 const entry=(w)=>words.get(w).collocations[0];
 assert.deepEqual(entry("register"),{en:"an entry in a register",zh:"登记簿中的一项记录"});
 assert.deepEqual(entry("cooperate"),{en:"cooperate with investigators",zh:"与调查人员合作"});
 assert.deepEqual(entry("duplicate"),{en:"make a duplicate",zh:"制作一份副本"});
 assert.equal(words.get("mechanism").collocations.length,1);
});
test("S48 pedagogical example edits leave the 12-chapter 733-anchor manuscript draft and all blockers unchanged",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const a=auditRainyNight(bundle);
 assert.equal(a.totalMentions,733);
 assert.equal(bundle.words.length,188);
 assert.equal(bundle.chapters.length,12);
 assert.equal(a.releaseStatus,"BLOCKED_FOR_EDITORIAL_REVIEW");
 assert.equal(evaluateRainyNightPublicationGate(bundle).publicationAllowed,false);
 assert.match(bundle.book.id,/^draft-/);
});
