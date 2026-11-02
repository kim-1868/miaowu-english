import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ids=["heartbreak-mistaken-love","fake-heiress-refuses-game"];
test("S86 two additional completed six chapter private CET4 stories",()=>{
 for(const id of ids){
 const source=readFileSync(new URL("../content/drafts/season-cet4-v1/"+id+".md",import.meta.url),"utf8");
 assert.ok(source.includes("id: "+id));
 assert.ok(source.includes("product: cet4"));
 assert.ok(source.includes("status: PRIVATE_ORIGINAL_FIRST_DRAFT_UNREVIEWED"));
 assert.equal((source.match(/^## 第[1-6]章/gm)||[]).length,6);
 assert.ok((source.match(/\[\[[a-z]+\]\]/g)||[]).length>=90);
 assert.ok(!source.includes("PUBLISHED_TRUE"));
 }
});
