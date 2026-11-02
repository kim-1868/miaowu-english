import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {S82_BOOK_IDS,buildS82DraftBundles,parseS82Markdown} from "../scripts/build-six-original-story-packages.mjs";
import {validatePackage} from "../src/editorial-content.js";
import {generateSql} from "../scripts/build-content-import.mjs";

test("S82 contains eight new original completed story arcs of six chapters each",()=>{
 const rows=buildS82DraftBundles();
 assert.equal(rows.length,8);
 assert.deepEqual(rows.map(x=>x.summary.id),S82_BOOK_IDS);
 assert.equal(new Set(rows.map(x=>x.bundle.book.title)).size,8);
 const total=rows.reduce((n,x)=>n+x.summary.mentions,0);
 assert.ok(total>=140,"expected at least 140 natural target-word references, got "+total);
 for(const {bundle,summary} of rows){
  assert.equal(bundle.book.category,"cet4");
  assert.equal(bundle.chapters.length,6);
  assert.ok(bundle.words.length>=10);
  assert.ok(summary.chaptersLength.every(x=>x.han>=300));
  assert.deepEqual(bundle.chapters.filter(c=>c.preview).map(c=>c.number),[1]);
  assert.equal(summary.publicationAllowed,false);
  assert.ok(!JSON.stringify(bundle.book).includes("genre_internal"));
  const valid=validatePackage(bundle);
  assert.equal(valid.mentionCount,summary.mentions);
  assert.ok(bundle.chapters.every((c,i)=>c.number===i+1&&c.paragraphs.length>=(summary.id==="ex-husband-business-client"?7:8)));
  const imported=generateSql(bundle);
  assert.equal(imported.summary.publication,"draft-only");
  assert.ok(imported.sql.includes(" AND status='draft'"));
  assert.ok(!imported.sql.includes("UPDATE books SET status='published'"));
  assert.ok(!imported.sql.includes("INSERT INTO entitlements"));
 }
});
test("S82 private-only metadata cannot be converted to a public genre category",()=>{
 const story=readFileSync(new URL("../content/drafts/season-cet4-v1/rivals-secret-care.md",import.meta.url),"utf8");
 assert.match(story,/genre_internal: BL双男主/);
 const rows=buildS82DraftBundles();
 const novel=rows.find(x=>x.summary.id==="rivals-secret-care");
 assert.equal(novel.bundle.book.title,"死对头突然开始对我好");
 assert.deepEqual(Object.keys(novel.bundle.book).sort(),
  ["category","coverKey","description","id","title"].sort());
 const bad=story.replace("product: cet4","product: bl");
 assert.throws(()=>parseS82Markdown("rivals-secret-care",bad,new Map(),new Set()),/METADATA_NOT_PRIVATE_CET4/);
});
test("S82 rejects unrecognized English anchors, malformed story chapters and unreviewed publication metadata",()=>{
 const id=S82_BOOK_IDS[0];
 const original=readFileSync(new URL("../content/drafts/season-cet4-v1/rejected-family-second-life.md",import.meta.url),"utf8");
 assert.throws(()=>parseS82Markdown(id,original.replace("[[signature]]","[[nonofficialword]]"),new Map(),new Set()),/UNVERIFIED_CET4_FORM/);
 assert.throws(()=>parseS82Markdown(id,original.replace("PRIVATE_ORIGINAL_FIRST_DRAFT_UNREVIEWED","PUBLISHED"),new Map(),new Set()),/METADATA_NOT_PRIVATE_CET4/);
 assert.throws(()=>parseS82Markdown(id,original.replace("## 第6章","## 第5章"),new Map(),new Set()),/CHAPTERS_NOT_SIX_IN_ORDER/);
});
