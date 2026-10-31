import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {generateSql,validatePackage} from "../scripts/build-content-import.mjs";
import worker from "../src/worker.js";

const file=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const input=JSON.parse(file("../content/examples/cet4-sample-draft.json"));
function database(){
  const db=new DatabaseSync(":memory:");
  for(const path of ["../db/001_schema.sql","../db/002_s1.sql",
      "../db/003_public_categories.sql","../db/004_editorial_content.sql"]) db.exec(file(path));
  return db;
}

test("S3 SQL safely imports Chinese story, quotes and word anchors into unpublished drafts",async()=>{
  const db=database();
  const {sql,summary}=generateSql(input);
  assert.equal(summary.chapters,2);
  assert.equal(summary.words,2);
  assert.equal(summary.wordOccurrences,4);
  assert.equal(summary.publication,"draft-only");
  db.exec(sql);
  assert.equal(db.prepare("SELECT status FROM books WHERE id=?").get(input.book.id).status,"draft");
  assert.equal(db.prepare("SELECT published_at FROM chapters WHERE id=?").get(input.chapters[0].id).published_at,null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM words").get().n,2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM chapter_words").get().n,4);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM word_categories").get().n,2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM content_packages").get().n,1);
  const row=db.prepare("SELECT content_json FROM chapters WHERE id=?").get(input.chapters[0].id);
  const chapter=JSON.parse(row.content_json);
  assert.equal(chapter.version,1);
  assert.equal(chapter.paragraphs[0].segments[1].wordId,"cet4-hesitate");
  assert.equal(chapter.paragraphs[1].segments[1].gloss,"承诺");
  assert.equal(db.prepare("SELECT context_anchor FROM chapter_words WHERE chapter_id=? ORDER BY context_anchor")
    .all(input.chapters[0].id)[0].context_anchor,"p0:s1");
  // Same package twice must not duplicate anything or overwrite story text.
  db.exec(sql);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM chapters").get().n,2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM content_packages").get().n,1);
  // A draft can be revised in a later dedicated workflow, not by accidental reimport.
  const changed=structuredClone(input);
  changed.chapters[0].title="不应覆盖现有草稿";
  db.exec(generateSql(changed).sql);
  assert.equal(db.prepare("SELECT title FROM chapters WHERE id=?").get(input.chapters[0].id).title,
    "一封没有署名的信");
});

test("S3 importer rejects unknown word references, duplicate chapters and malformed segments",()=>{
  const unknown=structuredClone(input);
  unknown.chapters[0].paragraphs[0].segments[1].wordId="cet4-unknown";
  assert.throws(()=>validatePackage(unknown),/unknown wordId/);
  const same=structuredClone(input);same.chapters[1].number=1;
  assert.throws(()=>validatePackage(same),/duplicate chapter number/);
  const bad=structuredClone(input);
  bad.chapters[0].paragraphs[0].segments[0].text="bad\u0000text";
  assert.throws(()=>generateSql(bad),/must be valid text/);
  const orphan=structuredClone(input);
  orphan.chapters[0].paragraphs[0].segments[1]={text:"x",wordId:"cet4-hesitate"};
  assert.throws(()=>generateSql(orphan),/requires either text or wordId/);
});

test("S3 SQL escapes apostrophes and cannot turn a text fragment into additional SQL",()=>{
  const modified=structuredClone(input);
  modified.chapters[0].paragraphs[0].segments[0].text="It's a sample'; DROP TABLE users;-- ";
  const db=database();
  db.exec(generateSql(modified).sql);
  const body=JSON.parse(db.prepare("SELECT content_json FROM chapters WHERE id=?").get("sample-letter-ch1").content_json);
  assert.match(body.paragraphs[0].segments[0].text,/DROP TABLE users/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n,0);
});

