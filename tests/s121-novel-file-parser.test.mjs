import test from "node:test";
import assert from "node:assert/strict";
import {parseNovelTextFile} from "../public/novel-file-parser.js";
import {validatePackage} from "../src/editorial-content.js";
import {planOpsBookImport} from "../src/ops-import.js";
const cards=[
 {id:"global-hospital",headword:"hospital",phoneticUk:"/ˈhɒspɪtl/",
  phoneticUs:"/ˈhɑspɪtl/",partOfSpeech:"n.",meaningZh:"医院",
  exampleEn:"She went to the hospital.",exampleZh:"她去了医院。"},
 {id:"global-evidence",headword:"evidence",phoneticUk:"/ˈevɪdəns/",
  phoneticUs:"/ˈevɪdəns/",partOfSpeech:"n.",meaningZh:"证据",
  exampleEn:"The evidence was clear.",exampleZh:"证据很清楚。"},
 {id:"global-record",headword:"record",phoneticUk:"/ˈrekɔːd/",
  phoneticUs:"/ˈrɛkərd/",partOfSpeech:"n.",meaningZh:"记录",
  exampleEn:"I found the record.",exampleZh:"我找到了记录。"}
];
const opts={bookId:"sample-story",title:"样章只用于自动化测试",category:"cet4",
 description:"一段离线解析演示，并非正式上架文本。",words:cards,previewChapters:0};
test("S121 author uploads Markdown/TXT and receives a valid CET4 file package",()=>{
 const text=[
 "## 第一章 夜里的电话",
 "凌晨她走进 hospital，想寻找那份 evidence 和旧 record。",
 "",
 "她把 [[evidence|证据]] 放进口袋。",
 "## 第二章 新发现",
 "那座 hospital 的 record 里也有 evidence。"
 ].join("\n");
 const {package:result,report}=parseNovelTextFile(text,opts);
 assert.equal(report.chapters,2);
 assert.equal(report.wordCards,3);
 assert.equal(report.anchors,7);
 assert.equal(report.previewChapters,0);
 assert.ok(report.allWordCardsComplete);
 assert.ok(result.chapters.every(ch=>ch.preview===false));
 assert.equal(result.chapters[0].paragraphs[1].segments.some(x=>x.surface==="evidence"),true);
 const checked=validatePackage(result);
 assert.equal(checked.mentionCount,report.anchors);
 const plan=planOpsBookImport(checked);
 assert.equal(plan.summary.paid,2);
 assert.equal(plan.summary.status,"draft");
 assert.ok(plan.statements.every(x=>!/UPDATE|DELETE|DROP/i.test(x.sql)));
});
test("S121 unresolved explicit word means an actionable error, not silent missing flashcards",()=>{
 try{parseNovelTextFile("第一章：旧箱\n她看见 [[unknown|未知]]，又去了 hospital。",opts);
  assert.fail("Expected missing card")}catch(e){
  assert.equal(e.message,"EXPLICIT_WORD_CARD_UNRESOLVED");
  assert.equal(e.details?.[0]?.word,"unknown");
 }
});
test("S121 ordinary untracked English is retained as reading text and flagged",()=>{
 const r=parseNovelTextFile("第一章\nSarah took evidence into hospital.",opts);
 assert.ok(r.report.warnings.some(x=>x.kind==="UNTRACKED_ENGLISH"&&x.word==="Sarah"));
 assert.equal(r.report.anchors,2);
});
test("S121 paid-only stays paid-only, never grants a category entitlement",()=>{
 const r=parseNovelTextFile("第一章\n她在 hospital 看见 evidence。",opts);
 assert.equal(r.package.chapters[0].preview,false);
 assert.throws(()=>parseNovelTextFile("第一章\nhospital evidence",{...opts,previewChapters:1}),/REQUIRES_AT_LEAST_ONE_PAID_CHAPTER/);
});
