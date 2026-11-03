import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
test("V1.3 reminder keeps up-to-date Echo copy and approved filled cat paw icon",()=>{
 const app=read("../public/app.js");
 assert.match(app,/reminder-cat/);
 assert.match(app,/class="solid-cat-paw" viewBox="0 0 80 80"/);
 assert.match(app,/今天有 '\+due\+' 个单词等你复习/);
 assert.match(app,/去剧情回声找回故事里的单词/);
 assert.match(app,/fill="currentColor"/);
 assert.doesNotMatch(app,/记忆练习将在云端剧情回声上线后同步/);
 assert.doesNotMatch(app,/剧情回声目前仍为演示玩法/);
 assert.match(app,/id="wordSmallSpeak"/);
 assert.match(app,/id="wordSpeak"/);
});
test("night reader and global theme retain accessible back navigation and original book cover",()=>{
 const css=read("../public/styles.css");
 const html=read("../public/index.html");
 assert.match(html,/id="readerBack"/);
 assert.match(html,/id="globalThemeToggle"/);
 assert.match(css,/html\[data-theme="dark"\]/);
 assert.match(css,/\.reader-layout\.night \.read-top #readerBack/);
 assert.match(css,/outline:2px solid #efc18d/);
 assert.match(css,/html\[data-theme="dark"\] \.book-cover\{filter:none!important\}/);
});
