import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validatePackage} from "../src/editorial-content.js";

const books=[
 ["ex-husband-business-client","离婚后，前夫公司成了我的客户"],
 ["substitute-bride-tears-contract","替嫁当天，我撕了婚约"]
];
const json=file=>JSON.parse(readFileSync(new URL(file,import.meta.url),"utf8"));
const ledger=json("../content/editorial/20261104-71-IPA-REFERENCE-SELECTIONS-UNAPPROVED.json");
const byIPA=new Map(ledger.words.map(w=>[w.wordId,w]));

test("private CET4 bundles contain full paid chapters, aligned text and full candidate word metadata",()=>{
 assert.equal(ledger.words.length,71);
 assert.equal(ledger.status,"NOT_APPROVED_SOURCE_BACKED_IPA_CANDIDATES");
 for(const [id,title] of books){
  const pkg=json("../content/review-packages/20261104-"+id+"-PRIVATE-UNAPPROVED.json");
  const source=readFileSync(new URL("../content/drafts/season-cet4-v1/"+id+".md",import.meta.url),"utf8");
  const parsed=validatePackage(pkg);
  assert.equal(pkg.book.title,title);
  assert.equal(pkg.book.category,"cet4");
  assert.equal(pkg.chapters.length,6);
  assert.equal(pkg.chapters.filter(ch=>ch.preview).length,0);
  assert.equal(parsed.chapters.length,6);
  assert.equal(parsed.mentionCount,(source.match(/\[\[[a-z]+\]\]/g)||[]).length);
  assert.ok(parsed.mentionCount>=150);
  const marks=[...source.matchAll(/\[\[([a-z]+)\]\]/g)].map(m=>m[1]);
  assert.deepEqual(pkg.chapters.flatMap(ch=>ch.paragraphs.flatMap(p=>p.segments.filter(s=>s.wordId).map(s=>s.surface))),marks);
  const existing=new Set(pkg.words.map(w=>w.id));
  for(const word of pkg.words){
   assert.ok(word.meaningZh?.length>0,"meaning: "+word.headword);
   assert.ok(word.partOfSpeech?.length>0,"POS: "+word.headword);
   assert.ok(word.exampleEn?.length>0&&word.exampleZh?.length>0,"examples: "+word.headword);
   assert.match(word.phoneticUk,/^\/.+\/$/,"UK IPA: "+word.headword);
   assert.match(word.phoneticUs,/^\/.+\/$/,"US IPA: "+word.headword);
   assert.equal(word.phoneticUk,byIPA.get(word.id)?.phoneticUkCandidate);
   assert.equal(word.phoneticUs,byIPA.get(word.id)?.phoneticUsCandidate);
  }
  for(const chapter of pkg.chapters)for(const paragraph of chapter.paragraphs)
   for(const segment of paragraph.segments)if(segment.wordId)assert.ok(existing.has(segment.wordId));
 }
});

test("release review keeps unapproved exam-headword status visible; noun pronunciations are disambiguated",()=>{
 const pending=ledger.words.filter(w=>w.examHeadwordStatus==="2016_PDF_FORM_NOT_YET_CHECKED");
 assert.equal(pending.length,45);
 assert.ok(ledger.words.every(w=>w.humanApproved===false));
 for(const word of ["contract","project","record"]){
  const card=ledger.words.find(w=>w.headword===word);
  assert.ok(card);
  assert.match(card.phoneticUkCandidate,/^\/ˈ/,"noun UK stress "+word);
  assert.match(card.phoneticUsCandidate,/^\/ˈ/,"noun US stress "+word);
 }
});
