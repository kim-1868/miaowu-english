import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../src/worker.js";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const sample=JSON.parse(read("../content/examples/cet4-sample-draft.json"));
const url="https://staging.example";
const EDITOR_KEY="independent-test-editor-secret-of-fifty-characters-2026";
const PREVIEW_KEY="staging-test-preview-password-for-tests-2026";
const PEPPER="staging-test-activation-pepper-with-32-plus-characters";
function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  for(const x of ["../db/001_schema.sql","../db/002_s1.sql","../db/003_public_categories.sql","../db/004_editorial_content.sql","../db/005_editorial_revisions.sql","../db/006_editorial_review_signoffs.sql"])sqlite.exec(read(x));
  const bindable=query=>({
    bind(...params){const statement=sqlite.prepare(query);return {
      async first(){return statement.get(...params)??null},
      async all(){return {results:statement.all(...params)}},
      async run(){return statement.run(...params)}
    }},
    async first(){return sqlite.prepare(query).get()??null},
    async all(){return {results:sqlite.prepare(query).all()}}
  });
  const DB={prepare:bindable, async batch(items){
    sqlite.exec("BEGIN");
    try{const results=[];for(const x of items)results.push(await x.run());sqlite.exec("COMMIT");return results}
    catch(e){sqlite.exec("ROLLBACK");throw e}
  }};
  return {sqlite,DB,APP_ENV:"staging",S3_EDITOR_SECRET:EDITOR_KEY,
    STAGING_PREVIEW_PASSWORD:PREVIEW_KEY,ACTIVATION_PEPPER:PEPPER};
}
const basic="Basic "+Buffer.from("reviewer:"+PREVIEW_KEY).toString("base64");
async function call(env,path,method="GET",body,opts={}){
  const headers={Authorization:basic,Origin:url,...opts.headers};
  if(body!==undefined)headers["Content-Type"]="application/json";
  return worker.fetch(new Request(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
}
test("S3 editor rejects unconfigured secret, missing editor key, and production environment",async()=>{
  const env=fixture();
  const route="/api/staging/editor/drafts";
  assert.equal((await call({...env,S3_EDITOR_SECRET:undefined},route,"GET",undefined,
    {headers:{"X-Mw-Editor-Key":EDITOR_KEY}})).status,503);
  assert.equal((await call(env,route)).status,403);
  assert.equal((await call(env,route,"GET",undefined,{headers:{"X-Mw-Editor-Key":PREVIEW_KEY}})).status,403);
  assert.equal((await call(env,route,"GET",undefined,{headers:{"X-Mw-Editor-Key":EDITOR_KEY}})).status,200);
  assert.equal((await call({...env,APP_ENV:"production"},route,"GET",undefined,
    {headers:{"X-Mw-Editor-Key":EDITOR_KEY}})).status,404);
  assert.equal((await worker.fetch(new Request(url+route,{headers:{"X-Mw-Editor-Key":EDITOR_KEY}}),env)).status,401);
});
test("S3 private editor inserts new draft, previews full annotated chapters, and never publishes",async()=>{
  const env=fixture();
  const headers={"X-Mw-Editor-Key":EDITOR_KEY};
  const res=await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers});
  assert.equal(res.status,201,await res.clone().text());
  assert.equal((await res.json()).publication,"draft-only");
  const list=await call(env,"/api/staging/editor/drafts","GET",undefined,{headers});
  const items=(await list.json()).drafts;
  assert.equal(items.length,1);assert.equal(items[0].chapter_count,2);
  const preview=await call(env,"/api/staging/editor/drafts/sample-cet4-letter","GET",undefined,{headers});
  assert.equal(preview.status,200);
  const response=await preview.json();
  assert.equal(response.chapters.length,2);
  assert.equal(response.chapters[0].content.paragraphs[0].segments[1].surface,"hesitate");
  assert.equal(response.words.length,2);
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM content_packages").get().n,1);
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM chapter_words").get().n,4);
  assert.equal(env.sqlite.prepare("SELECT status FROM books WHERE id='sample-cet4-letter'").get().status,"draft");
  assert.equal(env.sqlite.prepare("SELECT published_at FROM chapters WHERE id='sample-letter-ch1'").get().published_at,null);
  const publicBooks=await call(env,"/api/books?category=cet4");
  assert.equal((await publicBooks.json()).books.some(x=>x.id==="sample-cet4-letter"),false);
  assert.equal((await call(env,"/api/chapters/sample-letter-ch1")).status,404);
  const another=await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers});
  assert.equal(another.status,409);
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM books WHERE id='sample-cet4-letter'").get().n,1);
});
test("S3 private editor never allows foreign-origin writes, conflicting vocab IDs or invalid word references",async()=>{
  const env=fixture();const headers={"X-Mw-Editor-Key":EDITOR_KEY};
  const originRequest=await call(env,"/api/staging/editor/drafts","POST",{package:sample},
    {headers:{...headers,Origin:"https://evil.example"}});
  assert.equal(originRequest.status,403);
  const malformed=structuredClone(sample);
  malformed.chapters[0].paragraphs[0].segments[1].wordId="word-that-does-not-exist";
  const fail=await call(env,"/api/staging/editor/drafts","POST",{package:malformed},{headers});
  assert.equal(fail.status,400);
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM books").get().n,0);
  const prior=await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers});
  assert.equal(prior.status,201);
  const variant=structuredClone(sample);
  variant.book.id="sample-cet4-letter-2";
  variant.chapters.forEach((c,i)=>c.id="sample-letter-x"+(i+1));
  variant.words[0].meaningZh="故意与原词库冲突的错误释义";
  const wrong=await call(env,"/api/staging/editor/drafts","POST",{package:variant},{headers});
  assert.equal(wrong.status,409);
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM books").get().n,1);
  const unauthorized=await call(env,"/api/staging/editor/drafts/sample-cet4-letter","GET");
  assert.equal(unauthorized.status,403);
  assert.equal(JSON.stringify(await unauthorized.json()).includes("hesitate"),false);
});

