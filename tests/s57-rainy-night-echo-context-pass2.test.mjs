import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const {bundle}=composeRainyNightSeasonDraft();
const pack=buildEchoReviewPack(bundle);
const checks=[
 [5,"repair","每一次纸张的 repair 都应留下记录","纸张的 repair 应记录"],
 [6,"enlarge","再 enlarge 图像的局部给她看","在副本上 enlarge"],
 [8,"routine","routine 操作说明","routine 检查"],
 [8,"confuse","容易 confuse 初次查阅的人","confuse 读者"],
 [9,"statement","居民个人的 statement","私人 statement"],
 [11,"sequence","交接发生的 sequence 排好两份清单","按 sequence 排开"],
 [12,"relief","一阵迟来的 relief","一阵沉重的 relief"]
];
test("S57 question contexts no longer contain seven mechanical or semantically mismatched expressions",()=>{
 for(const [chapter,word,expected,old] of checks){
  const q=pack.questions.find(q=>q.chapterNo===chapter&&q.headword===word);
  assert.ok(q,"Missing original-context question "+chapter+":"+word);
  assert.ok(q.originalContext.includes(expected),chapter+":"+word+": expected phrase");
  assert.ok(!q.originalContext.includes(old),chapter+":"+word+": stale phrase");
  assert.equal(q.correctAnswer,word);
  assert.equal(q.reviewStatus,"EDITORIAL_NOT_APPROVED");
  assert.equal(q.forCloudUse,false);
 }
});
test("S57 remains a private editorial draft with stable curriculum and no publication privileges",()=>{
 assert.equal(pack.total,36);
 assert.equal(pack.chapterCount,12);
 assert.equal(pack.independentWords,36);
 assert.equal(bundle.words.length,188);
 assert.equal(bundle.chapters.length,12);
 assert.equal(buildRainyNightOccurrenceReview(bundle).overview.occurrenceCount,733);
 assert.match(bundle.book.id,/^draft-/);
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.productionDbTouched,false);
 assert.equal(gate.productionReleasePerformed,false);
});
