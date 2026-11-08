// Local visual acceptance only: no website API, Cloudflare or D1.
import {chromium} from 'playwright';
import {resolve} from 'node:path';
const sample=[
'<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>',
'<div class="app-shell"><section id="view-words" class="view active"><div class="wordbook-grid"><article class="vocab-card">',
'<h3>promise</h3><p class="vocab-phonetic">/ˈprɑːmɪs/</p><p>n./v. 承诺；答应</p>',
'<div class="vocab-section"><b>例句 / EXAMPLE</b><button class="v11-example-audio">♫ 朗读例句</button>',
'<div class="vocab-example">',
'<button class="v11-example-word" data-example-word="she">She</button> ',
'<button class="v11-example-word" data-example-word="made">made</button> ',
'<button class="v11-example-word" data-example-word="a">a</button> ',
'<button class="v11-example-word" data-example-word="promise">promise</button> ',
'<button class="v11-example-word" data-example-word="to">to</button> ',
'<button class="v11-example-word" data-example-word="her">her</button> ',
'<button class="v11-example-word" data-example-word="sister">sister</button>.',
'</div><p class="vocab-translation">她向妹妹许下了承诺。</p></div>',
'<div class="card-tools"><button>♫ 听发音</button><button>✓ 已掌握</button></div>',
'</article></div></section></div></body></html>'
].join('');
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const report=[];
 for(const width of [390,984]){
  for(const dark of [false,true]){
   const page=await browser.newPage({viewport:{width,height:800}});
   await page.setContent(sample);
   for(const css of ['public/styles.css','public/v11-wordbook.css','public/v11-responsive.css'])
    await page.addStyleTag({path:resolve(css)});
   if(dark)await page.evaluate(()=>document.documentElement.dataset.theme='dark');
   const computed=await page.evaluate(()=>{
    const example=document.querySelector('.vocab-example');
    const words=[...document.querySelectorAll('.vocab-example .v11-example-word')];
    const w=getComputedStyle(words[0]);
    const audio=getComputedStyle(document.querySelector('.v11-example-audio'));
    const cardButton=getComputedStyle(document.querySelector('.card-tools button'));
    const rects=words.map(el=>el.getBoundingClientRect());
    return {text:example.textContent.trim(),count:words.length,
      display:w.display,padding:w.padding,margin:w.margin,
      borderTop:w.borderTopWidth,borderBottom:w.borderBottomWidth,borderRadius:w.borderRadius,
      background:w.backgroundColor,decoration:w.textDecorationLine,
      audioBorder:audio.borderTopWidth,actionRadius:cardButton.borderRadius,
      firstSameRow:Math.abs(rects[0].top-rects[1].top)<2,
      overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth)};
   });
   const valid=computed.text==='She made a promise to her sister.'&&computed.count===7
    &&computed.display==='inline'&&computed.padding==='0px'&&computed.margin==='0px'
    &&computed.borderTop==='0px'&&computed.borderBottom==='0px'
    &&computed.borderRadius==='0px'&&computed.background==='rgba(0, 0, 0, 0)'
    &&computed.decoration.includes('underline')&&computed.audioBorder!=='0px'
    &&computed.actionRadius!=='0px'&&computed.firstSameRow&&computed.overflow<3;
   report.push({width,dark,passed:valid,...computed});
   await page.close();
  }
 }
 console.log(JSON.stringify(report,null,2));
 if(report.some(r=>!r.passed))process.exitCode=1;
 else console.log('V11_WORDBOOK_EXAMPLE_INLINE_VISUAL_PASSED');
}finally{await browser?.close()}
