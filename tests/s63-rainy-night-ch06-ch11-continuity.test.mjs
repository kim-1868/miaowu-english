import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const {bundle}=composeRainyNightSeasonDraft();
const paragraph=(chapter,no)=>bundle.chapters.find(ch=>ch.number===chapter).paragraphs[no-1]
 .segments.map(seg=>seg.text??seg.surface).join("");

test("S63 chapter six evidence and repair reveal follow an intelligible time sequence",()=>{
 assert.match(paragraph(6,1),/前一晚.*第二天.*spine/);
 assert.match(paragraph(6,2),/周砚此前交给自己的 photograph 与陌生短信附带的照片/);
 assert.match(paragraph(6,3),/先备份手机里的两张照片.*negative（底片）与冲印照片明暗相反/);
 assert.match(paragraph(6,4),/装帧铺还没有开门/);
 assert.match(paragraph(6,5),/店主到店后没有立即取书/);
 assert.match(paragraph(6,6),/打开书脊前/);
 assert.match(paragraph(6,7),/待索引页全貌显露.*背面.*缩小的旧照片/);
 assert.match(paragraph(6,8),/再在数字副本中 enlarge 第三人轮廓/);
 assert.doesNotMatch(paragraph(6,1),/书里没有预想中的密信/);
 assert.doesNotMatch(paragraph(6,2),/索引页背后贴着/);
 assert.doesNotMatch(paragraph(6,3),/店主把照片扫描/);
});
test("S63 chapter six final phone call does not repeat itself or imply duplicate archive discovery",()=>{
 const p31=paragraph(6,31),p35=paragraph(6,35),p36=paragraph(6,36),p37=paragraph(6,37);
 assert.match(p31,/图书馆回复邮件时/);
 assert.match(p35,/电话接通后.*第二天在图书馆.*preserve/);
 assert.match(p36,/白天收到的图书馆邮件.*已经 locate 到那只木箱/);
 assert.match(p37,/电话快结束时.*你要找的东西还在我这里/);
 assert.ok(!p37.includes("终于拨通邱老师的电话"));
 assert.ok(!p36.includes("馆员答复得很快"));
 assert.equal([p35,p36,p37].filter(x=>x.includes("你要找的东西还在我这里")).length,1);
});
test("S63 chapter eleven validates seals during review without asserting sealed box still unopened",()=>{
 const first=paragraph(11,1),second=paragraph(11,2),third=paragraph(11,3);
 assert.match(first,/工作人员将木箱搬到桌上/);
 assert.match(second,/账册的第一栏/);
 assert.match(third,/翻阅账册时.*刚拆下的封存条.*seal/);
 assert.match(third,/不能 confirm 账册里的数字一定准确/);
 assert.doesNotMatch(third,/预约开始前/);
 assert.match(paragraph(7,27),/一条 recent 线索/);
 assert.doesNotMatch(paragraph(7,27),/recent 的线索/);
});
test("S63 continuity edits keep all word anchors and publication blocked",()=>{
 assert.equal(bundle.chapters.length,12);
 assert.equal(bundle.words.length,188);
 const review=buildRainyNightOccurrenceReview(bundle);
 assert.equal(review.overview.occurrenceCount,733);
 assert.equal(review.overview.unreviewed,733);
 const echo=buildEchoReviewPack(bundle);
 assert.equal(echo.total,36);
 assert.ok(echo.questions.every(q=>q.reviewStatus==="EDITORIAL_NOT_APPROVED"&&!q.forCloudUse));
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.productionDbTouched,false);
 assert.equal(gate.productionReleasePerformed,false);
});
