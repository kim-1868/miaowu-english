import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const app=read("../public/app.js");
const echo=read("../public/echo-cloud.js");
const api=read("../src/echo-cloud.js");
const ops=read("../public/ops-console.js");
const html=read("../public/ops.html");
const worker=read("../src/worker.js");
const art=read("../public/rainy-night-cover-v2.svg");
test("S131 four course ornaments are distinct, with IELTS in the same typographic family",()=>{
 for(const [slug,symbol] of [["cet4","✦"],["cet6","✧"],["postgrad","❦"],["ielts","✥"]]){
  assert.ok(app.includes("id:'"+slug+"'"),slug);
  assert.ok(app.includes("icon:'"+symbol+"'"),symbol);
 }
 assert.doesNotMatch(app,/icon:'✳'/);
});
test("S131 progress label is updated only after successful cloud write, with throttled writes",()=>{
 assert.ok(app.includes("✓ 已同步阅读进度"));
 assert.ok(app.includes("已读完 · 已同步阅读进度"));
 assert.match(app,/await job;readingLastSave=Date\.now\(\)/);
 assert.match(app,/if\(Date\.now\(\)-readingLastSave<30000\)return/);
 assert.match(app,/saveReadingProgress\(\{complete:finishPrevious,quiet:false\}\)/);
});
test("S131 cloud review uses current chapter even without completion or saved bookmarks",()=>{
 assert.match(api,/function chapterCore\(\)/);
 assert.match(api,/let scoped=scope==="chapter"\?chapterCore\(\):core/);
 assert.match(api,/scope==="chapter"\?\[chapterId,user\.id\]:\[user\.id\]/);
 assert.match(echo,/const hasCurrentChapter=st\.scope==="chapter"&&Boolean\(st\.chapter\)/);
 assert.match(echo,/const canStart=hasCurrentChapter\|\|hasCompletedChapter/);
 assert.match(echo,/useChapter:id=>\{st\.chapter=id;st\.scope="chapter"/);
});
test("S131 approved vector image is crisp and does not expose any paid story text",()=>{
 assert.match(art,/viewBox="0 0 900 1200"/);
 assert.match(art,/雨夜档案/);
 assert.ok(art.length<30000);
 assert.doesNotMatch(art,/script\b|foreignObject|onload=|http:\/\//i);
 assert.match(app,/rainy-night-cover-v2\.svg/);
 assert.match(app,/cover-d1-/);
});
test("S131 covers are chosen by book, compressed in the browser and uploaded using a publisher credential",()=>{
 assert.ok(html.includes('id="selectedCoverFile"'));
 assert.ok(html.includes('id="uploadCoverWithNovel"'));
 assert.ok(html.includes('id="selectedCoverImage"'));
 assert.match(ops,/canvas\.width=900;canvas\.height=1200/);
 assert.match(ops,/URL\.createObjectURL/);
 assert.match(ops,/uploadCoverForBook\(result\.bookId,coverFile\)/);
 assert.match(ops,/X-Mw-Ops-Key/);
 assert.match(worker,/handleBookCover/);
 assert.ok(read("../db/production/004_book_cover_images.sql").includes("CREATE TABLE IF NOT EXISTS book_cover_images"));
});
