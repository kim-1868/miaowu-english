import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,mkdtempSync,statSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {auditRestoredLibrary} from "../scripts/v11-p5-restored-library-audit.mjs";

const schema=readFileSync(new URL("../db/001_schema.sql",import.meta.url),"utf8");
const item=(wordId)=>JSON.stringify({version:1,paragraphs:[{segments:[
 {text:"她找到 "},{wordId,surface:"record",gloss:"记录"},{text:" 一项关键信息。"}
]}]});
const registry={records:[
 {bookId:"ba",title:"已知书目A"},{bookId:"bb",title:"已知书目B"}
]};
function fixture(path=":memory:"){
 const db=new DatabaseSync(path);
 db.exec(schema);
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES"+
  "('u1','PRIVATE_ACCOUNT_NEVER_PRINT','secret-hash','secret-salt')");
 db.exec("INSERT INTO categories(id,slug,title,is_visible) VALUES"+
  "('c4','cet4','四级',1),('c6','cet6','六级',1)");
 db.exec("INSERT INTO books(id,category_id,title,status) VALUES"+
  "('ba','c4','已知书目A','published'),"+
  "('bb','c6','已知书目B','published'),"+
  "('draft','c4','未上架小说','draft')");
 db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh,phonetic_uk,phonetic_us,example_en,example_zh) VALUES"+
  "('wa','record','n.','记录','/ˈrekɔːd/','/ˈrekərd/','A record was kept.','保存了记录。'),"+
  "('wb','record','n.','记录','/ˈrekɔːd/','/ˈrekərd/','The record exists.','记录仍在。'),"+
  "('wc','record','v.','录制','/rɪˈkɔːd/','/rɪˈkɔːrd/','Record the audio.','录制音频。')");
 const ch=db.prepare("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at,is_preview) "+
  "VALUES(?,?,?,?,?,?,?)");
 ch.run("cha","ba",1,"私有章节甲",item("wa"),"2026-10-01 00:00:00",0);
 ch.run("chb","bb",1,"私有章节乙",item("wb"),"2026-10-01 00:00:00",0);
 ch.run("chc","ba",2,"未上架章节",item("wc"),null,0);
 const cx=db.prepare("INSERT INTO chapter_words(chapter_id,word_id,context_anchor,context_sentence) VALUES(?,?,?,?)");
 cx.run("cha","wa","p0:s1","PRIVATE_STORY_CONTEXT_A");
 cx.run("chb","wb","p0:s1","PRIVATE_STORY_CONTEXT_B");
 cx.run("chc","wc","p0:s1","PRIVATE_UNPUBLISHED_STORY_CONTEXT");
 db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('u1','c4')");
 db.exec("INSERT INTO user_words(user_id,word_id,status,bookmarked) VALUES"+
  "('u1','wa','mastered',1)");
 return db;
}
test("P5 restored book audit compares all published metadata and identifies missing publication chapters",()=>{
 const db=fixture();try{
  const {summary:s}=auditRestoredLibrary(db,{historicRegistry:registry});
  assert.equal(s.totalPublishedBooks,2);
  assert.equal(s.historicSnapshotBookCount,2);
  assert.equal(s.sameAsHistoricBookInventory,true);
  assert.equal(s.totalChapters,3);
  assert.equal(s.publishedChapters,2);
  assert.equal(s.notPublishedChapters,1);
  assert.equal(s.totalWordMentions,3);
  assert.equal(s.chapterWordIndexes,3);
  assert.equal(s.missingReferencedWordIds,0);
  assert.equal(s.unindexedMentions,0);
  assert.equal(s.unmatchedIndexedAnchors,0);
  assert.equal(s.differentWordIdsCrossBookSenseCandidates,1);
  assert.match(s.fingerprintForHumanReview,/^[a-f0-9]{64}$/);
  assert.equal(s.userHistoriesInspected,false);
  assert.equal(s.automaticMappingEnabled,false);
  assert.equal(s.productionD1Accessed,false);
 }finally{db.close()}
});
test("P5 standard stdout summary hides chapters, user identifiers, story prose and book titles",()=>{
 const db=fixture();try{
  const {summary:s}=auditRestoredLibrary(db,{historicRegistry:registry});
  const safe=JSON.stringify(s);
  for(const privateValue of ["PRIVATE_STORY_CONTEXT_A","PRIVATE_STORY_CONTEXT_B",
   "PRIVATE_UNPUBLISHED_STORY_CONTEXT","PRIVATE_ACCOUNT_NEVER_PRINT",
   "secret-hash","已知书目A","私有章节甲","wa","u1"])
   assert.ok(!safe.includes('"'+privateValue+'"'),privateValue);
 }finally{db.close()}
});
test("P5 private review queue is explicit, includes grounded separate POS, and never approves merges",()=>{
 const db=fixture();try{
  const {summary,privateQueue}=auditRestoredLibrary(db,{
   historicRegistry:registry,includePrivateQueue:true
  });
  assert.equal(privateQueue.status,"HUMAN_SEMANTIC_REVIEW_REQUIRED_NO_AUTO_APPROVAL");
  assert.equal(privateQueue.snapshotFingerprint,summary.fingerprintForHumanReview);
  assert.equal(privateQueue.candidates.length,1);
  assert.deepEqual(privateQueue.candidates[0].wordIds,["wa","wb"]);
  assert.ok(JSON.stringify(privateQueue).includes("PRIVATE_STORY_CONTEXT_A"));
  assert.ok(JSON.stringify(privateQueue).includes("PRIVATE_STORY_CONTEXT_B"));
  assert.ok(!privateQueue.candidates[0].wordIds.includes("wc"));
  assert.ok(!JSON.stringify(privateQueue).includes("PRIVATE_ACCOUNT_NEVER_PRINT"));
  assert.equal(summary.automaticReleaseApproved,false);
 }finally{db.close()}
});
test("P5 chapter-word anchor mismatch, unindexed text and missing word card are reported, not silently swallowed",()=>{
 const db=fixture();try{
  db.prepare("UPDATE chapters SET content_json=? WHERE id='cha'").run(item("missing-word"));
  db.exec("UPDATE chapter_words SET context_anchor='p0:s5' WHERE chapter_id='chb'");
  const {summary:s}=auditRestoredLibrary(db,{historicRegistry:registry});
  assert.equal(s.missingReferencedWordIds,1);
  assert.ok(s.unindexedMentions>=2);
  assert.equal(s.unmatchedIndexedAnchors,2);
 }finally{db.close()}
});
test("P5 missing historic book, additional published book and empty context block a full-coverage claim",()=>{
 const db=fixture();try{
  db.exec("UPDATE books SET status='draft' WHERE id='bb'");
  db.exec("UPDATE chapter_words SET context_sentence=' ' WHERE word_id='wa'");
  const r=auditRestoredLibrary(db,{historicRegistry:registry});
  assert.equal(r.summary.sameAsHistoricBookInventory,false);
  assert.equal(r.summary.missingHistoricPublishedCount,1);
  assert.equal(r.summary.emptyContextSentences,1);
 }finally{db.close()}
});
test("P5 all reads turn SQLite query_only on; original learning and entitlement data remain unchanged",()=>{
 const db=fixture();try{
  const before=db.prepare("SELECT * FROM user_words").all();
  auditRestoredLibrary(db,{historicRegistry:registry});
  assert.deepEqual(db.prepare("SELECT * FROM user_words").all(),before);
  assert.equal(db.prepare("PRAGMA query_only").get().query_only,1);
  assert.throws(()=>db.exec("DELETE FROM user_words"),/readonly|read-only/i);
 }finally{db.close()}
});
test("P5 actual CLI only prints aggregates; private evidence stays in a mode 0600 owner file outside repo",()=>{
 const dir=mkdtempSync(join(tmpdir(),"mw-restored-library-"));
 const path=join(dir,"private-copy.sqlite"),privatePath=join(dir,"owner-review.json");
 try{
  const db=fixture(path);db.close();
  const script=resolve(new URL("../scripts/v11-p5-restored-library-audit.mjs",import.meta.url).pathname);
  // CLI default uses the full historic list and therefore reports a mismatch
  // for this 2-book synthetic fixture. It must never assert 23-book signoff.
  const p=spawnSync(process.execPath,["--experimental-sqlite",script,
   "--local-sqlite",path,"--private-review-queue",privatePath],
   {encoding:"utf8",timeout:30000});
  assert.equal(p.status,0,p.stderr);
  const summary=JSON.parse(p.stdout);
  assert.equal(summary.totalPublishedBooks,2);
  assert.equal(summary.sameAsHistoricBookInventory,false);
  assert.equal(summary.productionD1Accessed,false);
  assert.ok(existsSync(privatePath));
  assert.equal(statSync(privatePath).mode&0o777,0o600);
  assert.ok(readFileSync(privatePath,"utf8").includes("PRIVATE_STORY_CONTEXT_A"));
  assert.ok(!p.stdout.includes("PRIVATE_STORY_CONTEXT_A"));
  assert.ok(!p.stdout.includes("PRIVATE_ACCOUNT_NEVER_PRINT"));
  const retry=spawnSync(process.execPath,["--experimental-sqlite",script,
   "--local-sqlite",path,"--private-review-queue",privatePath],
   {encoding:"utf8",timeout:30000});
  assert.notEqual(retry.status,0,"no private file overwrite");
  assert.ok(!retry.stderr.includes("PRIVATE_STORY_CONTEXT_A"));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("P5 restored audit never imports Worker routes, user tokens, or Cloudflare credentials",()=>{
 const code=readFileSync(new URL("../scripts/v11-p5-restored-library-audit.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(code,/wrangler|CLOUDFLARE_API_TOKEN|fetch\s*\(|execSync\s*\(|spawn\s*\(/);
 const db=fixture();try{
  assert.equal(auditRestoredLibrary(db,{historicRegistry:registry}).summary.humanSenseReviewComplete,false);
 }finally{db.close()}
});

test("P5 strict structural gate blocks unpublished chapters and missing teaching metadata, but not legal human signoff",()=>{
 const db=fixture();try{
  const original=auditRestoredLibrary(db,{historicRegistry:registry});
  assert.equal(original.summary.technicalContentReady,false);
  assert.ok(original.summary.technicalBlockerCodes.includes("PUBLISHED_BOOK_HAS_UNPUBLISHED_CHAPTER"));
 }finally{db.close()}
 const db2=fixture();try{
  db2.exec("UPDATE chapters SET published_at='2026-10-01 00:00:00' WHERE id='chc'");
  const clean=auditRestoredLibrary(db2,{historicRegistry:registry});
  assert.equal(clean.summary.technicalContentReady,true);
  assert.deepEqual(clean.summary.technicalBlockerCodes,[]);
  assert.equal(clean.summary.humanSenseReviewComplete,false,
   "structural check cannot replace semantic review");
 }finally{db2.close()}
 const db3=fixture();try{
  db3.exec("UPDATE chapters SET published_at='2026-10-01 00:00:00' WHERE id='chc'");
  db3.exec("UPDATE words SET example_en=NULL WHERE id='wb'");
  const missing=auditRestoredLibrary(db3,{historicRegistry:registry});
  assert.equal(missing.summary.technicalContentReady,false);
  assert.ok(missing.summary.technicalBlockerCodes.includes("MISSING_ENGLISH_EXAMPLE"));
 }finally{db3.close()}
});
test("P5 CLI --require-clean-content exits nonzero on incomplete published novel",()=>{
 const dir=mkdtempSync(join(tmpdir(),"mw-restored-strict-"));
 const path=join(dir,"private.sqlite");
 try{
  const db=fixture(path);db.close();
  const script=resolve(new URL("../scripts/v11-p5-restored-library-audit.mjs",import.meta.url).pathname);
  const p=spawnSync(process.execPath,["--experimental-sqlite",script,
   "--local-sqlite",path,"--require-clean-content"],
   {encoding:"utf8",timeout:30000});
  assert.equal(p.status,1);
  assert.equal(JSON.parse(p.stdout).technicalContentReady,false);
  assert.ok(!p.stdout.includes("PRIVATE_STORY_CONTEXT"));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
