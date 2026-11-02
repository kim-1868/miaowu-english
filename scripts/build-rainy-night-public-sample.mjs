// S73: explicit free reading sample ONLY. Never bundle the remaining 11 chapters,
// phonetic candidate sources, drafts, reviewer ledgers or entitlement data.
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
const htmlEscape=s=>String(s??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
export function buildRainyNightPublicSample(){
 const {bundle}=composeRainyNightSeasonDraft();
 if(!bundle.book.id.startsWith("draft-")||bundle.chapters.length!==12||
    bundle.words.length!==188)throw Error("SAMPLE_SOURCE_NOT_AN_UNPUBLISHED_DRAFT");
 const chapter=bundle.chapters[0];
 if(chapter.number!==1||chapter.paragraphs.length!==36)throw Error("SAMPLE_CHAPTER_DRIFT");
 const paragraph=chapter.paragraphs.map(({segments})=>
   '<p>'+segments.map(s=>s.wordId
    ?'<strong lang="en">'+htmlEscape(s.surface)+'</strong>'
    :htmlEscape(s.text)).join("")+'</p>').join("\n");
 const wordAnchors=(paragraph.match(/<strong lang="en">/g)||[]).length;
 if(wordAnchors!==64)throw Error("SAMPLE_ENGLISH_ANCHOR_DRIFT");
 return '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta name="referrer" content="no-referrer">'+
  '<meta name="description" content="妙屋英语原创轻悬疑小说《雨夜档案》免费试读第一章。">'+
  '<title>《雨夜档案》第一章免费试读｜妙屋英语</title>'+
  '<style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;color:#372f32;background:#f8f3ec;font-family:"Songti SC","Noto Serif SC",Georgia,serif;line-height:2.05}'+
  '.wrap{width:min(760px,calc(100% - 36px));margin:0 auto}header{padding:24px 0 12px}header a{color:#793b54;text-decoration:none}'+
  'main{background:#fffcf7;border:1px solid #e9ddd3;border-radius:20px;padding:clamp(22px,5vw,64px);margin:20px auto 48px;box-shadow:0 10px 34px #4133350a}'+
  '.eyebrow{font:600 11px/1.4 system-ui,sans-serif;letter-spacing:.16em;color:#956f7d}h1{font-size:clamp(30px,6vw,44px);margin:14px 0 4px;color:#65374b}'+
  'h2{font-size:23px;margin:30px 0 24px}article p{font-size:17px;text-indent:2em;margin:0 0 1.35em;overflow-wrap:anywhere}'+
  'article strong{font-family:Georgia,serif;background:#f7e8e6;color:#8d3457;padding:0 3px;border-radius:3px}'+
  '.notice,.finish{font:14px/1.85 system-ui,sans-serif;color:#785767;background:#f6eeeb;border-radius:12px;padding:14px 18px}'+
  '.finish{margin-top:40px}footer{padding:0 0 40px;font:13px/1.7 system-ui,sans-serif;color:#756b6b}'+
  '@media(prefers-color-scheme:dark){body{background:#1e1b20;color:#e8e0dc}main{background:#29232b;border-color:#493b49}h1{color:#f0bccd}header a{color:#edb3ca}.notice,.finish{background:#3b303d;color:#e5c5cf}article strong{background:#553446;color:#ffd6e6}footer{color:#c9bdc1}}'+
  '</style></head><body><div class="wrap"><header><a href="/">← 返回妙屋英语书架</a></header><main>'+
  '<span class="eyebrow">WORDLETTER · ORIGINAL STORY · FREE CHAPTER</span>'+
  '<h1>雨夜档案</h1><p class="eyebrow">原创轻悬疑 · 正文混合英语词汇阅读</p>'+
  '<div class="notice">第 1 章免费试读。完整版筹备中。完整 12 章、词卡音标、练习及购买入口尚未正式开放；本页不需要注册或激活码。英语词汇仅为正文展示，不代表词义与考试级别已经全部审核。</div>'+
  '<article><h2>第一章 · '+htmlEscape(chapter.title)+'</h2>\n'+paragraph+'</article>'+
  '<div class="finish">本章试读结束。喜欢这种读小说学英语的方式，可以继续关注妙屋英语。后续章节与学习功能将在审核完成后开放。</div>'+
  '</main><footer>妙屋英语 / WordLetter · 原创故事免费试读 · 不提供下载或付费承诺</footer></div></body></html>';
}