test("S3 editor checker returns JSON and verifies D1 schema, without revealing editor secret",async()=>{
  const env=fixture(),key={"X-Mw-Editor-Key":EDITOR_KEY};
  const checked=await call(env,"/api/staging/editor/check","GET",undefined,{headers:key});
  assert.equal(checked.status,200);
  assert.match(checked.headers.get("content-type"),/application\/json/);
  const data=await checked.json();
  assert.deepEqual({ok:data.ok,schemaReady:data.schemaReady,missingTables:data.missingTables},
    {ok:true,schemaReady:true,missingTables:[]});
  assert.equal(JSON.stringify(data).includes(EDITOR_KEY),false);
  assert.equal((await call(env,"/api/staging/editor/check")).status,403);
  const envNoEditor={...env,S3_EDITOR_SECRET:undefined};
  const missingSecret=await call(envNoEditor,"/api/staging/editor/check","GET",undefined,{headers:key});
  assert.equal(missingSecret.status,503);
  assert.equal((await missingSecret.json()).error,"EDITOR_NOT_CONFIGURED");
  assert.equal((await call({...env,APP_ENV:"production"},"/api/staging/editor/check","GET",undefined,{headers:key})).status,404);
});

test("S3 editor reports consistent JSON when D1 table missing or query fails",async()=>{
  const env=fixture(),key={"X-Mw-Editor-Key":EDITOR_KEY};
  env.sqlite.exec("DROP TABLE content_packages");
  const checker=await call(env,"/api/staging/editor/check","GET",undefined,{headers:key});
  assert.equal(checker.status,503);
  const checked=await checker.json();
  assert.equal(checked.schemaReady,false);
  assert.deepEqual(checked.missingTables,["content_packages"]);
  const listing=await call(env,"/api/staging/editor/drafts","GET",undefined,{headers:key});
  assert.equal(listing.status,200); // Listing uses books and chapter_words, independent of content_packages.
  env.sqlite.exec("DROP TABLE books");
  const failed=await call(env,"/api/staging/editor/drafts","GET",undefined,{headers:key});
  assert.equal(failed.status,500);
  assert.match(failed.headers.get("content-type"),/application\/json/);
  const result=await failed.json();
  assert.deepEqual(result,{error:"EDITOR_BACKEND_ERROR",diagnosticStage:"drafts.list"});
  assert.equal(JSON.stringify(result).includes(EDITOR_KEY),false);
});

