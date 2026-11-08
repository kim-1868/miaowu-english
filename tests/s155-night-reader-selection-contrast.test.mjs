import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const css=read("../public/styles.css");
const live=read("../public/live-reader.css");
const html=read("../public/index.html");
const liveHtml=read("../public/live.html");
const app=read("../public/app.js");

const luminance=(hex)=>{
  const c=hex.replace("#","").match(/../g).map(x=>parseInt(x,16)/255)
    .map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
};
const contrast=(a,b)=>{
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
};

test("S155: night-mode selected story text is readable on Safari, Firefox and Chrome",()=>{
  assert.match(css,/V28: readable text and tapped vocabulary/);
  assert.ok(css.includes('html[data-theme="dark"] #view-reader .story-text *::selection'));
  assert.ok(css.includes('#view-reader .reader-layout.night .story-text *::selection'));
  assert.ok(css.includes('#view-reader .reader-layout[data-reader-tone="night"] .story-text *::selection'));
  assert.ok(css.includes('html[data-theme="dark"] #view-reader .story-text *::-moz-selection'));
  assert.match(css,/background:#855067!important;\s*color:#fffaf5!important/);
  assert.ok(contrast("#855067","#fffaf5")>=4.5,"selected text must meet WCAG AA normal text contrast");
  assert.ok(html.includes('href="/styles.css?v=20261104-v28-night-selection"'));
  assert.ok(html.includes('src="/app.js?v=20261108-wave1-popover-voice-guard"'));
});

test("S155: active word and speech highlight stay legible in night reading on every viewport",()=>{
  assert.ok(css.includes('.story-text [data-cloud-word].study-word-active'));
  assert.match(css,/background:#684052!important;\s*color:#fff5ed!important/);
  assert.ok(contrast("#684052","#fff5ed")>=4.5,"active word must contrast");
  assert.ok(css.includes('.story-text p[data-audio-paragraph].reading-current'));
  assert.match(css,/background:#45404c!important;\s*box-shadow:0 0 0 6px #45404c!important;\s*color:#fff2e9!important/);
  assert.ok(contrast("#45404c","#fff2e9")>=4.5,"spoken paragraph must contrast");
  assert.match(css,/@media \(pointer:coarse\)\{\s*#view-reader .story-text \[data-cloud-word\]/);
  assert.match(css,/\.reader-layout\[data-reader-tone="night"\] .story-text \*::selection/);
  assert.ok(app.includes("study-word-active"));
  assert.ok(app.includes("function highlightSpeechParagraph(index)"));
});

test("S155: standalone reading page uses the same contrast and cache refresh",()=>{
  assert.ok(live.includes(':root[data-theme="dark"] .story *::selection'));
  assert.ok(live.includes(':root[data-theme="dark"] .story *::-moz-selection'));
  assert.ok(live.includes("background:#855067"));
  assert.ok(live.includes("color:#fffaf5"));
  assert.ok(liveHtml.includes('href="/live-reader.css?v=20261104-v28-night-selection"'));
  assert.match(live,/@media \(pointer:coarse\)/);
});