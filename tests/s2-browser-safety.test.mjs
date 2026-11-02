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

test('S5 uses the existing book cover, reader, bookplates, and dashboard for real D1-backed content',()=>{
  const script=app(),markup=html();
  assert.match(markup,/网站上线准备中/);
  assert.match(markup,/付费购买仍在验收中/);
  assert.doesNotMatch(markup,/私有测试环境/);
  assert.match(markup,/演示玩法/);
  assert.match(markup,/id="echoModeSwitch"/);
  assert.match(script,/function renderEchoModeSwitch/);
  assert.match(markup,/id="view-library"/);
  assert.match(markup,/id="view-reader"/);
  assert.match(markup,/id="view-words"/);
  assert.match(markup,/id="view-account"/);
  assert.match(markup,/id="cloudFinishReading"/);
  assert.match(script,/function loadCloudBookCards/);
  assert.match(script,/function showCloudWord/);
  assert.match(script,/function renderWords/);
  assert.match(script,/function renderAccount/);
  assert.match(script,/\/api\/me\/progress/);
  assert.match(script,/\/api\/me\/words/);
  assert.match(script,/refreshCloudLearning/);
  assert.match(script,/function renderReminder/);
  // The old internal demo array is inert: the real Story Echo adapter is active.
  assert.match(script,/window\.MiaowuCloudEcho\.render\(\)/);
  assert.match(markup,/script src="\/echo-cloud\.js"/);
});

test('chapter dialog selection immediately reveals reading screen and never waits for glossary',()=>{
  const js=app();
  const start=js.indexOf('async function openCloudChapter(id){');
  const end=js.indexOf('function resetDemoReadingUI()',start);
  assert.ok(start>=0&&end>start);
  const fn=js.slice(start,end);
  assert.ok(fn.indexOf("closeModal();")>=0);
  assert.ok(fn.indexOf("navigate('reader');")>=0);
  assert.ok(fn.indexOf("serverRequest('/api/chapters/'")>=0);
  assert.ok(fn.indexOf("closeModal();")<fn.indexOf("serverRequest('/api/chapters/'"));
  assert.ok(fn.indexOf("navigate('reader');")<fn.indexOf("serverRequest('/api/chapters/'"));
  assert.ok(fn.indexOf("parts.map(renderD1Paragraph)")<fn.indexOf("'/words'"));
  assert.match(fn,/cloud-reader-loading/);
  assert.match(fn,/cloud-reader-error/);
  assert.match(fn,/重试打开本章/);
});

test('S7 matches the original V0.3 design rules while showing actual progress and explicit planned books',()=>{
  const script=app(),markup=html();
  const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  const baseline=readFileSync(new URL('../public/design-reference-v03.html',import.meta.url),'utf8');
  const ref=baseline.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(ref,'V0.3 has an embedded original design system');
  assert.ok(css.startsWith(ref[1]),'approved V0.3 stylesheet must remain unchanged at its base');
  assert.match(script,/function updateCloudShelfProgress/);
  assert.match(script,/book\.chapter_count/);
  assert.match(script,/p\.completed_at/);
  assert.match(script,/data-live-progress/);
  assert.match(script,/BOOKS\.filter\(b=>b\.status==='planned'\)/);
  assert.match(script,/未上架 · 不可购买/);
  assert.match(script,/测试内容 · 不出售/);
  assert.match(script,/book\.cover_key|story\W+edition|故事试读册/);
  assert.match(script,/function openFirstCloudBook/);
  assert.match(script,/closeModal\(\);openFirstCloudBook\(\)/);
  assert.match(script,/activeCloud\.rawParagraphs/);
  assert.match(script,/token\.surface/);
  assert.match(markup,/付费购买仍在验收中/);
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
