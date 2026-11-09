import test from "node:test";
import assert from "node:assert/strict";
import {createLocalFreshSchema} from "../scripts/check-production-fresh-schema.mjs";
import {prepareRainyNightMemberCandidate} from "../scripts/prepare-rainy-night-member-candidate.mjs";
import {buildRainyNightFullDensityReviewDraft} from "../scripts/assemble-rainy-night-high-density-review-draft.mjs";
import {generateSql} from "../scripts/build-content-import.mjs";
import {validatePackage} from "../src/editorial-content.js";
import {planDraftRevision} from "../src/ops-draft-revision.js";
function prepare(){
 const {db}=createLocalFreshSchema();
 db.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES(?,?,?,?,?)")
  .run("ops-publisher","Test publisher","publisher","production","a".repeat(64));
 const original=prepareRainyNightMemberCandidate().candidate;
 db.exec(generateSql(original).sql);
 const all=db.prepare("SELECT id,chapter_no,title,content_json,is_preview,published_at FROM chapters ORDER BY chapter_no").all();
 const book=db.prepare("SELECT id,title,status,category_id FROM books WHERE id=?").get(original.book.id);
 const words=db.prepare("SELECT * FROM words").all();
 const version=db.prepare("SELECT version FROM ops_book_content_versions WHERE book_id=?").get(book.id).version;
 const {draft}=buildRainyNightFullDensityReviewDraft();
 draft.words.forEach(w=>{w.phoneticUk="/ˈtɛst/";w.phoneticUs="/ˈtɛst/"});
 const options={validated:validatePackage(draft),originalBook:book,
  originalChapters:all,originalWords:words,externalWordIds:[],expectedVersion:version,
  actorId:"ops-publisher",requestId:"revision_test_12345678"};
 return {db,options,draft,original};
}
function batch(db,statements){
 db.exec("BEGIN");
 try{for(const x of statements)db.prepare(x.sql).run(...x.params);db.exec("COMMIT")}
 catch(e){db.exec("ROLLBACK");throw e}
}
test("S123 the existing Rainy Night draft can be replaced atomically without replacing user IDs or publishing",()=>{
 const {db,options,original}=prepare();
 try{
  const {statements,summary}=planDraftRevision(options);
  assert.equal(summary.chapters,12);
  assert.equal(summary.newAnchors,1892);
  assert.equal(summary.wordCards,188);
  assert.equal(summary.remainsUnpublished,true);
  assert.equal(summary.approvalInvalidated,true);
  assert.ok(statements.every(x=>x.params.length<=100));
  assert.ok(statements.every(x=>!/\bUPDATE (?:users|entitlements|activation_codes|reading_progress|user_words)\b/i.test(x.sql)));
  batch(db,statements);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM chapter_words").get().n,1892);
  assert.equal(db.prepare("SELECT status FROM books WHERE id=?").get(original.book.id).status,"draft");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM chapters WHERE published_at IS NOT NULL").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM words WHERE phonetic_uk IS NULL OR phonetic_us IS NULL").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ops_audit_events WHERE event_type='book.revise'").get().n,1);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM entitlements").get().n,0);
 }finally{db.close()}
});
test("S123 published books, changed chapter IDs or removed original word anchors fail closed",()=>{
 const {db,options}=prepare();
 try{
  const published=structuredClone(options);published.originalBook.status="published";
  assert.throws(()=>planDraftRevision(published),/BOOK_NOT_SAME_DRAFT/);
  const altered=structuredClone(options);altered.validated.chapters[0].id="fake-chapter";
  assert.throws(()=>planDraftRevision(altered),/CHAPTER_ID_OR_ORDER_CHANGED/);
  const missing=structuredClone(options);
  const first=missing.validated.chapters[0].paragraphs[0];
  first.segments=first.segments.filter(s=>!s.wordId);
  assert.throws(()=>planDraftRevision(missing),/ORIGINAL_STUDY_ANCHOR_REMOVED/);
 }finally{db.close()}
});
test("S123 stale editor version cannot accidentally overwrite someone else's newer draft",()=>{
 const {db,options,original}=prepare();
 try{
  const {statements}=planDraftRevision(options);
  db.prepare("UPDATE chapters SET title=? WHERE id=?").run("A newer editor saved first",original.chapters[0].id);
  const before=db.prepare("SELECT content_json FROM chapters WHERE id=?").get(original.chapters[0].id).content_json;
  assert.throws(()=>batch(db,statements),/UNIQUE constraint failed/);
  const after=db.prepare("SELECT content_json FROM chapters WHERE id=?").get(original.chapters[0].id).content_json;
  assert.equal(after,before);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM chapter_words").get().n,733);
 }finally{db.close()}
});


