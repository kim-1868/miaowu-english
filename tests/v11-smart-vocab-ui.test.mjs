import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('only third bookplate choice is added, no new navigation or homepage banner',()=>{
  const home=read('public/index.html'),flash=read('public/flashcards.js');
  assert.match(flash,/flashStartFlip/);
  assert.match(flash,/flashStartSpell/);
  assert.match(flash,/flashStartSmart/);
  assert.match(flash,/MiaowuSmartVocab\?\.isAvailable/);
  assert.match(home,/id="smartVocabStage" hidden/);
  assert.match(home,/id="smartVocabGuide"/);
  assert.equal((home.match(/data-nav="words"/g)||[]).length,2);
  assert.doesNotMatch(home,/data-nav="smart"/);
});

test('original registration welcome and first word/bookmark hints are untouched',()=>{
  const original=read('public/onboarding.js'),addon=read('public/smart-vocab.js');
  assert.match(original,/欢迎来到妙屋英语/);
  assert.match(original,/mwWelcomePosition/);
  assert.match(original,/first_bookmark_tip_at|bookmarkTipPending/);
  assert.match(addon,/mw-bookplate-entry-guide-v1/);
  assert.match(addon,/view-words/);
  assert.match(addon,/showModal/);
});

test('feature is opt-in at server and storage level',()=>{
  const route=read('src/worker.js'),api=read('src/smart-vocab-api.js');
  const sql=read('db/012_smart_vocab_catalog.sql');
  assert.match(route,/handleSmartVocab/);
  assert.match(api,/SMART_VOCAB_SCHEMA_READY/);
  assert.match(api,/SMART_VOCAB_ENABLED/);
  assert.match(sql,/enabled INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql,/reviewed INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql,/catalog_verified_at TEXT/);
});

test('bookplate legacy and smart visibility are isolated by readiness gate',()=>{
  const lib=read('src/reading-library.js'),identity=read('src/study-identity.js');
  assert.match(lib,/flashVisibleFor\(env\)/);
  assert.match(lib,/SMART_VOCAB_SCHEMA_READY/);
  assert.match(lib,/uw\.bookmarked=1/);
  assert.match(identity,/SMART_VOCAB_SCHEMA_READY/);
  assert.match(identity,/relatedAccessibleWordIds/);
});

test('missing smart cards are never rendered and bookmarks keep feedback separate',()=>{
  const api=read('src/smart-vocab-api.js'),ui=read('public/smart-vocab.js');
  assert.match(api,/TRIM\(COALESCE\(w\.example_en/);
  assert.match(api,/TRIM\(COALESCE\(w\.example_zh/);
  assert.match(api,/game_type,result/);
  assert.match(ui,/mwSmartBookmark/);
  assert.match(ui,/mwSmartKnown/);
  assert.match(ui,/mwSmartForgot/);
  assert.match(ui,/pendingAnswer/);
});

test('smart-vocabulary UI is staging-only until owner approves its release',()=>{
  const build=read('scripts/build-production-assets.mjs'),html=read('public/index.html');
  const allowlist=build.split('PRODUCTION_ASSET_ALLOWLIST=Object.freeze([')[1]?.split(']);')[0]||'';
  assert.doesNotMatch(allowlist,/smart-vocab/);
  assert.match(build,/stripDraftSmartVocab/);
  assert.match(build,/UNAPPROVED_SMART_VOCAB_UI_BUNDLE/);
  assert.match(html,/src="\\/smart-vocab\\.js/);
  assert.match(html,/href="\\/smart-vocab\\.css/);
  assert.match(html,/src="\\/onboarding\\.js/);
});
