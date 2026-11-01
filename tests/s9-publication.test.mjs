import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../src/worker.js";
import {isNonProductionManuscript} from "../src/ops-publication.js";
import {digestOpsToken} from "../src/ops-access.js";
import {generateSql} from "../scripts/build-content-import.mjs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const ORIGIN="https://miaowu.test";
const TOKEN="mwops_"+"d".repeat(64);
const PEPPER="ops-release-test-pepper-not-activation-and-at-least-32";
const CHECKS=["ORIGINALITY_AND_RIGHTS","LANGUAGE_PROOFREADING","PRODUCT_SCOPE"];
let reqNum=0;const id=()=> "release-req-"+String(++reqNum).padStart(5,"0");
const BOOK="original-letter-case";
const original=JSON.parse(read("../content/examples/cet4-sample-draft.json"));
const manuscript=structuredClone(original);
manuscript.book.id=BOOK;
manuscript.book.title="未寄出的信";
manuscript.chapters.forEach((ch,i)=>ch.id="original-letter-ch-"+(i+1));

function fixture({sample=false,enabled=true,environment="production",withoutMigration=false}={}){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON;");
  const files=["001_schema","002_s1","003_public_categories","004_editorial_content",
    "005_editorial_revisions","006_editorial_review_signoffs","007_ops_identity_audit"];
  if(!withoutMigration)files.push("008_ops_release_workflow");
  for(const name of files)sqlite.exec(read("../db/"+name+".sql"));
  const selected=sample?original:manuscript;
  sqlite.exec(generateSql(selected).sql);
  let beforeBatch=null;
  const DB={
    prepare(query){return {
      bind(...params){const statement=sqlite.prepare(query);return {
        async first(){return statement.get(...params)??null},
        async all(){return {results:statement.all(...params)}},
        async run(){return statement.run(...params)}
      }},
      async first(){return sqlite.prepare(query).get()??null},
      async all(){return {results:sqlite.prepare(query).all()}}
    }},
    async batch(statements){
      if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook(sqlite)}
      sqlite.exec("BEGIN IMMEDIATE");
      try{
        const data=[];for(const item of statements)data.push(await item.run());
        sqlite.exec("COMMIT");return data;
      }catch(e){sqlite.exec("ROLLBACK");throw e}
    }
  };
  const env={DB,APP_ENV:environment,OPS_TOKEN_PEPPER:PEPPER,
    OPS_PUBLICATION_ENABLED:enabled?"true":"false",
    ACTIVATION_PEPPER:"activation-pepper-for-test-not-ops-xxxxxxxx",
    STAGING_PREVIEW_PASSWORD:"staging-password-for-tests-2026"};
  return {env,sqlite,setBeforeBatch(fn){beforeBatch=fn},bookId:selected.book.id};
}
async function operator(sqlite,{role="publisher",environment="production",active=true}={}){
  sqlite.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest,is_active) VALUES(?,?,?,?,?,?)")
    .run("ops-publisher","Site owner",role,environment,await digestOpsToken(TOKEN,PEPPER),active?1:0);
}
function call(env,path,method="GET",data,token=TOKEN){
  const headers={Origin:ORIGIN};
  if(token!==null)headers["X-Mw-Ops-Key"]=token;
  if(data!==undefined)headers["Content-Type"]="application/json";
  return worker.fetch(new Request(ORIGIN+path,{method,headers,
    body:data===undefined?undefined:JSON.stringify(data)}),env);
}
const base=id=>"/api/ops/books/"+id;
const approval=(r,overrides={})=>({
  expectedFingerprint:r.contentFingerprint,requestId:id(),checks:[...CHECKS],
  note:"已逐章检查原创性、词汇释义、英文自然度与免费章节，确认可以进入发布确认步骤。",
  ...overrides
});
const confirmation=(r,approvalId,overrides={})=>({
  expectedFingerprint:r.contentFingerprint,approvalId,confirmTitle:r.book.title,
  requestId:id(),...overrides
});
async function ready(env,bookId=BOOK){
  const response=await call(env,base(bookId)+"/readiness");
  assert.equal(response.status,200,await response.clone().text());
  return response.json();
}
async function approve(env,r,bookId=BOOK,overrides={}){
  return call(env,base(bookId)+"/approve","POST",approval(r,overrides));
}
test("S9-B only typed, separately approved, version-locked content can publish",async()=>{
  const {env,sqlite}=fixture();
  await operator(sqlite);
  const r=await ready(env);
  assert.equal(r.technicalCheckPassed,true);
  assert.equal(r.approval.current,false);
  assert.equal(r.publishAvailable,false);
  const noApproval=await call(env,base(BOOK)+"/publish","POST",
    confirmation(r,"00000000-0000-4000-8000-000000000000"));
  assert.equal(noApproval.status,409);
  const a=await approve(env,r);
  assert.equal(a.status,201,await a.clone().text());
  const grant=await a.json();
  assert.equal(grant.published,false);
  assert.equal(sqlite.prepare("SELECT status FROM books WHERE id=?").get(BOOK).status,"draft");
  assert.equal((await ready(env)).approval.current,true);
  const wrongTitle=await call(env,base(BOOK)+"/publish","POST",
    confirmation(r,grant.approvalId,{confirmTitle:"另一本书"}));
  assert.equal(wrongTitle.status,409);
  const attempt=confirmation(r,grant.approvalId);
  const result=await call(env,base(BOOK)+"/publish","POST",attempt);
  assert.equal(result.status,201,await result.clone().text());
  assert.equal((await result.json()).published,true);
  assert.equal(sqlite.prepare("SELECT status FROM books WHERE id=?").get(BOOK).status,"published");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM chapters WHERE book_id=? AND published_at IS NULL").get(BOOK).n,0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ops_audit_events").get().n,2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ops_publication_approvals").get().n,1);
  const replay=await call(env,base(BOOK)+"/publish","POST",attempt);
  assert.equal(replay.status,200);
  assert.equal((await replay.json()).alreadyApplied,true);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ops_audit_events").get().n,2);
  const preview=await call(env,"/api/chapters/original-letter-ch-1","GET",undefined,null);
  assert.equal(preview.status,200,await preview.clone().text());
  const paid=await call(env,"/api/chapters/original-letter-ch-2","GET",undefined,null);
  assert.notEqual(paid.status,200);
  assert.equal(JSON.stringify(await paid.json()).includes("hesitate"),false);
});
test("S9-B revised chapters and global words invalidate approvals even if text is restored",async()=>{
  const {env,sqlite}=fixture();await operator(sqlite);
  const r=await ready(env);
  const approved=await (await approve(env,r)).json();
  const before=sqlite.prepare("SELECT content_json FROM chapters WHERE book_id=? ORDER BY chapter_no").get(BOOK).content_json;
  sqlite.prepare("UPDATE chapters SET content_json=? WHERE book_id=? AND chapter_no=1").run('{"version":1,"paragraphs":["edited"]}',BOOK);
  sqlite.prepare("UPDATE chapters SET content_json=? WHERE book_id=? AND chapter_no=1").run(before,BOOK);
  const second=await ready(env);
  assert.equal(second.approval.current,false);
  assert.equal(second.contentFingerprint,r.contentFingerprint); // exact restored bytes
  const response=await call(env,base(BOOK)+"/publish","POST",
    confirmation(r,approved.approvalId));
  assert.equal(response.status,409);
  assert.equal(sqlite.prepare("SELECT status FROM books WHERE id=?").get(BOOK).status,"draft");
  const replacement=await (await approve(env,second)).json();
  sqlite.prepare("UPDATE words SET meaning_zh=meaning_zh||'。' WHERE id='cet4-hesitate'").run();
  assert.equal((await ready(env)).approval.current,false);
  assert.equal((await call(env,base(BOOK)+"/publish","POST",
    confirmation(second,replacement.approvalId))).status,409);
});
test("S9-B test and QA manuscripts can never be approved or published",async()=>{
  const {env,sqlite,bookId}=fixture({sample:true});await operator(sqlite);
  const r=await ready(env,bookId);
  assert.equal(r.sampleBlocked,true);
  const res=await approve(env,r,bookId);
  assert.equal(res.status,409);
  assert.equal((await res.json()).error,"TEST_MANUSCRIPT_BLOCKED");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ops_publication_approvals").get().n,0);
});
test("S9-B requires dedicated publishing role and explicit enable switch",async()=>{
  const f=fixture({enabled:false});await operator(f.sqlite);
  const r=await ready(f.env);
  assert.equal(r.publishAvailable,false);
  assert.equal((await approve(f.env,r)).status,403);
  assert.equal((await call(f.env,base(BOOK)+"/publish","POST",confirmation(r,"00000000-0000-4000-8000-000000000000"))).status,403);
  const noKey=await call(f.env,base(BOOK)+"/readiness","GET",undefined,null);
  assert.equal(noKey.status,401);
  const readonly=fixture();await operator(readonly.sqlite,{role:"reviewer"});
  assert.equal((await call(readonly.env,base(BOOK)+"/readiness")).status,403);
  assert.equal((await approve(readonly.env,r)).status,403);
  assert.equal((await call(readonly.env,base(BOOK)+"/publish","POST",confirmation(r,"00000000-0000-4000-8000-000000000000"))).status,403);
  const wrongEnvironment=fixture();await operator(wrongEnvironment.sqlite,{environment:"staging"});
  assert.equal((await call(wrongEnvironment.env,base(BOOK)+"/readiness")).status,401);
  const older=fixture({withoutMigration:true});await operator(older.sqlite);
  assert.equal((await call(older.env,base(BOOK)+"/readiness")).status,503);
});
test("S9-B malformed, forged and cross-site requests never publish",async()=>{
  const {env,sqlite}=fixture();await operator(sqlite);
  const r=await ready(env);
  for(const altered of [
    {checks:["ORIGINALITY_AND_RIGHTS"]},{note:"OK"},{expectedFingerprint:"0".repeat(64)}
  ]){
    const res=await approve(env,r,BOOK,altered);
    assert.equal(res.status,altered.expectedFingerprint?409:400);
  }
  const cross=await worker.fetch(new Request(ORIGIN+base(BOOK)+"/approve",{
    method:"POST",headers:{"X-Mw-Ops-Key":TOKEN,Origin:"https://evil.test","content-type":"application/json"},
    body:JSON.stringify(approval(r))
  }),env);
  assert.equal(cross.status,403);
  assert.equal(sqlite.prepare("SELECT status FROM books WHERE id=?").get(BOOK).status,"draft");
});
test("S9-B concurrent edit before batch makes approval fail and prevents partial publication",async()=>{
  const f=fixture();await operator(f.sqlite);
  const r=await ready(f.env);
  f.setBeforeBatch(sqlite=>sqlite.prepare("UPDATE chapters SET title=title||'！' WHERE book_id=? AND chapter_no=1").run(BOOK));
  const first=await approve(f.env,r);
  assert.equal(first.status,409);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM ops_publication_approvals").get().n,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM ops_audit_events").get().n,0);
  const current=await ready(f.env);
  const granted=await (await approve(f.env,current)).json();
  f.setBeforeBatch(sqlite=>sqlite.prepare("UPDATE chapters SET title=title||'！' WHERE book_id=? AND chapter_no=2").run(BOOK));
  const failed=await call(f.env,base(BOOK)+"/publish","POST",
    confirmation(current,granted.approvalId));
  assert.equal(failed.status,409);
  assert.equal(f.sqlite.prepare("SELECT status FROM books WHERE id=?").get(BOOK).status,"draft");
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM ops_audit_events WHERE event_type='book.publish'").get().n,0);
});
test("S9-B audit failure must rollback book and chapter publication atomically",async()=>{
  const f=fixture();await operator(f.sqlite);
  const r=await ready(f.env);
  const granted=await (await approve(f.env,r)).json();
  // Simulate write failure at the final required audit step.
  f.sqlite.exec("CREATE TRIGGER reject_published_audit BEFORE INSERT ON ops_audit_events "+
    "WHEN NEW.event_type='book.publish' BEGIN SELECT RAISE(ABORT,'AUDIT_WRITE_FAILED'); END;");
  const result=await call(f.env,base(BOOK)+"/publish","POST",
    confirmation(r,granted.approvalId));
  assert.equal(result.status,409);
  assert.equal(f.sqlite.prepare("SELECT status FROM books WHERE id=?").get(BOOK).status,"draft");
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM chapters WHERE book_id=? AND published_at IS NOT NULL").get(BOOK).n,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM ops_audit_events WHERE event_type='book.publish'").get().n,0);
});

