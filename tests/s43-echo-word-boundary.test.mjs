import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

function loadBlank(){
 const src=readFileSync(new URL("../public/echo-cloud.js",import.meta.url),"utf8");
 const hook="window.MiaowuCloudEcho={";
 assert.equal(src.split(hook).length,2,"test should find one export hook");
 // Expose private helper only in this sandbox; don't edit public module exports.
 const sandbox={window:{}};
 runInNewContext(src.replace(hook,"globalThis.__testOnlyBlank=blank;\n"+hook),
  sandbox,{filename:"echo-cloud.js"});
 return sandbox.__testOnlyBlank;
}

test("S43 Cloud Echo masks complete English headword but preserves longer word families",()=>{
 const blank=loadBlank();
 assert.equal(blank({headword:"record",context_sentence:"The record differs from the recording."}),
  "The ______ differs from the recording.");
 assert.equal(blank({headword:"record",context_sentence:"recording record record"}),
  "recording ______ record");
 assert.equal(blank({headword:"contact",context_sentence:"The contact tried to contact us."}),
  "The ______ tried to contact us.");
 assert.equal(blank({headword:"record",context_sentence:"她核查record前先保存recording副本。"}),
  "她核查______前先保存recording副本。");
 assert.equal(blank({headword:"record",context_sentence:"The records were archived."}),
  "根据中文提示找到对应英文：undefined");
});
test("S43 Cloud Echo handles case insensitive matches and avoids breaking narration",()=>{
 const blank=loadBlank();
 assert.equal(blank({headword:"Record",context_sentence:"Record the transfer."}),
  "______ the transfer.");
 assert.equal(blank({headword:"missing",meaning_zh:"缺失的",context_sentence:"There was no gap."}),
  "根据中文提示找到对应英文：缺失的");
});
