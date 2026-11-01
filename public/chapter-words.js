(()=>{
"use strict";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let api=null,chapter="",words=[],cursor=0,judgments=new Map(),mode="list";
const host=()=>$("chapterVocabBody");
function render(){
  const area=host();if(!area)return;
  $("chapterVocabCount").textContent=words.length+" 词";
  const title=$("chapterVocabTitle");
  title.textContent=mode==="quick"?"本章速记":"本章词汇";
  if(!chapter){area.innerHTML='<p class="side-caption">打开云端章节后，即可查看本章全部目标词。</p>';return}
  if(!words.length){area.innerHTML='<p class="side-caption">本章没有可展示的目标词，或词汇正在加载。</p>';return}
  if(mode==="list"){
    area.innerHTML='<div class="chapter-vocab-actions"><button class="primary" id="startQuickReview">开始速记 →</button></div>'+
    '<div class="chapter-vocab-list">'+words.map((w,i)=>
      '<div class="chapter-vocab-item"><button type="button" class="chapter-vocab-select" data-vocab-index="'+i+'">'+
      '<strong>'+esc(w.headword)+'</strong><small>'+esc(w.meaning_zh)+'</small></button>'+
      '<button type="button" class="chapter-vocab-voice" aria-label="朗读 '+esc(w.headword)+'" data-vocab-say="'+i+'">♫</button></div>'
    ).join("")+'</div>';
    $("startQuickReview").onclick=()=>{cursor=0;mode="quick";render()};
    area.querySelectorAll("[data-vocab-index]").forEach(b=>b.onclick=()=>{
      const word=words[+b.dataset.vocabIndex];api.showWord(word.word_id);
    });
    area.querySelectorAll("[data-vocab-say]").forEach(b=>b.onclick=()=>api.speak(words[+b.dataset.vocabSay].headword));
  }else{
    const w=words[cursor],decision=judgments.get(w.word_id);
    area.innerHTML='<div class="quick-review-card"><div class="quick-counter">'+(cursor+1)+' / '+words.length+'</div>'+
      '<div class="quick-word">'+esc(w.headword)+'</div>'+
      '<div class="quick-pron">'+esc(w.phonetic_uk||w.phonetic_us||"")+'</div>'+
      '<div class="quick-meaning">'+esc(w.meaning_zh||"")+'</div>'+
      (w.context_sentence?'<p class="quick-context">'+esc(w.context_sentence)+'</p>':"")+
      (decision?'<div class="quick-decision">'+(decision==="known"?"✓ 本轮记得":"↻ 已加入待复习")+'</div>':"")+
      '<div class="quick-review-navigation"><button id="quickPrev" type="button" '+(cursor===0?"disabled":"")+'>← 上一个</button>'+
      '<button id="quickNext" type="button" '+(cursor===words.length-1?"disabled":"")+'>下一个 →</button></div>'+
      '<div class="quick-review-vote"><button id="quickForgot" type="button">↻ 不记得</button>'+
      '<button id="quickKnow" type="button">✓ 记得</button></div>'+
      '<button class="quick-back" id="quickBack" type="button">返回本章词汇</button></div>';
    $("quickPrev").onclick=()=>{cursor=Math.max(0,cursor-1);render()};
    $("quickNext").onclick=()=>{cursor=Math.min(words.length-1,cursor+1);render()};
    $("quickBack").onclick=()=>{mode="list";render()};
    $("quickForgot").onclick=()=>vote(false);
    $("quickKnow").onclick=()=>vote(true);
  }
}
async function vote(remembered){
  if(!api.user()){api.login();return}
  const w=words[cursor];
  for(const id of ["quickKnow","quickForgot"])$(id).disabled=true;
  try{
    await api.request("/api/me/quick-review","POST",{wordId:w.word_id,chapterId:chapter,remembered});
    judgments.set(w.word_id,remembered?"known":"forgot");
    api.refresh();
    if(cursor<words.length-1)cursor++;render();
    api.toast(remembered?"已记录「记得」":"已加入记忆藏书票 · 待复习");
  }catch(error){api.toast(error.message);render()}
}
$("chapterVocabToggle").onclick=()=>{
  const body=$("chapterVocabBody"),folded=!body.hidden;
  body.hidden=folded;
  $("chapterVocabToggle").setAttribute("aria-expanded",String(!folded));
  $("chapterVocabToggle").textContent=folded?"展开":"收起";
};
$("mobileVocabOpen").onclick=()=>{
  $("readerLayout").classList.add("vocab-drawer-open");
  $("mobileVocabOpen").setAttribute("aria-expanded","true");
};
$("mobileVocabClose").onclick=()=>{
  $("readerLayout").classList.remove("vocab-drawer-open");
  $("mobileVocabOpen").setAttribute("aria-expanded","false");
};
window.MiaowuChapterWords={
  configure(x){api=x},
  openChapter(id){chapter=id;words=[];cursor=0;mode="list";judgments.clear();render()},
  setWords(rows){const seen=new Set();words=(rows||[]).filter(w=>{
    if(!w?.word_id||seen.has(w.word_id))return false;seen.add(w.word_id);return true;
  });render()},
  clear(){chapter="";words=[];mode="list";render()},
  render(){render()}
};
})();