test("S123 unpublished never-studied drafts may be fully reflowed without renumbering chapters or removing known word identities",()=>{
 const {db,options}=prepare();
 try{
  const rewritten=structuredClone(options);
  rewritten.validated.chapters[0].paragraphs.unshift({segments:[{text:"新增的自然段，不改变任何原来的学习词。"}]});
  assert.throws(()=>planDraftRevision(rewritten),/PARAGRAPH_SHAPE_CHANGED/);
  rewritten.allowSafeReflow=true;
  const planned=planDraftRevision(rewritten);
  assert.equal(planned.summary.remainsUnpublished,true);
  batch(db,planned.statements);
  assert.equal(db.prepare("SELECT status FROM books WHERE id=?").get(rewritten.validated.book.id).status,"draft");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM chapters WHERE published_at IS NOT NULL").get().n,0);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
 }finally{db.close()}
});

test("S123 safe full-book reflow may remove obsolete anchors while keeping the word row",()=>{
 const {db,options}=prepare();
 try{
  const rewritten=structuredClone(options);
  const old=JSON.parse(options.originalChapters[0].content_json);
  const id=old.paragraphs.flatMap(p=>p.segments).find(s=>s.wordId)?.wordId;
  assert.ok(id);
  for(const chapter of rewritten.validated.chapters)
   for(const paragraph of chapter.paragraphs)
    paragraph.segments=paragraph.segments.filter(s=>s.wordId!==id);
  // Real HTTP import revalidates the candidate and recomputes mentionCount;
  // the synthetic test mutates validated data directly, so mirror that step.
  rewritten.validated.mentionCount=rewritten.validated.chapters.reduce(
   (sum,ch)=>sum+ch.paragraphs.reduce((n,p)=>n+p.segments.filter(s=>s.wordId).length,0),0);
  // Without explicit safe-history approval, the original guard still rejects.
  assert.throws(()=>planDraftRevision(rewritten),/ORIGINAL_STUDY_ANCHOR_REMOVED/);
  rewritten.allowSafeReflow=true;
  const revised=planDraftRevision(rewritten);
  assert.ok(revised.statements.every(x=>!/DELETE\\s+FROM\\s+(?:words|user_words|reading_progress|review_events)/i.test(x.sql)));
  batch(db,revised.statements);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM chapter_words WHERE word_id=?").get(id).n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM words WHERE id=?").get(id).n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM chapters WHERE published_at IS NOT NULL").get().n,0);
 }finally{db.close()}
});

test("S123 withdrawn published-history draft can be rewritten only with explicit authorization and backup",()=>{
 const {db,options,original}=prepare();
 try{
  db.exec(`CREATE TABLE IF NOT EXISTS ops_live_book_versions(
   id TEXT PRIMARY KEY,book_id TEXT NOT NULL,actor_id TEXT NOT NULL,
   action TEXT NOT NULL CHECK(action IN ('metadata','content','restore')),
   request_id TEXT UNIQUE,base_version INTEGER NOT NULL,snapshot_json TEXT NOT NULL,
   summary_json TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  db.prepare("INSERT INTO ops_audit_events(id,actor_id,event_type,resource_type,resource_id,request_id,reason_code) VALUES(?,?,?,?,?,?,?)")
   .run("history-withdraw-001","ops-publisher","book.withdraw","book",original.book.id,"history_withdraw_req","CONFIRMED");
  const candidate=structuredClone(original);
  candidate.chapters[0].paragraphs.unshift({segments:[{text:"这是不包含旧标注的新开篇。"}]});
  const changed={...options,validated:validatePackage(candidate),allowSafeReflow:true,
   withdrawnHistory:true,previousAnchors:db.prepare("SELECT * FROM chapter_words").all(),
   previousDescription:"旧版内容"};
  const wrong=structuredClone(changed);wrong.allowSafeReflow=false;
  assert.throws(()=>planDraftRevision(wrong),/PARAGRAPH_SHAPE_CHANGED|WITHDRAWN_REVISION_NOT_SAFE/);
  const changedCard=structuredClone(changed);
  changedCard.validated.words[0].meaningZh="错误修改的历史释义";
  assert.throws(()=>planDraftRevision(changedCard),/HISTORICAL_WORD_CARD_CHANGED/);
  const planned=planDraftRevision(changed);
  assert.ok(planned.statements.some(x=>x.sql.includes("ops_live_book_versions")));
  assert.ok(planned.statements.every(x=>!/DELETE\\s+FROM\\s+(?:words|user_words|reading_progress|review_events)/i.test(x.sql)));
  batch(db,planned.statements);
  const backup=db.prepare("SELECT * FROM ops_live_book_versions").get();
  assert.equal(backup.action,"content");
  assert.equal(JSON.parse(backup.snapshot_json).book.id,original.book.id);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM chapters WHERE published_at IS NOT NULL").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM words").get().n>0,true);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
 }finally{db.close()}
});
