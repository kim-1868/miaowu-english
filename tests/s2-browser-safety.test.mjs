import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('public reader fetches paid cloud chapters from server, and does not bundle protected QA paragraphs', () => {
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const protectedSamples=[
    '这是只保存在 Cloudflare D1 测试数据库的四级受限正文。',
    '这是只保存在 Cloudflare D1 测试数据库的六级受限正文。'
  ];
  for (const sample of protectedSamples){
    assert.equal(app.includes(sample),false);
    assert.equal(html.includes(sample),false);
  }
  assert.match(app,/serverRequest\('\/api\/books\?/);
  assert.match(app,/serverRequest\('\/api\/chapters\//);
  assert.match(app,/function openCloudChapter\(/);
  assert.match(app,/escape|safe\(p\)/);
});

test('browser demo remains explicitly separated from real D1-backed protected reader',()=>{
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/小说与词汇复习仍为浏览器本地演示数据/);
  assert.match(app,/TEST CONTENT ONLY/);
  assert.match(app,/本云端权限测试章尚未接入词库/);
});
