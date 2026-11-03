// Guided merchant-only offline tool. Produces one private paid-order record,
// one voucher and one independent one-time recovery key. Never contacts Cloudflare.
// A selected category MUST have saleable content and a real confirmed payment.
import {createInterface} from "node:readline/promises";
import {stdin as input,stdout as output} from "node:process";
import {resolve} from "node:path";
import {loadVoucherCatalog} from "./voucher-catalog.mjs";
import {fulfillOrders} from "./fulfill-voucher-orders.mjs";

const ORDER=/^ORD-[A-Z0-9][A-Z0-9_-]{5,55}$/;
const available=loadVoucherCatalog().filter(x=>x.salesEnabled);
if(!process.stdin.isTTY){
 console.error("INTERACTIVE_TERMINAL_REQUIRED");
 process.exitCode=1;
}else if(typeof process.env.ACTIVATION_PEPPER!=="string"||
         process.env.ACTIVATION_PEPPER.length<32){
 console.error("Set the EXISTING production ACTIVATION_PEPPER privately in the operator terminal; never paste it into commands/chat.");
 process.exitCode=1;
}else{
 const cli=createInterface({input,output});
 try{
  output.write("妙屋英语 · 人工发码（本地操作；不会向 Cloudflare 导入数据）\n");
  available.forEach((c,i)=>output.write((i+1)+". "+c.name+" ["+c.slug+"]\n"));
  const choice=Number((await cli.question("选择已可售的商品分类编号：")).trim());
  const selected=available[choice-1];
  if(!selected||!Number.isInteger(choice))throw Error("INVALID_CATEGORY_SELECTION");
  const raw=(await cli.question("输入已经确认付款的小红书订单号：")).normalize("NFKC").trim().toUpperCase();
  const order=raw.startsWith("ORD-")?raw:"ORD-"+raw;
  if(!ORDER.test(order))throw Error("INVALID_ORDER_REFERENCE");
  const approved=(await cli.question("确认已收到该订单付款、类目内容已可交付。输入 PAID 确认：")).trim();
  if(approved!=="PAID")throw Error("PAYMENT_OR_PRODUCT_NOT_CONFIRMED");
  const result=await fulfillOrders({
   ordersCsv:"order_reference,category_id,payment_confirmed\n"+
     order+","+selected.slug+",YES\n",
   pepper:process.env.ACTIVATION_PEPPER,
   outputDir:resolve("private-output")
  });
  output.write("已预留 1 笔订单，仅生成私有文件；尚未导入生产 D1。\n");
  output.write("库存："+result.inventoryName+"\n");
  output.write("导入："+result.importName+"\n");
  output.write("必须先完成生产 D1 的 003 迁移，再核对并导入 SQL。\n");
  output.write("确认 D1 中状态为 unused 后，再把激活码和独立找回凭证发送给买家。\n");
 }catch(error){console.error("ISSUANCE_STOPPED:",error.message);process.exitCode=1}
 finally{cli.close();}
}
