import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=()=>readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=()=>readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('original designed reader fetches paid cloud chapters from D1 without bundling protected QA paragraphs',()=>{
  const script=app(),markup=html();
  for(const content of [
    '这是只保存在 Cloudflare D1 测试数据库的四级受限正文。',
    '这是只保存在 Cloudflare D1 测试数据库的六级受限正文。'
  ]){
    assert.equal(script.includes(content),false);
    assert.equal(markup.includes(content),false);
  }
  assert.match(script,/serverRequest\('\/api\/books\?/);
  assert.match(script,/serverRequest\('\/api\/chapters\//);
  assert.match(script,/function openCloudChapter\(/);
  assert.match(script,/safe\(segment\.text\)/);
  assert.match(script,/safe\(segment\.surface\)/);
});

test("S5 production UI is cloud-first, without public QA notices or manual progress controls",()=>{
 const script=app(),markup=html();
 assert.doesNotMatch(markup,/网站上线准备中|付费购买仍在验收中|阅读笔记|故事演示练习/);
 for(const id of ["view-library","view-reader","view-words","view-account","echoModeSwitch","readerTone","playerSeek"]){
  assert.match(markup,new RegExp('id="'+id+'"'));
 }
 assert.doesNotMatch(markup,/id="cloudFinishReading"/);
 for(const symbol of ["function loadCloudBookCards","function showCloudWord","function renderWords",
  "function renderAccount","function renderReminder","window.MiaowuCloudEcho.render()"]){
  assert.ok(script.includes(symbol),symbol);
 }
 assert.match(script,/\/api\/me\/progress/);
 assert.match(script,/\/api\/me\/words/);
 assert.match(markup,/script src="\/echo-cloud\.js"/);
});
test("S5 chapter navigation shows protected chapter first, glossary loads independently",()=>{
 const js=app();
 const start=js.indexOf("async function openCloudChapter(id,{finishPrevious=false}={}){");
 const end=js.indexOf("function resetDemoReadingUI()",start);
 assert.ok(start>=0&&end>start);
 const fn=js.slice(start,end);
 for(const marker of ["closeModal();","navigate('reader');","cloud-reader-loading",
    "cloud-reader-error","重试打开本章","glossaryPromise"]){
  assert.ok(fn.includes(marker),marker);
 }
 assert.ok(fn.indexOf("navigate('reader');")<fn.indexOf("await serverRequest('/api/chapters/'"));
 assert.ok(fn.indexOf("book.chapterId=id")<fn.indexOf("const glossary=await glossaryPromise"));
 assert.match(fn,/serverRequest\('\/api\/chapters\/'/);
 assert.match(fn,/serverRequest\('\/api\/chapters\/'.*'\/words'/s);
});
test("S7 retains original design foundation, but public shelf shows only actually published books",()=>{
 const script=app(),markup=html();
 const css=readFileSync(new URL("../public/styles.css",import.meta.url),"utf8");
 const baseline=readFileSync(new URL("../public/design-reference-v03.html",import.meta.url),"utf8");
 const ref=baseline.match(/<style>([\s\S]*?)<\/style>/);
 assert.ok(ref);
 assert.ok(css.startsWith(ref[1]));
 for(const marker of ["function updateCloudShelfProgress","book.chapter_count",
    "p.completed_at","data-live-progress","function openFirstCloudBook",
    "activeCloud.rawParagraphs","token.surface","rainy-night-cover.webp"]){
  assert.ok(script.includes(marker),marker);
 }
 assert.doesNotMatch(script,/book-item demo-book-item/);
 assert.doesNotMatch(script,/BOOKS\.filter\(b=>b\.status==='planned'\)/);
 assert.doesNotMatch(markup,/付费购买仍在验收中/);
});
test('S8 original reader embeds chapter word sidebar and secure quick-review controls',()=>{
  const js=app(),markup=html();
  const chapterWords=readFileSync(new URL('../public/chapter-words.js',import.meta.url),'utf8');
  assert.match(markup,/id="chapterVocabPanel"/);
  assert.match(markup,/id="chapterVocabBody"/);
  assert.match(markup,/id="mobileVocabOpen"/);
  assert.match(markup,/id="chapterVocabToggle"/);
  assert.match(markup,/src="\/chapter-words\.js"/);
  assert.match(js,/window\.MiaowuChapterWords\?\.openChapter\(id\)/);
  assert.match(js,/window\.MiaowuChapterWords\?\.setWords/);
  assert.match(chapterWords,/\/api\/me\/quick-review/);
  assert.match(chapterWords,/remembered/);
  assert.match(chapterWords,/judgments/);
  assert.match(chapterWords,/word_id/);
  assert.match(chapterWords,/mobileVocabOpen/);
  assert.doesNotMatch(chapterWords,/innerHTML\s*=\s*.*\bdata\.meaning_zh\b/);
});
