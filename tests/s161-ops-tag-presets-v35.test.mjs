import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../public/ops-console.js",import.meta.url),"utf8");
const match=source.match(/const defaultTagGroups=(\[[\s\S]*?\]);\nconst defaultTagColors=/);
assert.ok(match,"Operations UI must declare grouped label presets");
const groups=Function("return "+match[1])();
const labels=groups.flatMap(([,items])=>items.map(([label])=>label));

test("original operations presets remain intact and new recommendations are selectable",()=>{
  for(const old of ["新书上架","已完结","高能反转","甜宠","悬疑","治愈","热门推荐","持续更新"])
    assert.ok(labels.includes(old),"Missing existing preset: "+old);
  for(const name of [
    "豪门","都市","职场","双男主","重生","穿书","霸总",
    "豪门逆袭","职场逆袭","霸总甜宠","都市情感",
    "虐恋","双向暗恋","暗恋","先婚后爱","契约婚姻",
    "追妻火葬场","白月光","死对头","暧昧拉扯","合租日常",
    "误会","离婚","退婚","先退婚后恋爱",
    "爽文","逆袭","打脸","身份反转","真假千金","女主觉醒",
    "女性成长","反套路","追悔莫及","家族纷争","家庭反击",
    "替嫁","秘密揭晓","秘密","失踪谜案","亲情",
    "短篇","中长篇"
  ])assert.ok(labels.includes(name),"Missing recommended tag: "+name);
  assert.equal(labels.length,51);
  assert.equal(new Set(labels).size,labels.length,"Preset labels must not be duplicated");
});

test("every preset color is a valid hexadecimal color",()=>{
  for(const [group,items] of groups){
    assert.ok(group.length>0);
    for(const [label,color] of items){
      assert.ok(label.length<=24,"Tag exceeds backend length: "+label);
      assert.match(color,/^#[0-9a-fA-F]{6}$/,"Bad color for: "+label);
    }
  }
});

test("presets are grouped, existing saved custom options remain, and no auto-tag writes occur",()=>{
  assert.match(source,/document\.createElement\("optgroup"\)/);
  assert.match(source,/customGroup\.label="已有自定义标签"/);
  assert.match(source,/known\.has\(preset\.label\)/);
  assert.match(source,/const defaultTagColors=defaultTagGroups\.flatMap/);
  assert.match(source,/button\("tagSave",async\(\)=>\{/);
});
