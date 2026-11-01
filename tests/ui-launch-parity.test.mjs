import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
test("V0.3 cloud review reminder uses paw SVG and up-to-date real Echo copy",()=>{
 const app=read("../public/app.js");
 assert.match(app,/reminder-cat/);
 assert.match(app,/<svg viewBox="0 0 48 48"/);
 assert.match(app,/今天有 '\+due\+' 个单词等你复习/);
 assert.match(app,/剧情回声，完成练习后会更新云端学习记录/);
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