test("S3 B2 chapter edits rebuild word anchors, keep old snapshot, and support non-destructive restoration",async()=>{
  const env=fixture(),headers={"X-Mw-Editor-Key":EDITOR_KEY};
  assert.equal((await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers})).status,201);
  const preview=await call(env,"/api/staging/editor/drafts/sample-cet4-letter","GET",undefined,{headers});
  const first=(await preview.json()).chapters[0];
  assert.match(first.version,/^[a-f0-9]{64}$/);
  const para=structuredClone(first.content.paragraphs);
  para[0].segments[0].text="她盯着窗台上的信封，";
  const body={title:"修改后的第一章",preview:true,paragraphs:para,expectedVersion:first.version};
  const route="/api/staging/editor/drafts/sample-cet4-letter/chapters/sample-letter-ch1";
  const save=await call(env,route,"PUT",body,{headers});
  assert.equal(save.status,200,await save.clone().text());
  const result=await save.json();
  assert.equal(result.saved,true);
  assert.notEqual(result.version,first.version);
  const state=env.sqlite.prepare("SELECT title,content_json,published_at FROM chapters WHERE id='sample-letter-ch1'").get();
  assert.equal(state.title,"修改后的第一章");
  assert.equal(state.published_at,null);
  assert.equal(JSON.parse(state.content_json).paragraphs[0].segments[0].text,"她盯着窗台上的信封，");
  const contexts=env.sqlite.prepare("SELECT context_sentence FROM chapter_words WHERE chapter_id='sample-letter-ch1' ORDER BY context_anchor").all();
  assert.equal(contexts.length,2);
  assert.match(contexts[0].context_sentence,/窗台上的信封/);
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM editorial_revisions").get().n,1);
  const stale=await call(env,route,"PUT",body,{headers});
  assert.equal(stale.status,409);
  assert.equal((await stale.json()).error,"EDIT_CONFLICT");
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM editorial_revisions").get().n,1);
  const history=await call(env,"/api/staging/editor/drafts/sample-cet4-letter/revisions/chapter/sample-letter-ch1","GET",undefined,{headers});
  assert.equal(history.status,200);
  const records=(await history.json()).revisions;
  assert.equal(records.length,1);
  assert.equal(records[0].snapshot.title,first.title);
  assert.equal(records[0].version,first.version);
  const restore=await call(env,route,"PUT",{...records[0].snapshot,expectedVersion:result.version},{headers});
  assert.equal(restore.status,200);
  assert.equal(env.sqlite.prepare("SELECT title FROM chapters WHERE id='sample-letter-ch1'").get().title,first.title);
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM editorial_revisions").get().n,2);
  assert.equal((await call(env,route,"PUT",body)).status,403);
  env.sqlite.exec("UPDATE books SET status='published' WHERE id='sample-cet4-letter'");
  const locked=await call(env,route,"PUT",{...body,expectedVersion:(await restore.json()).version},{headers});
  assert.equal(locked.status,404);
});

test("S3 B2 word edits are revisioned; shared, invalid, and published words stay protected",async()=>{
  const env=fixture(),headers={"X-Mw-Editor-Key":EDITOR_KEY};
  await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers});
  const data=await (await call(env,"/api/staging/editor/drafts/sample-cet4-letter","GET",undefined,{headers})).json();
  const old=data.words.find(x=>x.id==="cet4-hesitate");
  assert.match(old.version,/^[a-f0-9]{64}$/);
  const urlWord="/api/staging/editor/drafts/sample-cet4-letter/words/cet4-hesitate";
  const payload={
    expectedVersion:old.version,
    headword:old.headword,meaningZh:"犹豫；迟疑；还没有决定",
    phoneticUk:old.phonetic_uk||"",phoneticUs:old.phonetic_us||"",
    partOfSpeech:old.part_of_speech||"",exampleEn:old.example_en||"",
    exampleZh:old.example_zh||"",collocations:old.collocations
  };
  const saved=await call(env,urlWord,"PUT",payload,{headers});
  assert.equal(saved.status,200,await saved.clone().text());
  const newData=await saved.json();
  assert.equal(env.sqlite.prepare("SELECT meaning_zh FROM words WHERE id='cet4-hesitate'").get().meaning_zh,
    "犹豫；迟疑；还没有决定");
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM editorial_revisions").get().n,1);
  assert.equal((await call(env,urlWord,"PUT",payload,{headers})).status,409);
  const history=await (await call(env,
    "/api/staging/editor/drafts/sample-cet4-letter/revisions/word/cet4-hesitate","GET",undefined,{headers})).json();
  assert.equal(history.revisions[0].snapshot.meaningZh,"犹豫；迟疑");
  const bad=await call(env,urlWord,"PUT",{...payload,expectedVersion:newData.version,headword:""},{headers});
  assert.equal(bad.status,400);
  const published=structuredClone(sample);
  published.book.id="another-cet4-draft";
  published.chapters.forEach((x,i)=>x.id="another-chapter-"+(i+1));
  // Existing definitions must match before they can be linked by a second draft.
  published.words[0].meaningZh="犹豫；迟疑；还没有决定";
  assert.equal((await call(env,"/api/staging/editor/drafts","POST",{package:published},{headers})).status,201);
  const shared=await call(env,urlWord,"PUT",{...payload,expectedVersion:newData.version,meaningZh:"编辑受保护"},{headers});
  assert.equal(shared.status,409);
  assert.equal((await shared.json()).error,"SHARED_WORD_LOCKED");
  assert.equal(env.sqlite.prepare("SELECT meaning_zh FROM words WHERE id='cet4-hesitate'").get().meaning_zh,
    "犹豫；迟疑；还没有决定");
});

