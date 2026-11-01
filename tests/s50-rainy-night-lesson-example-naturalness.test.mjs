import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {auditRainyNight} from "../scripts/audit-rainy-night-s1.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";

const {bundle}=composeRainyNightSeasonDraft();
const cards=new Map(bundle.words.map(w=>[w.headword,w]));
const examples={
 preserve:["The archive preserved the original flood records.","档案馆保存了原始的防汛记录。"],
 contrast:["There was a clear contrast between the two signatures.","两处签名有明显差别。"],
 resemble:["The new signature resembled the one in the old ledger.","新签名与旧登记簿上的签名很相似。"],
 blurred:["The blurred image made the face impossible to recognize.","图像太模糊，无法辨认那张脸。"],
 responsibility:["He accepted responsibility for his decision.","他为自己的决定承担了责任。"],
 transcript:["The interview transcript included a signature dated last week.","那份访谈记录附有上周的签名。"],
 routine:["Every night, the mail slot opened as part of a fixed routine.","每天夜里，投递槽都会按固定程序打开。"],
 operate:["The device operated on a fixed schedule.","这台装置按固定时间表运作。"],
 release:["At 11:47 p.m., the mechanism released the letters from the slot.","晚上十一点四十七分，装置将信件从投递槽放出。"],
 connect:["She connected the two events after checking the dates.","核对日期后，她发现这两件事有关联。"],
 guilt:["He struggled with guilt for years after hiding the records.","他隐瞒记录后，多年来一直饱受愧疚之苦。"],
 consequence:["The altered record had serious consequences for the families.","那条被改动的记录给那些家庭造成了严重后果。"],
 survive:["The families struggled to survive the flood.","那些家庭艰难地熬过了洪水。"],
 cooperate:["They agreed to cooperate with the investigators.","他们同意配合调查人员的工作。"],
 allocation:["The supply allocation did not match the quantities delivered.","物资分配记录与实际送达的数量不符。"],
 duplicate:["The duplicate contained a number missing from the original.","副本里有一串原件上没有的数字。"],
 accountability:["The residents demanded accountability for the missing supplies.","居民要求追查失踪物资的责任。"],
 future:["For the first time in two years, she could imagine a future with her sister.","两年来，她第一次能想象和姐姐共度未来的生活。"],
 journey:["The long journey to the truth brought the sisters together again.","漫长的寻真过程让姐妹俩重新走到了一起。"]
};

test("S50 nineteen word cards teach plot-relevant senses with aligned, natural English-Chinese examples",()=>{
 assert.equal(Object.keys(examples).length,19);
 for(const [word,[en,zh]] of Object.entries(examples)){
  const card=cards.get(word);
  assert.ok(card,"missing word card: "+word);
  assert.equal(card.exampleEn,en,"English example drift for "+word);
  assert.equal(card.exampleZh,zh,"Chinese example drift for "+word);
  assert.ok(card.collocations.length>0,"collocation missing: "+word);
 }
 assert.deepEqual(cards.get("release").collocations[0],{
  en:"release a letter from a slot",zh:"从投递槽放出一封信"
 });
});

test("S50 no invented midnight story event or unidiomatic glossary wording remains in affected cards",()=>{
 const affected=Object.keys(examples).map(w=>cards.get(w));
 assert.ok(affected.every(w=>!w.exampleEn.includes("at midnight")));
 assert.ok(!cards.get("routine").exampleEn.includes("The box followed"));
 assert.ok(!cards.get("transcript").exampleEn.includes("transcript carried"));
 assert.ok(!cards.get("cooperate").exampleEn.includes("cooperate with the review"));
 assert.ok(!cards.get("release").collocations.some(x=>x.en==="release a document"));
});

test("S50 copy edits do not approve or deploy the draft, change story anchors or remove launch blockers",()=>{
 const audit=auditRainyNight(bundle);
 assert.equal(bundle.chapters.length,12);
 assert.equal(bundle.words.length,188);
 assert.equal(audit.totalMentions,733);
 assert.equal(audit.releaseStatus,"BLOCKED_FOR_EDITORIAL_REVIEW");
 assert.match(bundle.book.id,/^draft-/);
 assert.ok(bundle.words.every(w=>!w.phoneticUk&&!w.phoneticUs));
 const preflight=evaluateRainyNightPublicationGate(bundle);
 assert.equal(preflight.publicationAllowed,false);
 assert.equal(preflight.productionDbTouched,false);
 assert.equal(preflight.productionReleasePerformed,false);
});
