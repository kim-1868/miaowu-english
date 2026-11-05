import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("public/ops.html");
const css=read("public/ops-console.css");
const customer=read("public/ops-customers.js");
const claims=read("public/ops-claims.js");
const main=read("public/ops-console.js");
const customerApi=read("src/ops-customers.js");
const claimsApi=read("src/ops-claims.js");
function region(id){
 const start=html.indexOf('<section class="panel" id="'+id+'"');
 assert.ok(start>0,"missing "+id+" panel");
 const end=html.indexOf("</section>",start);
 assert.ok(end>start);
 return html.slice(start,end);
}
test("S166: both operator panels default closed, retain live totals in their summaries and expand independently",()=>{
 const a=region("customerPanel"),b=region("claimsPanel");
 assert.match(a,/<details id="customerFold" class="ops-record-section">/);
 assert.match(b,/<details id="claimsFold" class="ops-record-section">/);
 assert.ok(!/<details[^>]*\sopen(?:\s|=|>)/.test(a+b),"both panels must default closed");
 for(const [section,overview,controls] of [
  [a,"customerOverview",["customerTabCodes","customerTabUsers","customerSearch","customerCategory","customerCodeStatus","customerList","customerPrev","customerNext"]],
  [b,"claimsOverview",["claimsSearch","claimsReviewFilter","claimsList","claimsPrev","claimsNext"]]
 ]){
  const summary=section.slice(section.indexOf("<summary"),section.indexOf("</summary>")+10);
  const content=section.slice(section.indexOf('class="ops-record-section-content"'));
  assert.ok(summary.includes('id="'+overview+'"'),"live counters stay outside collapsible contents");
  for(const id of controls){
   assert.ok(content.includes('id="'+id+'"'),"keep existing form/action ID "+id);
   assert.ok(!summary.includes('id="'+id+'"'),"query and action controls stay inside collapsed body");
  }
 }
 assert.match(html,/ops-console\.css\?[^"]*layout=20261106-v41/);
 assert.match(html,/ops-console\.js\?[^"]*layout=20261106-v41/);
});
test("S166: customer and claim rows use accessible one-column disclosure lists with safe summary and full detail",()=>{
 for(const [source,name] of [[customer,"customers"],[claims,"claims"]]){
  new Script(source.replace(/^export /gm,""),{filename:name+".js"});
  assert.ok(source.includes('"details"'),name+" uses native details rows");
  assert.ok(source.includes('"summary"'),name+" uses native summary controls");
  assert.ok(source.includes('ops-record-summary'));
  assert.ok(source.includes("ops-record-body"));
  assert.ok(source.includes("ops-record-meta"));
  assert.ok(source.includes("复制订单号"));
  assert.ok(source.includes("replace(/^ORD-/"),"complete order still available inside details");
  assert.ok(source.includes("••••"),"long order numbers are shortened in summary");
 }
 assert.match(css,/#customerPanel \.ops-customer-list,#claimsPanel \.ops-customer-list\{/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/@media\(prefers-color-scheme:dark\)/);
 assert.match(css,/\.ops-record-section\[open\]/);
 assert.match(css,/\.ops-record\[open\]/);
});
test("S166: unchanged operational actions and filters remain behind disclosure without bypass",()=>{
 assert.ok(customer.includes('api("/api/ops/customers/voucher-action","POST"'));
 assert.ok(customer.includes('window.confirm('));
 assert.ok(customer.includes('window.prompt('));
 assert.ok(customer.includes('expectedStatus:x.status'));
 assert.ok(customer.includes('reason:reason.trim(),requestId:crypto.randomUUID()'));
 assert.ok(customer.includes('api("/api/ops/customers/query","POST"'));
 assert.ok(customer.includes('mode,page,search:$("customerSearch").value.trim()'));
 assert.ok(customer.includes('category:mode==="codes"?$("customerCategory").value:""'));
 assert.ok(claims.includes('api("/api/ops/claims/action","POST"'));
 assert.ok(claims.includes('api("/api/ops/claims/query","POST"'));
 assert.ok(claims.includes('reason:note.trim(),requestId:crypto.randomUUID()'));
 assert.ok(claims.includes('if(!confirm('));
 assert.ok(claims.includes('reviewStatus:$("claimsReviewFilter").value'));
 assert.ok(claims.includes('[["restore","恢复本单权益"]]'));
 assert.ok(claims.includes('[["verify","核实通过"],["flag","标记异常"],["revoke","撤销本单权益"]]'));
 assert.ok(main.includes("/ops-customers.js?v=20261106-v41-compact"));
 assert.ok(main.includes("/ops-claims.js?v=20261106-v41-compact"));
});
test("S166: page size is ten in client and server; all existing result and entitlement fences remain intact",()=>{
 assert.ok(customer.includes("const pageSize=10;"));
 assert.ok(customerApi.includes("const PAGE_SIZE=10;"));
 assert.ok(customerApi.includes("LIMIT ? OFFSET ?"));
 assert.ok(customerApi.includes("APP_ENV"));
 assert.ok(customerApi.includes("publisher"));
 assert.ok(claims.includes("Math.ceil(total/10)"));
 assert.ok(claims.includes("page*10>=total"));
 assert.ok(claimsApi.includes("LIMIT 10 OFFSET ?"));
 assert.ok(claimsApi.includes("(page-1)*10"));
 assert.ok(claimsApi.includes("pageSize:10"));
 assert.ok(claimsApi.includes('["verify","flag","revoke","restore"]'));
 assert.ok(claimsApi.includes('hasOpsRole(auth.operator,"publisher")'));
});
