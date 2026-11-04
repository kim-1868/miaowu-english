import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const coverLayout=css.split('/* V21 cover-led bookshelf:')[1] || '';

test('cover-led bookshelf keeps a 3-up desktop library and more artwork than before',()=>{
  assert.ok(coverLayout);
  assert.match(css,/#view-library \.home-shelf-layout > \.book-grid\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(coverLayout,/grid-template-columns:minmax\(0,60%\) minmax\(0,1fr\)/);
  assert.match(coverLayout,/aspect-ratio:3\/4!important/);
  assert.match(coverLayout,/object-fit:cover/);
});

test('book title stays over cloud progress and button without redundant right-hand badges',()=>{
  assert.match(coverLayout,/\.book-info \.book-meta\{\s*display:none/);
  assert.match(coverLayout,/\.book-actions\{\s*margin-top:auto!important/);
  assert.match(css,/\.shelf-progress\{\s*order:2/);
  assert.match(css,/\.book-actions\{\s*order:3/);
  assert.match(app,/data-live-progress/);
});

test('tablet and phone cover widths are responsive and production assets are cache-busted',()=>{
  assert.match(coverLayout,/@media\(max-width:1300px\)/);
  assert.match(coverLayout,/@media\(max-width:820px\)/);
  assert.match(coverLayout,/@media\(max-width:600px\)/);
  assert.match(coverLayout,/grid-template-columns:minmax\(0,49%\) minmax\(0,1fr\)/);
  assert.match(coverLayout,/@media\(max-width:370px\)/);
  assert.match(coverLayout,/grid-template-columns:minmax\(0,47%\) minmax\(0,1fr\)/);
  assert.match(html,/styles\.css\?v=20261104-v21-cover-led-shelf/);
  assert.match(html,/app\.js\?v=20261104-v21-cover-led-shelf/);
});
