// WordLetter V1.1 announcement strip + public archive. Plain text only.
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const KIND={feature:"功能更新",books:"新书上架",maintenance:"维护通知",other:"妙屋消息"};
const storageKey="miaowu_notice_dismissed_id_v1";
const text=(el,value)=>{if(el)el.textContent=String(value??"");};
const safeDate=value=>{
 if(!value)return "";
 const normalized=String(value).includes("T")?String(value):String(value).replace(" ","T")+"Z";
 const date=new Date(normalized);
 return Number.isNaN(date.getTime())?"":new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"long",day:"numeric"}).format(date);
};
async function get(path){
 const response=await fetch(path,{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
 if(!response.ok)throw Error("更新日志暂时不可用");
 return response.json();
}
function dismissed(){try{return localStorage.getItem(storageKey)||""}catch{return ""}}
function dismiss(id){try{localStorage.setItem(storageKey,id)}catch{}}
async function home(){
 const section=$("siteUpdateBanner");
 if(!section)return;
 try{
  const result=await get("/api/updates/latest");
  const latest=result?.latest;
  // Reviewer-only preview link can reveal the sample once after it was dismissed.
  // This never overrides the dismissal rule for real published announcements.
  const forcePreview=result?.previewOnly===true &&
    new URLSearchParams(location.search).get("previewAnnouncement")==="1";
  if(!latest||!latest.id||(dismissed()===latest.id&&!forcePreview)){section.hidden=true;return}
  text($("siteUpdateTitle"),latest.title);
  text($("siteUpdateMeta"),safeDate(latest.publishedAt)+" · "+(KIND[latest.category]||"更新"));
  $("siteUpdateDetail").href="/updates.html#"+encodeURIComponent(latest.id);
  $("siteUpdateDismiss").onclick=()=>{
   dismiss(latest.id);
   section.hidden=true;
  };
  section.hidden=false;
 }catch{section.hidden=true}
}
async function archive(){
 const root=$("siteUpdateHistory");
 if(!root)return;
 const status=$("siteUpdateHistoryStatus"),more=$("siteUpdateMore");
 let page=1,busy=false;
 async function load(){
  if(busy)return;
  busy=true;more.hidden=true;
  text(status,"正在读取妙屋更新记录…");
  try{
   const result=await get("/api/updates?page="+page);
   const rows=result.updates||[];
   if(page===1)root.replaceChildren();
   for(const row of rows){
    const card=document.createElement("article");card.className="mw-history-card";card.id=row.id;
    const time=document.createElement("time");time.dateTime=row.publishedAt||"";
    time.textContent=safeDate(row.publishedAt);
    const kind=document.createElement("span");kind.className="mw-history-kind";
    kind.textContent=KIND[row.category]||"妙屋消息";
    const title=document.createElement("h2");title.textContent=row.title;
    const summary=document.createElement("p");summary.className="mw-history-body";
    summary.textContent=row.body;
    card.append(time,kind,title,summary);root.append(card);
   }
   text(status,result.total?"共 "+result.total+" 条公开更新":"喵呜～暂时还没有公开的更新公告。");
   more.hidden=!result.hasMore;
   if(page===1&&location.hash){
    const id=decodeURIComponent(location.hash.slice(1));
    if(/^[0-9a-f-]{36}$/i.test(id))document.getElementById(id)?.scrollIntoView({block:"start"});
   }
   if(result.hasMore)page++;
  }catch{text(status,"更新日志暂时无法读取，请刷新重试。")}
  finally{busy=false}
 }
 more.addEventListener("click",load);
 await load();
}
if($("siteUpdateHistory")){
 try{document.documentElement.setAttribute("data-theme",localStorage.getItem("miaowu_theme")==="dark"?"dark":"light")}
 catch{}
}
if(document.readyState==="loading")
 document.addEventListener("DOMContentLoaded",()=>{void home();void archive()},{once:true});
else{void home();void archive()}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)void home()});
})();
