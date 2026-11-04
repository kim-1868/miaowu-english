import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {digestOpsToken} from "../src/ops-access.js";
import {handleOpsLiveEdit,checkLivePackage} from "../src/ops-live-edit.js";
import {validatePackage} from "../src/editorial-content.js";
import {planOpsBookImport} from "../src/ops-import.js";

const TOKEN="mwops_"+"e".repeat(64);
const PEPPER="publisher-live-edition-tests-2026-secret-pepper";
const source=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const sql=path=>source("../"+path);

function D1(db){
  return {
    prepare(query){
      return {
        bind(...values){
          const stmt=db.prepare(query);
          return {
            async first(){return stmt.get(...values)||null},
            async all(){return {results:stmt.all(...values)}},
            async run(){return stmt.run(...values)}
          };
        },
        async all(){return {results:db.prepare(query).all()}},
        async first(){return db.prepare(query).get()||null}
      };
    },
    async batch(commands){
      db.exec("BEGIN");
      try{
        const results=[];
        for(const command of commands)results.push(await command.run());
        db.exec("COMMIT");return results;
      }catch(e){db.exec("ROLLBACK");throw e}
    }
  };
}
const pkg={
  version:1,sourceLabel:"publisher-original",
  book:{id:"published-story-01",title:"原版冒险",category:"cet4",description:"第一版简介"},
  chapters:[
    {id:"story-chapter-one",number:1,title:"第一章",preview:true,paragraphs:[
      {segments:[{text:"那个夜晚有一个 "},{wordId:"story-word-one",surface:"promise",gloss:"承诺"},{text:"。"}]}
    ]},
    {id:"story-chapter-two",number:2,title:"第二章",preview:false,paragraphs:[
      {segments:[{text:"她做了一个 "},{wordId:"story-word-two",surface:"decision",gloss:"决定"},{text:"。"}]}
    ]}
  ],
  words:[
    {id:"story-word-one",headword:"promise",meaningZh:"承诺",phoneticUk:"/ˈprɒmɪs/",phoneticUs:"/ˈprɑːmɪs/",
      partOfSpeech:"n.",exampleEn:"He kept his promise.",exampleZh:"他遵守了承诺。",collocations:[]},
    {id:"story-word-two",headword:"decision",meaningZh:"决定",phoneticUk:"/dɪˈsɪʒən/",phoneticUs:"/dɪˈsɪʒən/",
      partOfSpeech:"n.",exampleEn:"She made a decision.",exampleZh:"她做出了决定。",collocations:[]}
  ]
};
function revised(){
  const x=structuredClone(pkg);
  x.book.title="修订版冒险";
  x.book.description="修订故事简介";
  x.chapters[0].paragraphs[0].segments[0].text="凌晨，侦探终于回到了现场。这里还有一个 ";
  x.chapters.push({
    id:"story-chapter-three",number:3,title:"第三章：新的真相",preview:false,
    paragraphs:[{segments:[
      {text:"这次的 "},{wordId:"story-word-three",surface:"evidence",gloss:"证据"},
      {text:" 将改变一切。"}]}]
  });
  x.words.push({
    id:"story-word-three",headword:"evidence",meaningZh:"证据",phoneticUk:"/ˈevɪdəns/",
    phoneticUs:"/ˈevɪdəns/",partOfSpeech:"n.",
    exampleEn:"The evidence was clear.",exampleZh:"证据很明确。",collocations:[]
  });
  return x;
}
async function setup(){
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for(const path of [
    "db/001_schema.sql","db/002_s1.sql","db/003_public_categories.sql",
    "db/004_editorial_content.sql","db/005_editorial_revisions.sql",
    "db/006_editorial_review_signoffs.sql","db/007_ops_identity_audit.sql",
    "db/008_ops_release_workflow.sql","db/production/006_live_book_versions.sql"
  ])db.exec(sql(path));
  const digest=await digestOpsToken(TOKEN,PEPPER);
  db.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES(?,?,?,?,?)")
    .run("ops-live-editor","Owner","publisher","production",digest);
  const plan=planOpsBookImport(validatePackage(pkg));
  db.exec("BEGIN");
  for(const entry of plan.statements)db.prepare(entry.sql).run(...entry.params);
  db.exec("COMMIT");
  db.prepare("UPDATE books SET status='published' WHERE id=?").run(pkg.book.id);
  db.prepare("UPDATE chapters SET published_at=CURRENT_TIMESTAMP WHERE book_id=?").run(pkg.book.id);
  db.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES('user-reader','reader','h','s')").run();
  db.prepare("INSERT INTO reading_progress(user_id,chapter_id,progress) VALUES('user-reader','story-chapter-one',0.75)").run();
  db.prepare("INSERT INTO user_words(user_id,word_id,status,bookmarked) VALUES('user-reader','story-word-one','learning',1)").run();
  const env={APP_ENV:"production",OPS_TOKEN_PEPPER:PEPPER,OPS_CONSOLE_ENABLED:"true",
    OPS_PUBLICATION_ENABLED:"true",DB:D1(db)};
  const call=async(action="overview",method="GET",body=null,token=TOKEN)=>{
    const path="/api/ops/books/"+pkg.book.id+"/live-editor"+(action==="overview"?"":"/"+action);
    const response=await handleOpsLiveEdit(new Request("https://miaowu.example"+path,{
      method,headers:{"X-Mw-Ops-Key":token,...(body?{"Content-Type":"application/json"}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    }),env,path);
    return {status:response.status,data:await response.json()};
  };
  return {db,env,call};
}

test("S156 published edit requires publisher authentication and migration",async()=>{
  const {db,call,env}=await setup();
  try{
    assert.equal((await call("overview","GET",null,null)).status,401);
    const initial=await call();
    assert.equal(initial.status,200,JSON.stringify(initial.data));
    assert.equal(initial.data.chapterCount,2);
    assert.equal(initial.data.editable,true);
    assert.equal(initial.data.book.title,pkg.book.title);
    const exported=await call("export");
    assert.equal(exported.status,200);
    assert.equal(exported.data.package.chapters[0].id,pkg.chapters[0].id);
    assert.equal(exported.data.package.words[0].headword,"promise");
    env.OPS_PUBLICATION_ENABLED="false";
    assert.equal((await call("metadata","POST",{
      title:"blocked",description:"",expectedVersion:initial.data.version,requestId:"request_disabled_01"
    })).status,403);
    env.OPS_PUBLICATION_ENABLED="true";
  }finally{db.close()}
});

test("S156 full live revision previews changes and atomically preserves purchases and study progress",async()=>{
  const {db,call}=await setup();
  try{
    const review=await call("preview","POST",{package:revised()});
    assert.equal(review.status,200,JSON.stringify(review.data));
    const {digest,expectedVersion,diff}=review.data;
    assert.equal(diff.addedChapters,1);
    assert.equal(diff.changedChapters.length,2);
    assert.equal(diff.newWords,1);
    assert.equal(diff.metadataChanged,true);
    assert.match(digest,/^[a-f0-9]{64}$/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ops_live_book_versions").get().n,0,
      "read-only preview must not touch history");
    const altered=structuredClone(revised());
    altered.chapters[0].paragraphs[0].segments[0].text="not reviewed";
    const failDigest=await call("publish","POST",{package:altered,expectedVersion,
      previewDigest:digest,requestId:"preview_mismatch_001"});
    assert.equal(failDigest.status,409);
    const commit=await call("publish","POST",{package:revised(),expectedVersion,
      previewDigest:digest,requestId:"content_revision_001"});
    assert.equal(commit.status,200,JSON.stringify(commit.data));
    assert.equal(commit.data.updated,true);
    assert.equal(db.prepare("SELECT title FROM books WHERE id=?").get(pkg.book.id).title,"修订版冒险");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM chapters WHERE book_id=?").get(pkg.book.id).n,3);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM chapter_words").get().n,3);
    assert.equal(db.prepare("SELECT progress FROM reading_progress").get().progress,0.75);
    assert.equal(db.prepare("SELECT status,bookmarked FROM user_words").get().bookmarked,1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ops_live_book_versions").get().n,1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ops_audit_events WHERE event_type='book.live_content'").get().n,1);
    assert.throws(()=>db.prepare("UPDATE ops_live_book_versions SET summary_json='{}'").run(),/OPS_LIVE_VERSION_APPEND_ONLY/);
    const repeat=await call("publish","POST",{package:revised(),expectedVersion,
      previewDigest:digest,requestId:"content_revision_001"});
    assert.equal(repeat.status,200);
    assert.equal(repeat.data.alreadyApplied,true);
    const stale=await call("publish","POST",{package:revised(),expectedVersion,
      previewDigest:digest,requestId:"content_revision_002"});
    assert.equal(stale.status,409);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
  }finally{db.close()}
});

