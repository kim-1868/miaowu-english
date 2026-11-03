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
 for(const key of ["playerSeek","playerPosition",
                   "playerPrevious","playerNext","playerStop",
                   "mobileChapterOpen","mobileChapterClose","readerDrawerOverlay"])
  assert.ok(html.includes('id="'+key+'"'),"missing "+key);
 assert.match(js,/saveReadingProgress\(\{complete:finishPrevious,quiet:false\}\)/);
 assert.match(js,/await saveReadingProgress\(\{complete:true,quiet:false\}\)/);
 assert.match(js,/serverRequest\('\/api\/me\/progress','POST'/);
 assert.match(js,/savedAt\?\.progress>0\.025/);
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
 assert.doesNotMatch(html,/id="readerTone"|暖纸|纯白|夜读/);
 assert.match(js,/showManualRecovery/);
 assert.match(css,/html\[data-theme="dark"\] \.vocab-card\.status-mastered/);
 assert.match(css,/\.wordbook-grid\{grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(css,/\.reader-layout\.chapter-drawer-open/);
 assert.match(css,/\.chapter-vocab-header\{display:grid/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/\.player-seek input/);
});

test("V1.2 wordbook keeps vocabulary examples and collocations without a story sentence block",()=>{
 const start=js.indexOf("function renderWords(){");
 const end=js.indexOf("function renderQuiz(",start);
 assert.ok(start>=0&&end>start);
 const cards=js.slice(start,end);
 assert.doesNotMatch(cards,/故事中的原句|w\.context_sentence/);
 assert.match(cards,/例句 \/ EXAMPLE/);
 assert.match(cards,/常用搭配 \/ COLLOCATIONS/);
});
test("V1.2 removes the reading line-height selector and keeps single global theme",()=>{
 assert.doesNotMatch(html,/id="readerLine"|紧凑|舒适|舒展/);
 assert.doesNotMatch(js,/\$\('readerLine'\)/);
 assert.match(js,/setProperty\('line-height','2\.15'\)/);
});
test("V1.2 mobile study tray opens immediately and supports switching and learning",()=>{
 assert.match(js,/function chapterStudyWordIds\(\)/);
 assert.match(js,/function showCloudWord\(wordId\)/);
 assert.match(js,/function showCloudWord\(wordId\)[\s\S]*?studyPrevious[\s\S]*?studyNext/);
 assert.match(js,/showCloudWord\(word\.dataset\.cloudWord\)/);
 assert.match(js,/studyRequestSequence/);
 assert.match(js,/saveCloudWord\(wordId,false\)/);
 assert.match(js,/saveCloudWord\(wordId,true\)/);
 assert.match(css,/html\.study-tray-open #wordBackdrop\{display:none!important/);
 assert.match(css,/html\.study-tray-open \.word-pop\.on/);
 assert.match(css,/z-index:250!important/);
});

test("V1.2.1 iOS study tray never shades the screen without a visible learning card",()=>{
 assert.match(js,/const mobileStudyTray=window\.matchMedia/);
 assert.match(js,/backdrop\.classList\.toggle\('on',!mobileStudyTray\)/);
 assert.match(js,/backdrop\.style\.setProperty\('display','none','important'\)/);
 assert.match(js,/tray\.style\.setProperty\('z-index','2147483000','important'\)/);
 assert.match(css,/#wordBackdrop\.on\{display:none!important;pointer-events:none!important\}/);
 assert.match(css,/#wordPop\.on\{/);
 assert.match(html,/styles\.css\?v=20261103-immersive-v18/);
 assert.match(html,/app\.js\?v=20261103-immersive-v18/);
});

test("V1.2.3 mobile vocabulary drawer targets the aside preceding the overlay",()=>{
 const wordJs=source("chapter-words.js");
 assert.match(css,/\.reader-layout\.vocab-drawer-open>\.sidebar:last-of-type/);
 assert.doesNotMatch(css,/\.reader-layout\.vocab-drawer-open>\.sidebar:last-child/);
 assert.match(css,/\.reader-layout\.vocab-drawer-open \.reader-drawer-overlay\{z-index:80!important\}/);
 assert.match(wordJs,/classList\.toggle\("vocab-drawer-open",opening\)/);
 assert.match(wordJs,/\$\("chapterVocabBody"\)\.hidden=false/);
 assert.match(html,/id="mobileVocabOpen"[^>]+aria-expanded="false"/);
 assert.match(html,/id="mobileVocabClose"/);
});
test("V1.2.3 mobile reader tools use a uniform four-column grid",()=>{
 assert.match(css,/\.read-top \.tool-row\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/height:44px!important;min-height:44px!important/);
 assert.match(html,/id="topRead"[^>]*>♫ 朗读<\/button>/);
 assert.match(html,/styles\.css\?v=20261103-immersive-v18/);
});
