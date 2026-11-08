import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("V1.1 reader vocabulary fold button uses small paper-toned pill instead of native gray box",()=>{
 const css=source("public/v11-reader.css");
 assert.match(css,/#view-reader \.chapter-vocab-header \.chapter-vocab-toggle\{/);
 assert.match(css,/appearance:none;display:inline-flex/);
 assert.match(css,/border-radius:999px/);
 assert.match(css,/background:var\(--paper/);
 assert.match(css,/color:var\(--wine/);
 assert.match(css,/font-size:12px/);
 assert.match(css,/min-height:34px/);
});
test("V1.1 reader vocabulary fold button supports dark, hover, focus and mobile tap target",()=>{
 const css=source("public/v11-reader.css");
 assert.match(css,/html\[data-theme="dark"\] #view-reader \.chapter-vocab-header \.chapter-vocab-toggle/);
 assert.match(css,/#readerLayout\.night \.chapter-vocab-header \.chapter-vocab-toggle/);
 assert.match(css,/:hover\{/);
 assert.match(css,/:focus-visible\{/);
 assert.match(css,/min-height:38px/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\[aria-expanded="true"\]::after/);
});
test("V1.1 reader fold behavior and accessible expanded state remain connected",()=>{
 const html=source("public/index.html"),js=source("public/chapter-words.js");
 assert.match(html,/id="chapterVocabToggle" class="chapter-vocab-toggle" type="button" aria-expanded="true" aria-controls="chapterVocabBody"/);
 assert.match(html,/v11-reader\.css\?v=20261106-p2&amp;fold=20261108-v1/);
 assert.match(js,/\$\("chapterVocabToggle"\)\.onclick=/);
 assert.match(js,/body\.hidden=folded/);
 assert.match(js,/setAttribute\("aria-expanded",String\(!folded\)\)/);
 assert.match(js,/textContent=folded\?"展开":"收起"/);
 assert.match(js,/\$\("mobileVocabOpen"\)\.onclick=/);
 assert.doesNotMatch(js,/startLearnedReview|自愿复习已学词/);
});