test("S9 test and draft identifiers are blocked even when the title sounds commercial",()=>{
  assert.equal(isNonProductionManuscript({id:"qa-archive",title:"雨夜档案"}),true);
  assert.equal(isNonProductionManuscript({id:"draft-cet4",title:"雨夜档案"}),true);
  assert.equal(isNonProductionManuscript({id:"original-cet4",title:"雨夜档案"}),false);
  assert.equal(isNonProductionManuscript({id:"original-cet4",title:"测试雨夜档案"}),true);
});


test("S46 operator cannot approve an exam story with incomplete UK/US phonetics, POS or bilingual examples",async()=>{
 for(const [column,label] of [
  ["phonetic_uk","missingUk"],["phonetic_us","missingUs"],
  ["part_of_speech","missingPos"],["example_en","missingExampleEn"],
  ["example_zh","missingExampleZh"]
 ]){
  const f=fixture();await operator(f.sqlite);
  f.sqlite.prepare("UPDATE words SET "+column+"='' WHERE id='cet4-hesitate'").run();
  const r=await ready(f.env);
  assert.equal(r.technicalCheckPassed,true,"structural draft review remains separate");
  assert.equal(r.learningMetadata.complete,false,column);
  assert.equal(r.learningMetadata[label],1,column);
  assert.equal(r.publishAvailable,false,column);
  const approvalAttempt=await approve(f.env,r);
  assert.equal(approvalAttempt.status,409,column);
  assert.equal((await approvalAttempt.json()).error,"LEARNING_METADATA_INCOMPLETE",column);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM ops_publication_approvals").get().n,0);
  assert.equal(f.sqlite.prepare("SELECT status FROM books WHERE id=?").get(BOOK).status,"draft");
  f.sqlite.close();
 }
});

