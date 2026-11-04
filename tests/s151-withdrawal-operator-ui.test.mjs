import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const page=read("../public/ops.html");
const ui=read("../public/ops-console.js");
const api=read("../src/ops-console.js");
const configCheck=read("../scripts/check-production-config.mjs");

test("S151: published book withdrawal uses a read-only matched title, reason, consent and second confirmation",()=>{
  assert.match(page,/<input id="withdrawTitle"[^>]*readonly/);
  assert.match(page,/<textarea id="withdrawReason"[^>]*minlength="12"/);
  assert.match(page,/<input type="checkbox" id="withdrawConfirm"/);
  assert.match(page,/id="withdrawHelp"/);
  assert.match(page,/确认下架并从书架移除/);
  assert.match(page,/ops-console\.js\?v=20261104-v23-withdraw-ready/);
  assert.match(ui,/\$\("withdrawTitle"\)\.value=book\.title/);
  assert.match(ui,/\$\("withdrawReason"\)\.value\.trim\(\)\.length>=12/);
  assert.match(ui,/\$\("withdrawConfirm"\)\.checked/);
  assert.match(ui,/window\.confirm\("确定下架《"/);
  assert.match(ui,/confirmTitle:\$\("withdrawTitle"\)\.value/);
  new Script(ui,{filename:"ops-console.js"});
});

test("S151: UI explains disabled permission instead of silently presenting a dead button",()=>{
  assert.match(ui,/当前下架权限尚未启用/);
  assert.match(ui,/请先填写至少 12 字/);
  assert.match(ui,/请先确认下架影响/);
  assert.match(ui,/readiness\.canWithdraw/);
  assert.match(ui,/\$\("withdraw"\)\.disabled=!/);
});

test("S151: the backend remains gated by publisher role, feature flag, title, reason and append-only audit",()=>{
  assert.match(api,/OPS_WITHDRAWAL_ENABLED!=="true"/);
  assert.match(api,/hasOpsRole\(auth\.operator,"publisher"\)/);
  assert.match(api,/if\(b\.title!==d\.confirmTitle\)/);
  assert.match(api,/d\.reason\.trim\(\)\.length<12/);
  assert.match(api,/confirmAction!=="WITHDRAW_PUBLIC_ACCESS"/);
  assert.match(api,/UPDATE books SET status='draft'/);
  assert.match(api,/UPDATE chapters SET published_at=NULL/);
  assert.match(api,/INSERT INTO ops_audit_events/);
  assert.match(api,/ops_audit_events WHERE event_type='book.withdraw'/);
  assert.match(configCheck,/NO_OPS_PUBLISHING_IN_RELEASE_CONFIG/);
  assert.match(configCheck,/OPS_WITHDRAWAL_ENABLED/);
});