test("S3 B2 edit routes fail closed before additive 005 migration, while older preview stays usable",async()=>{
  const env=fixture(),headers={"X-Mw-Editor-Key":EDITOR_KEY};
  await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers});
  env.sqlite.exec("DROP TABLE editorial_revisions");
  const page=await call(env,"/api/staging/editor/drafts/sample-cet4-letter","GET",undefined,{headers});
  assert.equal(page.status,200);
  const details=await page.json();
  const blocked=await call(env,"/api/staging/editor/drafts/sample-cet4-letter/chapters/sample-letter-ch1",
    "PUT",{title:"new",preview:true,paragraphs:details.chapters[0].content.paragraphs,
      expectedVersion:details.chapters[0].version},{headers});
  assert.equal(blocked.status,503);
  assert.equal((await blocked.json()).error,"EDITOR_REVISION_SCHEMA_REQUIRED");
  const health=await (await call(env,"/api/staging/editor/check","GET",undefined,{headers})).json();
  assert.equal(health.ok,true);
  assert.equal(health.revisionsSchemaReady,false);
});

test("S3 C1 QA report stays private, read-only and never publishes",async()=>{
  const env=fixture(),headers={"X-Mw-Editor-Key":EDITOR_KEY};
  const created=await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers});
  assert.equal(created.status,201);
  const path="/api/staging/editor/drafts/sample-cet4-letter/review";
  const noEditor=await call(env,path,"GET");
  assert.equal(noEditor.status,403);
  assert.equal((await noEditor.json()).error,"EDITOR_FORBIDDEN");
  const before=env.sqlite.prepare("SELECT status FROM books WHERE id=?").get("sample-cet4-letter").status;
  const chaptersBefore=env.sqlite.prepare("SELECT count(*) AS n FROM chapters WHERE published_at IS NOT NULL").get().n;
  const revisionsBefore=env.sqlite.prepare("SELECT count(*) AS n FROM editorial_revisions").get().n;
  const response=await call(env,path,"GET",undefined,{headers});
  assert.equal(response.status,200,await response.clone().text());
  const review=await response.json();
  assert.equal(review.book.title,sample.book.title);
  assert.deepEqual(review.metrics,{chapters:2,previewChapters:1,paidChapters:1,
    distinctWords:2,wordOccurrences:4});
  assert.equal(review.technicalCheckPassed,true);
  assert.equal(review.blockerCount,0);
  assert.equal(review.publicationEnabled,false);
  assert.equal(review.manualChecks.length,3);
  assert.ok(review.warningCount>0);
  assert.equal(env.sqlite.prepare("SELECT status FROM books WHERE id=?").get("sample-cet4-letter").status,before);
  assert.equal(env.sqlite.prepare("SELECT count(*) AS n FROM chapters WHERE published_at IS NOT NULL").get().n,chaptersBefore);
  assert.equal(env.sqlite.prepare("SELECT count(*) AS n FROM editorial_revisions").get().n,revisionsBefore);
  assert.equal((await call({...env,APP_ENV:"production"},path,"GET",undefined,{headers})).status,404);
  assert.equal((await worker.fetch(new Request(url+path,{headers}),env)).status,401);
});

test("S3 C1 catches missing free previews, broken word anchors and nonsequential chapters",async()=>{
  const env=fixture(),headers={"X-Mw-Editor-Key":EDITOR_KEY};
  assert.equal((await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers})).status,201);
  env.sqlite.exec("UPDATE chapters SET is_preview=0 WHERE book_id='sample-cet4-letter'");
  env.sqlite.exec("UPDATE chapters SET chapter_no=4 WHERE id='sample-letter-ch2'");
  env.sqlite.exec("DELETE FROM chapter_words WHERE word_id='cet4-promise' AND chapter_id='sample-letter-ch1'");
  const res=await call(env,"/api/staging/editor/drafts/sample-cet4-letter/review","GET",undefined,{headers});
  assert.equal(res.status,200);
  const report=await res.json();
  assert.equal(report.technicalCheckPassed,false);
  const codes=new Set(report.blockers.map(x=>x.code));
  assert.ok(codes.has("NO_FREE_PREVIEW"));
  assert.ok(codes.has("CHAPTER_GAP"));
  assert.ok(codes.has("MISSING_WORD_ANCHOR"));
  assert.equal(report.publicationEnabled,false);
});

