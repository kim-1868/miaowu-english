(()=>{
"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const kinds=[["fill","▤ 剧情填词"],["situation","✧ 情境选择"],["spell","✎ 单词找回"]];
const st={scope:"recent",selected:new Set(kinds.map(x=>x[0])),book:"all",from:1,to:300,chapter:"",
 phase:"setup",questions:[],idx:0,answer:null,hint:false,correct:0,posting:false};
let adapter=null;
function setup(){
 const hasCompletedChapter=adapter.progress().some(p=>!!p.completed_at);
 const hasCurrentChapter=st.scope==="chapter"&&Boolean(st.chapter);
 const canStart=hasCurrentChapter||hasCompletedChapter;
 const items=new Map(adapter.progress().map(p=>[p.book_id,p.book_title]));
 $("quizContainer").innerHTML='<div class="echo-panel"><span class="eyebrow">STORY ECHO · YOUR REAL STORY</span>'+
 '<h3 class="echo-selector-heading">让读过的故事，再次回响</h3>'+
 '<p class="echo-tip">本章复习可以立即练当前章节的词，不需要收藏或读完。最近章节、今日到期等长期复习仍按云端进度筛选。</p>'+
 '<div class="echo-selector-title">01 · 选择练习范围</div><div class="echo-radio-group">'+
 [["chapter","本章复习"],["recent","最近章节"],["custom","自选已读章节"],["due","今日到期词汇"]].map(x=>
 '<button class="echo-radio '+(st.scope===x[0]?"selected":"")+'" data-scope="'+x[0]+'">'+x[1]+'</button>').join("")+'</div>'+
 (st.scope==="custom"?'<div class="echo-batch-filter"><div class="echo-filter-caption"><strong>按书籍与章节范围快速筛选</strong>'+
 '<small>无需逐个勾选章节</small></div><div class="echo-filter-row"><label>书籍<select id="echoCloudBook">'+
 '<option value="all">全部已读书籍</option>'+[...items].map(x=>
 '<option value="'+esc(x[0])+'" '+(st.book===x[0]?"selected":"")+'>《'+esc(x[1])+'》</option>').join("")+
 '</select></label><label>章节范围：第几章至第几章</label></div><div class="echo-range-row">'+
 '<label>起 <input id="echoCloudFrom" type="number" min="1" max="300" value="'+st.from+'"></label>'+
 '<label>止 <input id="echoCloudTo" type="number" min="1" max="300" value="'+st.to+'"></label></div></div>':"")+
 '<div class="echo-selector-title">02 · 选择玩法（可组合）</div><div class="echo-options">'+
 kinds.map(x=>'<button class="echo-option '+(st.selected.has(x[0])?"selected":"")+'" data-kind="'+x[0]+'">'+
 '<span class="echo-option-title">'+x[1]+'</span><span class="echo-option-sub">'+
 (x[0]==="spell"?"主动拼写，支持系统手写键盘":"原剧情与英文词义选择")+
 '</span><span class="echo-check">'+(st.selected.has(x[0])?"✓ 已选择":"○ 点击加入")+'</span></button>').join("")+
 '</div>'+(canStart?'':'<div id="echoCloudEmpty" class="echo-cloud-empty" role="status">本章复习请从小说阅读页的「本章复习」进入；其余复习范围请先读完一章。</div>')+
 '<div class="echo-footer-actions"><span class="echo-tip">答题后显示对应释义与原剧情句子</span>'+
 '<button class="primary" id="cloudEchoStart" '+(canStart?'':'disabled')+'>开始复习 →</button></div></div>';
 document.querySelectorAll("[data-scope]").forEach(b=>b.onclick=()=>{st.scope=b.dataset.scope;setup()});
 document.querySelectorAll("[data-kind]").forEach(b=>b.onclick=()=>{
 const id=b.dataset.kind;if(st.selected.has(id)&&st.selected.size>1)st.selected.delete(id);
 else st.selected.add(id);setup()});
 if($("echoCloudBook"))$("echoCloudBook").onchange=e=>{st.book=e.target.value;setup()};
 if($("echoCloudFrom"))$("echoCloudFrom").onchange=e=>{st.from=Math.max(1,Math.min(300,Number(e.target.value)||1))};
 if($("echoCloudTo"))$("echoCloudTo").onchange=e=>{st.to=Math.max(1,Math.min(300,Number(e.target.value)||1))};
 $("cloudEchoStart").onclick=start;
}
async function start(){
 const b=$("cloudEchoStart");b.disabled=true;
 try{
 const q=new URLSearchParams({scope:st.scope});
 if(st.scope==="chapter"){if(!st.chapter){adapter.toast("请从正在阅读的章节点击「本章复习」进入");b.disabled=false;return}
 q.set("chapterId",st.chapter)}
 if(st.scope==="custom"){
 if(st.book!=="all")q.set("bookId",st.book);
 q.set("from",st.from);q.set("to",st.to);
 }
 const payload=await adapter.request("/api/me/echo/available?"+q);
 const words=payload.words||[],allowed=[...st.selected].filter(x=>payload.availableGames.includes(x));
 if(!words.length){adapter.toast(st.scope==="chapter"?"这章尚无可用的目标词卡，请检查本章词汇数据":"当前范围尚无可复习词汇，请调整范围或完成章节阅读");b.disabled=false;return}
 if(!allowed.length){adapter.toast("当前词量较少，可先只选「单词找回」");b.disabled=false;return}
 const randomized=[...words].sort(()=>Math.random()-.5).slice(0,8);
 st.questions=randomized.map((w,i)=>({word:w,kind:allowed[i%allowed.length],
 options:[w,...words.filter(y=>y.word_id!==w.word_id).sort(()=>Math.random()-.5).slice(0,3)]
 .sort(()=>Math.random()-.5)}));
 st.idx=0;st.correct=0;st.answer=null;st.hint=false;st.phase="playing";draw();
 }catch(e){adapter.toast(e.message);b.disabled=false}
}
function blank(w){
 const text=w.context_sentence||"";
 const escaped=w.headword.replace(/[.*+?^$()|[\]{}\\]/g,"\\$&");
 // Match a complete English headword only. Do not erase `record` inside `recording`
 // or blank multiple positions if the same target repeats in a story sentence.
 const filled=text.replace(new RegExp("\\b"+escaped+"\\b","i"),"______");
 return filled===text?"根据中文提示找到对应英文："+w.meaning_zh:filled;
}
function draw(){
 if(st.phase==="setup"){setup();return}
 if(st.idx>=st.questions.length){
 st.phase="done";$("quizContainer").innerHTML='<div class="quiz-card" style="text-align:center">'+
 '<span class="eyebrow">STORY ECHO · CLOUD REVIEW</span><div class="stamp" style="margin:17px auto">喵呜<br>✦</div>'+
 '<h3>找回了 '+st.correct+'/'+st.questions.length+' 个单词</h3>'+
 '<p class="echo-tip">已提交的答案和复习日期已保存至云端。</p>'+
 '<button class="primary" id="cloudAgain">重新选择玩法</button></div>';
 $("cloudAgain").onclick=()=>{st.phase="setup";setup()};return}
 const q=st.questions[st.idx],w=q.word,answered=!!st.answer;
 const question=esc(blank(w));
 let options;
 if(q.kind==="spell"){
 options='<h3 class="spelling-prompt">'+question+'</h3><p class="echo-tip">中文提示：'+esc(w.meaning_zh)+
 ' · '+w.headword.length+' 个字母</p>'+
 '<input id="cloudSpelling" class="answer-input" autocapitalize="none" autocomplete="off" spellcheck="false" '+
 (answered?"disabled":"")+' placeholder="输入英文单词">'+
 '<div class="hero-actions"><button class="primary" id="cloudSpellSubmit" '+(answered?"disabled":"")+'>提交拼写</button>'+
 '<button class="secondary-btn" id="cloudSpellHint" '+(answered?"disabled":"")+'>首字母提示</button></div>';
 }else{
 options='<h3>'+(q.kind==="situation"?"根据人物情境与中文提示选择对应单词：":"从原句中选择正确单词：")+
 '</h3><p class="spelling-prompt">'+question+'</p><div class="answer-grid">'+
 q.options.map(x=>'<div class="answer-choice '+(answered?"answered ":"")+
 (answered&&x.word_id===w.word_id?"correct":"")+'">'+
 '<button class="answer-pick" data-choice="'+esc(x.headword)+'" '+(answered?"disabled":"")+'>'+
 esc(x.headword)+'</button>'+(answered?'<div class="answer-extra"><span>'+esc(x.meaning_zh)+
 '</span><button class="answer-speak" data-speak="'+esc(x.headword)+'">♫</button></div>':"")+
 '</div>').join("")+'</div>';
 }
 const feedback=answered?'<div class="quiz-response"><strong>'+
 (st.answer.correct?"答对了，喵呜！":"再看一眼，就能把它记得更牢。")+'</strong>'+
 '<div class="quiz-correct-answer">'+esc(st.answer.expected)+' <span>'+esc(st.answer.phonetic)+
 ' · '+esc(st.answer.meaning)+'</span><button id="cloudCorrectSpeak" class="answer-speak">♫</button></div>'+
 '<div class="story-reveal"><strong>故事原句</strong><br>'+esc(st.answer.context)+'</div>'+
 '<p class="score-status">复习已保存 · '+(st.answer.nextReviewDays===null?"已掌握":
 "约 "+st.answer.nextReviewDays+" 天后复习")+'</p></div>':"";
 $("quizContainer").innerHTML='<div class="quiz-card"><div class="quiz-kicker"><span>STORY ECHO · '+
 kinds.find(x=>x[0]===q.kind)[1]+'</span><span>'+(st.idx+1)+' / '+st.questions.length+'</span></div>'+
 '<div class="quiz-exit-row"><span>随时可退出，已答题目保留</span>'+
 '<button id="cloudEchoQuit" class="quiet-exit">✕ 退出／换玩法</button></div>'+
 options+feedback+'<div class="quiz-foot"><small>答题后选项释义直接显示在原选项旁边。</small>'+
 '<button class="primary" id="cloudEchoNext" '+(!answered?"disabled":"")+'>'+
 (st.idx===st.questions.length-1?"查看结果":"下一题 →")+'</button></div></div>';
 $("cloudEchoQuit").onclick=()=>leave("setup");
 document.querySelectorAll("[data-choice]").forEach(x=>x.onclick=()=>answer(x.dataset.choice));
 document.querySelectorAll("[data-speak]").forEach(x=>x.onclick=()=>adapter.speak(x.dataset.speak));
 if($("cloudCorrectSpeak"))$("cloudCorrectSpeak").onclick=()=>adapter.speak(st.answer.expected);
 if($("cloudSpellSubmit")){
 $("cloudSpellSubmit").onclick=()=>{const v=$("cloudSpelling").value.trim();if(v)answer(v);else adapter.toast("请输入英文单词")};
 $("cloudSpelling").onkeydown=e=>{if(e.key==="Enter")$("cloudSpellSubmit").click()};
 $("cloudSpellHint").onclick=()=>{st.hint=true;$("cloudSpellHint").textContent="首字母："+w.headword[0]};
 }
 $("cloudEchoNext").onclick=()=>{st.idx++;st.answer=null;st.hint=false;draw()};
}
async function answer(value){
 if(st.answer||st.posting)return;
 st.posting=true;const q=st.questions[st.idx],w=q.word;
 try{
 const r=await adapter.request("/api/me/echo/answer","POST",{
 wordId:w.word_id,chapterId:w.chapter_id,gameType:q.kind,answer:value,hinted:st.hint});
 st.answer=r;if(r.correct)st.correct++;adapter.refresh();draw();
 }catch(e){adapter.toast(e.message)}finally{st.posting=false}
}
function leave(destination){
 if(st.phase!=="playing")return false;
 const done=st.idx+(st.answer?1:0);
 adapter.showModal('<span class="eyebrow">PAUSE YOUR STORY ECHO</span>'+
 '<h2 id="modalTitle">要结束这一轮练习吗？</h2><p>已答 '+done+
 ' 题，提交过的记录会保留；未提交的不会计入成绩。</p>'+
 '<div class="exit-actions"><button class="secondary-btn" id="cloudKeep">继续练习</button>'+
 '<button class="primary" id="cloudLeave">结束练习</button></div>');
 $("cloudKeep").onclick=adapter.closeModal;
 $("cloudLeave").onclick=()=>{adapter.closeModal();st.phase="setup";st.questions=[];st.answer=null;
 if(destination==="setup")setup();else adapter.navigate(destination)};
 return true;
}
window.MiaowuCloudEcho={
 configure:obj=>{adapter=obj},
 render:()=>{if(adapter)draw()},
 running:()=>st.phase==="playing"&&st.idx<st.questions.length,
 leave,useChapter:id=>{st.chapter=id;st.scope="chapter";st.phase="setup"},
 reset:()=>{st.phase="setup";st.questions=[];st.answer=null}
};
})();