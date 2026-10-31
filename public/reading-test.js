(()=>{
'use strict';
const $=id=>document.getElementById(id);
const say=(id,s)=>$(id).textContent=s;
const errors={
  LOGIN_REQUIRED:"未登录：服务器拒绝读取付费章节（HTTP 401）",
  PURCHASE_REQUIRED:"无此分类购买权限：服务器拒绝读取正文（HTTP 403）",
  NOT_FOUND:"不存在或尚未发布的章节（HTTP 404）",
  INTERNAL_ERROR:"服务端内部错误（HTTP 500）",
  SERVICE_NOT_CONFIGURED:"服务尚未配置完成（HTTP 503）",
  INVALID_ORIGIN:"来源验证未通过（HTTP 403）"
};
async function api(path,method="GET",payload){
  const opts={method,credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}};
  if(payload){opts.headers["Content-Type"]="application/json";opts.body=JSON.stringify(payload)}
  const r=await fetch(path,opts);
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(errors[data.error]||"HTTP "+r.status+"："+(data.error||"请求失败"));
  return data;
}
async function busy(btn,fn){
  btn.disabled=true;try{await fn()}catch(e){say("feedback",e.message)}finally{btn.disabled=false}
}
async function account(){
  try{
    const a=await api("/api/auth/me");
    say("identity","账号："+a.user.username+"\n分类："+(a.categories.map(x=>x.title).join("、")||"暂无"));
  }catch{say("identity","尚未登录妙屋英语测试账号（仍可阅读试读章节）。")}
}
async function books(){
  const container=$("books");container.replaceChildren();
  for(const [slug,label] of [["cet4","四级"],["cet6","六级"]]){
    const result=await api("/api/books?category="+slug);
    const title=document.createElement("h2");title.textContent=label+"测试书架";container.append(title);
    if(!result.books.length){const p=document.createElement("p");p.textContent="目前没有发布的测试书。";container.append(p)}
    for(const book of result.books.filter(b=>b.id.startsWith("qa-"))){
      const heading=document.createElement("h3");heading.textContent=book.title;container.append(heading);
      const listing=await api("/api/books/"+encodeURIComponent(book.id)+"/chapters");
      for(const ch of listing.chapters){
        const el=document.createElement("div");el.className="chapter";
        const strong=document.createElement("strong");
        strong.textContent="第"+ch.chapterNo+"章 · "+ch.title+(ch.isPreview?" · 免费试读":(ch.canRead?" · 当前账号有权读取":" · 当前账号未解锁"));
        const btn=document.createElement("button");btn.className=ch.canRead?"":"secondary";
        btn.textContent="请求服务器正文";
        btn.onclick=()=>busy(btn,async()=>{
          say("content","正在请求 "+ch.id+"…");
          try{
            const page=await api("/api/chapters/"+encodeURIComponent(ch.id));
            say("content",page.title+"\n\n"+(page.content.paragraphs||[]).join("\n\n"));
            say("feedback","服务器允许读取 "+ch.id+"。");
          }catch(e){say("content",e.message);say("feedback","服务器拒绝返回正文："+ch.id)}
        });
        el.append(strong,btn);container.append(el);
      }
    }
  }
  say("feedback","目录加载成功。请分别尝试免费章节与付费章节；切换账号后可以对比权限。");
}
$("refreshAccount").onclick=()=>busy($("refreshAccount"),account);
$("seed").onclick=()=>busy($("seed"),async()=>{
  const out=await api("/api/staging/seed-chapter-fixtures","POST",{});
  say("feedback","D1 测试书目准备完成："+out.bookCount+"本，"+out.chapterCount+"章。");
  await books();
});
$("seedWordbook").onclick=()=>busy($("seedWordbook"),async()=>{
  const result=await api("/api/staging/seed-wordbook-fixture","POST",{});
  say("feedback","云端点词测试章已就绪："+result.chapterId+"，词汇："+result.wordId+"。现在可以返回主站打开四级 QA 书籍，第3章点词并收藏。");
  await books();
});
$("seedEcho").onclick=()=>busy($("seedEcho"),async()=>{
  const r=await api("/api/staging/seed-echo-fixture","POST",{});
  say("feedback","剧情回声测试章已准备："+r.chapterId+"（"+r.wordCount+"个目标词）。请回主站登录，读完四级测试书第4章并标记已读完，再进入剧情回声。");
  await books();
});
$("load").onclick=()=>busy($("load"),books);
account();books().catch(e=>say("feedback",e.message));
})();