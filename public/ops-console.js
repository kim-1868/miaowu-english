(()=>{
"use strict";
// Never persist the operator credential in localStorage, sessionStorage, URL,
// browser cookies, analytics or console logs. Page memory only, cleared on exit.
const $=id=>document.getElementById(id);
let key="",chosen=null,readiness=null,identity=null,busy=false;
const byId=(tag,text,className)=>{
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=String(text);
  if(className)el.className=className;
  return el;
};
function status(msg){$("status").textContent=msg;}
function clearActions(){
  readiness=null;$("draftActions").hidden=true;$("liveActions").hidden=true;
  $("approve").disabled=true;$("publish").disabled=true;$("withdraw").disabled=true;
  $("report").textContent="";$("withdrawSummary").textContent="";
  $("checks").querySelectorAll("input").forEach(x=>x.checked=false);
  $("reviewNote").value="";$("publishTitle").value="";
  $("withdrawTitle").value="";$("withdrawReason").value="";$("withdrawConfirm").checked=false;
}
function connected(){return key.startsWith("mwops_")&&identity!==null}
async function api(path,method="GET",body){
  if(!key)throw Error("请先验证运营身份。");
  const headers={Accept:"application/json","X-Mw-Ops-Key":key};
  const options={method,headers,credentials:"same-origin",cache:"no-store",referrerPolicy:"same-origin"};
  if(body!==undefined){headers["Content-Type"]="application/json";options.body=JSON.stringify(body);}
  let result;
  try{result=await fetch(path,options);}
  catch{throw Error("无法连接后台，请检查网络和 Cloudflare 部署。");}
  let data;
  try{data=await result.json();}
  catch{throw Error("服务器未返回有效 JSON（HTTP "+result.status+"）。");}
  if(!result.ok){
    if(result.status===401){key="";identity=null;$("operatorIdentity").textContent="身份已失效";}
    throw Error("操作被拒绝："+(typeof data.error==="string"?data.error:"UNKNOWN")+
      "（HTTP "+result.status+"）。");
  }
  return data;
}
function button(id,fn){
  $(id).addEventListener("click",async()=>{
    if(busy)return;busy=true;const b=$(id),wasDisabled=b.disabled;b.disabled=true;
    try{await fn()}catch(e){status(e.message||"请求失败，请刷新重试。");}
    finally{busy=false;b.disabled=wasDisabled;syncButtons();}
  });
}
function syncButtons(){
  $("checkNovel").disabled=!connected()||!$("uploadNovel").files?.length;
  $("refresh").disabled=!connected();
  if(!readiness){$("approve").disabled=true;$("publish").disabled=true;$("withdraw").disabled=true;return}
  if(chosen?.status==="draft"){
    const checks=[...$("checks").querySelectorAll("input")];
    $("approve").disabled=!(readiness.technicalCheckPassed&&!readiness.sampleBlocked&&
      checks.every(x=>x.checked)&&$("reviewNote").value.trim().length>=12);
    $("publish").disabled=!(readiness.publishAvailable&&readiness.approval?.current&&
      $("publishTitle").value===chosen.title);
  }else{
    $("withdraw").disabled=!($("withdrawConfirm").checked&&
      $("withdrawTitle").value===chosen?.title&&$("withdrawReason").value.trim().length>=12&&
      readiness.canWithdraw);
  }
}
["checks","reviewNote","publishTitle","withdrawTitle","withdrawReason","withdrawConfirm"]
  .forEach(id=>$(id).addEventListener("input",syncButtons));
async function verify(){
  // Remove token from the input immediately after reading. It lives only in
  // one scoped JS variable, and never in location / storage.
  key=$("opsKey").value.trim();$("opsKey").value="";
  if(!/^mwops_[a-f0-9]{64}$/.test(key)){key="";throw Error("运营密钥格式不正确。");}
  const data=await api("/api/ops/me");
  if(data.operator?.role!=="publisher"){
    key="";identity=null;throw Error("此后台只开放给受授权的发布者角色。");
  }
  identity=data.operator;
  $("operatorIdentity").textContent=identity.displayName+" · "+identity.role+" · "+identity.environment;
  status("已通过运营身份校验。所有数据只从后台接口读取。");
  await loadBooks();
}
async function loadBooks(keepId=chosen?.id){
  if(!connected())return;
  const data=await api("/api/ops/books");
  const root=$("books");root.replaceChildren();
  if(!Array.isArray(data.books)||!data.books.length){
    root.append(byId("p","暂无草稿或已发布书籍。请先到内容编辑后台导入原创草稿。","hint"));
    clearActions();return;
  }
  for(const book of data.books){
    const card=byId("div",undefined,"book-entry");
    card.append(byId("strong",book.title));
    card.append(byId("p",book.category_id+" · "+book.chapter_count+"章 · "+
      (book.status==="published"?"已发布":"草稿未发布")));
    const select=byId("button","选择这本书",book.status==="published"?"":"secondary");
    select.type="button";select.addEventListener("click",()=>openBook(book));
    card.append(select);root.append(card);
  }
  if(keepId&&data.books.some(x=>x.id===keepId)){
    await openBook(data.books.find(x=>x.id===keepId));
  }else if(!chosen){
    await openBook(data.books[0]);
  }else{
    chosen=null;clearActions();$("selected").textContent="请选择一本书";
  }
}
async function openBook(book){
  chosen=book;clearActions();
  $("selected").textContent="《"+book.title+"》";
  $("bookSummary").textContent=book.category_id+" · "+book.chapter_count+"章 · "+
    (book.status==="published"?"已发布":"未发布");
  const path="/api/ops/books/"+encodeURIComponent(book.id);
  if(book.status==="draft"){
    const result=await api(path+"/readiness");
    if(chosen?.id!==book.id)return;
    readiness=result;$("draftActions").hidden=false;
    const entries=[
      "自动技术检查："+(result.technicalCheckPassed?"通过":"未通过"),
      "章节："+result.metrics.chapters+"；目标词："+result.metrics.distinctWords,
      "当前人工审核："+(result.approval?.current?"有效":"未批准／版本已变化"),
      "是否测试内容："+(result.sampleBlocked?"是，禁止上架":"否"),
      "发布能力："+(result.publishAvailable?"已开启":"当前关闭或未满足条件")
    ];
    for(const b of result.blockers||[])entries.push("必须修复："+b.message);
    for(const w of (result.warnings||[]).slice(0,8))entries.push("需复核："+w.message);
    $("report").textContent=entries.join("\n");
  }else{
    const result=await api(path+"/withdraw-readiness");
    if(chosen?.id!==book.id)return;
    readiness=result;$("liveActions").hidden=false;
    $("withdrawSummary").textContent="总章节："+result.chapters+" · 已发布："+result.publishedChapters+
      "\n该分类当前有效授权数："+result.activeCategoryGrants+
      "\n下架权限："+(result.canWithdraw?"已启用":"尚未启用")+
      "\n"+(result.effects||[]).join("\n");
  }
  await loadAudit(book.id);syncButtons();
}
async function loadAudit(bookId){
  const data=await api("/api/ops/books/"+encodeURIComponent(bookId)+"/audit");
  if(chosen?.id!==bookId)return;
  const root=$("audit");root.replaceChildren();
  if(!data.events?.length){root.append(byId("p","暂无操作记录。","soft"));return;}
  for(const e of data.events){
    const item=byId("div",undefined,"audit-entry");
    item.append(byId("strong",e.event_type));
    item.append(byId("small",e.created_at+" · 操作员 "+e.actor_id+" · 请求 "+e.request_id));
    if(e.reason_note)item.append(byId("p","原因："+e.reason_note,"hint"));
    root.append(item);
  }
}
function requestId(){return crypto.randomUUID();}
async function doApprove(){
  if(!chosen||chosen.status!=="draft"||!readiness)return;
  const checks=[...$("checks").querySelectorAll("input")];
  if(!checks.every(x=>x.checked))throw Error("请完成真实的人工复核。");
  const data=await api("/api/ops/books/"+encodeURIComponent(chosen.id)+"/approve","POST",{
    expectedFingerprint:readiness.contentFingerprint,checks:checks.map(x=>x.value),
    note:$("reviewNote").value.trim(),requestId:requestId()
  });
  status("已保存本版内容审核。尚未上架。审批 ID："+data.approvalId);
  await openBook(chosen);
}
async function doPublish(){
  if(!chosen||!readiness?.approval?.current||$("publishTitle").value!==chosen.title)
    throw Error("请先完成当前版本审核，并再次准确填写书名。");
  if(!window.confirm("确认上架《"+chosen.title+"》？免费章节将公开，付费章节仍需要分类授权。"))return;
  const result=await api("/api/ops/books/"+encodeURIComponent(chosen.id)+"/publish","POST",{
    approvalId:readiness.approval.id,expectedFingerprint:readiness.contentFingerprint,
    confirmTitle:$("publishTitle").value,requestId:requestId()
  });
  status("上架成功："+result.bookId+"。请检查读者端免费试读和付费权限。");
  await loadBooks(chosen.id);
}
async function doWithdraw(){
  if(!chosen||chosen.status!=="published"||!readiness?.canWithdraw||
    $("withdrawTitle").value!==chosen.title||!$("withdrawConfirm").checked)
    throw Error("请完整确认下架影响。");
  if(!window.confirm("确认下架《"+chosen.title+"》？所有章节将立即无法访问，已购权益仍会保留。"))return;
  const result=await api("/api/ops/books/"+encodeURIComponent(chosen.id)+"/withdraw","POST",{
    confirmTitle:$("withdrawTitle").value,reason:$("withdrawReason").value.trim(),
    confirmAction:"WITHDRAW_PUBLIC_ACCESS",requestId:requestId()
  });
  status("已撤回公开访问。"+(result.supportActionRequired?"该分类存在有效权益，请依售后政策处理已购用户。":""));
  await loadBooks(chosen.id);
}
let pendingNovel=null;
const uploadMsg=message=>{$("uploadStatus").textContent=message;};
function resetNovel(){
 pendingNovel=null;$("importNovel").disabled=true;
 $("uploadReport").hidden=true;
}
function uploadedTitle(name){
 return name.replace(/\.(json|md|markdown|txt)$/i,"").replace(/[_-]+/g," ").trim();
}
async function readFile(inputId){
 const file=$(inputId).files?.[0];
 if(!file)return null;
 if(file.size>2_000_000)throw Error("文件超过2MB，请拆分章节或者压缩内容。");
 return await file.text();
}
function localReport(pkg,external){
 const chapters=pkg.chapters?.length||0;
 const words=pkg.words?.length||0;
 const anchors=(pkg.chapters||[]).reduce((n,c)=>n+(c.paragraphs||[]).reduce(
  (p,par)=>p+(par.segments||[]).filter(s=>s.wordId).length,0),0);
 const metadata=(pkg.words||[]).filter(w=>!w.phoneticUk||!w.phoneticUs||
  !w.partOfSpeech||!w.exampleEn||!w.exampleZh);
 const warnings=external?.warnings||[];
 return {chapters,words,anchors,paid:(pkg.chapters||[]).filter(c=>!c.preview).length,
  metadataIncomplete:metadata.map(w=>w.headword),
  warnings,warningsCount:warnings.length,avgPerParagraph:external?.avgPerParagraph??null};
}
async function examineNovel(){
 if(!connected())throw Error("请先验证运营身份");
 const novel=$("uploadNovel").files?.[0];
 if(!novel)throw Error("请先选择小说文件");
 const source=await readFile("uploadNovel");
 let pkg,report;
 if(/\.json$/i.test(novel.name)){
  try{const data=JSON.parse(source);pkg=data.package??data;}
  catch{throw Error("文件不是有效JSON，请检查文件格式")}
  report=localReport(pkg,null);
 }else if(/\.(md|markdown|txt)$/i.test(novel.name)){
  const title=$("uploadBookTitle").value.trim()||uploadedTitle(novel.name);
  const bookId=$("uploadBookId").value.trim();
  const category=$("uploadCategory").value;
  const previewChapters=Number($("uploadPreviewCount").value||"0");
  const common=await api("/api/ops/lexicon?category="+encodeURIComponent(category));
  let supplement=[];
  if($("uploadWords").files?.length){
   try{
    const parsed=JSON.parse(await readFile("uploadWords"));
    supplement=Array.isArray(parsed)?parsed:parsed.words||[];
    if(!Array.isArray(supplement))throw Error();
   }catch{throw Error("补充词卡JSON格式不正确，应是词卡数组或含words数组的对象")}
  }
  const {parseNovelTextFile}=await import("/novel-file-parser.js");
  let result;
  try{result=parseNovelTextFile(source,{bookId,title,
   category,previewChapters,description:$("uploadBookDescription").value.trim(),
   words:[...(common.words||[]),...supplement]});}
  catch(e){
   if(e.details?.length)throw Error("有"+e.details.length+"个显式标记词没有对应词卡，例如："+e.details.slice(0,8).map(x=>x.word).join("、"));
   throw e;
  }
  pkg=result.package;report=localReport(pkg,result.report);
 }else throw Error("当前支持JSON、Markdown(.md)和TXT文件");
 if(pkg?.version!==1||!pkg.book?.id||!Array.isArray(pkg.chapters)||
  !pkg.chapters.length||!Array.isArray(pkg.words)||!pkg.words.length)
  throw Error("小说文件缺少书籍、章节或目标词卡，无法导入");
 if(report.anchors===0)throw Error("没有可点击的英文词汇标注，请检查词库匹配");
 if(JSON.stringify(pkg).length>1_500_000)throw Error("内容包过大，请缩短单次上传文件");
 if(report.metadataIncomplete.length)uploadMsg("预检发现"+report.metadataIncomplete.length+"个词卡缺少音标/例句。可以导入草稿，但必须补齐后才能正式上架。");
 else uploadMsg("文件识别成功。预览报告如下，确认后点击“导入为新草稿”。");
 pendingNovel=pkg;$("importNovel").disabled=false;
 const lines=[
  "书籍："+pkg.book.title+"（"+pkg.book.category+"）",
  "章节："+report.chapters+"；付费章节："+report.paid,
  "词卡："+report.words+"；正文标注："+report.anchors,
  "缺少词卡信息："+report.metadataIncomplete.length,
  "待复核识别提示："+report.warningsCount
 ];
 if(report.avgPerParagraph!=null)lines.push("平均每段英语词："+report.avgPerParagraph);
 if(report.metadataIncomplete.length)lines.push("缺失信息词："+report.metadataIncomplete.slice(0,20).join("、"));
 if(report.warningsCount)lines.push("示例提示："+report.warnings.slice(0,12).map(x=>
  "第"+x.chapter+"章"+x.paragraph+"段 "+x.kind+" "+(x.word||"")).join("；"));
 $("uploadReport").hidden=false;$("uploadReport").textContent=lines.join("\n");
}
$("uploadNovel").addEventListener("change",()=>{
 resetNovel();const file=$("uploadNovel").files?.[0];
 if(file&&!$("uploadBookTitle").value)$("uploadBookTitle").value=uploadedTitle(file.name);
 if(file&&!$("uploadBookId").value)$("uploadBookId").value="story-"+crypto.randomUUID().slice(0,12);
 syncButtons();
});
["uploadWords","uploadBookTitle","uploadBookId","uploadCategory",
 "uploadPreviewCount","uploadBookDescription"].forEach(id=>{
  $(id).addEventListener("change",resetNovel);
});
button("checkNovel",async()=>{
 resetNovel();await examineNovel();
});
button("importNovel",async()=>{
 if(!pendingNovel)throw Error("请先点击文件检查");
 const result=await api("/api/ops/import","POST",{package:pendingNovel});
 uploadMsg("草稿导入成功：《"+result.title+"》，"+result.chapters+"章、"+
  result.wordCards+"词卡。未发布；请在书籍目录中完成审核和上架。");
 resetNovel();await loadBooks(result.bookId);
});

button("connect",verify);button("refresh",()=>loadBooks());button("approve",doApprove);
button("publish",doPublish);button("withdraw",doWithdraw);
button("disconnect",async()=>{
  key="";identity=null;chosen=null;clearActions();$("opsKey").value="";
  $("operatorIdentity").textContent="未登录";$("books").replaceChildren(byId("p","已清除密钥。","soft"));
  $("audit").replaceChildren(byId("p","请先验证身份。","soft"));
  $("selected").textContent="请选择一本书";status("本页内存中的运营密钥已清除。");
});
window.addEventListener("pagehide",()=>{key="";identity=null;});
syncButtons();
})();