// WordLetter V1.1 announcement strip + public archive. Plain text only.
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const KIND={feature:"功能更新",books:"新书上架",maintenance:"维护通知",other:"妙屋消息"};
const storageKey="miaowu_notice_dismissed_id_v1";
let currentLatest=null;
let latestRequestId=0; // Prevent delayed older responses from replacing a newer notice.
let historyRows=[],historyPage=1,historyHasMore=true,historyVisible=5,historyLoading=false,historyError=false;
const HISTORY_STEP=5;
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
 const requestId=++latestRequestId;
 try{
  const result=await get("/api/updates/latest");
  if(requestId!==latestRequestId)return;
  const latest=result?.latest;
  // Preview-only reset is a ONE-TIME reviewer action. Leaving the history page
  // must never make the notice disappear, and clicking × must remain final.
  // Never reset a real published notice's dismissed state.
  const previewRequested=result?.previewOnly===true && latest?.id &&
    new URLSearchParams(location.search).get("previewAnnouncement")==="1";
  if(previewRequested){
    try {if(dismissed()===latest.id)localStorage.removeItem(storageKey)} catch {}
    // Consume the preview flag so a later explicit × is respected on refresh.
    const url=new URL(location.href);
    url.searchParams.delete("previewAnnouncement");
    history.replaceState(history.state,"",url.pathname+url.search+url.hash);
  }
  if(!latest||!latest.id||dismissed()===latest.id){currentLatest=null;section.hidden=true;return}
  currentLatest=latest;
  text($("siteUpdateTitle"),latest.title);
  text($("siteUpdateMeta"),safeDate(latest.publishedAt)+" · "+(KIND[latest.category]||"更新"));
  $("siteUpdateTitle").onclick=()=>openAnnouncementDialog();
  $("siteUpdateMeta").onclick=()=>openAnnouncementDialog();
  $("siteUpdateDetail").onclick=()=>openAnnouncementDialog();
  $("siteUpdateDismiss").onclick=()=>{
   dismiss(latest.id);
   section.hidden=true;
  };
  section.hidden=false;
 }catch{if(requestId===latestRequestId)section.hidden=true}
}
function setAnnouncementTab(tab){
 const latest=tab==="latest";
 const latestTab=$("siteUpdateTabLatest"),historyTab=$("siteUpdateTabHistory");
 if(!latestTab||!historyTab)return;
 latestTab.setAttribute("aria-selected",String(latest));
 historyTab.setAttribute("aria-selected",String(!latest));
 latestTab.tabIndex=latest?0:-1;
 historyTab.tabIndex=latest?-1:0;
 $("siteUpdatePanelLatest").hidden=!latest;
 $("siteUpdatePanelHistory").hidden=latest;
 if(!latest)void ensureHistory();
}
function openAnnouncementDialog(){
 const dialog=$("siteUpdateDialog");
 if(!dialog||!currentLatest)return;
 text($("siteUpdateDialogDate"),safeDate(currentLatest.publishedAt)+" · "+(KIND[currentLatest.category]||"妙屋消息"));
 text($("siteUpdateDialogHeadline"),currentLatest.title);
 text($("siteUpdateDialogBody"),currentLatest.body||currentLatest.summary||"");
 historyVisible=HISTORY_STEP;
 setAnnouncementTab("latest");
 if(!dialog.open)dialog.showModal();
}
function renderCompactHistory(){
 const root=$("siteUpdateCompactList"),more=$("siteUpdateHistoryMore"),status=$("siteUpdateHistoryInlineStatus");
 if(!root||!more||!status)return;
 root.replaceChildren();
 for(const item of historyRows.slice(0,historyVisible)){
  const row=document.createElement("div");
  row.className="mw-updates-history-row";
  const button=document.createElement("button");
  button.type="button";button.className="mw-updates-history-toggle";
  button.setAttribute("aria-expanded","false");
  const date=document.createElement("time");
  date.dateTime=item.publishedAt||"";
  date.textContent=safeDate(item.publishedAt);
  const title=document.createElement("span");
  title.className="mw-updates-history-title";
  title.textContent=item.title||"更新公告";
  const arrow=document.createElement("span");
  arrow.className="mw-updates-history-chevron";
  arrow.setAttribute("aria-hidden","true");
  arrow.textContent="⌄";
  button.append(date,title,arrow);
  const body=document.createElement("p");
  body.className="mw-updates-history-body";
  body.textContent=item.body||item.summary||"";
  body.hidden=true;
  button.addEventListener("click",()=>{
   const opening=body.hidden;
   root.querySelectorAll(".mw-updates-history-body").forEach(p=>{p.hidden=true});
   root.querySelectorAll(".mw-updates-history-toggle").forEach(b=>b.setAttribute("aria-expanded","false"));
   body.hidden=!opening;
   button.setAttribute("aria-expanded",String(opening));
  });
  row.append(button,body);root.append(row);
 }
 text(status,historyLoading?"正在读取更新记录…":
   historyError?"更新记录暂时无法读取，点击“查看更多”重试。":
   historyRows.length===0&&!historyHasMore?"还没有历史公告。":"");
 more.hidden=historyLoading||(!historyError&&historyRows.length<=historyVisible&&!historyHasMore);
 more.disabled=historyLoading;
}
async function ensureHistory(){
 if(historyLoading)return;
 if(historyRows.length>=historyVisible||!historyHasMore){renderCompactHistory();return}
 historyLoading=true;historyError=false;renderCompactHistory();
 try{
  while(historyRows.length<historyVisible&&historyHasMore){
   const result=await get("/api/updates?page="+historyPage);
   const rows=Array.isArray(result.updates)?result.updates:[];
   const known=new Set(historyRows.map(x=>x.id));
   for(const item of rows){
    if(item&&item.id&&!known.has(item.id)){
     historyRows.push(item);
     known.add(item.id);
    }
   }
   historyHasMore=Boolean(result.hasMore)&&rows.length>0;
   historyPage++;
  }
 }catch{historyError=true}
 finally{historyLoading=false;renderCompactHistory()}
}
function initAnnouncementDialog(){
 const dialog=$("siteUpdateDialog");
 if(!dialog)return;
 $("siteUpdateDialogClose").addEventListener("click",()=>dialog.close());
 $("siteUpdateTabLatest").addEventListener("click",()=>setAnnouncementTab("latest"));
 $("siteUpdateTabHistory").addEventListener("click",()=>setAnnouncementTab("history"));
 for(const name of ["latest","history"]){
  const tab=$(name==="latest"?"siteUpdateTabLatest":"siteUpdateTabHistory");
  tab.addEventListener("keydown",event=>{
   if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
   event.preventDefault();
   const target=event.key==="Home"?"latest":event.key==="End"?"history":
    name==="latest"?"history":"latest";
   setAnnouncementTab(target);
   $(target==="latest"?"siteUpdateTabLatest":"siteUpdateTabHistory").focus();
  });
 }
 $("siteUpdateHistoryMore").addEventListener("click",()=>{
  if(historyError){historyError=false}
  else historyVisible+=HISTORY_STEP;
  void ensureHistory();
 });
 dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close()});
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
   const rows=Array.isArray(result.updates)?result.updates:[];
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
   more.textContent="加载更早的更新";
   if(page===1&&location.hash){
    const id=decodeURIComponent(location.hash.slice(1));
    if(/^[0-9a-f-]{36}$/i.test(id))document.getElementById(id)?.scrollIntoView({block:"start"});
   }
   if(result.hasMore)page++;
  }catch{
   text(status,"更新日志暂时无法读取，请点击重试。");
   more.textContent="重试加载";
   more.hidden=false;
  }
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
 document.addEventListener("DOMContentLoaded",()=>{initAnnouncementDialog();void home();void archive()},{once:true});
else{initAnnouncementDialog();void home();void archive()}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)void home()});
// Restore from history (including bfcache): simply refresh; never dismiss on navigation.
window.addEventListener("pageshow",()=>{if($("siteUpdateBanner"))void home()});
})();