test("S3 C1 QA never returns draft content or report to unrelated paid reader",async()=>{
  const env=fixture();
  await call(env,"/api/staging/editor/drafts","POST",{package:sample},
    {headers:{"X-Mw-Editor-Key":EDITOR_KEY}});
  const path="/api/staging/editor/drafts/sample-cet4-letter/review";
  const denied=await call(env,path,"GET",undefined,{headers:{"X-Mw-Editor-Key":"a".repeat(40)}});
  assert.equal(denied.status,403);
  const text=await denied.text();
  assert.equal(text.includes("hesitate"),false);
  assert.equal(text.includes(sample.book.title),false);
});

test("S3 C2 stores an explicit review acknowledgement without publishing or changing reader rights",async()=>{
  const env=fixture(),headers={"X-Mw-Editor-Key":EDITOR_KEY};
  assert.equal((await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers})).status,201);
  const prefix="/api/staging/editor/drafts/sample-cet4-letter";
  const report=await (await call(env,prefix+"/review","GET",undefined,{headers})).json();
  assert.match(report.contentFingerprint,/^[a-f0-9]{64}$/);
  const initial=await call(env,prefix+"/review-signoffs","GET",undefined,{headers});
  assert.equal(initial.status,200);
  const initialStatus=await initial.json();
  assert.equal(initialStatus.current,null);
  assert.equal(initialStatus.publicationEnabled,false);
  const payload={expectedFingerprint:report.contentFingerprint,
    checks:report.manualChecks.map(x=>x.code),note:"这是独立示例内容的测试人工审核，不代表正式销售批准。"};
  const create=await call(env,prefix+"/review-signoffs","POST",payload,{headers});
  assert.equal(create.status,201,await create.clone().text());
  const saved=await create.json();
  assert.equal(saved.saved,true);
  assert.equal(saved.publicationEnabled,false);
  const listed=await (await call(env,prefix+"/review-signoffs","GET",undefined,{headers})).json();
  assert.equal(listed.current.note,payload.note);
  assert.equal(listed.current.stillMatches,true);
  assert.equal(listed.history.length,1);
  assert.equal(env.sqlite.prepare("SELECT status FROM books WHERE id='sample-cet4-letter'").get().status,"draft");
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM chapters WHERE published_at IS NOT NULL").get().n,0);
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM entitlements").get().n,0);
});

test("S3 C2 rejects false checklist, empty note, stale fingerprint and structural blockers",async()=>{
  const env=fixture(),headers={"X-Mw-Editor-Key":EDITOR_KEY};
  await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers});
  const path="/api/staging/editor/drafts/sample-cet4-letter/review-signoffs";
  const report=await (await call(env,"/api/staging/editor/drafts/sample-cet4-letter/review","GET",undefined,{headers})).json();
  const body={expectedFingerprint:report.contentFingerprint,
    checks:report.manualChecks.map(x=>x.code),note:"这段测试只验证人工审核确认流程，并非出版审批。"};
  assert.equal((await call(env,path,"POST",{...body,checks:body.checks.slice(0,2)},{headers})).status,400);
  assert.equal((await call(env,path,"POST",{...body,note:"太短"},{headers})).status,400);
  assert.equal((await call(env,path,"POST",{...body,expectedFingerprint:"a".repeat(64)},{headers})).status,409);
  env.sqlite.exec("UPDATE chapters SET is_preview=0 WHERE book_id='sample-cet4-letter'");
  const blocked=await call(env,path,"POST",body,{headers});
  assert.equal(blocked.status,409);
  const result=(await blocked.json()).error;
  assert.equal(result,"REVIEW_CONTENT_CHANGED");
  const report2=await (await call(env,"/api/staging/editor/drafts/sample-cet4-letter/review","GET",undefined,{headers})).json();
  const blocked2=await call(env,path,"POST",{...body,expectedFingerprint:report2.contentFingerprint},{headers});
  assert.equal(blocked2.status,409);
  assert.equal((await blocked2.json()).error,"REVIEW_BLOCKERS_PRESENT");
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM editorial_review_signoffs").get().n,0);
});

