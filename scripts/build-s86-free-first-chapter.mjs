// S86: intentionally public ONLY the first high-density chapter of one book.
// Never export other chapters, raw Markdown, unpublished glosses or IPA data.
import {readFileSync} from "node:fs";
const escape=s=>String(s).replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
export const PUBLIC_S86_STORY={id:"rejected-family-second-life",
 title:"重生后我不再讨好他们",
 description:"被亲情与债务压得喘不过气的温予宁，重回签下担保合同的那一天。这一次，她决定为自己而活。",
 path:"/rejected-family-second-life.html"};
export function buildS86FreeChapter(){
 const manuscript=readFileSync(new URL("../content/drafts/season-cet4-v1/rejected-family-second-life.md",import.meta.url),"utf8");
 if(!manuscript.includes("status: PRIVATE_ORIGINAL_FIRST_DRAFT_UNREVIEWED")||
    !manuscript.includes("product: cet4"))throw Error("S86_PRIVATE_SOURCE_REQUIRED");
 const parts=manuscript.split(/^## 第[1-6]章[　 ].*$/m);
 if(parts.length!==7)throw Error("S86_EXPECT_EXACTLY_SIX_CHAPTERS");
 const first=parts[1].trim();
 const anchors=[...first.matchAll(/\[\[([a-z]+)\]\]/g)].map(m=>m[1]);
 const paras=first.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
 if(paras.length!==17||anchors.length!==77)throw Error("S86_FIRST_CHAPTER_QA_DRIFT");
 if(paras.some(p=>(p.match(/\[\[[a-z]+\]\]/g)||[]).length>6))
   throw Error("S86_UNREVIEWED_DENSITY_CHANGE");
 const htmlParagraphs=paras.map(p=>"<p>"+escape(p).replace(/\[\[([a-z]+)\]\]/g,
  '<strong lang="en">$1</strong>')+"</p>").join("\n");
 if(htmlParagraphs.includes("[[")||/<script/i.test(htmlParagraphs))throw Error("S86_PUBLIC_PAGE_INJECTION");
 return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width, initial-scale=1">'+
 '<meta name="robots" content="index,follow"><meta name="referrer" content="no-referrer">'+
 '<title>《'+escape(PUBLIC_S86_STORY.title)+'》第一章免费试读｜妙屋英语</title>'+
 '<meta name="description" content="'+escape(PUBLIC_S86_STORY.description)+'">'+
 '<style>*{box-sizing:border-box}:root{color-scheme:light dark}body{margin:0;background:#f8f3ec;color:#372f32;font-family:"Songti SC","Noto Serif SC",Georgia,serif;line-height:2.05}'+
 'main{margin:20px auto 48px;max-width:790px;padding:clamp(24px,5vw,60px);border-radius:20px;background:#fffcf7;border:1px solid #e6dcd4}'+
 'header{max-width:790px;margin:auto;padding:22px 20px 8px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}'+
 'header a{color:#874563;text-decoration:none}h1{font-size:clamp(30px,5vw,42px);color:#793b54;margin:10px 0}h2{font-size:23px;margin:25px 0}'+
 'p{margin:0 0 1.35em;font-size:17px;text-indent:2em;overflow-wrap:anywhere}'+
 '.eyebrow{font:600 12px system-ui,sans-serif;letter-spacing:.12em;color:#9a707e}'+
 '.desc,.note,.finish{font:14px/1.9 system-ui,sans-serif;letter-spacing:0;text-indent:0}'+
 '.desc{color:#79656f;margin:12px 0 18px}.note,.finish{padding:15px 18px;background:#f7efee;border-radius:12px;color:#785767}'+
 '.finish{margin-top:34px}article strong{font-family:Georgia,serif;background:#f6e4e5;color:#903856;padding:0 3px;border-radius:3px}'+
 '.button{display:inline-block;padding:7px 16px;border-radius:999px;background:#86465e;color:white;text-decoration:none;font:600 13px/1.7 system-ui,sans-serif;margin:0 0 20px}'+
 'footer{max-width:790px;margin:auto;padding:0 20px 42px;color:#776c70;font:13px system-ui,sans-serif}'+
 '@media(prefers-color-scheme:dark){body{background:#1e1b20;color:#e8dedd}main{background:#29232b;border-color:#4b3b46}h1{color:#ecc1d0}header a{color:#f3bfd3}.desc{color:#d9c1cc}.note,.finish{background:#3b303d;color:#e5cbd3}article strong{background:#573547;color:#ffd2e3}}</style></head><body>'+
 '<header><a href="/">⌂ 妙屋英语 · WordLetter</a><nav><a href="/">返回书架</a>　<a href="#chapter">阅读第一章</a></nav></header>'+
 '<main><div class="eyebrow">WORDLETTER · CET4 · FREE CHAPTER</div>'+
 '<h1>'+escape(PUBLIC_S86_STORY.title)+'</h1>'+
 '<div class="desc">'+escape(PUBLIC_S86_STORY.description)+'</div>'+
 '<a class="button" href="#chapter">开始阅读第一章</a>'+
 '<div class="note">本页为免费的原创小说试读。英语目标词经过初步筛选，完整四级词形、语境释义、音标及学习功能仍在校对；本页不提供付费权限或完整小说下载。</div>'+
 '<article id="chapter"><h2>第一章 · 这一次，我没有签字</h2>'+htmlParagraphs+'</article>'+
 '<div class="finish">第1章试读结束。其余5章已经有原创故事初稿，正式会员阅读与单词学习功能完成审核后开放。</div></main>'+
 '<footer>妙屋英语 / WordLetter · 原创故事试读，不代表正式四级合集已经开售</footer></body></html>';
}
