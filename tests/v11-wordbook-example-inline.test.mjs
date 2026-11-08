import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const selector='.vocab-card .vocab-example button.v11-example-word';
test('V1.1 wordbook examples render as inline underlined text, never bubble-shaped buttons',()=>{
 const css=read('public/v11-wordbook.css');
 const match=css.match(/\.vocab-card \.vocab-example button\.v11-example-word\{([^}]+)\}/);
 assert.ok(match,'specificity must beat .vocab-card button in styles.css');
 const block=match[1];
 for(const required of [/display:inline\s*;/,/padding:0\s*;/,/margin:0\s*;/,/border:0\s*;/,
   /border-radius:0\s*;/,/background:transparent\s*;/,/font:inherit\s*;/,
   /text-decoration-line:underline\s*;/,/white-space:normal\s*;/]){
  assert.match(block,required);
 }
 const dark=css.match(/html\[data-theme="dark"\] \.vocab-card \.vocab-example button\.v11-example-word\{([^}]+)\}/);
 assert.ok(dark,'night mode must not restore the generic dark card button background');
 assert.match(dark[1],/background:transparent/);
 assert.match(dark[1],/border:0/);
});
test('example inline CSS is loaded after generic button styles, with a new asset version',()=>{
 const html=read('public/index.html');
 assert.ok(html.indexOf('/styles.css?')<html.indexOf('/v11-wordbook.css?'));
 assert.match(html,/\/v11-wordbook\.css\?v=20261106-p5-inline-example/);
});
test('whole sentence audio and single-word pronunciation still work without nested meaning popups',()=>{
 const js=read('public/app.js');
 assert.match(js,/data-example-audio/);
 assert.match(js,/if\(w\?\.example_en\)speakWord\(w\.example_en\)/);
 assert.match(js,/'<div class="vocab-example">'\+renderExampleWords\(w\.example_en,w\.word_id\)/);
 assert.match(js,/function pronounceExampleWord\(button\)/);
 assert.match(js,/speakWord\(word\)/);
 assert.doesNotMatch(js,/function showExampleLookup/);
});