test("S3 import doesn't publish drafts; paid chapter API must not return any body",async()=>{
  const db=database();db.exec(generateSql(input).sql);
  const binding={
    prepare(sql){
      return {
        bind(...params){const stmt=db.prepare(sql);return {
          async first(){return stmt.get(...params)??null},
          async all(){return {results:stmt.all(...params)}},
          async run(){return {success:true,meta:stmt.run(...params)}}
        }},
        async all(){return {results:db.prepare(sql).all()}},
        async first(){return db.prepare(sql).get()??null}
      }
    },
    async batch(statements){
      db.exec("BEGIN");try{const a=[];for(const x of statements)a.push(await x.run());db.exec("COMMIT");return a;}
      catch(e){db.exec("ROLLBACK");throw e;}
    }
  };
  const env={DB:binding,ACTIVATION_PEPPER:"test-only-secret-longer-than-thirty-two-characters"};
  const first=await worker.fetch(new Request("https://demo.example/api/chapters/sample-letter-ch1"),env);
  assert.equal(first.status,404);
  const shelf=await worker.fetch(new Request("https://demo.example/api/books?category=cet4"),env);
  const list=await shelf.json();
  assert.equal(list.books.some(b=>b.id==="sample-cet4-letter"),false);
  // Future publish workflow must still require category-specific user entitlements.
});

test("S3 story-word API applies exactly the same entitlement rules as paid chapter body",async()=>{
  const db=database();
  db.exec(generateSql(input).sql);
  db.exec("UPDATE books SET status='published' WHERE id='sample-cet4-letter'");
  db.exec("UPDATE chapters SET published_at=CURRENT_TIMESTAMP WHERE book_id='sample-cet4-letter'");
  const binding={
    prepare(query){return {
      bind(...args){const sql=db.prepare(query);return {
        async first(){return sql.get(...args)??null},
        async all(){return {results:sql.all(...args)}},
        async run(){return {success:true,meta:sql.run(...args)}}
      }},
      async all(){return {results:db.prepare(query).all()}},
      async first(){return db.prepare(query).get()??null}
    }}
  };
  const env={DB:binding,ACTIVATION_PEPPER:"test-only-secret-longer-than-thirty-two-characters"};
  const url="https://demo.example/api/chapters/";
  const preview=await worker.fetch(new Request(url+"sample-letter-ch1/words"),env);
  assert.equal(preview.status,200);
  const data=await preview.json();
  assert.equal(data.words.length,2);
  assert.equal(data.words[0].word_id,"cet4-hesitate");
  assert.equal(data.words[0].meaning_zh,"犹豫；迟疑");
  assert.equal(data.words[0].collocations[0].en,"hesitate to speak");
  // Paid contexts cannot leak through the vocabulary endpoint.
  const blocked=await worker.fetch(new Request(url+"sample-letter-ch2/words"),env);
  assert.equal(blocked.status,401);
  assert.equal(JSON.stringify(await blocked.json()).includes("犹豫"),false);
  // Give a single test user category rights and a hashed server session.
  const token="a".repeat(64);
  const hashed=createHash("sha256").update(token).digest("hex");
  db.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES (?,?,?,?)")
    .run("user-s3","test_reader","not-a-real-hash","salt");
  db.prepare("INSERT INTO entitlements(user_id,category_id) VALUES (?,?)").run("user-s3","cet4");
  db.prepare("INSERT INTO sessions(id_hash,user_id,expires_at) VALUES (?,?,'2099-12-31 23:59:59')")
    .run(hashed,"user-s3");
  const allowed=await worker.fetch(new Request(url+"sample-letter-ch2/words",{
    headers:{Cookie:"mw_session="+token}
  }),env);
  assert.equal(allowed.status,200);
  assert.equal((await allowed.json()).words.length,2);
});

test("S3 editorial diagnostics report the migrated schema without changing S1 checks",async()=>{
  const db=database();
  const adapter={prepare(q){return {async all(){return {results:db.prepare(q).all()}},async first(){return db.prepare(q).get()??null}}}};
  const env={APP_ENV:"staging",STAGING_PREVIEW_PASSWORD:"only-a-test-preview-secret-12345",DB:adapter,
    ACTIVATION_PEPPER:"fake-secret-just-for-automatic-tests-123456789"};
  const reviewer="Basic "+Buffer.from("reviewer:"+env.STAGING_PREVIEW_PASSWORD).toString("base64");
  const response=await worker.fetch(new Request("https://demo.example/api/staging/diagnostics",{
    headers:{Authorization:reviewer}
  }),env);
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.databaseSchemaReady,true);
  assert.equal(result.s3.editorialSchemaReady,true);
  assert.deepEqual(result.s3.missingColumnsByTable,{});
});
