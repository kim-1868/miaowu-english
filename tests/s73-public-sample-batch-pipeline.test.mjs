import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildRainyNightPublicSample} from "../scripts/build-rainy-night-public-sample.mjs";
import {buildProductionAssets} from "../scripts/build-production-assets.mjs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildStoryBatchPlans,auditStoryChapter,requestStoryChapter} from "../scripts/story-batch.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";

test("S73 public Rainy Night page contains only cover and entitlement information, never member chapter text",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const html=buildRainyNightPublicSample();
 assert.match(html,/<title>《雨夜档案》· 四级会员专享/);
 assert.match(html,/全部为四级会员专享内容/);
 assert.match(html,/rainy-night-cover.webp/);
 assert.equal((html.match(/<strong lang="en">/g)||[]).length,0);
 assert.equal((html.match(/<article id="chapter">/g)||[]).length,0);
 for(const chapter of bundle.chapters){
   assert.ok(!html.includes(chapter.title),"No chapter title in public page: "+chapter.title);
   for(const paragraph of chapter.paragraphs){
     const plain=paragraph.segments.map(seg=>seg.wordId?seg.surface:seg.text).join("");
     if(plain.length>30)assert.ok(!html.includes(plain.slice(0,25)),"Public chapter text detected");
   }
 }
 for(const unsafe of ["phoneticUk","phoneticUs","correctAnswer","sourceUkGapReference",
   "editorNotes","password","/api/auth/","chapter_words","PRIVATE-HUMAN-REVIEW"])
   assert.ok(!html.includes(unsafe),"Sensitive learning metadata "+unsafe);
 assert.equal(evaluateRainyNightPublicationGate(bundle).status,"BLOCKED");
});
test("S73 production generated assets do not disclose any Rainy Night free preview",()=>{
 const output=buildProductionAssets();
 assert.ok(output.assets.includes("rainy-night.html"));
 const html=readFileSync(new URL("../dist-production/public/rainy-night.html",import.meta.url),"utf8");
 assert.equal(html,buildRainyNightPublicSample());
 const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
 assert.match(app,/isRainyNight=book\.id==='rainy-night-archives-cet4-v1'/);
 assert.equal(app.includes('href="/rainy-night.html"'),false);
 assert.doesNotMatch(app,/book-item rainy-night-sample-book-item/);
 assert.doesNotMatch(html,/第十二章/);
 assert.doesNotMatch(html,/第 1 章免费试读/);
});
test("S80 eight original short-story plans have fixed safe private review flags, not preapproved senses",()=>{
 const plans=buildStoryBatchPlans();
 assert.deepEqual(plans.map(x=>x.genre),["虐恋","爽文","玄幻","BL","逆袭","霸总","逆袭","BL"]);
 for(const p of plans){
  assert.equal(p.chapterCount,6);
  assert.equal(p.beats.length,6);
  assert.equal(p.vocabulary.length,64);
  assert.equal(new Set(p.vocabulary.map(x=>x.headword)).size,64);
  assert.equal(p.publicationStatus,"PRIVATE_AI_CANDIDATE");
  assert.equal(p.commercialApproved,false);
  assert.ok(p.vocabulary.every(x=>x.senseReviewed===false&&x.ipaReviewed===false));
 }
});
test("S73 structure QA accepts sensible chapter draft candidates and fails on forced or unlisted vocabulary",()=>{
 const plan=buildStoryBatchPlans()[0];
 const clean=Array.from({length:16},(_,i)=>"她知道这段关系里藏着太多误会，却决定先离开这座城，整理自己的生活与选择。".repeat(2));
 const first=auditStoryChapter(plan,clean,"plain");
 assert.equal(first.anchors,0);
 const word=plan.vocabulary[0].headword;
 const embedded=clean.map(p=>p+("[["+word+"]]").repeat(5));
 const result=auditStoryChapter(plan,embedded,"embedded",clean);
 assert.equal(result.anchors,80);
 assert.ok(result.occurrencesPer100Han>=2.2);
 assert.ok(result.flags.includes("UNREVIEWED_POS_AND_SENSE"));
 assert.throws(()=>auditStoryChapter(plan,embedded,"embedded",clean.slice(1)),/EMBEDDED_PARAGRAPH_MISMATCH/);
 assert.throws(()=>auditStoryChapter(plan,clean.map((p,i)=>i===0?p+"[[notinlist]]":p),"embedded",clean),/EMBEDDING_DENSITY_INVALID|UNLISTED_VOCABULARY/);
 const tooDense=clean.map((p,i)=>i===0?p+"[["+word+"]]".repeat(9):p);
 assert.throws(()=>auditStoryChapter(plan,tooDense,"embedded",clean),/EMBEDDING_DENSITY_INVALID|DENSE_VOCABULARY/);
});
test("S73 Responses request uses explicit schema and store:false, never contacts network in tests",async()=>{
 let request=null;
 const fake=async (url,init)=>{request={url,init};return {
  ok:true,status:200,json:async()=>({status:"completed",output:[{content:[{type:"output_text",
   text:JSON.stringify({paragraphs:["他走了。","她不愿回头。"]})}]}]})
 }};
 const paragraphs=await requestStoryChapter("测试规则","写原创故事",{
  apiKey:"example-local-secret",model:"test-model",fetchImpl:fake
 });
 assert.deepEqual(paragraphs,["他走了。","她不愿回头。"]);
 assert.equal(request.url,"https://api.openai.com/v1/responses");
 const body=JSON.parse(request.init.body);
 assert.equal(body.model,"test-model");
 assert.equal(body.store,false);
 assert.equal(body.text.format.type,"json_schema");
 assert.equal(body.text.format.strict,true);
 assert.equal(body.text.format.schema.additionalProperties,false);
 assert.ok(!JSON.stringify(body).includes("example-local-secret"));
 await assert.rejects(()=>requestStoryChapter("x","y",{apiKey:"",model:"test",fetchImpl:fake}),/SET_OPENAI_API_KEY/);
});
