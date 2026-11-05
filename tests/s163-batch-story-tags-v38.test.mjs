import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const js=fs.readFileSync(new URL("../public/ops-console.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/ops.html",import.meta.url),"utf8");
const source=JSON.parse(fs.readFileSync(new URL("../content/operations/published-book-story-tags-v38.json",import.meta.url),"utf8"));
const match=js.match(/const storyTagPlanV38=(\[[\s\S]*?\]);\n\/\/ The curated original 23/);
assert.ok(match,"Curated tag data must be embedded into the console");
const plan=JSON.parse(match[1]);

test("23 title-verified published books have 46 reasonable, unique suggested labels",()=>{
  assert.equal(plan.length,23);
  assert.deepEqual(plan,source.records.map(b=>({
    id:b.bookId,title:b.title,category:b.category,
    tags:b.add.map(x=>[x.label,x.color])
  })));
  assert.equal(plan.reduce((n,b)=>n+b.tags.length,0),46);
  assert.equal(new Set(plan.map(b=>b.id)).size,23);
  for(const b of plan){
    assert.match(b.id,/^[a-z][a-z0-9_-]{2,79}$/);
    assert.ok(b.title.length>1);
    assert.ok(["cet4","cet6","postgrad"].includes(b.category));
    assert.equal(new Set(b.tags.map(x=>x[0])).size,b.tags.length);
    for(const [label,color] of b.tags){
      assert.ok(label.length>0&&label.length<=24);
      assert.match(color,/^#[a-fA-F0-9]{6}$/);
    }
  }
});

test("existing curated titles remain and the bulk action works for new published books",()=>{
  assert.match(html,/id="applyStoryTags"/);
  assert.match(html,/tags=20261106-v40/);
  assert.match(html,/为全部已上架小说补齐推荐标签/);
  assert.match(js,/if\(!connected\(\)\)throw Error\("请先验证运营身份"\)/);
  assert.match(js,/catalogBooks\.filter\(b=>b\.status==="published"\)/);
  assert.match(js,/window\.confirm\(/);
  assert.match(js,/const existing=await api\(path\)/);
  assert.match(js,/if\(have\.has\(tag\.label\)\)/);
  assert.match(js,/await api\(path,"POST",\{label:tag\.label,color:tag\.color,requestId:requestId\(\)\}\)/);
  const batchSection=js.slice(js.indexOf('async function proposeTags('),js.indexOf('// Cover tags stay separate'));
  assert.doesNotMatch(batchSection,/"DELETE"/);
  assert.match(js,/if\(chosen\)await loadCoverTags\(chosen\)/);
});
