(()=>{
"use strict";
const $=id=>document.getElementById(id);
const state={user:null,grants:new Set(),categories:[],category:"cet4",book:null,chapters:[],
  currentChapter:null,chapterWords:new Map(),saved:new Map(),progress:new Map(),showGloss:true,selectedWord:null};
const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x};
const btn=(title,handler,cls="secondary")=>{const b=el("button",cls,title);b.type="button";b.onclick=handler;return b};
function toast(message){$("toast").textContent=message;$("toast").classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>$("toast").classList.remove("show"),3500)}
async function api(path,options={}){
  let response;
  try{response=await fetch(path,{credentials:"same-origin",cache:"no-store",...options,
    headers:{...(options.headers||{})}})}
  catch{throw Error("网络暂时无法连接，请稍后重试。")}
  let data=null;try{data=await response.json()}catch{throw Error("服务端返回了无法解析的数据（HTTP "+response.status+"）")}
  if(!response.ok){const map={
    LOGIN_REQUIRED:"请先登录妙屋英语账号",PURCHASE_REQUIRED:"未开通该学习分类，无法阅读付费章节",
    CHAPTER_NOT_AVAILABLE:"无权保存该章节进度",WORD_NOT_AVAILABLE:"该词暂不可收藏",
    INVALID_CREDENTIALS:"用户名或密码错误",TOO_MANY_ATTEMPTS:"尝试次数过多，请稍后再试"
  };throw Error(map[data.error]||data.error||"请求失败（HTTP "+response.status+"）")}
  return data;
}
const body=(value)=>({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(value)});
function openLogin(){$("loginError").textContent="";$("loginDialog").showModal()}
async function auth(){
  try{
    const me=await api("/api/auth/me");
    state.user=me.user;state.grants=new Set((me.categories||[]).map(x=>x.slug));
  }catch{state.user=null;state.grants=new Set()}
  $("accountBtn").textContent=state.user?state.user.username+" · 退出":"登录";
  if(state.user){
    try{
      const [saved,progress]=await Promise.all([api("/api/me/words"),api("/api/me/progress")]);
      state.saved=new Map(saved.words.map(w=>[w.word_id,w]));
      state.progress=new Map(progress.progress.map(p=>[p.chapter_id,p]));
    }catch(e){toast("登录成功，但学习记录未读取："+e.message)}
  }else{state.saved=new Map();state.progress=new Map()}
}
function setView(name){
  for(const id of ["library","reader","word"])$(id+"View").hidden=id!==name;
  $("navBooks").classList.toggle("active",name!=="word");
  $("navWords").classList.toggle("active",name==="word");
  window.scrollTo({top:0,behavior:"instant"});
}
async function loadCategories(){
  const data=await api("/api/categories");
  state.categories=data.categories||[];
  if(!state.categories.some(c=>c.slug===state.category))state.category=state.categories[0]?.slug||"cet4";
  const host=$("categories");host.replaceChildren();
  for(const category of state.categories){
    const item=btn(category.title,()=>selectCategory(category.slug),"");
    item.classList.toggle("selected",category.slug===state.category);
    host.append(item);
  }
}
async function selectCategory(slug){
  state.category=slug;
  for(const [i,category] of state.categories.entries()){
    $("categories").children[i]?.classList.toggle("selected",category.slug===slug);
  }
  await loadBooks();
}
async function loadBooks(){
  const host=$("bookGrid");host.replaceChildren(el("p","muted","正在查询云端书架……"));
  try{
    const data=await api("/api/books?category="+encodeURIComponent(state.category));
    host.replaceChildren();
    if(!(data.books||[]).length){
      host.append(el("div","card","当前分类尚未发布可阅读小说。后台草稿不会在此显示。"));return;
    }
    for(const book of data.books){
      const card=el("div","book-card");
      const cover=el("div","book-cover");
      const center=el("div");
      center.append(el("span",null,"MIAOWU STORY LIBRARY"));
      center.append(el("div",null,book.title));cover.append(center);
      const label=/(测试|示例|^qa-)/i.test(book.title+" "+book.id);
      card.append(cover,el("h3",null,book.title),el("p",null,book.description||"进入故事，遇见值得记住的单词。"));
      if(label)card.append(el("span","test-badge","仅限功能测试"));
      card.append(btn("打开章节目录 →",()=>openBook(book),"primary"));
      host.append(card);
    }
  }catch(e){host.replaceChildren(el("p","error","书架读取失败："+e.message))}
}
async function openBook(book){
  state.book=book;state.chapters=[];
  setView("reader");
  $("tocBook").textContent="《"+book.title+"》· 目录";
  $("chapterHeading").textContent="正在读取章节……";
  $("chapterStory").replaceChildren();$("chapterLock").hidden=true;
  $("readerCrumb").textContent=book.title;
  try{
    const data=await api("/api/books/"+encodeURIComponent(book.id)+"/chapters");
    state.chapters=data.chapters||[];
    drawChapters();
    if(!state.chapters.length){$("chapterHeading").textContent="尚无已发布章节";return}
    await openChapter(state.chapters[0].id);
  }catch(e){$("chapterHeading").textContent="无法打开书籍";$("chapterLock").hidden=false;$("chapterLock").textContent=e.message}
}
function drawChapters(){
  const host=$("chapterList");host.replaceChildren();
  for(const c of state.chapters){
    const title="第"+c.chapterNo+"章 · "+c.title+(c.isPreview?" · 试读":"");
    const item=btn(title,()=>openChapter(c.id),"chapter-link");
    item.classList.toggle("locked",!c.canRead);
    item.classList.toggle("active",state.currentChapter?.id===c.id);
    host.append(item);
  }
}
async function openChapter(id){
  const target=state.chapters.find(c=>c.id===id);
  if(!target)return;
  state.currentChapter=target;
  drawChapters();
  $("chapterNumber").textContent="CHAPTER "+String(target.chapterNo).padStart(2,"0")+
    (target.isPreview?" · FREE PREVIEW":" · MEMBERS ONLY");
  $("chapterHeading").textContent=target.title;
  $("chapterStory").replaceChildren();
  $("chapterLock").hidden=true;
  $("finishBtn").disabled=true;
  $("nextBtn").disabled=state.chapters.indexOf(target)===state.chapters.length-1;
  $("readingProgress").textContent="读取中……";
  if(!target.canRead){
    showLock(state.user?"你还没有该分类的授权。可通过激活码解锁。":"请先登录并使用对应分类的激活码。");
    return;
  }
  try{
    const [chapter,words]=await Promise.all([
      api("/api/chapters/"+encodeURIComponent(id)),
      api("/api/chapters/"+encodeURIComponent(id)+"/words")
    ]);
    if(state.currentChapter?.id!==id)return;
    state.chapterWords=new Map((words.words||[]).map(w=>[w.word_id,w]));
    renderChapter(chapter.content);
    $("finishBtn").disabled=!state.user;
    const progress=state.progress.get(id);
    $("readingProgress").textContent=state.user?
      (progress?"已记录 "+Math.round(progress.progress*100)+"% · "+(progress.completed_at?"已读完":"阅读中"):
        "本章未标记已读。点击下方完成阅读即可保存云端进度。"):"免费试读中。登录后可同步进度。";
    $("readingUser").replaceChildren();
    if(!state.user)$("readingUser").append(btn("登录以保存进度",openLogin,"secondary"));
  }catch(e){showLock(e.message)}
}
function showLock(text){
  $("chapterStory").replaceChildren();
  $("chapterLock").hidden=false;$("chapterLock").replaceChildren();
  $("chapterLock").append(el("strong",null,"🔒 正文受到保护"),el("p",null,text));
  $("chapterLock").append(btn("登录 / 解锁说明",openLogin,"secondary"));
  $("finishBtn").disabled=true;
  $("readingProgress").textContent="本章暂不可读";
}
function renderChapter(content){
  const host=$("chapterStory");host.replaceChildren();
  if(!Array.isArray(content?.paragraphs)){host.append(el("p",null,"章节数据格式错误。"));return}
  for(const paragraph of content.paragraphs){
    const p=el("p");
    if(typeof paragraph==="string"){p.textContent=paragraph;host.append(p);continue}
    for(const segment of paragraph.segments||[]){
      if(typeof segment.text==="string"){p.append(document.createTextNode(segment.text));continue}
      if(typeof segment.wordId==="string"){
        const word=btn(segment.surface||"word",()=>openWord(segment.wordId),"inline-word");
        word.setAttribute("aria-label","查看单词 "+segment.surface+" 的词卡");
        p.append(word);
        if(segment.gloss&&state.showGloss)p.append(el("span","gloss","（"+segment.gloss+"）"));
      }
    }
    host.append(p);
  }
}
async function openWord(wordId){
  const entry=state.chapterWords.get(wordId);
  if(!entry)return toast("暂时无法获取这个单词的详细信息");
  state.selectedWord=entry;
  const host=$("wordInfo");host.replaceChildren();
  host.append(el("h2",null,entry.headword));
  const phonetics=[entry.phonetic_uk,entry.phonetic_us].filter(Boolean).join(" / ");
  host.append(el("p","detail-row",phonetics+" · "+(entry.part_of_speech||"")));
  host.append(el("p",null,entry.meaning_zh));
  if(entry.context_sentence)host.append(el("p","detail-row","原剧情："+entry.context_sentence));
  if(entry.example_en)host.append(el("p","detail-row",entry.example_en+" · "+(entry.example_zh||"")));
  for(const c of entry.collocations||[])host.append(el("p","detail-row",c.en+" — "+c.zh));
  updateWordButtons();
  $("wordDialog").showModal();
}
function updateWordButtons(){
  const word=state.selectedWord;
  if(!word)return;
  const current=state.saved.get(word.word_id);
  $("wordSave").textContent=current?"移除收藏":"收藏单词";
  $("wordMastered").textContent=current?.status==="mastered"?"改为学习中":"标记已掌握";
}
async function saveWord(markMastered){
  if(!state.selectedWord)return;
  if(!state.user){openLogin();return}
  const w=state.selectedWord;
  const current=state.saved.get(w.word_id);
  const bookmarked=markMastered?true:!current;
  const status=markMastered?(current?.status==="mastered"?"learning":"mastered"):(current?.status||"learning");
  try{
    await api("/api/me/words/"+encodeURIComponent(w.word_id),{
      method:"PUT",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({bookmarked,status})
    });
    if(bookmarked)state.saved.set(w.word_id,{...w,word_id:w.word_id,bookmarked:1,status});
    else state.saved.delete(w.word_id);
    updateWordButtons();
    toast("词卡状态已同步到云端");
  }catch(e){toast(e.message)}
}
function speak(text,lang){
  if(!("speechSynthesis" in window)){toast("当前浏览器不支持语音朗读");return}
  window.speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=lang==="en-US"?.85:.95;
  window.speechSynthesis.speak(u);
}
async function showWords(){
  setView("word");const host=$("savedWords");host.replaceChildren();
  if(!state.user){
    host.append(el("p","muted","登录之后，你收藏的单词会保存在 Cloudflare D1 测试库。"));
    host.append(btn("登录",openLogin,"primary"));return;
  }
  try{
    const result=await api("/api/me/words");
    state.saved=new Map(result.words.map(w=>[w.word_id,w]));
    if(!result.words.length){host.append(el("p","muted","还没有收藏单词。先打开一篇云端章节，点击英文标注进行收藏。"));return}
    for(const w of result.words){
      const card=el("div","word-card card");
      card.append(el("h3",null,w.headword),el("p","muted",(w.phonetic_uk||w.phonetic_us||"")+" · "+(w.part_of_speech||"")),el("p",null,w.meaning_zh));
      if(w.example_en)card.append(el("p","muted",w.example_en+" / "+(w.example_zh||"")));
      const row=el("div","word-actions");
      row.append(btn("▶ 发音",()=>speak(w.headword,"en-US"),"light"),
        btn(w.status==="mastered"?"已掌握":"学习中",async()=>{
          const newStatus=w.status==="mastered"?"learning":"mastered";
          try{
            await api("/api/me/words/"+encodeURIComponent(w.word_id),{
              method:"PUT",headers:{"Content-Type":"application/json"},
              body:JSON.stringify({bookmarked:true,status:newStatus})
            });await showWords();
          }catch(e){toast(e.message)}
        },"secondary"),
        btn("移除收藏",async()=>{
          try{
            await api("/api/me/words/"+encodeURIComponent(w.word_id),{
              method:"PUT",headers:{"Content-Type":"application/json"},
              body:JSON.stringify({bookmarked:false,status:w.status==="mastered"?"mastered":"learning"})
            });await showWords();
          }catch(e){toast(e.message)}
        },"light"));
      card.append(row);host.append(card);
    }
  }catch(e){host.replaceChildren(el("p","error","加载收藏失败："+e.message))}
}
async function finishChapter(){
  if(!state.currentChapter)return;
  if(!state.user){openLogin();return}
  try{
    const id=state.currentChapter.id;
    await api("/api/me/progress",body({chapterId:id,progress:1}));
    const fresh=await api("/api/me/progress");
    state.progress=new Map(fresh.progress.map(p=>[p.chapter_id,p]));
    $("readingProgress").textContent="✓ 已读完，本章阅读记录已保存到云端。";
    toast("本章进度已经保存到你的账号");
  }catch(e){toast(e.message)}
}
async function handleLogin(event){
  event.preventDefault();
  const form=event.currentTarget;
  const submit=$("submitLogin");submit.disabled=true;
  const user=form.elements.username.value.trim();
  const password=form.elements.password.value;
  try{
    await api("/api/auth/login",body({username:user,password}));
    form.elements.password.value="";
    $("loginDialog").close();await auth();
    toast("登录成功，已同步你的阅读进度");
    if(!$("readerView").hidden&&state.book)await openBook(state.book);
    if(!$("wordView").hidden)await showWords();
  }catch(e){$("loginError").textContent=e.message}
  finally{submit.disabled=false}
}
function flipTheme(){
  const dark=document.documentElement.dataset.theme!=="dark";
  document.documentElement.dataset.theme=dark?"dark":"light";
  $("themeBtn").textContent=dark?"☀ 日间":"☾ 夜间";
  try{localStorage.setItem("miaowu_live_theme",dark?"dark":"light")}catch{}
}
$("loginForm").addEventListener("submit",handleLogin);
$("loginCancel").onclick=()=>$("loginDialog").close();
$("accountBtn").onclick=async()=>{
  if(!state.user){openLogin();return}
  if(!confirm("退出当前测试账号？"))return;
  try{await api("/api/auth/logout",body({}));await auth();toast("已退出账号");if(state.book)await openBook(state.book)}
  catch(e){toast(e.message)}
};
$("navBooks").onclick=()=>{setView("library");loadBooks()};
$("navWords").onclick=showWords;
$("refreshBooks").onclick=loadBooks;
$("backToLibrary").onclick=()=>setView("library");
$("wordRefresh").onclick=showWords;
$("nextBtn").onclick=()=>{const i=state.chapters.findIndex(c=>c.id===state.currentChapter?.id);if(i>=0&&state.chapters[i+1])openChapter(state.chapters[i+1].id)};
$("finishBtn").onclick=finishChapter;
$("glossBtn").onclick=async()=>{
  state.showGloss=!state.showGloss;$("glossBtn").textContent="译 释义："+(state.showGloss?"开":"关");
  if(state.currentChapter)await openChapter(state.currentChapter.id);
};
$("speakBtn").onclick=()=>{
  if(!state.currentChapter)return;
  const story=$("chapterStory").innerText||"";
  if(!story)return;
  speak(story,"zh-CN");
};
$("wordClose").onclick=()=>$("wordDialog").close();
$("wordSpeak").onclick=()=>{if(state.selectedWord)speak(state.selectedWord.headword,"en-US")};
$("wordSave").onclick=()=>saveWord(false);
$("wordMastered").onclick=()=>saveWord(true);
$("themeBtn").onclick=flipTheme;
(async()=>{
  try{if(localStorage.getItem("miaowu_live_theme")==="dark")flipTheme()}catch{}
  await auth();
  try{await loadCategories();await loadBooks()}catch(e){$("bookGrid").replaceChildren(el("p","error",e.message))}
})();
})();