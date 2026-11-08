import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
const read=name=>readFileSync(new URL("../public/"+name,import.meta.url),"utf8");
const html=read("index.html"),css=read("styles.css"),app=read("app.js");

test("S138 full-bleed hero keeps native text, buttons and the reminder below the image",()=>{
 const hero=html.indexOf('<div class="hero story-home-hero" id="miaowuHomeScene">');
 const copy=html.indexOf('<div class="hero-copy">',hero);
 const picture=html.indexOf('class="home-scene-picture"',hero);
 const rain=html.indexOf('class="home-scene-rain"',hero);
 const lamp=html.indexOf('class="home-scene-lamp"',hero);
 const reminder=html.indexOf('<aside class="home-reminder-strip"',hero);
 const shelf=html.indexOf('id="categories"',hero);
 assert.ok(hero>=0&&copy>hero&&picture>copy&&rain>picture&&lamp>rain);
 assert.ok(reminder>lamp&&shelf>reminder);
 assert.equal((html.match(/id="reviewReminder"/g)||[]).length,1);
 assert.ok(html.includes('id="heroRead"'));
 assert.ok(html.includes('id="heroExplain"'));
 assert.ok(html.includes('id="bookGrid"'));
 assert.ok(html.includes('srcset="/cat-reading-hd.avif?v=20261104-v26-standard 1x, /cat-reading-tablet-2x.avif?v=20261104-v26-retina 2x"'));
 assert.ok(html.includes('src="/cat-reading-tablet-1x.webp?v=20261104-v26-standard"'));
 assert.ok(html.includes('href="/styles.css?v=20261104-v28-night-selection"'));
 assert.ok(html.includes('src="/app.js?v=20261108-wave1-popover"'));
});

test("S138 art dissolves into the background, rather than ending at a fixed 2-column boundary",()=>{
 assert.match(css,/#view-library \.story-home-hero\{[\s\S]*?display:flex!important/);
 assert.match(css,/#view-library \.story-home-hero \.story-home-art\{[\s\S]*?position:absolute!important/);
 assert.match(css,/\.home-scene-picture\{[\s\S]*?mask-image:linear-gradient\(90deg/);
 assert.match(css,/\.home-scene-rain\{/);
 assert.match(css,/\.home-scene-lamp\{/);
 assert.match(css,/@keyframes mw-rain-drift/);
 assert.match(css,/@keyframes mw-lamp-breathe/);
 // Mobile hero height is fluid: keep both tablet and phone sizing bounded
 // while preserving the original immersive fade and illustration.
 assert.match(css,/min-height:clamp\(490px,73vw,585px\)!important/);
 assert.match(css,/min-height:clamp\(430px,108vw,478px\)!important/);
 assert.match(css,/height:54%!important/);
 assert.match(css,/mask-image:linear-gradient\(180deg/);
 assert.match(css,/html\[data-theme="dark"\] #view-library \.story-home-hero/);
});

test("S138 parallax is desktop-only, frame-limited and respects reduced-motion preferences",()=>{
 assert.match(app,/function setupHomeSceneMotion\(\)/);
 assert.match(app,/window\.matchMedia\('\(hover: hover\) and \(pointer: fine\)'\)/);
 assert.match(app,/window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
 assert.match(app,/if\(!frame\)frame=window\.requestAnimationFrame\(apply\)/);
 assert.match(app,/scene\.addEventListener\('pointerleave',reset\)/);
 assert.match(app,/setupHomeSceneMotion\(\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.home-scene-lamp\{animation:none!important\}/);
 assert.match(css,/@media\(hover:none\),\(pointer:coarse\)/);
});

test("S138 no regressions in dynamic vocabulary reminders or paid book UI",()=>{
 assert.match(app,/const due=user\?cloudDue\(\):0,seen=cloudSaved\.size/);
 assert.match(app,/renderHomeStudyStats\(\)/);
 assert.ok(app.includes("navigate('echo')"));
 assert.ok(app.includes("resumeLatestReading"));
 assert.ok(html.includes('id="homeDueCount"'));
 assert.ok(html.includes('id="topAccount"'));
 assert.ok(html.includes('id="view-reader"'));
 assert.ok(html.includes('id="view-echo"'));
 assert.doesNotMatch(html.slice(html.indexOf('id="miaowuHomeScene"'),html.indexOf('class="home-reminder-strip"')),/style=/);
 new Script(app,{filename:"app.js"});
});
