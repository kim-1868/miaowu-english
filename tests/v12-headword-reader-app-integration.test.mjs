import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/global-dictionary-headword-api.js',import.meta.url),'utf8');
test('reader script loads bridge before app and original wordbook remains',()=>{
 assert.ok(html.indexOf('/headword-reader-bridge.js?')>0);
 assert.ok(html.indexOf('/headword-reader-bridge.js?')<html.indexOf('/app.js?'));
 assert.match(html,/chapter-words\.js/);
 assert.match(app,/window\.MiaowuChapterWords\?\.configure/);
});
test('reader computes pX:sY anchor for explicit existing wordId, never raw unchecked text',()=>{
 assert.match(app,/segments\.map\(\(segment,segmentIndex\)=>/);
 assert.match(app,/data-dictionary-anchor=/);
 assert.match(app,/book\.reviewedAnchors=new Map\(\)/);
 assert.match(app,/page\.headwordReaderReady&&user/);
 assert.match(app,/activeCloud\?\.reviewedAnchors\?\.get\(anchor\)/);
 assert.match(app,/else showCloudWord\(word\.dataset\.cloudWord,word\)/);
});
test('new API is staging-only and reader entry originates from approved binding',()=>{
 assert.match(worker,/env\.APP_ENV==='staging'/);
 assert.match(worker,/path\.startsWith\("\/api\/me\/dictionary\/chapters\/"\)/);
 assert.match(api,/CHAPTER_ANCHORS/);
 assert.match(api,/listApprovedReaderChapterAnchors/);
 assert.match(api,/GLOBAL_DICTIONARY_HEADWORD_SRS_ENABLED/);
 assert.match(api,/if\(env\?\.APP_ENV!=='staging'\)/);
});
test('reader preserves old audio controls, click-outside closing and manual resume',()=>{
 assert.match(app,/function pauseNarrationForWord\(/);
 assert.match(app,/window\.speechSynthesis\.pause\(\)/);
 assert.match(app,/window\.MiaowuHeadwordReaderBridge\?\.invalidate\(\)/);
 assert.match(app,/if\(\$\('wordPop'\)\.classList\.contains\('on'\)\)closeWord\(\)/);
 assert.match(app,/window\.speechSynthesis\.resume\(\)/);
 assert.match(app,/saveLegacy:id=>saveCloudWord\(id,false\)/);
});