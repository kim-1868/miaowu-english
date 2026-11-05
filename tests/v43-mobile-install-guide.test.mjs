import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRODUCTION_ASSET_ALLOWLIST} from '../scripts/build-production-assets.mjs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/install-guide.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/install-guide.css',import.meta.url),'utf8');

test('short iPhone/Android instructions and both selectable tabs',()=>{
  for(const id of ['homeInstallTip','installTipOpen','installTipDismiss','installGuide','installGuideClose','installAccountOpen']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.match(html,/data-install-tab="iphone"/);
  assert.match(html,/data-install-tab="android"/);
  assert.match(html,/data-install-panel="iphone"/);
  assert.match(html,/data-install-panel="android"/);
  assert.match(html,/添加到主屏幕/);
  assert.match(html,/Chrome/);
  assert.match(html,/Safari/);
  assert.match(html,/小红书/);
});
test('nonintrusive help does not auto-open, respects dismissal and installed mode',()=>{
  assert.match(html,/id="installGuide"[^>]*hidden/);
  assert.match(html,/id="homeInstallTip"[^>]*hidden/);
  assert.match(js,/display-mode: standalone/);
  assert.match(js,/install-tip-dismissed/);
  assert.doesNotMatch(js,/fetch\s*\(/);
  assert.doesNotMatch(js,/\/api\//);
  assert.match(css,/@media\(max-width:760px\)/);
});
test('production asset pack contains both new files',()=>{
  assert.ok(PRODUCTION_ASSET_ALLOWLIST.includes('install-guide.css'));
  assert.ok(PRODUCTION_ASSET_ALLOWLIST.includes('install-guide.js'));
  assert.match(html,/\/install-guide.css\?v=20261106-v1/);
  assert.match(html,/\/install-guide.js\?v=20261106-v1/);
});
