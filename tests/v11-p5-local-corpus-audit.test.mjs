import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditLocalPublishedPackages} from "../scripts/v11-p5-local-corpus-audit.mjs";

const read=path=>JSON.parse(readFileSync(new URL("../"+path,import.meta.url),"utf8"));
const original=()=>[
 {file:"original-A.json",record:read("content/release-packages/20261104-ex-husband-business-client-FIXED-LEXICON-IDS.json")},
 {file:"original-B.json",record:read("content/release-packages/20261104-substitute-bride-tears-contract-FIXED-LEXICON-IDS.json")}
];
test("P5 actually available local corpus has 23 metadata titles but only 2 full release packages, not all D1 books",()=>{
 const r=auditLocalPublishedPackages();
 assert.equal(r.publishedMetadataTitles,23);
 assert.equal(r.availableFullPackageFiles,2);
 assert.equal(r.titleMatchedToMetadata,2);
 assert.equal(r.metadataTitlesWithoutRepositoryPackages,21);
 assert.equal(r.wordIdsUsedAcrossMultiplePackages,38);
 assert.equal(r.conflictingSharedWordIdDefinitions,0);
 assert.equal(r.missingReferencedWordIds,0);
 assert.equal(r.hasCompleteCurrentPublishedCorpus,false);
 assert.equal(r.actualUserHistoryAudited,false);
 assert.equal(r.permissionToAutoMergeOldCards,false);
 assert.equal(r.verdict,"PARTIAL_REPOSITORY_CONTENT_ONLY_NOT_23_BOOK_SIGNOFF");
});
test("P5 detects definition drift for same old wordId across two real-package structures without changing original files",()=>{
 const packages=original();
 const shared=packages[0].record.words[0].id;
 const same=packages[1].record.words.find(w=>w.id===shared);
 if(!same){
  const id=packages[0].record.words.find(w=>packages[1].record.words.some(b=>b.id===w.id))?.id;
  assert.ok(id);
  packages[1].record.words.find(w=>w.id===id).meaningZh="新的另一义项";
 }else same.meaningZh="新的另一义项";
 const r=auditLocalPublishedPackages({packages});
 assert.equal(r.conflictingSharedWordIdDefinitions,1);
 assert.equal(r.permissionToAutoMergeOldCards,false);
});
test("P5 flags missing referenced word IDs instead of quietly dropping prose vocabulary",()=>{
 const packages=original();
 const ch=packages[0].record.chapters[0];
 const paragraph=ch.paragraphs.find(p=>p.segments.some(s=>s.wordId));
 const item=paragraph.segments.find(s=>s.wordId);
 item.wordId="not-existing-word-id";
 const r=auditLocalPublishedPackages({packages});
 assert.equal(r.missingReferencedWordIds,1);
});
test("P5 rejects duplicate book package titles, prevents silent inventory overwrite",()=>{
 const packages=original();
 packages[1].record.book.title=packages[0].record.book.title;
 assert.throws(()=>auditLocalPublishedPackages({packages}),/LOCAL_RELEASE_PACKAGE_DUPLICATE_TITLE/);
});
test("P5 report has aggregate-only data, cannot claim 23-book or professional language review",()=>{
 const r=auditLocalPublishedPackages();
 const output=JSON.stringify(r);
 assert.ok(!output.includes("paragraphs"));
 assert.ok(!output.includes("sentence"));
 assert.equal(r.semanticContextHumanReviewed,false);
 assert.equal(r.productionD1Accessed,false);
 assert.equal(r.hasCompleteCurrentPublishedCorpus,false);
});