test("S46 readiness reports exact missing words without multiplying repeated chapter word anchors",async()=>{
 const f=fixture();await operator(f.sqlite);
 let result=await ready(f.env);
 assert.equal(result.learningMetadata.complete,true);
 assert.equal(result.learningMetadata.wordCount,2);
 assert.equal(result.learningMetadata.missingUk,0);
 assert.equal(result.learningMetadata.missingUs,0);
 f.sqlite.prepare("UPDATE words SET phonetic_uk=NULL,phonetic_us=NULL,example_en=NULL WHERE id='cet4-promise'").run();
 result=await ready(f.env);
 assert.equal(result.learningMetadata.wordCount,2);
 assert.equal(result.learningMetadata.missingUk,1);
 assert.equal(result.learningMetadata.missingUs,1);
 assert.equal(result.learningMetadata.missingExampleEn,1);
 assert.equal(result.learningMetadata.complete,false);
 assert.equal(result.publishAvailable,false);
 f.sqlite.close();
});

test("S46 post-approval deletion of a pronunciation is blocked at publish without changing the book",async()=>{
 const f=fixture();await operator(f.sqlite);
 const report=await ready(f.env);
 const approvalId=(await (await approve(f.env,report)).json()).approvalId;
 assert.ok(approvalId);
 f.sqlite.prepare("UPDATE words SET phonetic_us='' WHERE id='cet4-hesitate'").run();
 const next=await ready(f.env);
 assert.equal(next.learningMetadata.complete,false);
 const result=await call(f.env,base(BOOK)+"/publish","POST",confirmation(report,approvalId));
 assert.equal(result.status,409);
 assert.equal((await result.json()).error,"LEARNING_METADATA_INCOMPLETE");
 assert.equal(f.sqlite.prepare("SELECT status FROM books WHERE id=?").get(BOOK).status,"draft");
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM chapters WHERE published_at IS NOT NULL").get().n,0);
 f.sqlite.close();
});
