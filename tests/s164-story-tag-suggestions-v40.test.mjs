import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {suggestStoryTags} from "../public/novel-file-parser.js";

const js=readFileSync(new URL("../public/ops-console.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../public/ops.html",import.meta.url),"utf8");
const backend=readFileSync(new URL("../src/ops-console.js",import.meta.url),"utf8");
const assets=readFileSync(new URL("../scripts/build-production-assets.mjs",import.meta.url),"utf8");

test("V40: brand new books receive content-based suggestions without hardcoded ID",()=>{
  const book=suggestStoryTags({
    title:"穿书后我拒绝替嫁",
    description:"女主穿进小说成了被迫替嫁的女配，她撕毁婚约，不再遵循剧情，决定为自己而活。",
    chapters:["这场婚礼没有新娘","谁都不能替我签字"]
  });
  const labels=book.map(x=>x.label);
  assert.ok(labels.includes("穿书"));
  assert.ok(labels.includes("替嫁"));
  assert.ok(labels.includes("女主觉醒")||labels.includes("反套路"));
  assert.ok(labels.length>=2&&labels.length<=5);
  for(const x of book)assert.match(x.color,/^#[a-f0-9]{6}$/i);
  assert.ok(book.every(x=>x.basis.length>0));
});

test("V40: ambiguous or empty metadata does not fabricate genre tags",()=>{
  assert.deepEqual(suggestStoryTags({title:"第一封信",description:"故事仍在准备中。",chapters:["第一章"]}),[]);
  const book=suggestStoryTags({title:"春天的雨",description:"一个普通学生每天到图书馆读书。"});
  assert.ok(!book.some(x=>["双男主","先婚后爱","穿书","重生"].includes(x.label)));
  assert.deepEqual(suggestStoryTags({body:"只有一段文字提到了总裁",title:"无名小说"}),[]);
});

test("V40: existing books and future books share secure save path, existing labels remain untouched",()=>{
  assert.match(js,/catalogBooks\.filter\(b=>b\.status==="published"\)/);
  assert.match(js,/const fixed=novel\?null:storyTagPlanV38\.find/);
  assert.match(js,/const \{suggestStoryTags\}=await import\("\/story-tag-suggester\.js\?v=20261106-v40"\)/);
  assert.match(js,/const have=new Set\(\(existing\.tags\|\|\[\]\)\.map/);
  assert.match(js,/if\(have\.has\(tag\.label\)\)/);
  assert.match(js,/await api\(path,"POST"/);
  assert.match(js,/window\.confirm\(/);
  assert.match(backend,/b\.description/);
  assert.match(backend,/AS chapter_titles/);
  assert.match(html,/id="suggestTags"/);
  assert.match(html,/id="saveSuggestedTags"/);
  assert.match(html,/id="uploadTagSuggestions"/);
  assert.match(html,/为全部已上架小说补齐推荐标签/);
  assert.match(assets,/"story-tag-suggester\.js"/);
});

test("V40: new book upload offers opt-out tag checkboxes and saves after actual publication",()=>{
  assert.match(js,/await renderImportTagSuggestions\(pkg\)/);
  assert.match(js,/input\.type="checkbox"/);
  assert.match(js,/const tags=selectedImportTags\(\)/);
  const publish=js.indexOf("await quickPublishBook(created.bookId,snapshot)");
  const tags=js.indexOf("const tags=selectedImportTags()");
  assert.ok(publish>=0&&tags>publish,"tags must be saved after publication succeeds");
  assert.match(js,/小说已上架，但部分标签未保存/);
  assert.match(js,/function resetNovel\(\)/);
  assert.match(js,/\$\("uploadTagSuggestions"\)\.replaceChildren\(\)/);
});