test("S3 C2 saved chapter edits and undo invalidate prior signoff permanently",async()=>{
  const env=fixture(),headers={"X-Mw-Editor-Key":EDITOR_KEY};
  await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers});
  const prefix="/api/staging/editor/drafts/sample-cet4-letter";
  const report=await (await call(env,prefix+"/review","GET",undefined,{headers})).json();
  const body={expectedFingerprint:report.contentFingerprint,
    checks:report.manualChecks.map(x=>x.code),note:"测试故事章节、词汇标注与权限流程均由人工核对。"};
  assert.equal((await call(env,prefix+"/review-signoffs","POST",body,{headers})).status,201);
  const preview=(await (await call(env,prefix,"GET",undefined,{headers})).json()).chapters[0];
  const adjusted=structuredClone(preview.content.paragraphs);
  adjusted[0].segments[0].text="测试写入：她看到信封。";
  const change=await call(env,prefix+"/chapters/"+preview.id,"PUT",
    {title:preview.title,preview:preview.preview,paragraphs:adjusted,expectedVersion:preview.version},{headers});
  assert.equal(change.status,200);
  const after=(await (await call(env,prefix+"/review-signoffs","GET",undefined,{headers})).json());
  assert.equal(after.current,null);
  assert.equal(after.requiresRecheck,true);
  assert.equal(after.history[0].stillMatches,false);
  const restored=await call(env,prefix+"/chapters/"+preview.id,"PUT",
    {title:preview.title,preview:preview.preview,paragraphs:preview.content.paragraphs,
      expectedVersion:(await change.json()).version},{headers});
  assert.equal(restored.status,200);
  const afterRestore=(await (await call(env,prefix+"/review-signoffs","GET",undefined,{headers})).json());
  assert.equal(afterRestore.current,null);
  assert.equal(afterRestore.requiresRecheck,true);
  assert.equal(afterRestore.history.length,1);
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM editorial_revisions").get().n,2);
});

test("S3 C2 signoff stays private, missing new D1 table is fail-closed; prior QA still works",async()=>{
  const env=fixture(),headers={"X-Mw-Editor-Key":EDITOR_KEY};
  await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers});
  const path="/api/staging/editor/drafts/sample-cet4-letter/review-signoffs";
  assert.equal((await call(env,path)).status,403);
  assert.equal((await worker.fetch(new Request(url+path,{headers}),env)).status,401);
  assert.equal((await call({...env,APP_ENV:"production"},path,"GET",undefined,{headers})).status,404);
  env.sqlite.exec("DROP TABLE editorial_review_signoffs");
  const missing=await call(env,path,"GET",undefined,{headers});
  assert.equal(missing.status,503);
  assert.equal((await missing.json()).error,"REVIEW_SCHEMA_REQUIRED");
  const old=await call(env,"/api/staging/editor/drafts/sample-cet4-letter/review","GET",undefined,{headers});
  assert.equal(old.status,200);
  assert.equal((await old.json()).blockerCount,0);
});