test("S156 published content cannot delete existing chapters, anchors or rewrite shared word cards",async()=>{
  const {db,call}=await setup();
  try{
    const removed=structuredClone(pkg);removed.chapters.pop();
    assert.equal((await call("preview","POST",{package:removed})).data.error,"PUBLISHED_CHAPTER_REMOVAL_FORBIDDEN");
    const changedIds=structuredClone(pkg);changedIds.chapters[0].id="chapter-changed-01";
    assert.equal((await call("preview","POST",{package:changedIds})).data.error,"EXISTING_CHAPTER_ID_OR_ORDER_CHANGED");
    const lost=structuredClone(pkg);lost.chapters[0].paragraphs[0].segments=
      [{text:"removed old study anchor"}];
    assert.equal((await call("preview","POST",{package:lost})).data.error,"EXISTING_STUDY_WORD_REMOVED");
    const changedMeaning=structuredClone(pkg);changedMeaning.words[0].meaningZh="different meaning";
    assert.equal((await call("preview","POST",{package:changedMeaning})).data.error,"EXISTING_WORD_CARD_CHANGED");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ops_live_book_versions").get().n,0);
  }finally{db.close()}
});

test("S156 metadata edit is versioned and rolling back content preserves prior progress",async()=>{
  const {db,call}=await setup();
  try{
    const original=await call();
    const edit=await call("metadata","POST",{
      title:"新书名",description:"修正后的简介",expectedVersion:original.data.version,
      requestId:"metadata_revision_01"});
    assert.equal(edit.status,200,JSON.stringify(edit.data));
    assert.equal(db.prepare("SELECT description FROM books").get().description,"修正后的简介");
    const history=await call("history");
    assert.equal(history.data.versions[0].action,"metadata");
    let current=await call();
    const revisedDoc=revised();
    revisedDoc.book.title="新书名";revisedDoc.book.description="修正后的简介";
    const ready=await call("preview","POST",{package:revisedDoc});
    assert.equal(ready.status,200);
    const updated=await call("publish","POST",{package:revisedDoc,
      previewDigest:ready.data.digest,expectedVersion:ready.data.expectedVersion,
      requestId:"content_revision_003"});
    assert.equal(updated.status,200,JSON.stringify(updated.data));
    const versionAfterContent=(await call()).data.version;
    const contentHistory=(await call("history")).data.versions;
    const contentBackup=contentHistory.find(row=>row.action==="content");
    assert.ok(contentBackup);
    const restored=await call("restore","POST",{
      historyId:contentBackup.id,expectedVersion:versionAfterContent,confirmRestore:true,
      requestId:"restore_version_003"});
    assert.equal(restored.status,200,JSON.stringify(restored.data));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM chapters").get().n,2);
    assert.equal(db.prepare("SELECT title FROM books").get().title,"新书名");
    assert.equal(db.prepare("SELECT progress FROM reading_progress").get().progress,0.75);
    assert.equal(db.prepare("SELECT bookmarked FROM user_words").get().bookmarked,1);
    const restoredHistory=(await call("history")).data.versions;
    assert.equal(restoredHistory[0].action,"restore");
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
  }finally{db.close()}
});

