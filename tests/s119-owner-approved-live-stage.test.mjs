import test from "node:test";
import assert from "node:assert/strict";
import {prepareDraftUpdate} from "../scripts/prepare-rainy-night-owner-approved-stage.mjs";
import {prepareRainyNightMemberCandidate} from "../scripts/prepare-rainy-night-member-candidate.mjs";
import {pronunciationDraft} from "../scripts/prepare-rainy-night-ipa-ai-working-copy.mjs";
const content=ch=>JSON.stringify({version:1,paragraphs:ch.paragraphs.map(p=>({
 segments:p.segments.map(s=>s.wordId?{wordId:s.wordId,surface:s.surface,gloss:s.gloss}:{text:s.text})
}))});
function fakeLive(){
 const {candidate}=prepareRainyNightMemberCandidate();
 return {productionBooks:[{id:candidate.book.id,status:"draft",category_id:"cet4"}],
 productionChapters:candidate.chapters.map(ch=>({
 id:ch.id,chapter_no:ch.number,title:ch.title,content_json:content(ch),
 is_preview:0,published_at:null
 })),
 productionWords:candidate.words.map(w=>({
 id:w.id,headword:w.headword,phonetic_uk:null,phonetic_us:null,
 part_of_speech:w.partOfSpeech,meaning_zh:w.meaningZh,
 example_en:w.exampleEn,example_zh:w.exampleZh
 })),
 productionCounts:[{anchors:733,preview_chapters:0,published_chapters:0,approvals:0}],
 pronunciations:pronunciationDraft({britishRead:()=>"/ˈtɛst/"})
 };
}
test("S119 production staging requires the owner's explicit unmodified-candidate approval",()=>{
 const original=process.env.RAINY_NIGHT_OWNER_APPROVAL;
 try{
 delete process.env.RAINY_NIGHT_OWNER_APPROVAL;
 assert.throws(()=>prepareDraftUpdate(fakeLive()),/EXPLICIT_OWNER_APPROVAL_REQUIRED/);
 process.env.RAINY_NIGHT_OWNER_APPROVAL="unchanged-2026-11-03";
 const output=prepareDraftUpdate(fakeLive());
 assert.equal(output.summary.doesNotPublish,true);
 assert.equal(output.summary.sourceAnchors,733);
 assert.equal(output.summary.targetAnchors,1892);
 assert.equal(output.summary.targetIPA,188);
 assert.ok(output.summary.statementCount<240);
 assert.ok(output.sql.includes("UPDATE chapters SET content_json="));
 assert.ok(output.sql.includes("DELETE FROM chapter_words"));
 assert.ok(output.sql.includes("UPDATE words SET phonetic_uk="));
 assert.ok(!/UPDATE\s+books\b/i.test(output.sql));
 assert.ok(!/UPDATE\s+users|UPDATE\s+entitlements|UPDATE\s+reading_progress/i.test(output.sql));
 const modified=fakeLive();modified.productionChapters[0].content_json="{}";
 assert.throws(()=>prepareDraftUpdate(modified),/D1_ORIGINAL_CHAPTER_DIFFERS/);
 const published=fakeLive();published.productionBooks[0].status="published";
 assert.throws(()=>prepareDraftUpdate(published),/D1_BOOK_NOT_EXACTLY_CET4_DRAFT/);
 const attributed=fakeLive();attributed.productionWords[0].phonetic_us="/other/";
 assert.throws(()=>prepareDraftUpdate(attributed),/D1_WORD_METADATA_DIFFERS/);
 }finally{
 if(original===undefined)delete process.env.RAINY_NIGHT_OWNER_APPROVAL;
 else process.env.RAINY_NIGHT_OWNER_APPROVAL=original;
 }
});
