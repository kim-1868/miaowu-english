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
test("S19 manual recovery UI never collects passwords or creates self-service credentials",()=>{
 assert.match(app,/function showManualRecovery\(\)/);
 assert.match(app,/忘记密码？人工找回/);
 assert.doesNotMatch(app,/function showRecoverAccount\(\)/);
 assert.doesNotMatch(app,/serverRequest\('\\/api\\/auth\\/recover','POST'/);
 assert.ok(!app.includes('localStorage.setItem("recoveryCode"'));
 assert.ok(!app.includes("location.search='?recoveryCode"));
});
test("S19 customer storefront hides prototype stories and only releases D1-approved book cards",()=>{
 assert.match(app,/serverRequest\('\/api\/books\?category='/);
 assert.match(app,/isRainyNight=book\.id==='rainy-night-archives-cet4-v1'/);
 assert.doesNotMatch(html,/玫瑰未落幕|演示内容|上线准备中/);
 assert.doesNotMatch(app,/book-item demo-book-item|book-item planned-book-item/);
});
