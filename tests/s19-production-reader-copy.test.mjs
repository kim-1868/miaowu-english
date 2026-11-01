import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");

test("S19 customer-facing auth forms do not link to blocked staging laboratories",()=>{
 assert.ok(!app.includes('href="/account-test.html"'));
 for(const obsolete of ["注册并激活测试账号","测试账号密码","一次性测试激活码",
 "登录我的书房</h2>\',\n        \'<p>使用之前创建的真实测试用户名",
 "测试分类已成功添加","输入另一枚测试激活码",
 "当前站点处于测试环境，不代表正式售卖"]){
  assert.ok(!app.includes(obsolete),obsolete);
 }
 assert.match(app,/新的分类激活码/);
 assert.match(app,/分类权益及售后/);
});
test("S19 reader recovery UI does not persist credentials to local storage or URL",()=>{
 assert.match(app,/function showRecoveryNotice\(code\)/);
 assert.match(app,/function showRecoverAccount\(\)/);
 assert.match(app,/serverRequest\('\/api\/auth\/recover','POST'/);
 assert.match(app,/恢复成功后原码作废/);
 assert.ok(!app.includes('localStorage.setItem("recoveryCode"'));
 assert.ok(!app.includes("location.search='?recoveryCode"));
});
test("S19 preserved Rose demo stays labeled as browser-only and never looks paid",()=>{
 assert.match(app,/name:'玫瑰未落幕'/);
 assert.match(app,/仅供体验 · 不出售/);
 assert.match(app,/互动演示 · 非正式商品/);
 assert.match(html,/玫瑰未落幕/);
});
