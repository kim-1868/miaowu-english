import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const js=fs.readFileSync(new URL("../public/ops-console.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/ops.html",import.meta.url),"utf8");
const source=JSON.parse(fs.readFileSync(new URL("../content/operations/published-book-story-tags-v38.json",import.meta.url),"utf8"));
const match=js.match(/const storyTagPlanV38=(\[[\s\S]*?\]);\nbutton\("applyStoryTags"/);
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

test("batch is opt-in, authorized, and only adds missing labels via publisher tag API",()=>{
  assert.match(html,/id="applyStoryTags"/);
  assert.match(html,/tags=20261106-v38/);
  assert.match(js,/if\(!connected\(\)\)throw Error\("请先验证运营身份"\)/);
  assert.match(js,/b\.status==="published"/);
  assert.match(js,/window\.confirm\(/);
  assert.match(js,/const current=await api\(url\)/);
  assert.match(js,/if\(seen\.has\(label\)\)\{skipped\+\+;continue\}/);
  assert.match(js,/await api\(url,"POST",\{label,color,requestId:requestId\(\)\}\)/);
  assert.doesNotMatch(js,/\/api\/ops\/books\/.*?\/tags","DELETE"/s);
  assert.match(js,/if\(chosen\)await loadCoverTags\(chosen\)/);
});
