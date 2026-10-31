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
  assert.match(markup,/主站书架、正文阅读与记忆藏书票已接入 Cloudflare D1/);
  assert.match(markup,/剧情回声目前仍为演示题库/);
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
  // The demo quiz survives as an explicitly separate learning preview, not a real cloud result.
  assert.match(script,/const ECHO_BANK=/);
  assert.match(markup,/真实云端章节的词汇练习将在下一阶段接入/);
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
