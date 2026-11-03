import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../public/ops.html",import.meta.url),"utf8");
const js=readFileSync(new URL("../public/ops-console.js",import.meta.url),"utf8");
const backend=readFileSync(new URL("../src/ops-sales.js",import.meta.url),"utf8");

test("quick merchant issue requires only a selected category and an order number in UI",()=>{
 const area=html.slice(html.indexOf('aria-label="人工订单发货"'),html.indexOf('class="cols"'));
 assert.ok(area.includes('id="saleCategory"'));
 assert.ok(area.includes('id="saleOrder"'));
 assert.ok(area.includes('id="saleIssueButton"'));
 assert.doesNotMatch(area,/id="salePaid"|id="saleContent"|type="checkbox"/);
 assert.match(area,/生成激活码/);
 assert.doesNotMatch(js,/\$\("salePaid"\)|\$\("saleContent"\)/);
 const quick=js.slice(js.indexOf('button("saleIssueButton",async()=>{'),js.indexOf('$("saleCopy").addEventListener'));
 assert.ok(quick.includes('categoryId:category,orderReference:order'));
 assert.doesNotMatch(quick,/window\.confirm/);
 assert.doesNotMatch(quick,/salePaid|saleContent/);
});

test("single visible receipt prevents lost codes; previous order is cleared before next issue",()=>{
 assert.match(js,/const receiptOpen=!\$\("saleReceipt"\)\.hidden/);
 assert.match(js,/!orderEntered\|\|receiptOpen/);
 assert.match(js,/if\(!\$\("saleReceipt"\)\.hidden\)throw Error/);
 assert.match(js,/\$\("saleReceipt"\)\.hidden=false/);
 assert.match(js,/\$\("saleOrder"\)\.value=""/);
});

test("server still refuses duplicates and unauthorized code issuance",()=>{
 assert.match(backend,/authenticateOperator\(req,env\)/);
 assert.match(backend,/hasOpsRole\(auth\.operator,"publisher"\)/);
 assert.match(backend,/OPS_SALES_ENABLED/);
 assert.match(backend,/ORDER_RECOVERY_ENABLED/);
 assert.match(backend,/data\?\.paymentConfirmed!==true/);
 assert.match(backend,/data\?\.contentConfirmed!==true/);
 assert.match(backend,/ORDER_ISSUE_REJECTED/);
 assert.match(backend,/INSERT INTO activation_codes/);
 assert.match(backend,/order_recovery_credentials/);
});
