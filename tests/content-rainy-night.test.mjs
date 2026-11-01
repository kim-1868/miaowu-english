import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validatePackage} from "../src/editorial-content.js";
const input=JSON.parse(readFileSync(new URL("../content/drafts/rainy-night-archives-two-chapter-pilot.json",import.meta.url),"utf8"));

test("Rainy Night Archives original content pilot is a valid PRIVATE draft with first chapter preview",()=>{
 const result=validatePackage(input);
 assert.equal(result.book.category,"cet4");
 assert.equal(result.book.title.includes("测试"),true);
 assert.equal(result.chapters.length,2);
 assert.equal(result.chapters[0].preview,true);
 assert.equal(result.chapters[1].preview,false);
 assert.equal(result.words.length,36);
 assert.equal(result.mentionCount,37);
 assert.equal(result.book.id.startsWith("draft-"),true);
 const allMentions=result.chapters.flatMap(ch=>ch.paragraphs.flatMap(p=>p.segments.filter(s=>s.wordId)));
 assert.equal(new Set(allMentions.map(s=>s.wordId)).size,36);
 assert.equal(result.chapters.every(ch=>ch.paragraphs.length>=15),true);
 // This two-chapter unfinished pilot must be blocked by S9's test-manuscript safeguard.
 assert.match(result.book.title,/测试/);
});
test("Rainy Night pilot remains editorially unverified and cannot be marketed as a complete season",()=>{
 assert.match(input.sourceLabel,/draft-do-not-publish/);
 assert.equal(input.chapters.length<12,true);
 assert.equal(input.words.some(w=>!w.phoneticUk),true);
 assert.equal(input.words.some(w=>!w.exampleZh),true);
 assert.equal(input.book.title.includes("正式上架"),false);
});
