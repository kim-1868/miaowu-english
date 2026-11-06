// Browser-based layout acceptance, entirely local and isolated from staging/D1.
// Requires Playwright chromium: npm install --no-save playwright@1.56.1
//                          && npx playwright install --with-deps chromium
import {chromium} from "playwright";
import {resolve} from "node:path";
const widths=[320,344,360,375,390,430,540,600,601,680,768,820,821,1024,1280,1440,1920];
const shell=String.raw\`
<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<div class="app-shell">
 <section id="view-library" class="view active">
  <div class="home-shelf-layout">
   <div class="book-grid">
    <article class="book-item cloud-book-item">
      <div class="book-cover"><div class="book-tag">已解锁</div></div>
      <div class="book-info">
       <div class="line1"><h3>雨夜档案</h3></div>
       <p>悬疑故事</p>
       <div class="shelf-progress"><div class="progress-text"><span>已同步阅读进度</span><span>2 / 6 章</span></div><div class="progress-track"></div></div>
       <div class="book-actions"><button class="primary" data-measure>继续阅读 →</button><button class="secondary-btn cloud-bookmark-button" data-measure>✓ 已收藏</button></div>
      </div>
    </article>
    <article class="book-item cloud-book-item">
      <div class="book-cover"><div class="book-tag">会员专享</div></div>
      <div class="book-info">
       <div class="line1"><h3>退婚后，京圈太子爷</h3></div>
       <p>故事介绍</p>
       <div class="shelf-progress"><div class="progress-text"><span>尚未开始阅读</span><span>—</span></div></div>
       <div class="book-actions"><button class="primary" data-measure>查看会员目录 →</button><button class="secondary-btn cloud-bookmark-button" data-measure>♡ 收藏小说</button></div>
      </div>
    </article>
    <article class="book-item cloud-book-item">
      <div class="book-cover"></div>
      <div class="book-info">
       <div class="line1"><h3>替嫁当天，我撕了婚约</h3></div>
       <div class="shelf-progress"><div class="progress-text"><span>尚未开始阅读</span><span>—</span></div></div>
       <div class="book-actions"><button class="primary" data-measure>开始阅读 →</button><button class="secondary-btn cloud-bookmark-button" data-measure>✓ 已收藏</button></div>
      </div>
    </article>
   </div>
   <aside class="home-study-card"></aside>
  </div>
 </section>
 <section id="view-account" class="view active">
  <section id="myBookshelf" class="v11-personal-shelf">
   <div class="v11-my-shelf-list">
    <article class="v11-my-shelf-card">
     <div class="v11-my-shelf-cover"></div>
     <div class="v11-my-shelf-info">
      <h3>雨夜档案</h3><p>最近读到第 3 章</p>
      <div class="v11-my-shelf-actions">
        <button class="primary" data-measure>继续阅读 →</button>
        <button class="secondary-btn" data-measure>✓ 已收藏 · 移除</button>
      </div>
     </div>
    </article>
   </div>
  </section>
 </section>
 <section id="view-words" class="view active">
  <div class="wordbook-grid">
   <div class="vocab-card"><div class="card-tools">
     <button data-measure>♫ 听发音</button>
     <button data-measure>✓ 已掌握</button>
     <button data-measure>移出生词本</button>
   </div></div>
  </div>
 </section>
 <section id="view-echo" class="view active">
  <div class="quiz-card"><div class="quiz-foot"><button data-measure>继续做题</button><button data-measure>回到书架</button></div></div>
 </section>
</div>
</body></html>\`;
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const problems=[],results=[];
 for(const width of widths){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  await page.setContent(shell,{waitUntil:"domcontentloaded"});
  for(const css of ["public/styles.css","public/flashcards.css","public/v11-bookshelf.css","public/v11-responsive.css"])
   await page.addStyleTag({path:resolve(css)});
  const report=await page.evaluate(()=>{
   const buttons=[...document.querySelectorAll("[data-measure]")];
   return {
    documentOverflow:Math.max(0,document.documentElement.scrollWidth-window.innerWidth),
    controls:buttons.map(el=>{
      const range=document.createRange();range.selectNodeContents(el);
      const boxes=[...range.getClientRects()];
      const rect=el.getBoundingClientRect();
      return {label:el.textContent.trim(),width:Math.round(rect.width),
       nowrap:getComputedStyle(el).whiteSpace==="nowrap",
       lines:boxes.length,overflow:Math.max(0,el.scrollWidth-el.clientWidth),
       visible:rect.width>0&&rect.height>0};
    })
   };
  });
  for(const c of report.controls){
   if(!c.nowrap||c.lines!==1||c.overflow>2||!c.visible)
    problems.push({viewport:width,...c});
  }
  if(report.documentOverflow>2)problems.push({viewport:width,documentOverflow:report.documentOverflow});
  results.push({viewport:width,controls:report.controls.length,overflow:report.documentOverflow});
  await page.close();
 }
 console.log(JSON.stringify({checkedViewports:results,problems},null,2));
 if(problems.length)process.exitCode=1;
 else console.log("V11_RESPONSIVE_BROWSER_MATRIX_PASSED");
}finally{await browser?.close()}
