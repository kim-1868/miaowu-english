import {test} from "node:test";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import assert from "node:assert/strict";
import {createLocalFreshSchema,inspectProductionWrangler,
 EXPECTED_NEW_PRODUCTION_D1,FRESH_PRODUCTION_SCHEMA_FILES,assertCleanDatabase
} from "../scripts/check-production-fresh-schema.mjs";

test("S20 screenshot's brand-new production D1 is targeted without touching QA database",()=>{
 const c=inspectProductionWrangler();
 assert.equal(c.worker,"miaowu-english-production");
 assert.equal(c.database,"miaowu-english-prod");
 assert.equal(c.databaseId,"649c71b3-340c-49bf-b806-3d39256851d3");
 assert.equal(c.databaseId,EXPECTED_NEW_PRODUCTION_D1);
 assert.notEqual(c.databaseId,"88a817cb-23bb-4ae4-bcb8-92286c4165d4");
 assert.equal(FRESH_PRODUCTION_SCHEMA_FILES.length,10);
});
test("S20 all 10 reviewed production migrations work on a genuinely empty SQLite D1",()=>{
 const {db,report}=createLocalFreshSchema();
 try{
  assert.equal(report.status,"FRESH_SCHEMA_DRY_RUN_VALID_ONLY");
  assert.equal(report.qaDbTouched,false);
  assert.equal(report.productionDbTouched,false);
  assert.equal(report.categorySlugs.length,4);
  assert.equal(report.requiredSchemaFiles.length,10);
  assert.ok(report.requiredTablesPresent>=22);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM activation_codes").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM books").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM account_recovery").get().n,0);
  assert.ok(db.prepare("PRAGMA table_info(books)").all().some(x=>x.name==="last_release_request_id"));
  assert.throws(()=>assertCleanDatabase(db),/NOT_A_FRESH_EMPTY_DATABASE/);
 }finally{db.close()}
});
test("S20 production duplicate order-code constraint rejects two codes for same order",()=>{
 const {db}=createLocalFreshSchema();
 try{
  db.prepare("INSERT INTO activation_codes(id,code_hash,category_id,status,order_reference) VALUES(?,?,?,?,?)")
   .run("a","a".repeat(64),"cet4","unused","ORD-CREATED-20261101");
  assert.throws(()=>db.prepare("INSERT INTO activation_codes(id,code_hash,category_id,status,order_reference) VALUES(?,?,?,?,?)")
   .run("b","b".repeat(64),"cet4","unused","ORD-CREATED-20261101"),/UNIQUE/);
 }finally{db.close()}
});
test("S20 recovery code storage enforces one digest per account and no plaintext schema column",()=>{
 const {db}=createLocalFreshSchema();
 try{
  const names=db.prepare("PRAGMA table_info(account_recovery)").all().map(x=>x.name);
  assert.deepEqual(names,["user_id","code_hash","issued_at"]);
  assert.ok(!names.includes("code"));
  assert.ok(!names.includes("recovery_code"));
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_account_recovery_hash'").get());
 }finally{db.close()}
});

test("S20 copyable production SQL bundle exactly matches the 10 audited source migrations",()=>{
 const sql=readFileSync(new URL("../db/production/BOOTSTRAP_NEW_EMPTY_D1.sql",import.meta.url),"utf8");
 assert.match(sql,/FIRST-TIME SCHEMA BOOTSTRAP/);
 assert.ok(sql.includes(EXPECTED_NEW_PRODUCTION_D1));
 let prev=-1;
 for(const path of FRESH_PRODUCTION_SCHEMA_FILES){
  const begin="-- BEGIN SOURCE: "+path+"\n";
  const end="-- END SOURCE: "+path;
  const start=sql.indexOf(begin),stop=sql.indexOf(end);
  assert.ok(start>prev,"missing/incorrect source order: "+path);
  assert.ok(stop>start,"missing source end: "+path);
  assert.equal(sql.indexOf(begin,start+begin.length),-1,"duplicate source: "+path);
  const actual=sql.slice(start+begin.length,stop).trimEnd();
  const source=readFileSync(new URL("../"+path,import.meta.url),"utf8").trimEnd();
  assert.equal(actual,source,"source file drift: "+path);
  prev=stop;
 }
 const db=new DatabaseSync(":memory:");
 try{
  assertCleanDatabase(db);
  db.exec(sql);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM categories").get().n,4);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM activation_codes").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM books").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM account_recovery").get().n,0);
  assert.throws(()=>db.exec(sql),/duplicate column name/, "not an idempotent migration; must be run ONCE on empty DB");
 }finally{db.close()}
});
