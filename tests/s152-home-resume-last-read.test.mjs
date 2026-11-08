import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
const read=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const app=read("../public/app.js");
const html=read("../public/index.html");
const backend=read("../src/reading-library.js");
const start=app.indexOf("function latestReadableProgress(rows){");
const end=app.indexOf("\n    function chooseFirstStory(){",start);
assert.ok(start>0&&end>start,"recent reading selector should exist");
const latestReadableProgress=new Function(app.slice(start,end)+"\nreturn latestReadableProgress;")();

test("S152: choose newest valid server-backed account progress, not the first shelf book",()=>{
  const entries=[
    {book_id:"last-visited-book",book_title:"合租室友",category_slug:"postgrad",chapter_id:"chapter-5"},
    {book_id:"rainy-night",book_title:"雨夜档案",category_slug:"cet4",chapter_id:"chapter-1"}
  ];
  assert.deepEqual(latestReadableProgress(entries),entries[0]);
  assert.deepEqual(latestReadableProgress([{},entries[1]]),entries[1]);
  assert.equal(latestReadableProgress([]),null);
  assert.equal(latestReadableProgress(null),null);
  assert.equal(latestReadableProgress([{book_id:"x",chapter_id:"y"}]),null);
});

test("S152: hero uses current account progress endpoint and resumes the exact saved chapter",()=>{
  new Script(app,{filename:"app.js"});
  assert.match(app,/\$\('heroRead'\)\.onclick=resumeLatestReading/);
  assert.doesNotMatch(app,/function openFirstCloudBook\(/);
  assert.match(app,/await initialSessionPromise/);
  assert.match(app,/await serverRequest\('\/api\/me\/progress'\)/);
  assert.match(app,/latestReadableProgress\(list\)/);
  assert.match(app,/resumeChapterId:recent\.chapter_id/);
  assert.match(app,/const target=chapters\.find\(ch=>ch\.id===resumeChapterId\)/);
  assert.match(app,/if\(target&&\(target\.canRead\|\|target\.isPreview\)\)return openCloudChapter\(target\.id\)/);
  assert.match(app,/if\(!user\)\{chooseFirstStory\(\);return;\}/);
  assert.match(app,/if\(!recent\)\{chooseFirstStory\(\);return;\}/);
});

test("S152: opening a permitted chapter saves the first fraction to make it the user's recent book",()=>{
  assert.match(app,/saveReadingProgress\(\{started:true,quiet:true\}\)/);
  assert.match(app,/async function saveReadingProgress\(\{complete=false,quiet=true,started=false\}=\{\}\)/);
  assert.match(app,/started\?\.01:readingFraction\(\)/);
  assert.match(app,/cloudProgress=\[row,\.\.\.cloudProgress\.filter\(p=>p\.chapter_id!==id\)\]/);
  assert.match(app,/cloudProgress\.unshift\(\{chapter_id:id,book_id:activeCloud\.bookId/);
  assert.match(app,/const savedAt=cloudProgress\.find\(x=>x\.chapter_id===id\)/);
  assert.match(backend,/ORDER BY p\.updated_at DESC LIMIT 100/);
  assert.match(backend,/b\.status='published'/);
  assert.match(backend,/c\.is_visible=1/);
  assert.match(backend,/p\.user_id=\?/);
});

test("S152: homepage script is cache-busted without replacing approved visuals",()=>{
  assert.match(html,/id="heroRead"/);
  assert.match(html,/href="\/styles.css\?v=20261104-v28-night-selection"/);
  assert.match(html,/src="\/app.js\?v=20261108-0104-production-isolated"/);
  assert.match(app,/function updateHeroReadLabel\(/);
  assert.match(app,/user&&cloudProgress\.length\?'继续上次阅读':'开始阅读'/);
});
