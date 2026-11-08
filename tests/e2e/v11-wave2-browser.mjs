// Real Chromium interactions against an isolated local Wrangler mirror + fresh D1 fixture.
// NEVER targets the remote site, and NEVER uses customer accounts or production data.
import assert from "node:assert/strict";
import {chromium} from "playwright-core";
const url=process.env.QA_ORIGIN||"http://localhost:8787";
const previewPassword=process.env.STAGING_PREVIEW_PASSWORD;
if(!previewPassword)throw Error("QA_LOCAL_PREVIEW_PASSWORD_REQUIRED");
const browser=await chromium.launch({
 executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-gpu"]
});
let checks=0;
const ok=(name,condition)=>{assert.ok(condition,name);checks++;console.log("BROWSER_PASS__"+name)};
const context=await browser.newContext({
 viewport:{width:1320,height:850},
 httpCredentials:{username:"reviewer",password:previewPassword},
 ignoreHTTPSErrors:true
});
const page=await context.newPage();
page.on("pageerror",e=>console.error("BROWSER_PAGE_ERROR__"+String(e.message).slice(0,230)));
await page.addInitScript(()=>{
 window.__qaNarrationCalls=0;
 if(window.speechSynthesis){
  try{window.speechSynthesis.speak=function(){window.__qaNarrationCalls++}}catch{}
 }
});
try{
 const response=await page.goto(url+"/",{waitUntil:"domcontentloaded",timeout:30000});
 ok("STAGING_PROTECTED_BROWSER_AUTH",response.status()===200);
 await page.locator("#view-library").waitFor({state:"attached"});
 ok("REAL_INDEX_WITH_V11_UI",await page.locator("#myBookshelf").count()===1&&await page.locator("#mwWelcomeDialog").count()===1);
 const voucher=await page.evaluate(async()=>{
  const res=await fetch("/api/staging/test-voucher",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({category:"cet4"})});
  return {status:res.status,data:await res.json()};
 });
 assert.equal(voucher.status,201,JSON.stringify({status:voucher.status,error:voucher.data?.error||null}));
 ok("QA_ONLY_TEST_VOUCHER_ISSUED",voucher.data.testOnly===true&&typeof voucher.data.activationCode==="string");
 const username="wave2qa_"+Date.now().toString(36).slice(-8);
 const pass="Wave2Qa!"+Date.now().toString(36)+"Test";
 await page.locator("#topAccount").click();
 await page.locator("#switchRegister").click();
 await page.locator("#rName").fill(username);
 await page.locator("#rPass").fill(pass);
 await page.locator("#rPassConfirm").fill(pass+"x");
 await page.locator("#rCode").fill(voucher.data.activationCode);
 let registerRequests=0;
 page.on("request",req=>{if(req.url().includes("/api/auth/register"))registerRequests++});
 await page.locator("#registerForm [type=submit]").click();
 await page.getByText("两次输入的密码不一致",{exact:false}).first().waitFor({state:"visible",timeout:5000});
 ok("REGISTER_MISMATCH_BLOCKED_BEFORE_NETWORK",registerRequests===0);
 await page.locator("#rPassConfirm").fill(pass);
 await page.locator("#registerForm [type=submit]").click();
 await page.locator("#mwWelcomeDialog").waitFor({state:"visible",timeout:20000});
 ok("NEW_ACCOUNT_THREE_STEP_WELCOME_OPENS",registerRequests===1&&await page.locator("#mwWelcomePosition").textContent()==="1 / 3");
 await page.locator("#mwWelcomeNext").click();
 ok("WELCOME_STEP_TWO",await page.locator("#mwWelcomePosition").textContent()==="2 / 3");
 await page.locator("#mwWelcomeNext").click();
 ok("WELCOME_STEP_THREE",await page.locator("#mwWelcomePosition").textContent()==="3 / 3");
 await page.locator("#mwWelcomeNext").click();
 await page.locator("#mwWelcomeDialog").waitFor({state:"hidden",timeout:12000});
 let onboard=await page.evaluate(async()=>(await fetch("/api/me/onboarding")).json());
 ok("WELCOME_COMPLETION_PERSISTED",onboard.eligible===true&&onboard.pending===false&&onboard.completionKind==="finished");
 await page.locator('[data-nav="library"]').locator(':visible').first().click();
 await page.locator('#bookGrid [data-cloud-bookmark="wave2-qa-book"]').waitFor({state:"visible",timeout:16000});
 await page.locator('#bookGrid [data-cloud-bookmark="wave2-qa-book"]').click();
 await page.waitForFunction(async()=>{
  const r=await fetch("/api/me/bookshelf");if(!r.ok)return false;
  const d=await r.json();return d.books?.some(b=>b.book_id==="wave2-qa-book"&&b.bookmarked===true&&b.state==="want");
 },null,{timeout:11000});
 ok("REAL_BOOKMARK_WANT_STATE_SAVED",true);
 await page.locator('[data-nav="account"]').locator(':visible').first().click();
 await page.locator('[data-personal-filter="want"]').click();
 await page.locator('[data-personal-book="wave2-qa-book"]').waitFor({state:"visible",timeout:11000});
 ok("ACCOUNT_SHELF_WANT_TAB_DISPLAYS_SAVED_BOOK",true);
 await page.locator('[data-my-shelf-read="wave2-qa-book"]').click();
 await page.locator('[data-cloud-choose="wave2-qa-chapter"]').click();
 await page.locator('#storyText [data-cloud-word="wave2-qa-word"]').waitFor({state:"visible",timeout:15000});
 await page.waitForFunction(async()=>{
  const r=await fetch("/api/me/bookshelf");if(!r.ok)return false;
  const d=await r.json();return d.books?.some(b=>b.book_id==="wave2-qa-book"&&b.state==="reading");
 },null,{timeout:11000});
 ok("OPEN_CHAPTER_UPDATES_READING_STATUS",true);
 const p=page.locator("#storyText p[data-audio-paragraph]").nth(1);
 await p.hover();await p.click();
 ok("HOVER_AND_PLAIN_PARAGRAPH_CLICK_DO_NOT_START_SPEECH",
  !(await page.locator("#player").evaluate(el=>el.classList.contains("show"))));
 await page.locator("#playerSeek").evaluate(el=>el.dispatchEvent(new Event("change",{bubbles:true})));
 ok("SEEK_WITHOUT_READ_DOES_NOT_START_SPEECH",
  !(await page.locator("#player").evaluate(el=>el.classList.contains("show"))));
 await page.locator('#storyText [data-cloud-word="wave2-qa-word"]').click();
 await page.locator("#wordPop.on").waitFor({state:"visible",timeout:7000});
 const cards=await page.evaluate(()=>{
  const word=document.querySelector('#storyText [data-cloud-word="wave2-qa-word"]')?.getBoundingClientRect();
  const card=document.querySelector("#wordPop")?.getBoundingClientRect();
  return {wordLeft:word?.left,wordBottom:word?.bottom,cardLeft:card?.left,cardTop:card?.top,cardWidth:card?.width,viewportWidth:innerWidth};
 });
 ok("DESKTOP_WORDCARD_ANCHORED_WITHIN_VIEWPORT",
  Number.isFinite(cards.cardLeft)&&cards.cardLeft>=0&&cards.cardLeft+cards.cardWidth<=cards.viewportWidth+2);
 ok("CLICK_WORD_DOES_NOT_START_CHAPTER_NARRATION",
  !(await page.locator("#player").evaluate(el=>el.classList.contains("show"))));
 const wordRef=await page.evaluate(async()=>{
  const r=await fetch("/api/lexicon/lookup?word=the&originWordId=wave2-qa-word");
  return {status:r.status,data:await r.json()};
 });
 ok("SUPPLEMENTAL_DICTIONARY_FROM_AUTHORIZED_EXAMPLE",
  wordRef.status===200&&wordRef.data?.fallback?.headword==="the"&&wordRef.data?.fallback?.referenceOnly===true);
 await page.locator("#topRead").click();
 await page.locator("#player.show").waitFor({state:"visible",timeout:8000});
 ok("EXPLICIT_READ_BUTTON_STARTS_PLAYER",true);
 await page.locator("#playerStop").click();
 ok("STOP_NARRATION_DISMISSES_PLAYER",
  !(await page.locator("#player").evaluate(el=>el.classList.contains("show"))));
 await page.setViewportSize({width:390,height:844});
 await page.locator('#storyText [data-cloud-word="wave2-qa-word"]').click();
 await page.locator("#wordPop.on").waitFor({state:"visible",timeout:7000});
 const mobile=await page.evaluate(()=>{
  const box=document.querySelector("#wordPop")?.getBoundingClientRect();
  return {bottom:innerHeight-box.bottom,height:box.height,viewport:innerHeight};
 });
 ok("MOBILE_BOTTOM_WORDCARD_REMAINS_BOTTOM_ANCHORED",Math.abs(mobile.bottom)<12);
 await page.locator("#nextChapter").click();
 await page.waitForFunction(async()=>{
  const r=await fetch("/api/me/bookshelf");if(!r.ok)return false;
  const d=await r.json();return d.books?.some(b=>b.book_id==="wave2-qa-book"&&b.state==="finished");
 },null,{timeout:13000});
 ok("FINISH_LAST_CHAPTER_UPDATES_BOOK_STATE",true);
 await page.locator('[data-nav="account"]').locator(':visible').first().click();
 await page.locator('[data-personal-filter="finished"]').click();
 await page.locator('[data-personal-book="wave2-qa-book"]').waitFor({state:"visible"});
 ok("ACCOUNT_SHELF_FINISHED_TAB_VISIBLE",true);
 await page.locator('[data-my-shelf-save="wave2-qa-book"]').click();
 await page.waitForFunction(async()=>{
  const r=await fetch("/api/me/bookshelf");if(!r.ok)return false;
  const d=await r.json();return d.books?.some(b=>b.book_id==="wave2-qa-book"&&!b.bookmarked&&b.state==="finished");
 },null,{timeout:11000});
 ok("UNBOOKMARK_RETAINS_PROGRESS_AND_FINISHED_STATE",true);
 const creds={
  username,
  password:pass
 };
 const logout=await page.evaluate(async()=>fetch("/api/auth/logout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}));
 assert.equal(logout.status,200);
 await page.reload({waitUntil:"domcontentloaded"});
 await page.locator("#topAccount").click();
 await page.locator("#lName").fill(creds.username);
 await page.locator("#lPass").fill(creds.password);
 await page.locator("#loginForm [type=submit]").click();
 await page.waitForFunction(async()=>{
  const r=await fetch("/api/auth/me");return r.ok;
 },null,{timeout:16000});
 ok("RETURNING_ACCOUNT_LOGIN_PRESERVES_SESSION",true);
 ok("COMPLETED_WELCOME_DOES_NOT_REOPEN",!(await page.locator("#mwWelcomeDialog").evaluate(el=>el.open)));
 console.log("WAVE2_REAL_CHROMIUM_LOCAL_MIRROR_PASS__"+checks+"_CHECKS__NO_REMOTE_WRITES");
}catch(error){
 console.error("WAVE2_REAL_CHROMIUM_LOCAL_MIRROR_FAILED__"+String(error.message).slice(0,500));
 try{await page.screenshot({path:"/tmp/wave2-browser-failed.png",fullPage:true,timeout:5000})}catch{}
 throw error;
}finally{
 await browser.close();
}