import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
test("Narration starts only from explicit 朗读 buttons",()=>{
 assert.match(app,/\$\('sideRead'\)\.onclick=startReading/);
 assert.match(app,/\$\('topRead'\)\.onclick=startReading/);
 const controls=app.slice(app.indexOf("$('playerPrevious').onclick"),app.indexOf("$('storyText').addEventListener('click'"));
 assert.ok(controls.length>100,"transport controls located");
 assert.doesNotMatch(controls,/startReading/);
 assert.match(controls,/if\(speaking\)seekSpeech\(Number\(e\.target\.value\)\)/);
});
test("Plain text never starts speech before 朗读; click seek only while playing",()=>{
 const start=app.indexOf("$('storyText').addEventListener('click'");
 const end=app.indexOf("$('wordBackdrop').onclick",start);
 assert.ok(start>=0&&end>start);
 const click=app.slice(start,end);
 assert.doesNotMatch(click,/startReading\(/);
 assert.match(click,/if\(activeCloud\?\.chapterId&&p&&speaking&&!paused\)/);
 assert.match(click,/if\(segment>=0\)seekSpeech\(segment\)/);
 assert.match(click,/showCloudWord\(word\.dataset\.cloudWord,word\)/);
});
test("No reader-text pointer/mouse hover auto speak listeners",()=>{
 const reading=app.slice(app.indexOf("function renderD1Paragraph"),app.indexOf("function cloudPlainText"));
 assert.doesNotMatch(reading,/onmouseover|onmouseenter|onpointerenter/);
 const clickStart=app.indexOf("$('storyText').addEventListener('click'");
 const storyRegion=app.slice(clickStart,clickStart+1000);
 assert.doesNotMatch(storyRegion,/addEventListener\(['"](mouseover|mouseenter|mousemove|pointermove|pointerenter)/);
});
