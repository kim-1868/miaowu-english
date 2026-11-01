import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {mkdtemp,readFile,writeFile,readdir,rm,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {loadVoucherCatalog,assertIssuableCategory} from "../scripts/voucher-catalog.mjs";
import {parseConfirmedOrdersCsv,makeVoucher,fulfillOrders} from "../scripts/fulfill-voucher-orders.mjs";
import {normalizeCode,hashCode} from "../src/security.js";

const pepper="ONLY_AN_INERT_S13_LOCAL_TEST_PEPPER_2026";
const base="order_reference,category_id,payment_confirmed\n";
const first="ORD-20261101-001,cet4,YES";
const second="ORD-20261101-002,ielts,YES";
const testCsv=base+first+"\n"+second+"\n";
const read=async(path)=>readFile(path,"utf8");
test("S13 approval catalog has four launch products and blocks the two future categories",()=>{
 const rows=loadVoucherCatalog();
 assert.deepEqual(rows.filter(x=>x.salesEnabled).map(x=>x.slug),
  ["cet4","cet6","postgrad","ielts"]);
 assert.deepEqual(rows.filter(x=>!x.salesEnabled).map(x=>x.slug),
  ["high-school","zhuanshengben"]);
 for(const row of rows.filter(x=>x.salesEnabled))assert.equal(assertIssuableCategory(row.slug).slug,row.slug);
 for(const slug of ["high-school","zhuanshengben","unknown"]){
  assert.throws(()=>assertIssuableCategory(slug),/CATEGORY_NOT_APPROVED_FOR_ISSUANCE/);
 }
});
test("S13 paid CSV parser rejects unconfirmed, duplicated or unsafe order identifiers",()=>{
 assert.deepEqual(parseConfirmedOrdersCsv(testCsv).map(x=>x.categoryId),["cet4","ielts"]);
 const bad=[
  base+first+"\n"+first+"\n",
  base+"ORD-20261101-003,cet4,NO\n",
  base+"ORD-20261101-003,cet4,YES,OVERRIDE\n",
  base+"someone@example.com,cet4,YES\n",
  base+"ORD-20261101-003');DROP TABLE users;--,cet4,YES\n",
  base+"ORD-20261101-003,cet4,YES\n\n",
  base+"ORD-20261101-003,not a category,YES\n"
 ];
 for(const csv of bad)assert.throws(()=>parseConfirmedOrdersCsv(csv),undefined,csv);
});
test("S13 voucher hash matches Worker authorization HMAC format without leaking password",async()=>{
 const v=makeVoucher("postgrad",pepper);
 assert.ok(/^MW-POSTGRAD-(?:[A-F0-9]{8}-){4}[A-F0-9]{8}$/.test(v.activationCode));
 assert.equal(v.codeHash,await hashCode(normalizeCode(v.activationCode),{ACTIVATION_PEPPER:pepper}));
 assert.throws(()=>makeVoucher("cet4","weak"),/STRONG_PEPPER_REQUIRED/);
});
test("S13 one paid batch writes private inventory, irreversible SQL, and nonsecret replay ledger",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"mw-offline-test-"));
 try{
  const out=join(dir,"private-output");
  const res=await fulfillOrders({ordersCsv:testCsv,pepper,outputDir:out});
  assert.equal(res.count,2);
  assert.deepEqual(res.categories,["cet4","ielts"]);
  const inventory=await read(join(out,res.inventoryName));
  const sql=await read(join(out,res.importName));
  const ledger=await read(join(out,res.ledgerName));
  assert.equal(inventory.split("\n").filter(Boolean).length,3);
  const lines=inventory.trim().split("\n");
  const codes=lines.slice(1).map(x=>x.split(",")[2]);
  assert.equal(new Set(codes).size,2);
  for(const code of codes){
   assert.match(inventory,new RegExp(code));
   assert.ok(!sql.includes(code));
   assert.ok(!ledger.includes(code));
   assert.ok(!res.inventoryName.includes(code));
  }
  assert.ok(!ledger.includes(pepper));
  assert.ok(!sql.includes(pepper));
  assert.ok(!res.importName.includes("ORD-"));
  assert.ok(JSON.parse(ledger).entries.every(x=>x.status==="issued"));
  assert.ok(!(await readdir(out)).includes("fulfillment.lock"));
  // Real local SQLite schema and production ONLY uniqueness guard accept the
  // hashed stock; neither file can disclose the voucher's plaintext.
  const db=new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../db/001_schema.sql",import.meta.url),"utf8"));
  db.exec(readFileSync(new URL("../db/003_public_categories.sql",import.meta.url),"utf8"));
  db.exec(readFileSync(new URL("../db/production/001_one_paid_order_one_code.sql",import.meta.url),"utf8"));
  db.exec(sql);
  const d=db.prepare("SELECT order_reference,category_id,status FROM activation_codes ORDER BY order_reference").all();
  assert.deepEqual(d.map(x=>x.category_id),["cet4","ielts"]);
  assert.ok(d.every(x=>x.status==="unused"));
  assert.throws(()=>db.exec(sql),/UNIQUE/);
  db.close();
  // Same order, even with a fresh random code, can never be issued again
  // while using the same private ledger.
  await assert.rejects(
    fulfillOrders({ordersCsv:base+first+"\n",pepper,outputDir:out}),/ORDER_ALREADY_ISSUED/
  );
  assert.equal((await readdir(out)).filter(x=>x.startsWith("voucher-inventory-")).length,1);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test("S13 disabling future sales and stale prepared/locked orders fails closed",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"mw-offline-deny-"));
 const out=join(dir,"private-output");
 try{
  await assert.rejects(fulfillOrders({ordersCsv:base+"ORD-20261101-007,high-school,YES\n",
   pepper,outputDir:out}),/CATEGORY_NOT_APPROVED_FOR_ISSUANCE/);
  await mkdir(out,{recursive:true});
  await writeFile(join(out,"fulfillment-ledger.json"),JSON.stringify({version:1,entries:[{
   orderReference:"ORD-20261101-000",categoryId:"cet4",
   codeHash:"a".repeat(64),codeId:"ID",status:"prepared",runId:"RUN"
  }]}));
  await assert.rejects(fulfillOrders({ordersCsv:base+first+"\n",
   pepper,outputDir:out}),/UNRESOLVED_PREPARED_BATCH/);
  await writeFile(join(out,"fulfillment.lock"),"manual intervention required");
  await assert.rejects(fulfillOrders({ordersCsv:base+first+"\n",
   pepper,outputDir:out}),e=>e.code==="EEXIST");
 }finally{await rm(dir,{recursive:true,force:true})}
});