test("S3 D0 readiness blocks demo manuscript even when human signoff exists, with no publish actions",async()=>{
  const env=fixture(),key={"X-Mw-Editor-Key":EDITOR_KEY};
  const prefix="/api/staging/editor/drafts/sample-cet4-letter";
  assert.equal((await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers:key})).status,201);
  const before=await call(env,prefix+"/publication-readiness","GET",undefined,{headers:key});
  assert.equal(before.status,200);
  const first=await before.json();
  assert.equal(first.canPublish,false);
  assert.equal(first.publicationAvailable,false);
  assert.equal(first.environment,"staging");
  assert.equal(first.humanReview.status,"missing");
  const blockers=new Set(first.blockers.map(x=>x.code));
  assert.ok(blockers.has("TEST_MANUSCRIPT"));
  assert.ok(blockers.has("MANUAL_REVIEW_REQUIRED"));
  assert.ok(blockers.has("PUBLICATION_DISABLED"));
  const qa=(await (await call(env,prefix+"/review","GET",undefined,{headers:key})).json());
  const signed=await call(env,prefix+"/review-signoffs","POST",{
    expectedFingerprint:qa.contentFingerprint,checks:qa.manualChecks.map(x=>x.code),
    note:"仅限测试内容的人工审核流程演示，不作为商业上架批准。"
  },{headers:key});
  assert.equal(signed.status,201);
  const after=await call(env,prefix+"/publication-readiness","GET",undefined,{headers:key});
  assert.equal(after.status,200);
  const saved=await after.json();
  assert.equal(saved.humanReview.status,"current");
  assert.equal(saved.canPublish,false);
  assert.ok(saved.blockers.some(x=>x.code==="TEST_MANUSCRIPT"));
  assert.ok(saved.blockers.some(x=>x.code==="PUBLICATION_DISABLED"));
  assert.equal(env.sqlite.prepare("SELECT status FROM books WHERE id='sample-cet4-letter'").get().status,"draft");
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM chapters WHERE published_at IS NOT NULL").get().n,0);
  assert.equal((await call(env,prefix+"/publication-readiness","POST",{publish:true},{headers:key})).status,404);
});
test("S3 D0 preflight is editor-only and old signatures become outdated after chapter edits",async()=>{
  const env=fixture(),key={"X-Mw-Editor-Key":EDITOR_KEY},prefix="/api/staging/editor/drafts/sample-cet4-letter";
  await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers:key});
  assert.equal((await call(env,prefix+"/publication-readiness","GET")).status,403);
  assert.equal((await call({...env,APP_ENV:"production"},prefix+"/publication-readiness","GET",undefined,{headers:key})).status,404);
  const qa=await (await call(env,prefix+"/review","GET",undefined,{headers:key})).json();
  await call(env,prefix+"/review-signoffs","POST",{
    expectedFingerprint:qa.contentFingerprint,checks:qa.manualChecks.map(x=>x.code),
    note:"两章原始测试内容的人工审核记录，用于确认后续修改失效逻辑。"
  },{headers:key});
  const current=(await (await call(env,prefix+"/publication-readiness","GET",undefined,{headers:key})).json());
  assert.equal(current.humanReview.status,"current");
  const p=(await (await call(env,prefix,"GET",undefined,{headers:key})).json()).chapters[0];
  const paragraphs=structuredClone(p.content.paragraphs);
  paragraphs[0].segments[0].text="重新修改了准备审核后第一章文字。";
  const updated=await call(env,prefix+"/chapters/"+p.id,"PUT",{
    title:p.title,preview:p.preview,paragraphs,expectedVersion:p.version
  },{headers:key});
  assert.equal(updated.status,200);
  const stale=(await (await call(env,prefix+"/publication-readiness","GET",undefined,{headers:key})).json());
  assert.equal(stale.humanReview.status,"outdated");
  assert.equal(stale.canPublish,false);
  assert.ok(stale.blockers.some(x=>x.code==="MANUAL_REVIEW_REQUIRED"));
  assert.equal(env.sqlite.prepare("SELECT COUNT(*) AS n FROM entitlements").get().n,0);
});
test("S3 D0 read-only report still works when signoff migration is absent but never approves publishing",async()=>{
  const env=fixture(),key={"X-Mw-Editor-Key":EDITOR_KEY};
  await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers:key});
  env.sqlite.exec("DROP TABLE editorial_review_signoffs");
  const res=await call(env,"/api/staging/editor/drafts/sample-cet4-letter/publication-readiness","GET",undefined,{headers:key});
  assert.equal(res.status,200);
  const report=await res.json();
  assert.equal(report.signoffsSchemaReady,false);
  assert.equal(report.canPublish,false);
  assert.ok(report.blockers.some(x=>x.code==="REVIEW_STORAGE_MISSING"));
  assert.equal(env.sqlite.prepare("SELECT status FROM books WHERE id='sample-cet4-letter'").get().status,"draft");
});

