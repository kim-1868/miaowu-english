import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import worker from "../src/worker.js";
import {digestOpsToken} from "../src/ops-access.js";
import {generateSql} from "../scripts/build-content-import.mjs";

const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const ORIGIN="https://ops-v19.test",TOKEN="mwops_"+"e".repeat(64);
const PEPPER="ops-v19-unit-test-pepper-does-not-match-production-2026";
let nonce=0;const rid=()=> "ops-v19-request-"+String(++nonce).padStart(6,"0");
function fakeD1(sqlite){
  return {
    prepare(sql){
      const bind=(args)=>({
        first:async()=>sqlite.prepare(sql).get(...args)??null,
        all:async()=>({results:sqlite.prepare(sql).all(...args)}),
        run:async()=>sqlite.prepare(sql).run(...args)
      });
      return {...bind([]),bind:(...args)=>bind(args)};
    },
    async batch(items){
      sqlite.exec("BEGIN IMMEDIATE");
      try{
        const result=[];for(const x of items)result.push(await x.run());
        sqlite.exec("COMMIT");return result;
      }catch(e){sqlite.exec("ROLLBACK");throw e}
    }
  };
}
async function fixture({enabled=true,withTagMigration=true}={}){
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for(const file of ["001_schema","002_s1","003_public_categories","004_editorial_content",
    "005_editorial_revisions","006_editorial_review_signoffs","007_ops_identity_audit",
    "008_ops_release_workflow"])db.exec(read("../db/"+file+".sql"));
  if(withTagMigration)db.exec(read("../db/production/005_book_cover_tags.sql"));
  const pkg=structuredClone(JSON.parse(read("../content/examples/cet4-sample-draft.json")));
  pkg.book.id="owner-live-test-novel";pkg.book.title="一封迟到的信";
  for(const [i,c] of pkg.chapters.entries())c.id="owner-v19-ch-"+(i+1);
  db.exec(generateSql(pkg).sql);
  db.prepare("UPDATE categories SET is_visible=1 WHERE slug='cet4'").run();
  db.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES (?,?,?,?,?)")
    .run("ops-v19-owner","Publisher","publisher","production",await digestOpsToken(TOKEN,PEPPER));
  const env={
    DB:fakeD1(db),APP_ENV:"production",OPS_TOKEN_PEPPER:PEPPER,
    OPS_PUBLICATION_ENABLED:enabled?"true":"false",
    ACTIVATION_PEPPER:"v19-unit-test-activation-pepper-not-live",
    ASSETS:{fetch:async()=>new Response("NOT_FOUND",{status:404})}
  };
  return {db,env,pkg};
}
function call(env,path,method="GET",body,token=TOKEN){
  const headers={Origin:ORIGIN};
  if(token!==null)headers["X-Mw-Ops-Key"]=token;
  if(body!==undefined)headers["Content-Type"]="application/json";
  return worker.fetch(new Request(ORIGIN+path,{
    method,headers,body:body===undefined?undefined:JSON.stringify(body)
  }),env);
}
test("S147 owner can publish reviewed complete paid content with one explicit POST and no approval fields",async()=>{
  const {db,env,pkg}=await fixture();
  try{
    const path="/api/ops/books/"+pkg.book.id;
    let readiness=await (await call(env,path+"/readiness")).json();
    assert.equal(readiness.quickPublishAvailable,false,"cover required");
    const blocked=await call(env,path+"/publish-reviewed","POST",{
      confirmed:true,bookId:pkg.book.id,expectedFingerprint:readiness.contentFingerprint,requestId:rid()
    });
    assert.equal(blocked.status,409);
    assert.equal((await blocked.json()).error,"BOOK_COVER_REQUIRED");
    db.prepare("UPDATE books SET cover_key='cover-d1-unit-test-cover-12345' WHERE id=?")
      .run(pkg.book.id);
    readiness=await (await call(env,path+"/readiness")).json();
    assert.equal(readiness.technicalCheckPassed,true);
    assert.equal(readiness.quickPublishAvailable,true);
    const invalid=await call(env,path+"/publish-reviewed","POST",{
      confirmed:false,bookId:pkg.book.id,expectedFingerprint:readiness.contentFingerprint,requestId:rid()
    });
    assert.equal(invalid.status,400);
    const unauthorized=await call(env,path+"/publish-reviewed","POST",{
      confirmed:true,bookId:pkg.book.id,expectedFingerprint:readiness.contentFingerprint,requestId:rid()
    },null);
    assert.equal(unauthorized.status,401);
    const request={confirmed:true,bookId:pkg.book.id,expectedFingerprint:readiness.contentFingerprint,requestId:rid()};
    const success=await call(env,path+"/publish-reviewed","POST",request);
    assert.equal(success.status,201,await success.clone().text());
    assert.equal(db.prepare("SELECT status FROM books WHERE id=?").get(pkg.book.id).status,"published");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM chapters WHERE book_id=? AND published_at IS NULL")
      .get(pkg.book.id).n,0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ops_publication_approvals").get().n,0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ops_audit_events WHERE event_type='book.publish'").get().n,1);
    const replay=await call(env,path+"/publish-reviewed","POST",request);
    assert.equal(replay.status,200);
    assert.equal((await replay.json()).alreadyApplied,true);
  }finally{db.close()}
});
test("S147 publication is version-bound, disabled when feature flag is off",async()=>{
  const {db,env,pkg}=await fixture({enabled:false});
  try{
    db.prepare("UPDATE books SET cover_key='cover-d1-unit-test-cover-12345' WHERE id=?").run(pkg.book.id);
    const path="/api/ops/books/"+pkg.book.id;
    const readied=await (await call(env,path+"/readiness")).json();
    assert.equal(readied.quickPublishAvailable,false);
    assert.equal((await call(env,path+"/publish-reviewed","POST",{
      confirmed:true,bookId:pkg.book.id,expectedFingerprint:readied.contentFingerprint,requestId:rid()
    })).status,403);
    env.OPS_PUBLICATION_ENABLED="true";
    db.prepare("UPDATE chapters SET title=title||'变化' WHERE book_id=? AND chapter_no=1").run(pkg.book.id);
    const stale=await call(env,path+"/publish-reviewed","POST",{
      confirmed:true,bookId:pkg.book.id,expectedFingerprint:readied.contentFingerprint,requestId:rid()
    });
    assert.equal(stale.status,409);
    assert.equal(db.prepare("SELECT status FROM books WHERE id=?").get(pkg.book.id).status,"draft");
  }finally{db.close()}
});
test("S147 publisher can create, recolor, rename and delete multiple labels without touching user records",async()=>{
  const {db,env,pkg}=await fixture();
  try{
    const path="/api/ops/books/"+pkg.book.id+"/tags";
    assert.equal((await call(env,path,"GET",undefined,null)).status,401);
    for(let i=0;i<15;i++){
      const response=await call(env,path,"POST",{
        label:"标签"+i,color:"#713848",requestId:rid()
      });
      assert.equal(response.status,200,await response.clone().text());
    }
    let state=await (await call(env,path)).json();
    assert.equal(state.tags.length,15);
    assert.equal(state.presets.length,15);
    const changed=await call(env,path,"POST",{
      label:"标签0",color:"#408070",requestId:rid()
    });
    assert.equal(changed.status,200);
    const renamed=await call(env,path,"POST",{
      previousLabel:"标签0",label:"完结新标签",color:"#cf527d",requestId:rid()
    });
    assert.equal(renamed.status,200,await renamed.clone().text());
    state=await (await call(env,path)).json();
    assert.equal(state.tags.length,15);
    assert.ok(state.tags.some(t=>t.label==="完结新标签"&&t.color==="#cf527d"));
    const removed=await call(env,path,"DELETE",{
      label:"完结新标签",requestId:rid()
    });
    assert.equal(removed.status,200);
    assert.equal((await removed.json()).tags.length,14);
    assert.equal((await call(env,path,"POST",{
      label:"XSS",color:"url(javascript:evil)",requestId:rid()
    })).status,400);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n,0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM entitlements").get().n,0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM book_cover_tags").get().n,14);
  }finally{db.close()}
});
test("S147 published catalog shows labels but not private drafts; missing tag migration leaves shelf functional",async()=>{
  const {db,env,pkg}=await fixture();
  try{
    const tagPath="/api/ops/books/"+pkg.book.id+"/tags";
    await call(env,tagPath,"POST",{label:"高能反转",color:"#713848",requestId:rid()});
    let publicResult=await (await call(env,"/api/books?category=cet4","GET",undefined,null)).json();
    assert.ok(!publicResult.books.some(x=>x.id===pkg.book.id));
    db.prepare("UPDATE books SET status='published' WHERE id=?").run(pkg.book.id);
    const catalog=await call(env,"/api/books?category=cet4","GET",undefined,null);
    assert.equal(catalog.status,200,await catalog.clone().text());
    publicResult=await catalog.json();
    assert.deepEqual(publicResult.books.find(x=>x.id===pkg.book.id).cover_tags,
      [{label:"高能反转",color:"#713848"}]);
  }finally{db.close()}
  const missing=await fixture({withTagMigration:false});
  try{
    const res=await call(missing.env,"/api/books?category=cet4","GET",undefined,null);
    assert.equal(res.status,200);
    assert.equal((await call(missing.env,"/api/ops/books/"+missing.pkg.book.id+"/tags")).status,503);
  }finally{missing.db.close()}
});
