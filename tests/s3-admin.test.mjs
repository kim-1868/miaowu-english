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
  for(const x of ["../db/001_schema.sql","../db/002_s1.sql","../db/003_public_categories.sql","../db/004_editorial_content.sql","../db/005_editorial_revisions.sql"])sqlite.exec(read(x));
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