test("S4 real reader persists cloud progress, requires login, and checks category grants",async()=>{
  const env=fixture();
  // The S2 QA books are published, unlike newly imported S3 drafts.
  assert.equal((await call(env,"/api/staging/seed-chapter-fixtures","POST",{})).status,200);
  const userId="s4-user",token="a".repeat(64);
  env.sqlite.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES(?,?,?,?)")
    .run(userId,"s4-reader","test-hash-not-used","test-salt");
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),
    x=>x.toString(16).padStart(2,"0")).join("");
  env.sqlite.prepare("INSERT INTO sessions(id_hash,user_id,expires_at) VALUES(?,?,datetime('now','+1 day'))")
    .run(digest,userId);
  const cookie={Cookie:"mw_session="+token};
  assert.equal((await call(env,"/api/me/progress","GET")).status,401);
  assert.equal((await call(env,"/api/me/progress","POST",{chapterId:"qa-cet4-free",progress:1})).status,401);
  assert.equal((await call(env,"/api/me/progress","POST",{chapterId:"qa-cet4-paid",progress:1},{headers:cookie})).status,403);
  assert.equal((await call(env,"/api/me/progress","POST",{chapterId:"qa-cet6-paid",progress:1},{headers:cookie})).status,403);
  const preview=await call(env,"/api/me/progress","POST",{chapterId:"qa-cet4-free",progress:0.4},{headers:cookie});
  assert.equal(preview.status,200,await preview.clone().text());
  assert.equal((await call(env,"/api/me/progress","POST",{chapterId:"qa-cet4-free",progress:1},{headers:cookie})).status,200);
  const list=await (await call(env,"/api/me/progress","GET",undefined,{headers:cookie})).json();
  assert.equal(list.progress.length,1);
  assert.equal(list.progress[0].progress,1);
  assert.ok(list.progress[0].completed_at);
  assert.equal((await call(env,"/api/me/progress","POST",{chapterId:"sample-letter-ch1",progress:1},{headers:cookie})).status,403);
  env.sqlite.prepare("INSERT INTO entitlements(user_id,category_id,source_code_id) VALUES(?,?,NULL)")
    .run(userId,"cet4");
  assert.equal((await call(env,"/api/me/progress","POST",{chapterId:"qa-cet4-paid",progress:1},{headers:cookie})).status,200);
  assert.equal((await call(env,"/api/me/progress","POST",{chapterId:"qa-cet6-paid",progress:1},{headers:cookie})).status,403);
  assert.equal(env.sqlite.prepare("SELECT count(*) n FROM reading_progress WHERE user_id=?").get(userId).n,2);
  env.sqlite.prepare("UPDATE entitlements SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?").run(userId);
  const after=(await (await call(env,"/api/me/progress","GET",undefined,{headers:cookie})).json());
  assert.equal(after.progress.some(p=>p.chapter_id==="qa-cet4-paid"),false);
  assert.equal((await call(env,"/api/me/progress","POST",{chapterId:"qa-cet4-paid",progress:1},{headers:cookie})).status,403);
});
test("S4 real reader word collection is persistent, published-only and unavailable across revoked rights",async()=>{
  const env=fixture();
  const key={"X-Mw-Editor-Key":EDITOR_KEY};
  await call(env,"/api/staging/editor/drafts","POST",{package:sample},{headers:key});
  await call(env,"/api/staging/seed-chapter-fixtures","POST",{});
  env.sqlite.prepare("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES(?,?,?,?)")
    .run("qa-cet4-free","cet4-hesitate","公开试看章节的 hesitant 词汇联动","p10:s1");
  const userId="s4-words",token="b".repeat(64);
  env.sqlite.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES(?,?,?,?)")
    .run(userId,"s4-wordreader","unused","unused");
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),
    x=>x.toString(16).padStart(2,"0")).join("");
  env.sqlite.prepare("INSERT INTO sessions(id_hash,user_id,expires_at) VALUES(?,?,datetime('now','+1 day'))")
    .run(digest,userId);
  const cookie={Cookie:"mw_session="+token};
  assert.equal((await call(env,"/api/me/words/cet4-hesitate","PUT",{bookmarked:true,status:"learning"})).status,401);
  assert.equal((await call(env,"/api/me/words/cet4-promise","PUT",{bookmarked:true,status:"mastered"},{headers:cookie})).status,403);
  const add=await call(env,"/api/me/words/cet4-hesitate","PUT",{bookmarked:true,status:"learning"},{headers:cookie});
  assert.equal(add.status,200,await add.clone().text());
  const saved=await (await call(env,"/api/me/words","GET",undefined,{headers:cookie})).json();
  assert.equal(saved.words.length,1);
  assert.equal(saved.words[0].headword,"hesitate");
  assert.equal(saved.words[0].status,"learning");
  assert.equal((await call(env,"/api/me/words/cet4-hesitate","PUT",{bookmarked:true,status:"mastered"},{headers:cookie})).status,200);
  assert.equal(env.sqlite.prepare("SELECT status,due_at FROM user_words WHERE user_id=?").get(userId).status,"mastered");
  assert.equal(env.sqlite.prepare("SELECT due_at FROM user_words WHERE user_id=?").get(userId).due_at,null);
  assert.equal((await call(env,"/api/me/words/cet4-hesitate","PUT",{bookmarked:false,status:"learning"},{headers:cookie})).status,200);
  assert.equal((await (await call(env,"/api/me/words","GET",undefined,{headers:cookie})).json()).words.length,0);
  const crossOrigin=await call(env,"/api/me/words/cet4-hesitate","PUT",{bookmarked:true,status:"learning"},
    {headers:{...cookie,Origin:"https://attacker.example"}});
  assert.equal(crossOrigin.status,403);
});
