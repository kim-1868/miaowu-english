// V1.1 staging-only announcement manager. Publisher token stays in parent page memory.
export function initUpdatesAdmin({api,connected}){
 const $=id=>document.getElementById(id);
 const list=$("updatesAdminList"),form=$("updatesAdminForm"),message=$("updatesAdminStatus");
 const setupPanel=$("updatesSetupPanel"),setupButton=$("updatesSetup");
 if(!list||!form||!message||!setupPanel||!setupButton)
  throw Error("UPDATES_ADMIN_LAYOUT_MISSING");
 const labels={feature:"功能更新",books:"新书上架",maintenance:"维护通知",other:"其他"};
 const statusNames={published:"已发布",draft:"草稿",withdrawn:"已下架"};
 let records=[],selected=null,busy=false,serverReady=false,setupRequired=false,dirty=false;
 const say=value=>{message.textContent=value};
 const canEdit=()=>Boolean(connected()&&serverReady&&!setupRequired);
 const button=(id,allow)=>{$(id).disabled=!connected()||busy||!allow};
 function fields(){
  const title=$("updatesTitle").value.trim();
  return {title,summary:$("updatesSummary").value.trim()||title,
   body:$("updatesBody").value.trim(),category:$("updatesKind").value,
   showOnHome:$("updatesOnHome").checked};
 }
 function sync(){
  setupPanel.hidden=!setupRequired||!connected();
  button("updatesSetup",setupRequired);
  button("updatesRefresh",true);
  button("updatesNew",canEdit());
  button("updatesSave",canEdit());
  button("updatesPublish",canEdit()&&!dirty&&selected&&selected.status!=="published");
  button("updatesWithdraw",canEdit()&&!dirty&&selected&&selected.status==="published");
 }
 function select(row){
  selected=row||null;dirty=false;
  $("updatesFormHeading").textContent=row?"编辑公告 · "+(statusNames[row.status]||"未知"):"新建妙屋公告";
  $("updatesTitle").value=row?.title||"";
  $("updatesSummary").value=row?.summary||"";
  $("updatesBody").value=row?.body||"";
  $("updatesKind").value=row?.category||"feature";
  $("updatesOnHome").checked=row?.showOnHome??true;
  sync();renderList();
 }
 function renderList(){
  list.replaceChildren();
  if(setupRequired){
   const p=document.createElement("p");p.className="hint";
   p.textContent="请先点击「启用公告管理」初始化测试公告表。";
   list.append(p);return;
  }
  if(!records.length){
   const p=document.createElement("p");p.className="hint";
   p.textContent="暂无已保存公告。可以先新建一条草稿。";
   list.append(p);return;
  }
  for(const row of records){
   const entry=document.createElement("button");
   entry.type="button";
   entry.className="mw-ops-update-record"+(selected?.id===row.id?" selected":"");
   entry.setAttribute("aria-pressed",String(selected?.id===row.id));
   const title=document.createElement("strong");title.textContent=row.title;
   const meta=document.createElement("small");
   meta.textContent=(statusNames[row.status]||"未知")+" · "+(labels[row.category]||"其他")+
    (row.showOnHome?" · 首页展示":" · 仅历史")+
    " · "+(row.publishedAt||row.updatedAt||"未发布");
   entry.append(title,meta);entry.disabled=!canEdit()||busy;
   entry.addEventListener("click",()=>{
    if(dirty&&!window.confirm("当前表单尚未保存，确定放弃修改并切换公告？"))return;
    select(row);say("已选择公告："+row.title);
   });
   list.append(entry);
  }
 }
 async function refresh(preferred){
  if(!connected()){reset();return}
  const result=await api("/api/ops/updates");
  setupRequired=result.setupRequired===true;
  serverReady=!setupRequired;
  records=Array.isArray(result.updates)?result.updates:[];
  const keep=preferred||selected?.id;
  const found=keep?records.find(x=>x.id===keep):null;
  select(found||null);
  say(setupRequired?"测试公告表尚未初始化。请点击「启用公告管理」，仅操作测试数据库。":
   "已加载 "+records.length+" 条公告（包含草稿、已发布及下架记录）。");
 }
 async function run(job){
  if(busy||!connected())return;
  busy=true;sync();renderList();
  try{await job()}catch(error){say(error?.message||"操作未完成，请检查网络。")}
  finally{busy=false;sync();renderList()}
 }
 async function save(){
  if(!canEdit())return;
  const data=fields();
  if(!data.title||!data.body){say("请填写公告标题和正文。摘要可留空。");return}
  const previous=selected;
  const path=previous?"/api/ops/updates/"+encodeURIComponent(previous.id):"/api/ops/updates";
  const method=previous?"PUT":"POST";
  const result=await api(path,method,previous?{...data,revision:previous.revision}:data);
  await refresh(result.id);
  dirty=false;sync();
  say(previous?"公告修改已保存。已发布公告自动更新正文，不会重复提醒。":"草稿已保存。确认无误后点击「发布公告」。");
 }
 setupButton.addEventListener("click",()=>void run(async()=>{
  if(!setupRequired)return;
  if(!window.confirm("仅在当前受密码保护的 V1.1 测试数据库创建独立公告表，不涉及正式网站或用户学习数据。确认启用？"))return;
  const result=await api("/api/ops/updates/setup","POST",{});
  if(result.ready!==true)throw Error("公告表初始化结果异常，请刷新重试。");
  await refresh();
  say("公告管理已启用。现在可以新建、保存和发布公告。");
 }));
 $("updatesNew").addEventListener("click",()=>{
  if(!canEdit())return;
  if(dirty&&!window.confirm("当前修改尚未保存，确定新建一条公告？"))return;
  select(null);say("正在新建草稿。");$("updatesTitle").focus();
 });
 $("updatesRefresh").addEventListener("click",()=>void run(async()=>{
  if(dirty&&!window.confirm("当前表单有未保存的修改，确定刷新吗？"))return;
  await refresh();
 }));
 for(const id of ["updatesTitle","updatesSummary","updatesBody","updatesKind","updatesOnHome"]){
  const node=$(id);
  node.addEventListener(id==="updatesKind"||id==="updatesOnHome"?"change":"input",()=>{
   if(!canEdit())return;
   dirty=true;sync();
  });
 }
 form.addEventListener("submit",event=>{event.preventDefault();void run(save)});
 $("updatesPublish").addEventListener("click",()=>void run(async()=>{
  if(!selected||selected.status==="published")return;
  if(dirty){say("当前有未保存的修改，请先点击「保存草稿 / 修改」。");return}
  if(!window.confirm("确认发布这条公告？发布后将对预览网站读者公开。"))return;
  const id=selected.id;
  await api("/api/ops/updates/"+encodeURIComponent(id)+"/publish","POST",{revision:selected.revision});
  await refresh(id);
  say("公告发布成功。首页和历史公告弹窗将在读者刷新后显示。");
 }));
 $("updatesWithdraw").addEventListener("click",()=>void run(async()=>{
  if(!selected||selected.status!=="published")return;
  if(dirty){say("当前有未保存的修改，请先保存或取消修改。");return}
  if(!window.confirm("确认下架？公告将从首页和历史弹窗隐藏，但保留在运营台。"))return;
  const id=selected.id;
  await api("/api/ops/updates/"+encodeURIComponent(id)+"/withdraw","POST",{revision:selected.revision});
  await refresh(id);
  say("公告已下架，运营记录保留。");
 }));
 function reset(){
  records=[];selected=null;busy=false;serverReady=false;setupRequired=false;dirty=false;
  select(null);
  const p=document.createElement("p");p.className="hint";p.textContent="请先验证运营身份。";
  list.replaceChildren(p);say("请先验证运营身份。");
 }
 reset();
 return {refresh,reset};
}
