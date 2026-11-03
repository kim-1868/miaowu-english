import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
const source=name=>readFileSync(new URL("../public/"+name,import.meta.url),"utf8");
const html=source("index.html"),js=source("app.js"),words=source("chapter-words.js"),css=source("styles.css");
test("V1 customer UI is no longer a demo site and no unfinished reading notes are shown",()=>{
 for(const term of ["网站上线准备中","阅读笔记","故事演示练习","互动演示","本机测试","本机演示","第一章开放试读"])
  assert.ok(!html.includes(term),"disallowed public HTML: "+term);
 assert.match(html,/id="view-library"/);
 assert.match(html,/id="view-reader"/);
 assert.match(html,/id="view-echo"/);
 assert.ok(!html.includes('id="cloudFinishReading"'));
 assert.match(js,/let echoMode='cloud'/);
 assert.doesNotMatch(js,/showRoseDemo/);
 assert.doesNotMatch(js,/已授权/);
 assert.match(js,/if\(!books\.length\)/);
 assert.doesNotMatch(html,/雨夜档案.*上线准备中/);
});
test("V1 controls are fully wired, with no direct payment or unprotected content requests",()=>{
 assert.doesNotThrow(()=>new Script(js,{filename:"app.js"}));
 assert.doesNotThrow(()=>new Script(words,{filename:"chapter-words.js"}));
 for(const key of ["readerTone","readerLine","playerSeek","playerPosition",
                   "playerPrevious","playerNext","playerStop",
                   "mobileChapterOpen","mobileChapterClose","readerDrawerOverlay"])
  assert.ok(html.includes('id="'+key+'"'),"missing "+key);
 assert.match(js,/saveReadingProgress\(\{complete:finishPrevious,quiet:false\}\)/);
 assert.match(js,/await saveReadingProgress\(\{complete:true,quiet:false\}\)/);
 assert.match(js,/serverRequest\('\/api\/me\/progress','POST'/);
 assert.match(js,/savedAt\.progress>0\.025/);
 assert.match(js,/seekSpeech/);
 assert.match(js,/speechGeneration/);
 assert.match(js,/highlightSpeechParagraph/);
 assert.match(js,/applyReadingPrefs/);
 assert.match(words,/visibleCount=36/);
 assert.match(words,/Math\.min\(words\.length,visibleCount\+PAGE\)/);
 assert.match(js,/glossaryCache/);
 assert.doesNotMatch(js,/\/api\/ops\/|\/api\/staging\//);
});
test("V1 responsive and theme rules cover phone, echo overlap, word overflow and night reader",()=>{
 assert.match(css,/Miaowu V1 production polish/);
 assert.match(css,/\.echo-banner h2\{line-height:1\.3/);
 assert.match(css,/\.reader-layout\[data-reader-tone="night"\]/);
 assert.match(css,/\.reader-layout\.chapter-drawer-open/);
 assert.match(css,/\.chapter-vocab-header\{display:grid/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/\.player-seek input/);
});
