import {test} from "node:test";
import assert from "node:assert/strict";
import {chapters as endingChapters} from "../content/drafts/rainy-night-s1-ch10-ch12.mjs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {validatePackage} from "../src/editorial-content.js";
import {auditRainyNight} from "../scripts/audit-rainy-night-s1.mjs";
import {generateSql} from "../scripts/build-content-import.mjs";

const hanCount=s=>(s.match(/\p{Script=Han}/gu)||[]).length;
test("S30 ending chapters 10–12 meet 3000–3500 characters and 50–65 annotated targets",()=>{
 assert.deepEqual(endingChapters.map(c=>c.number),[10,11,12]);
 for(const chapter of endingChapters){
  const text=chapter.paragraphs.join("");
  const words=[...text.matchAll(/\[\[([a-z]+)\]\]/g)].map(x=>x[1]);
  assert.ok(hanCount(text)>=3000&&hanCount(text)<=3500,
    "chapter "+chapter.number+" Han characters "+hanCount(text));
  assert.ok(words.length>=50&&words.length<=65,
    "chapter "+chapter.number+" word mentions "+words.length);
  assert.ok(chapter.paragraphs.length>=35);
 }
});
test("S30 full first-season twelve-chapter draft meets editorial quantity goals without false release status",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const checked=validatePackage(bundle);
 const audit=auditRainyNight(bundle);
 assert.equal(checked.chapters.length,12);
 assert.equal(checked.words.length,188);
 assert.ok(audit.totalMentions>=650&&audit.totalMentions<=750,
   "actual embedded word mentions "+audit.totalMentions);
 assert.ok(audit.chapters.every(c=>c.hanCharacters>=3000&&c.hanCharacters<=3500),
   "every chapter must have real narrative reading length");
 assert.ok(audit.chapters.every(c=>c.wordMentions>=50&&c.wordMentions<=65),
   "every chapter must contain 50–65 contextual anchors");
 assert.ok(audit.repeatedAcrossChapters>=audit.crossChapterReusePlanningTarget);
 assert.equal(audit.wordsWithoutIpa,audit.targetWords);
 assert.equal(audit.wordsWithoutVerifiedLevel,audit.targetWords);
 assert.equal(audit.releaseStatus,"BLOCKED_FOR_EDITORIAL_REVIEW");
 assert.match(bundle.book.id,/^draft-/);
 assert.match(bundle.book.title,/测试/);
 assert.deepEqual(bundle.chapters.map(ch=>ch.number),[1,2,3,4,5,6,7,8,9,10,11,12]);
 assert.equal(bundle.chapters.filter(ch=>ch.preview).length,1);
 assert.equal(bundle.chapters[0].preview,true);
 assert.ok(bundle.chapters.slice(1).every(ch=>!ch.preview));
 const privateImport=generateSql(bundle);
 assert.equal(privateImport.summary.publication,"draft-only");
 assert.doesNotMatch(privateImport.sql,/UPDATE\s+books\s+SET\s+status\s*=\s*'published'/i);
});
