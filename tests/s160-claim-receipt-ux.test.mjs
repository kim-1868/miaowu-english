import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../public/claim.html",import.meta.url),"utf8");
const js=readFileSync(new URL("../public/claim.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../public/claim.css",import.meta.url),"utf8");
test("V36: claim receipt stays visible after copying and backup is expanded",()=>{
 for(const id of ["voucher","copyVoucher","copyVoucherHint","recovery","copyRecovery",
  "copyRecoveryHint","recoveryDetails","claimForm","receipt","packageName"])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.ok(html.indexOf('id="voucher"')<html.indexOf('前往妙屋英语，注册并激活'));
 assert.match(html,/复制学习兑换码/);
 assert.match(html,/账号找回备用凭证/);
 assert.match(html,/小红书-订单编号/);
 assert.match(html,/无需手动添加/);
 assert.match(html,/感谢你选择妙屋英语/);
 assert.match(html,/每笔订单仅可领取一次/);
 assert.doesNotMatch(html,/后台会进行人工对账|人工对账|复制全部信息|一键复制全部/);
 assert.doesNotMatch(html,/不支持自动付款核验/);
 assert.match(js,/copySingle\("voucher"\)/);
 assert.match(js,/copySingle\("recovery"\)/);
 assert.match(js,/已复制！现在可以前往妙屋英语/);
 assert.match(js,/navigator\.clipboard\.writeText\(value\)/);
 assert.match(js,/fallbackCopy\(value\)/);
 assert.doesNotMatch(js,/JSON\.stringify\(\{[^}]*activationCode[^}]*recoveryKey/);
 assert.match(html,/<section id="recoveryDetails"/);
 assert.doesNotMatch(html,/<details id="recoveryDetails"|<summary>/);
 assert.match(js,/RECEIPT_KEY/);
 assert.match(js,/sessionStorage/);
 assert.match(js,/restoreReceipt\(\)/);
 assert.doesNotMatch(js,/addEventListener\("pagehide"/);
 assert.match(css,/\.voucher-panel/);
 assert.match(css,/\.voucher-copy/);
 assert.match(css,/\[hidden\]\{display:none!important\}/);
});
