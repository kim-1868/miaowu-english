// S51: Generate a local, read-only HTML editorial review dashboard.
// Do not serve this file online. It contains the unpublished, paid-scope manuscript.
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {createVocabularyReviewQueue} from "./prepare-rainy-night-vocabulary-review.mjs";
import {buildRainyNightOccurrenceReview} from "./review-rainy-night-word-contexts.mjs";
import {buildEchoReviewPack} from "./build-rainy-night-echo-review-pack.mjs";
import {buildRainyNightTeachingTrackPlan} from "./plan-rainy-night-teaching-tracks.mjs";

const h=value=>String(value??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);

export function buildRainyNightOfflineReviewDashboard(bundle){
 const words=createVocabularyReviewQueue(bundle);
 const contexts=buildRainyNightOccurrenceReview(bundle);
 const echo=buildEchoReviewPack(bundle);
 const tracks=buildRainyNightTeachingTrackPlan(bundle);
 if(bundle.book.id.startsWith("draft-")===false||
    words.rows.length!==188||contexts.rows.length!==733||
    echo.questions.length!==36||tracks.rows.length!==188||
    words.overview.flaggedForIpa!==188||
    contexts.overview.unreviewed!==733||
    echo.questions.some(q=>q.reviewStatus!=="EDITORIAL_NOT_APPROVED"))
  throw Error("S51_REVIEW_DASHBOARD_REQUIRES_UNAPPROVED_12_CHAPTER_DRAFT");
 const trackById=new Map(tracks.rows.map(x=>[x.wordId,x.track]));
 const syntaxRiskCount=contexts.rows.filter(r=>r.reviewFlags.some(f=>f.startsWith("CODE_SWITCH_"))).length;
 const summaries={
  status:"PRIVATE_EDITORIAL_NOT_APPROVED",wordCards:words.rows.length,
  contexts:contexts.rows.length,echoQuestions:echo.questions.length,
  reviewedWords:0,reviewedContexts:0,reviewedQuestions:0,
  published:false,productionDbTouched:false
 };
 const wordsHtml=words.rows.map(w=>
  '<article class="item" data-entry data-kind="word" data-search="'+h(
   [w.headword,w.meaningZh,w.partOfSpeech,w.exampleEn,w.exampleZh,
    w.reviewFlags.join(" "),trackById.get(w.wordId)].join(" ").toLowerCase())+'">'+
   '<div class="line"><h3>'+h(w.headword)+'</h3><span class="pill">'+h(w.priority)+'</span></div>'+
   '<div class="muted">'+h(w.partOfSpeech)+' · '+h(trackById.get(w.wordId))+
   ' · '+w.mentions+'次标注 / '+w.chapterCount+'章</div>'+
   '<p><strong>情境释义：</strong>'+h(w.meaningZh)+'</p>'+
   '<p class="en">'+h(w.exampleEn)+'</p><p>'+h(w.exampleZh)+'</p>'+
   '<p class="muted">搭配：'+h(w.collocations)+
   '组 · 英式来源候选：'+w.sourceUkCandidatesCount+
   ' · 美式IPA候选：'+w.sourceUsIpaCount+'</p>'+
   '<p class="flags">'+h(w.reviewFlags.join(" · "))+'</p>'+
   '<p class="unapproved">待核：词性、情境词义、英美音标、CET等级及例句自然度</p></article>'
 ).join("");
 const contextsHtml=contexts.rows.map(r=>
  '<article class="item" data-entry data-kind="context" data-chapter="'+r.chapter+
  '" data-syntax-risk="'+(r.reviewFlags.some(f=>f.startsWith("CODE_SWITCH_"))?"yes":"no")+
  '" data-search="'+h([r.word,r.gloss,r.originalContext,r.reviewFlags.join(" ")]
   .join(" ").toLowerCase())+'">'+
  '<div class="line"><h3>'+h(r.word)+'</h3><span class="pill">第'+r.chapter+'章 · '+h(r.ref)+'</span></div>'+
  '<p><strong>义项：</strong>'+h(r.gloss)+' · '+h(r.partOfSpeech)+
  ' · '+h(r.track)+'</p><p class="context">'+h(r.originalContext)+'</p>'+
  '<p class="flags">'+h(r.reviewFlags.join(" · "))+'</p>'+
  '<p class="unapproved">UNREVIEWED：确认此处词性/义项/混排是否自然</p></article>'
 ).join("");
 const echoHtml=echo.questions.map((q,i)=>
  '<article class="item" data-entry data-kind="echo" data-chapter="'+q.chapterNo+
  '" data-search="'+h([q.headword,q.blankContext,q.meaningZh,q.chapterTitle]
  .join(" ").toLowerCase())+'">'+
  '<div class="line"><h3>第'+q.chapterNo+'章 · 候选题 '+(i+1)+
  '</h3><span class="pill">段'+q.paragraphNo+'</span></div>'+
  '<p>'+h(q.prompt)+'</p><p class="context">'+h(q.blankContext)+'</p>'+
  '<details><summary>核对答案与词义（仅供编辑）</summary><p>'+
  h(q.correctAnswer)+' · '+h(q.meaningZh)+' · '+h(q.partOfSpeech)+'</p></details>'+
  '<p class="unapproved">EDITORIAL_NOT_APPROVED：检查答案唯一性与真实故事语境</p></article>'
 ).join("");
 const html=[
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; script-src &#39;unsafe-inline&#39;; connect-src &#39;none&#39;; img-src &#39;none&#39;">',
  '<title>《雨夜档案》私有内容审校台 · 仅供离线</title>',
  '<style>',
  ':root{font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;color:#2e2b26;background:#faf6ef}',
  'body{max-width:1120px;margin:0 auto;padding:28px 20px 60px;line-height:1.7}',
  'h1{font-family:Georgia,serif;color:#722f37;font-size:32px;margin:10px 0}',
  'h2{font-size:20px;margin:22px 0 10px}h3{margin:0;font-size:18px;color:#722f37}',
  'p{margin:7px 0}.warning{border-left:5px solid #722f37;padding:14px 18px;background:#efe7da}',
  '.count{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}',
  '.stat{background:white;padding:13px 18px;border:1px solid #ded3c5;border-radius:12px}',
  '.stat b{font-size:22px;display:block;color:#722f37}.toolbar{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0;position:sticky;top:0;background:#faf6ef;padding:12px 0;z-index:2}',
  'input,select{padding:11px 12px;border:1px solid #b9aa9e;border-radius:8px;background:white;font-size:15px;max-width:100%}',
  'input{flex:1;min-width:200px}.item{background:white;border:1px solid #e5d8c7;border-radius:12px;padding:15px 18px;margin:10px 0;overflow-wrap:anywhere}',
  '.line{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}',
  '.pill{font-size:12px;background:#efe7da;padding:2px 9px;border-radius:30px}',
  '.muted{color:#706459;font-size:13px}.flags{color:#85594c;font-size:12px}',
  '.en{font-weight:600}.context{white-space:pre-wrap;background:#faf6ef;padding:9px 11px;border-radius:8px}',
  '.unapproved{font-size:12px;color:#8e3b3b;font-weight:600}',
  'details{margin:10px 0}summary{cursor:pointer;color:#722f37}',
  '[hidden]{display:none!important}@media(max-width:600px){body{padding:16px 12px}.toolbar{top:0}.item{padding:13px}}',
  '</style></head><body>',
  '<h1>《雨夜档案》离线审校台</h1>',
  '<p class="warning"><strong>内部草稿 · 禁止发布/上传/分享</strong>：包含完整未公开小说段落和题目答案。所有内容均未人工签审，来源候选不是获准商用的音标；此页面不提供发布、批准或提交到云端的功能。</p>',
  '<div class="count"><div class="stat"><b>188</b>未签审词卡</div>',
  '<div class="stat"><b>733</b>未签审语境</div>',
  '<div class="stat"><b>36</b>未签审剧情回声题</div>',
  '<div class="stat"><b>0</b>正式批准音标词</div>',
  '<div class="stat"><b>'+syntaxRiskCount+'</b>词性混排风险提示 · 非审核结论</div></div>',
  '<div class="toolbar"><label for="kind">检查内容</label>',
  '<select id="kind"><option value="words">词卡 · 188</option><option value="contexts">故事语境 · 733</option><option value="echo">剧情回声 · 36</option></select>',
  '<input id="search" type="search" placeholder="搜索单词、释义或正文" aria-label="搜索审校记录">',
  '<label for="chapter">章节</label><select id="chapter"><option value="">全部章节</option>',
  ...Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">第'+(i+1)+'章</option>'),
  '</select><label for="syntaxRisk">混排语境</label>',
  '<select id="syntaxRisk"><option value="">所有语境</option><option value="yes">优先看语法风险提示</option><option value="no">未触发本类提示</option></select></div>',
  '<p class="muted">词性混排风险是自动启发式提示，存在误报；没有提示也不表示获得审核批准。仅在“故事语境”页启用筛选。</p>',
  '<p id="visible-count" aria-live="polite"></p>',
  '<section class="panel" data-panel="words"><h2>词卡审核候选</h2>',wordsHtml,'</section>',
  '<section class="panel" data-panel="contexts" hidden><h2>733处正文锚点</h2>',contextsHtml,'</section>',
  '<section class="panel" data-panel="echo" hidden><h2>36道剧情回声候选题</h2>',echoHtml,'</section>',
  '<p class="warning">只读离线审校辅助。没有保存审核结果；没有权利验证或售卖功能。请按正式签审制度保留人工证据。</p>',
  '<script>',
  '(function(){const kind=document.getElementById("kind"),search=document.getElementById("search"),chapter=document.getElementById("chapter"),syntaxRisk=document.getElementById("syntaxRisk"),count=document.getElementById("visible-count");',
  'function refresh(){let shown=0;const current=kind.value;chapter.disabled=current==="words";syntaxRisk.disabled=current!=="contexts";',
  'document.querySelectorAll("[data-panel]").forEach(p=>{p.hidden=p.dataset.panel!==current});',
  'document.querySelectorAll("[data-panel="+current+"] [data-entry]").forEach(item=>{',
  'const ok=item.dataset.search.includes(search.value.trim().toLowerCase())&&',
  '(current==="words"||!chapter.value||item.dataset.chapter===chapter.value)&&',
  '(current!=="contexts"||!syntaxRisk.value||item.dataset.syntaxRisk===syntaxRisk.value);',
  'item.hidden=!ok;if(ok)shown++;});count.textContent="当前显示 "+shown+" 条未审核记录";}',
  'kind.addEventListener("change",refresh);search.addEventListener("input",refresh);',
  'chapter.addEventListener("change",refresh);syntaxRisk.addEventListener("change",refresh);refresh();})();',
  '</script></body></html>'
 ].join("");
 return {summary:summaries,html};
}

function main(){
 const args=process.argv.slice(2);
 if(args.some(x=>!["--summary","--write-private"].includes(x)))
  throw Error("Usage: node scripts/build-rainy-night-review-dashboard.mjs [--summary|--write-private]");
 const report=buildRainyNightOfflineReviewDashboard(composeRainyNightSeasonDraft().bundle);
 if(args.includes("--write-private")){
  const dir=resolve("private-output");
  mkdirSync(dir,{recursive:true,mode:0o700});
  writeFileSync(resolve(dir,"rainy-night-s1-PRIVATE-UNREVIEWED.html"),report.html,
   {encoding:"utf8",mode:0o600});
 }
 process.stdout.write(JSON.stringify(report.summary,null,2)+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1;}
}
