(()=>{
"use strict";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let api=null,userName=null,scope="due",roundSize=10,round=null,busy=false,loadSerial=0;
const host=()=>$("flashcardTrainer");
const word=()=>round?.queue[round.index]?.word||null;
const cursor=()=>round?.queue[round.index]||null;
const actions=()=>({due:"今日到期",learning:"学习中",all:"全部收藏"});
function clearRound(){round=null;busy=false;loadSerial++;}
function counts(){
  const list=round?.answers||[];
  return {attempted:list.length,remembered:list.filter(x=>x.correct&&!x.retry).length,
    forgotten:list.filter(x=>!x.correct&&!x.retry).length,
    retrieved:list.filter(x=>x.retry&&x.correct).length};
}
function renderHome(loggedIn,saved,due){
  const el=host();if(!el)return;
  el.innerHTML='<div class="flash-intro"><div>'+
    '<span class="eyebrow">MIAOWU · QUICK MEMORY</span>'+
    '<h2>喵呜，翻开下一张藏书票</h2>'+
    '<p>不必打开单独的复习页。听一听、想一想、翻一张，几分钟就能完成一轮。</p></div>'+
    '<div class="flash-kpis"><span>已收藏 <strong>'+saved+'</strong></span>'+
    '<span>今日待复习 <strong>'+due+'</strong></span></div></div>'+
    '<div class="flash-setup">'+
    '<div class="flash-setting"><strong>练习范围</strong><div class="flash-pills" role="group" aria-label="选择单词范围">'+
    Object.entries(actions()).map(([k,label])=>
      '<button type="button" class="flash-pill '+(scope===k?'selected':'')+
      '" data-flash-scope="'+k+'" aria-pressed="'+(scope===k)+'">'+label+'</button>').join("")+
    '</div></div>'+
    '<div class="flash-setting"><strong>每轮词数</strong><div class="flash-pills" role="group" aria-label="每轮词数">'+
    [10,20].map(n=>'<button class="flash-pill '+(roundSize===n?'selected':'')+
      '" type="button" data-flash-size="'+n+'" aria-pressed="'+(roundSize===n)+'">'+n+' 张</button>').join("")+
    '</div></div>'+
    '<div class="flash-choices"><button type="button" class="flash-choice" id="flashStartFlip">'+
    '<span class="flash-choice-icon" aria-hidden="true">✦</span><strong>快刷词卡</strong>'+
    '<small>翻开释义 → 判断记忆 → 立即下一张</small><b>开始速记 →</b></button>'+
    '<button type="button" class="flash-choice" id="flashStartSpell">'+
    '<span class="flash-choice-icon" aria-hidden="true">♫</span><strong>听音拼写</strong>'+
    '<small>听发音 / 看中文 → 键入或系统手写 → 核对</small><b>开始拼写 →</b></button></div>'+
    '<p class="flash-footnote">每次提交后同步学习记录。忘记的词会在本轮稍后再出现一次；单次答对不会自动标记「已掌握」。</p>'+
    '<div class="flash-status" id="flashStatus" role="status" aria-live="polite"></div></div>';
  el.querySelectorAll("[data-flash-scope]").forEach(b=>b.onclick=()=>{
    scope=b.dataset.flashScope;renderHome(loggedIn,saved,due);
  });
  el.querySelectorAll("[data-flash-size]").forEach(b=>b.onclick=()=>{
    roundSize=Number(b.dataset.flashSize);renderHome(loggedIn,saved,due);
  });
  const open=mode=>{
    if(!loggedIn){api?.login?.();return;}
    if(!saved){api?.toast?.("先在小说中收藏一些单词，再来速记吧。");return;}
    void begin(mode);
  };
  $("flashStartFlip").onclick=()=>open("flip");
  $("flashStartSpell").onclick=()=>open("spell");
}
async function begin(mode,page=1){
  if(busy||!api)return;
  busy=true;
  const serial=++loadSerial;
  const state=host()?.querySelector("#flashStatus");
  if(state)state.textContent="正在从云端抽取你的词卡……";
  try{
    const data=await api.request("/api/me/flashcards?scope="+scope+"&page="+page+
      "&size="+roundSize);
    if(serial!==loadSerial||!api.user())return;
    const batch=(data.words||[]).slice(0,roundSize);
    if(!batch.length){
      const notice=data.total?
        "这组暂时没有词卡，试试其它页或重新选择范围。":
        scope==="due"?"今天暂时没有到期词卡，可以选择「学习中」继续练习。":
        "这个范围没有可用词卡，先在故事里收藏单词。";
      if(state)state.textContent=notice;
      else api.toast(notice);
      return;
    }
    round={mode,scope,page,total:data.total,hasMore:data.hasMore,
      queue:batch.map(w=>({word:w,retry:false})),index:0,shown:false,
      feedback:null,answers:[],queued:new Set(),startedAt:Date.now()};
    draw();
  }catch(error){api.toast(error.message);if(state)state.textContent="词卡获取失败，请重试。";}
  finally{busy=false;}
}
function draw(){
  const area=host();if(!area||!round)return;
  if(round.index>=round.queue.length){finish();return;}
  const w=word(),flipped=round.shown,feedback=round.feedback;
  const num=round.index+1,total=round.queue.length,percent=Math.round((num-1)/total*100);
  const reading=round.mode==="spell";
  area.innerHTML='<div class="flash-session" id="flashSession">'+
    '<div class="flash-session-top"><div><span class="eyebrow">'+
    (reading?"LISTEN · RECALL":"FLIP · REMEMBER")+'</span>'+
    '<h2>'+(reading?"听音拼写":"快刷词卡")+'</h2></div>'+
    '<button id="flashExit" type="button" class="flash-close" aria-label="退出本轮学习">结束本轮 ×</button></div>'+
    '<div class="flash-progress-label"><span>'+esc(actions()[round.scope])+
    '</span><strong>'+num+' / '+total+'</strong></div>'+
    '<div class="flash-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+
    percent+'" aria-label="本轮学习进度"><span style="width:'+percent+'%"></span></div>'+
    '<div class="flash-paper '+(feedback?(feedback.correct?"flash-celebrate":"flash-retry"):"")+
    '" id="flashPaper">'+
    '<div class="flash-paper-top"><span>♧ MEMORY BOOKPLATE</span><span>'+(cursor().retry?'↻ 再记一次':'✦')+'</span></div>'+
    (reading?
      '<div class="flash-listen-header"><button id="flashVoice" type="button" class="flash-voice" aria-label="播放单词发音">♫ <span>听发音</span></button>'+
      '<span class="flash-audio-note">可反复播放 · 设备语音</span></div>'+
      '<h3 class="flash-meaning">'+esc(w.meaning_zh||"暂缺中文释义")+'</h3>'+
      '<p class="flash-letters">'+Array.from(w.headword||"").length+' 个字符 · 回忆英文拼写</p>'+
      (feedback?
        '<div class="flash-reveal-answer"><strong>'+esc(w.headword)+'</strong>'+
        '<span>'+esc(w.phonetic_us||w.phonetic_uk||"")+'</span></div>':
        '<label class="flash-input-label" for="flashAnswer">输入或手写英文单词</label>'+
        '<input id="flashAnswer" class="flash-answer" type="text" inputmode="text" autocomplete="off" '+
        'autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="100" '+
        'placeholder="在这里输入英文单词">'+
        '<p class="flash-handwriting-hint">平板可使用 Apple Pencil / 系统手写输入；手机使用系统手写键盘。</p>'):
      '<div class="flash-front"><h3 class="flash-headword">'+esc(w.headword)+'</h3>'+
      '<div class="flash-phonetic">'+esc(w.phonetic_us||w.phonetic_uk||"")+
      '<button id="flashVoice" type="button" aria-label="播放单词发音">♫</button></div>'+
      (flipped?
        '<h4 class="flash-flip-meaning">'+esc(w.meaning_zh||"暂无中文释义")+'</h4>':
        '<p class="flash-mystery">先在心里回忆它的意思，再翻开词卡</p>')+'</div>')+
    ((flipped||feedback)?
      '<div class="flash-context"><span class="flash-context-label">来自你的小说记忆'+
      (w.book_title?' · 《'+esc(w.book_title)+'》':'')+'</span>'+
      (w.context_sentence?'<p>'+esc(w.context_sentence.slice(0,260))+'</p>':'')+
      (w.example_en?'<small>'+esc(w.example_en.slice(0,220))+
      (w.example_zh?' · '+esc(w.example_zh.slice(0,160)):'')+'</small>':'')+'</div>':'')+
    '</div>'+
    (feedback?
      '<div class="flash-feedback" role="status" aria-live="polite"><strong>'+
      (feedback.correct?'✓ 记住了，喵呜！':'↻ 没关系，这张稍后再见')+'</strong>'+
      '<span>已同步 · '+(feedback.nextReviewDays==null?'维持已掌握状态':
        '约 '+feedback.nextReviewDays+' 天后再复习')+'</span></div>':'')+
    '<div class="flash-footer">'+
    (reading?
      (feedback?
        '<button class="flash-primary" id="flashNext" type="button">下一张 →</button>':
        '<button class="flash-primary" id="flashSubmit" type="button">核对拼写 →</button>'):
      (flipped?
        '<div class="flash-votes"><button id="flashForgot" type="button">↻ 忘记了</button>'+
        '<button id="flashUnsure" type="button">≈ 有点模糊</button>'+
        '<button class="flash-primary" id="flashKnown" type="button">✓ 记住了 →</button></div>':
        '<button class="flash-primary" id="flashFlip" type="button">翻开词卡 · 查看释义</button>'))+
    '</div>'+
    '<p class="flash-footer-help">每张词卡只在提交成功后推进，退出时已提交的记录仍会保存。</p></div>';
  $("flashExit").onclick=()=>{if(busy)return;closeSession();};
  $("flashVoice").onclick=()=>api.speak(w.headword);
  if($("flashFlip"))$("flashFlip").onclick=()=>{round.shown=true;draw();};
  if($("flashKnown"))$("flashKnown").onclick=()=>void vote("known");
  if($("flashUnsure"))$("flashUnsure").onclick=()=>void vote("unsure");
  if($("flashForgot"))$("flashForgot").onclick=()=>void vote("forgot");
  if($("flashSubmit")){
    $("flashSubmit").onclick=()=>{
      const value=$("flashAnswer").value.trim();
      if(!value){api.toast("先输入你想起的英文拼写");$("flashAnswer").focus();return;}
      void vote(null,value);
    };
    $("flashAnswer").onkeydown=e=>{
      if(e.key==="Enter"&&!e.isComposing){e.preventDefault();$("flashSubmit").click();}
    };
  }
  if($("flashNext"))$("flashNext").onclick=advance;
}
async function vote(judgment,answer){
  if(busy||!round||!word())return;
  if(!api.user()){api.login();return;}
  busy=true;
  const local=round,w=word(),entry=cursor(),i=round.index;
  areaBusy(true);
  try{
    const body={wordId:w.word_id,mode:round.mode,requestId:crypto.randomUUID()};
    if(round.mode==="spell")body.answer=answer;
    else body.judgment=judgment;
    const result=await api.request("/api/me/flashcards/answer","POST",body);
    if(local!==round||i!==round.index||!api.user())return;
    local.feedback=result;
    local.answers.push({wordId:w.word_id,correct:result.correct,retry:entry.retry});
    if(!result.correct&&!entry.retry&&!local.queued.has(w.word_id)){
      local.queued.add(w.word_id);
      const later=Math.min(local.queue.length,local.index+4);
      local.queue.splice(later,0,{word:w,retry:true});
    }
    if(result.correct&&navigator.vibrate)try{navigator.vibrate(14)}catch{}
    draw();
    // Flip mode keeps the satisfying single-tap rhythm; typing stays on the
    // feedback until the learner explicitly requests another card.
    if(local.mode==="flip"){
      const index=i;
      setTimeout(()=>{if(local===round&&local.index===index&&!busy)advance();},460);
    }
  }catch(error){api.toast("这张词卡未能保存："+error.message);}
  finally{busy=false;areaBusy(false);}
}
function areaBusy(flag){
  host()?.querySelectorAll("button,input").forEach(x=>{if(x.id!=="flashExit")x.disabled=flag;});
}
function advance(){
  if(!round||busy)return;
  round.index++;round.shown=false;round.feedback=null;draw();
}
function finish(){
  const el=host();if(!el||!round)return;
  const summary=counts(),elapsed=Math.max(1,Math.round((Date.now()-round.startedAt)/60000));
  const last=round;
  el.innerHTML='<div class="flash-session flash-finish"><div class="flash-finish-stamp" aria-hidden="true">♧ ✦</div>'+
    '<span class="eyebrow">MIAOWU · MEMORIES KEPT</span><h2>这一轮，翻完啦！</h2>'+
    '<p>你把藏书票里的故事，又记住了一点点。</p>'+
    '<div class="flash-finish-stats">'+
    '<div><strong>'+summary.attempted+'</strong><span>完成次数</span></div>'+
    '<div><strong>'+summary.remembered+'</strong><span>首次记住</span></div>'+
    '<div><strong>'+summary.forgotten+'</strong><span>需要再练</span></div>'+
    '<div><strong>'+summary.retrieved+'</strong><span>回炉记住</span></div></div>'+
    '<p class="flash-finish-note">约 '+elapsed+' 分钟 · 每张提交均已同步到账号；“记住了”不等于永久掌握。</p>'+
    '<div class="flash-finish-actions"><button id="flashAgain" class="flash-primary" type="button">再来一轮</button>'+
    (last.hasMore?'<button id="flashMore" type="button">下一组词卡 →</button>':'')+
    '<button id="flashBackList" type="button">返回全部藏书票</button></div></div>';
  $("flashAgain").onclick=()=>{clearRound();void begin(last.mode,1);};
  if($("flashMore"))$("flashMore").onclick=()=>{clearRound();void begin(last.mode,last.page+1);};
  $("flashBackList").onclick=closeSession;
  void api.refresh();
}
function closeSession(){
  clearRound();
  // Re-rendering restores the original vocabulary grid rather than discarding
  // bookmarks or resetting already submitted review events.
  renderHome(Boolean(api?.user()),api?.saved?.()||0,api?.due?.()||0);
}
window.MiaowuFlashcards={
  configure(adapter){api=adapter;},
  render({loggedIn=false,saved=0,due=0,sessionKey=null}={}){
    if(sessionKey!==userName){userName=sessionKey;clearRound();}
    if(round){if(!host()?.querySelector(".flash-session"))draw();return;}
    renderHome(loggedIn,saved,due);
  },
  running(){return !!round;},
  close:closeSession
};
})();