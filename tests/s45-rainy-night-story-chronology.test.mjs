import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {auditRainyNight} from "../scripts/audit-rainy-night-s1.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";

const {bundle}=composeRainyNightSeasonDraft();
const lines=n=>bundle.chapters.find(x=>x.number===n).paragraphs.map(
 p=>p.segments.map(s=>s.text??s.surface).join(""));
const position=(n,part)=>{
 const i=lines(n).findIndex(x=>x.includes(part));
 assert.ok(i>=0,"Cannot find chronology anchor in chapter "+n+": "+part);
 return i;
};

test("S45 dates and first library appointment unfold in chronological order",()=>{
 const ch3=lines(3).join("");
 assert.match(ch3,/看起来像十一月一日，而今天仍是十月三十一日/);
 assert.doesNotMatch(ch3,/今天也正是十月三十一日/);
 assert.ok(position(7,"到图书馆之前")<position(7,"接待她的"));
 assert.ok(position(7,"接待她的")<position(7,"确认今天的"));
});

test("S45 delay-box paper is delivered only once and followed by content verification",()=>{
 assert.ok(position(8,"夜里快十一点时")<position(8,"已发生的信件投递"));
 assert.ok(position(8,"已发生的信件投递")<position(8,"信封里仍只有姐姐的一行字"));
 assert.ok(position(8,"信封里仍只有姐姐的一行字")<position(8,"读着那张纸条"));
 assert.equal(lines(8).filter(x=>x.includes("信箱里又掉下一张纸")).length,0);
});
test("S45 audio provenance, playback, speech and end-of-recording are in time order",()=>{
 assert.ok(position(9,"回到书店，她收到")<position(9,"播放音频前"));
 assert.ok(position(9,"播放音频前")<position(9,"那段 recording 长约两分钟"));
 assert.ok(position(9,"那段 recording 长约两分钟")<position(9,"姐姐说自己曾以为"));
 assert.ok(position(9,"姐姐说自己曾以为")<position(9,"我不知道自己能不能"));
 assert.ok(position(9,"我不知道自己能不能")<position(9,"录音结束，店里"));
 assert.ok(position(9,"录音结束，店里")<position(9,"独自倒了一杯热水"));
 assert.doesNotMatch(lines(9).join(""),/只有三十多秒/);
});
test("S45 formal archive application precedes next-day attendance and reunion is not faked",()=>{
 assert.ok(position(10,"傍晚前，他们开始")<position(10,"傍晚，予安回到书店"));
 assert.ok(position(10,"傍晚，予安回到书店")<position(10,"明早按预约去图书馆"));
 assert.ok(position(11,"周日清晨六点")<position(11,"脚步声来自一位"));
 assert.doesNotMatch(lines(11).join(""),/走廊尽头只有一道熟悉的背影/);
});
test("S45 reunion starts after its eve; breakfast precedes three-month epilogue",()=>{
 assert.ok(position(12,"约定的周日到来前")<position(12,"周日清晨"));
 assert.ok(position(12,"周日清晨")<position(12,"她把姐姐请进店里"));
 assert.ok(position(12,"她把姐姐请进店里")<position(12,"她们坐下后很久"));
 assert.ok(position(12,"你有没有想过我会以为你已经死了")<position(12,"那顿早餐"));
 assert.ok(position(12,"那顿早餐")<position(12,"三个月后"));
 assert.ok(position(12,"几个月后")<position(12,"至少今晚可以一起回家吃饭"));
 assert.doesNotMatch(lines(12).at(-1),/今天可以一起吃早餐/);
});
test("S45 chronology edits preserve full-season word counts and do not grant publication approval",()=>{
 const audit=auditRainyNight(bundle);
 const review=buildRainyNightOccurrenceReview(bundle);
 const echo=buildEchoReviewPack(bundle);
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(bundle.words.length,188);
 assert.equal(bundle.chapters.length,12);
 assert.equal(audit.totalMentions,733);
 assert.equal(review.overview.occurrenceCount,733);
 assert.equal(echo.total,36);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.publicationAllowed,false);
 assert.ok(audit.chapters.every(x=>x.hanCharacters>=3000&&x.hanCharacters<=3500));
 assert.ok(audit.chapters.every(x=>x.wordMentions>=50&&x.wordMentions<=65));
 assert.match(bundle.book.id,/^draft-/);
});