test("S156 rollback rejects removing newly published chapters that now have reader progress",async()=>{
  const {db,call}=await setup();
  try{
    const ready=await call("preview","POST",{package:revised()});
    assert.equal((await call("publish","POST",{package:revised(),
      previewDigest:ready.data.digest,expectedVersion:ready.data.expectedVersion,
      requestId:"content_revision_004"})).status,200);
    db.prepare("INSERT INTO reading_progress(user_id,chapter_id,progress) VALUES('user-reader','story-chapter-three',0.15)").run();
    const before=(await call()).data.version;
    const history=(await call("history")).data.versions[0];
    const response=await call("restore","POST",{historyId:history.id,
      expectedVersion:before,confirmRestore:true,requestId:"restore_blocked_004"});
    assert.equal(response.status,409);
    assert.equal(response.data.error,"RESTORE_WOULD_REMOVE_READER_HISTORY");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM chapters").get().n,3);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ops_live_book_versions").get().n,1);
  }finally{db.close()}
});

test("S156 publisher UI offers a standalone inline editor without ever changing book ids",()=>{
  const html=source("../public/ops.html"),js=source("../public/ops-console.js"),css=source("../public/ops-console.css");
  for(const id of ["liveEditorPanel","liveEditTitle","liveEditDescription","liveRevisionFile",
    "liveCheckRevision","livePublishRevision","liveDownloadSource","liveHistory","liveSaveMetadata"]){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.match(html,/v=20261104-v29-live-editor/);
  assert.match(js,/function loadLiveEditor/);
  assert.match(js,/function renderLiveHistory/);
  assert.ok(js.includes("/live-editor/preview"));
  assert.ok(js.includes("/live-editor/publish"));
  assert.ok(js.includes("/live-editor/restore"));
  assert.ok(js.includes("/live-editor/export"));
  assert.match(css,/V29: versioned publisher editor/);
});
