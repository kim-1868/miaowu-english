// V1.1 operator announcement manager. Credential stays in parent ops-console.js memory.
export function initUpdatesAdmin({api,connected}){
 const $=id=>document.getElementById(id);
 const list=$("updatesAdminList"),form=$("updatesAdminForm"),message=$("updatesAdminStatus");
 if(!list||!form||!message)throw Error("UPDATES_ADMIN_LAYOUT_MISSING");
 const labels={feature:"功能更新",books:"新书上架",maintenance:"维护通知",other:"其他"};
 let records=[],selected=null,busy=false,active=false;
 const say=value=>{message.textContent=value};
 const button=(id,on)=>{$(id).disabled=!active||busy||!on};
 function fields(){
  return {title:$("updatesTitle").value.trim(),summary:$("updatesSummary").value.trim(),
   body:$("updatesBody").value.trim(),category:$("updatesKind").value,
   showOnHome:$("updatesOnHome").checked};
 }
 function select(row){
  selected=row||null;
  $("updatesFormHeading").textContent=row?"编辑公告 · "+(row.status==="published"?"已发布":row.status==="draft"?"草稿":"已下架"):"新建妙屋公告";
  $("updatesTitle").value=row?.title||"";
  $("updatesSummary").value=row?.summary||"";
  $("updatesBody").value=row?.body||"";
  $("updatesKind").value=row?.category||"feature";
  $("updatesOnHome").checked=row?.showOnHome??true;
  sync();renderList();
 }
 function sync(){
  active=Boolean(connected());
  button("updatesNew",true);button("updatesRefresh",true);
  button("updatesSave",true);
  button("updatesPublish",selected&&selected.status!=="published");
  button("updatesWithdraw",selected&&selected.status==="published");
 }
 function renderList(){
  list.replaceChildren();
  if(!records.length){
   const empty=document.createElement("p");empty.className="hint";
   empty.textContent="暂无公告。可以先新建一条草稿。";list.append(empty);return;
  }
  for(const row of records){
   const entry=document.createElement("button");
   entry.type="button";entry.className="mw-ops-update-record"+(selected?.id===row.id?" selected":"");
   const title=document.createElement("strong");title.textContent=row.title;
   const metadata=document.createElement("small");
   metadata.textContent=(row.status==="published"?"已发布":row.status==="draft"?"草稿":"已下架")+" · "+
      (labels[row.category]||"其他")+" · "+(row.publishedAt||row.updatedAt||"");
   entry.append(title,metadata);entry.disabled=!active||busy;
   entry.addEventListener("click",()=>{select(row);say("当前选择："+row.title)});
   list.append(entry);
  }
 }
 async function refresh(preferred){
  if(!connected()){reset();return}
  active=true;sync();
  const result=await api("/api/ops/updates");
  records=result.updates||[];
  const keep=preferred||selected?.id;
  const found=keep?records.find(x=>x.id===keep):null;
  if(found)select(found);
  else if(selected)select(null);
  else renderList();
  say("已加载 "+records.length+" 条公告（包含草稿、历史及下架记录）。");
 }
 async function run(job){
  if(busy||!connected())return;
  busy=true;sync();renderList();
  try{await job()}catch(error){say(error?.message||"操作未完成，请检查网络。")}
  finally{busy=false;sync();renderList()}
 }
 async function save(){
  const data=fields();
  if(!data.title||!data.summary||!data.body){say("请填写标题、摘要和正文。");return}
  const previous=selected;
  const path=previous?"/api/ops/updates/"+encodeURIComponent(previous.id):"/api/ops/updates";
  const method=previous?"PUT":"POST";
  const result=await api(path,method,previous?{...data,revision:previous.revision}:data);
  say(previous?"公告内容已保存。":"草稿已创建，可点击「发布公告」。");
  await refresh(result.id);
 }
 $("updatesNew").addEventListener("click",()=>{select(null);say("正在新建草稿。");$("updatesTitle").focus()});
 $("updatesRefresh").addEventListener("click",()=>void run(()=>refresh()));
 form.addEventListener("submit",event=>{event.preventDefault();void run(save)});
 $("updatesPublish").addEventListener("click",()=>void run(async()=>{
  if(!selected||selected.status==="published")return;
  if(!window.confirm("确认发布这条公告？发布后所有用户都可在更新日志中看到。"))return;
  const id=selected.id;
  await api("/api/ops/updates/"+encodeURIComponent(id)+"/publish","POST",{revision:selected.revision});
  await refresh(id);say("公告已发布，读者刷新首页即可看到最新通知。");
 }));
 $("updatesWithdraw").addEventListener("click",()=>void run(async()=>{
  if(!selected||selected.status!=="published")return;
  if(!window.confirm("确认下架此公告？它将从首页和历史更新中隐藏，后台保留记录。"))return;
  const id=selected.id;
  await api("/api/ops/updates/"+encodeURIComponent(id)+"/withdraw","POST",{revision:selected.revision});
  await refresh(id);say("公告已下架，后台历史记录已保留。");
 }));
 function reset(){
  records=[];active=false;selected=null;busy=false;select(null);
  list.replaceChildren();
  const note=document.createElement("p");note.className="hint";
  note.textContent="请先验证运营身份。";list.append(note);
  say("请先验证运营身份。");
 }
 reset();
 return {refresh,reset};
}
