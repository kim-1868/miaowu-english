import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("wave1: desktop learning card anchors to exact clicked word; phone stays bottom sheet",()=>{
 const app=read("public/app.js");
 assert.match(app,/function showCloudWord\(wordId,anchorEl=null\)/);
 assert.match(app,/showCloudWord\(word\.dataset\.cloudWord,word\)/);
 assert.match(app,/studyAnchorEl=anchorEl/);
 assert.match(app,/function positionStudyPopover\(/);
 assert.match(app,/getBoundingClientRect/);
 assert.match(app,/window\.addEventListener\('resize',positionStudyPopover/);
 assert.match(app,/window\.addEventListener\('scroll',positionStudyPopover/);
 assert.match(app,/selectedStudyWordId=null;studyAnchorEl=null/);
 assert.match(app,/backdrop\.classList\.remove\('on'\)/);
 assert.match(app,/tray\.style\.setProperty\('bottom','0','important'\)/);
 assert.match(app,/max-height','65dvh'/);
});
test("wave1: operator announcement preview is local and never publishes an unsaved draft",()=>{
 const html=read("public/ops.html"),js=read("public/ops-updates.js");
 assert.match(html,/id="updatesLocalPreview"[^>]*>预览当前公告<\/button>/);
 assert.match(html,/id="updatesLocalPreviewDialog"/);
 assert.match(html,/id="updatesLocalPreviewBody"/);
 assert.doesNotMatch(html,/href="\/"[^>]*>查看预览首页/);
 assert.match(js,/\$\("updatesLocalPreview"\)\.addEventListener\("click"/);
 assert.match(js,/previewDialog\.showModal\(\)/);
 assert.match(js,/\$\("updatesLocalPreviewBody"\)\.textContent=d\.body/);
 const fn=js.slice(js.indexOf('$("updatesLocalPreview").addEventListener'),js.indexOf('$("updatesNew").addEventListener'));
 assert.doesNotMatch(fn,/fetch\(|\bapi\(|window\.open|location\.href|window\.location|innerHTML/);
});
test("wave1: public notice client rejects stale responses and is source compatible",()=>{
 const js=read("public/site-updates.js");
 assert.match(js,/let latestRequestId=0/);
 assert.match(js,/if\(requestId!==latestRequestId\)return/);
 assert.match(js,/miaowu_notice_dismissed_id_v1/);
 assert.match(js,/\/api\/updates\/latest/);
});
test("wave1: phone/touch rules extend prior release without altering learning data",()=>{
 const css=read("public/v11-responsive.css"),html=read("public/index.html");
 assert.match(css,/PUBLIC-03/);
 assert.match(css,/min-height:\s*44px/);
 assert.match(css,/@media\s*\(max-width:\s*360px\)/);
 assert.match(html,/v11-responsive\.css\?v=20261108-wave1-mobile/);
 assert.match(html,/app\.js\?v=20261108-wave2-bookshelf/);
});
test("wave1: revoked vouchers never claim effective entitlement in ops listings",()=>{
 const code=read("src/ops-claims.js"),users=read("src/ops-customers.js");
 assert.match(code,/a\.status<>'revoked'/);
 assert.match(users,/a\.status<>'revoked'/);
 assert.match(users,/v\.status='revoked'/);
});
test("wave2: optional features still exclude P4 study engine",()=>{
 const app=read("public/app.js"),worker=read("src/worker.js");
 assert.doesNotMatch(worker,/user_study_schedules|study-schedule-store/);
 assert.match(app,/MiaowuOnboarding|loadPersonalBookshelf/);
 assert.doesNotMatch(read("public/chapter-words.js"),/自愿复习已学词/);
});
