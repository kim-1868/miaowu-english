(()=>{
"use strict";
// Never persist the operator credential in localStorage, sessionStorage, URL,
// browser cookies, analytics or console logs. Page memory only, cleared on exit.
const $=id=>document.getElementById(id);
let key="",chosen=null,readiness=null,identity=null,busy=false;
let liveEditorState=null,liveRevision=null,liveHistory=[];
let globalMatchDecisions=[],globalManifestPreview=null,globalSavedManifestRequestId=null;
let dictionaryV2Source=null,dictionaryV2Decisions=[],dictionaryV2ModeConverted=false;
let customerAdmin=null,claimAdmin=null,updatesAdmin=null;
const byId=(tag,text,className)=>{
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=String(text);
  if(className)el.className=className;
  return el;
};
function status(msg){$("status").textContent=msg;}
function clearActions(){
  resetLiveEditor();
  readiness=null;$("draftActions").hidden=true;$("liveActions").hidden=true;
  $("publish").disabled=true;$("withdraw").disabled=true;
  $("report").textContent="";$("withdrawSummary").textContent="";
  $("withdrawTitle").value="";$("withdrawReason").value="";$("withdrawConfirm").checked=false;
  $("withdrawHelp").textContent="选择已发布小说后，填写原因并确认即可下架。";
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
    if(result.status===401){
      key="";identity=null;catalogBooks=[];catalogPage=1;chosen=null;
      $("operatorIdentity").textContent="身份已失效";
      clearActions();renderBookDirectory();customerAdmin?.reset();claimAdmin?.reset();updatesAdmin?.reset();
    }
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
  syncSaleButtons();syncLiveEditorButtons();
  $("checkNovel").disabled=!connected()||!$("uploadNovel").files?.length;
  // A1 preview is only exposed to verified staging publishers.
  const matchButton=$("previewGlobalMatch");
  if(matchButton){
    matchButton.hidden=identity?.environment!=="staging";
    matchButton.disabled=!connected()||!pendingNovel||identity?.environment!=="staging";
  }
  const saveBindings=$("stageGlobalBindings");
  if(saveBindings){
    saveBindings.hidden=identity?.environment!=="staging"||
      !globalManifestPreview?.save_available;
    saveBindings.disabled=!connected()||!pendingNovel||
      !globalManifestPreview?.ready_to_stage;
  }
  const downloadBindings=$("downloadGlobalBindingBundle");
  if(downloadBindings){
    downloadBindings.hidden=identity?.environment!=="staging"||
      !globalSavedManifestRequestId;
    downloadBindings.disabled=!connected()||!pendingNovel||
      !globalSavedManifestRequestId||!globalManifestPreview?.ready_to_stage;
  }
  $("importNovel").disabled=!(connected()&&pendingNovel&&$("uploadCoverWithNovel").files?.length&&
    pendingNovel.words?.every(w=>w.phoneticUk&&w.phoneticUs&&w.partOfSpeech&&w.meaningZh&&w.exampleEn&&w.exampleZh));
  if(dictionaryV2ModeConverted&&(!globalSavedManifestRequestId||
     !globalManifestPreview?.ready_to_stage||
     !globalManifestPreview?.attach_available))
    $("importNovel").disabled=true;
  $("importNovel").textContent=dictionaryV2ModeConverted?
    (globalSavedManifestRequestId&&globalManifestPreview?.attach_available?
       "上传并关联统一词典（仅保存草稿）":"先完成词典审核并保存关联候选"):
    (identity?.environment==="staging"&&globalSavedManifestRequestId?
      "上传并关联统一词典（仅保存草稿）":"确认上传并上架");
  $("tagSave").disabled=!connected()||!chosen||!$("tagText").value.trim();
  $("applyStoryTags").disabled=!connected()||catalogBooks.length===0;
  $("suggestTags").disabled=!connected()||!chosen;
  $("saveSuggestedTags").disabled=!connected()||!chosen||suggestionBookId!==chosen.id||!$("suggestedTags").querySelector("input");
  $("useSelectedDraft").disabled=!connected()||chosen?.status!=="draft";
  $("reviseNovel").disabled=!(connected()&&pendingNovel&&chosen?.status==="draft"&&
    pendingNovel.book?.id===chosen.id&&pendingNovel.book?.title===chosen.title&&
    readiness?.contentFingerprint);
  $("refresh").disabled=!connected();
  $("saveSelectedCover").disabled=!connected()||!chosen||!$("selectedCoverFile").files?.length;
  syncCategoryCreateButton();
  if(!readiness){$("publish").disabled=true;$("withdraw").disabled=true;return}
  if(chosen?.status==="draft"){
    $("publish").disabled=!(readiness.quickPublishAvailable&&readiness.contentFingerprint);
  }else{
    const enabled=connected()&&Boolean(readiness.canWithdraw);
    const reasonOk=$("withdrawReason").value.trim().length>=12;
    const acknowledged=$("withdrawConfirm").checked;
    const titleMatches=$("withdrawTitle").value===chosen?.title;
    $("withdraw").disabled=!(enabled&&reasonOk&&acknowledged&&titleMatches);
    $("withdrawHelp").textContent=!enabled?
      "当前下架权限尚未启用，请联系管理员检查生产环境开关。":
      !reasonOk?"请先填写至少 12 字的下架原因及已购用户处理计划。":
      !acknowledged?"请先确认下架影响，已有购买权益和学习记录会保留。":
      "已满足下架条件。点击按钮后会再次确认，不会自动退款或删除购买权益。";
  }
}
["withdrawTitle","withdrawReason","withdrawConfirm","tagText"]
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
  try{await loadSaleCategories();}catch(e){saleStatus('发码功能暂不可用：'+e.message);}
  try{await mountCustomerAdmin();}catch(e){$("customerResult").textContent="查询暂不可用："+e.message;}
  try{await mountClaimAdmin();}catch(e){$("claimsStatus").textContent="对账功能暂不可用："+e.message;}
  if($("updatesAdminForm")){
    try{await mountUpdatesAdmin();}catch(e){
      $("updatesAdminStatus").textContent="公告管理未启用或无法连接："+e.message+"。请先确认独立公告表与正式站启用开关。";
    }
  }
}
async function mountUpdatesAdmin(){
  if(!updatesAdmin){
    const mod=await import("/ops-updates.js?v=20261108-wave1");
    updatesAdmin=mod.initUpdatesAdmin({api,connected});
  }
  await updatesAdmin.refresh();
}
async function mountClaimAdmin(){
  if(!claimAdmin){
    const mod=await import("/ops-claims.js?v=20261106-v42-compact");
    claimAdmin=mod.initClaimsAdmin({api,connected});
  }
  await claimAdmin.refresh();
}
async function mountCustomerAdmin(){
  if(!customerAdmin){
    const module=await import("/ops-customers.js?v=20261106-v42-compact");
    customerAdmin=module.initCustomerAdmin({api,connected,onChanged:()=>claimAdmin?.refresh()});
  }
  customerAdmin.categories(categoryCatalog);
  await customerAdmin.refresh();
}
// The catalog is kept in page memory only. Filters never alter D1 data or
// the current publishing selection; page-size is capped to avoid long lists.
let catalogBooks=[],catalogPage=1;
const DIRECTORY_PAGE_SIZE=6;
function updateBookCategoryOptions(){
  const menu=$("bookCategory"),previous=menu.value;
  const categories=[...new Set(catalogBooks.map(x=>String(x.category_id||"")).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"zh-CN"));
  menu.replaceChildren(new Option("全部分类",""));
  for(const id of categories)menu.add(new Option(id.toUpperCase(),id));
  menu.value=categories.includes(previous)?previous:"";
}
function filterCatalogBooks(books,query,category,state){
  const normalized=String(query||"").trim().toLocaleLowerCase();
  return books.filter(book=>
    (!normalized||String(book.title||"").toLocaleLowerCase().includes(normalized))&&
    (!category||book.category_id===category)&&
    (!state||book.status===state));
}
function renderBookDirectory(){
  const root=$("books");root.replaceChildren();
  const active=connected();
  const query=$("bookSearch").value.trim();
  const category=$("bookCategory").value;
  const state=$("bookStatus").value;
  for(const id of ["bookSearch","bookCategory","bookStatus"])$(id).disabled=!active;
  const filtered=active?filterCatalogBooks(catalogBooks,query,category,state):[];
  const totalPages=filtered.length?Math.ceil(filtered.length/DIRECTORY_PAGE_SIZE):0;
  catalogPage=Math.min(Math.max(1,catalogPage),Math.max(1,totalPages));
  const first=(catalogPage-1)*DIRECTORY_PAGE_SIZE;
  $("bookDirectorySummary").textContent=!active?"验证运营身份后查看书籍":
    "共 "+catalogBooks.length+" 本 · 符合筛选 "+filtered.length+" 本";
  $("bookPageInfo").textContent="第 "+(totalPages?catalogPage:0)+" / "+totalPages+" 页";
  $("bookPagePrev").disabled=!active||catalogPage<=1;
  $("bookPageNext").disabled=!active||catalogPage>=totalPages;
  $("bookClearFilters").disabled=!active||(!query&&!category&&!state);
  if(!filtered.length){
    root.append(byId("p",!active?"请先验证运营身份。":
      !catalogBooks.length?"暂无草稿或已发布书籍。请先导入原创草稿。":
      "没有找到符合条件的小说，可清空筛选重新查看。","ops-book-empty"));
    return;
  }
  for(const book of filtered.slice(first,first+DIRECTORY_PAGE_SIZE)){
    const selected=book.id===chosen?.id;
    const card=byId("div",undefined,"book-entry"+(selected?" is-selected":""));
    const details=byId("div",undefined,"ops-book-entry-copy");
    details.append(byId("strong",book.title));
    details.append(byId("p",book.category_id+" · "+book.chapter_count+" 章 · "+
      (book.status==="published"?"已发布":"草稿未发布")));
    card.append(details);
    const select=byId("button",selected?"当前书籍":"选择",selected?"secondary is-current":"secondary");
    select.type="button";
    select.setAttribute("aria-pressed",String(selected));
    select.setAttribute("aria-label",(selected?"当前选中《":"选择《")+book.title+"》");
    select.addEventListener("click",()=>{if(!selected)void openBook(book).catch(e=>status(e.message||"加载书籍失败"));});
    card.append(select);
    root.append(card);
  }
}
async function loadBooks(keepId=chosen?.id){
  if(!connected())return;
  const data=await api("/api/ops/books");
  catalogBooks=Array.isArray(data.books)?data.books.filter(x=>x&&x.id&&x.title):[];
  updateBookCategoryOptions();
  if(!catalogBooks.length){
    chosen=null;clearActions();$("selected").textContent="请选择一本书";
    $("bookSummary").textContent="";$("audit").replaceChildren();
    renderBookDirectory();return;
  }
  // Keep a legitimate selection after refresh. The visible page stays filtered.
  const next=catalogBooks.find(x=>x.id===keepId)||
    (!chosen?catalogBooks[0]:null);
  if(next){
    await openBook(next);
  }else{
    chosen=null;clearActions();$("selected").textContent="请选择一本书";
    $("bookSummary").textContent="";
  }
  renderBookDirectory();
}
async function openBook(book){
  chosen=book;renderBookDirectory();clearActions();
  suggestionBookId=null;$("suggestedTags").replaceChildren();
  $("suggestTagsStatus").textContent="可为当前书籍生成新的剧情标签建议。";
  $("selectedCoverFile").value="";
  void loadCurrentCover(book);
  void loadCoverTags(book);
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
      "封面："+(result.coverReady?"已上传":"请先上传对应封面"),
      "是否测试内容："+(result.sampleBlocked?"是，禁止上架":"否"),
      "一键发布："+(result.quickPublishAvailable?"可以确认上架":"当前未满足发布条件")
    ];
    for(const b of result.blockers||[])entries.push("必须修复："+b.message);
    for(const w of (result.warnings||[]).slice(0,8))entries.push("需复核："+w.message);
    $("report").textContent=entries.join("\n");
  }else{
    const result=await api(path+"/withdraw-readiness");
    if(chosen?.id!==book.id)return;
    readiness=result;$("liveActions").hidden=false;
    // The backend still requires an exact title match, but the operator
    // no longer has to type it again; the selected book is the source.
    $("withdrawTitle").value=book.title;
    $("withdrawSummary").textContent="总章节："+result.chapters+" · 已发布："+result.publishedChapters+
      "\n该分类当前有效授权数："+result.activeCategoryGrants+
      "\n下架权限："+(result.canWithdraw?"已启用":"尚未启用")+
      "\n"+(result.effects||[]).join("\n");
  }
  await loadAudit(book.id);
  if(book.status==="published")await loadLiveEditor(book);
  syncButtons();
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
async function quickPublishBook(bookId,snapshot){
  if(!snapshot?.quickPublishAvailable)throw Error("当前草稿仍存在阻止上架的项目，请查看预检报告");
  return api("/api/ops/books/"+encodeURIComponent(bookId)+"/publish-reviewed","POST",{
    expectedFingerprint:snapshot.contentFingerprint,bookId,
    confirmed:true,requestId:requestId()
  });
}
async function doPublish(){
  if(!chosen||chosen.status!=="draft"||!readiness?.quickPublishAvailable)
    throw Error("请先完成预检并上传封面");
  const id=chosen.id;
  const result=await quickPublishBook(id,readiness);
  status("《"+chosen.title+"》上架成功；"+(result.alreadyApplied?"本次为重试确认。":"现在可以在前台书架查看。"));
  await loadBooks(id);
}
async function doWithdraw(){
  if(!chosen||chosen.status!=="published"||!readiness?.canWithdraw||
    $("withdrawTitle").value!==chosen.title||!$("withdrawConfirm").checked||
    $("withdrawReason").value.trim().length<12)
    throw Error("请先填写至少12字的下架原因并确认下架影响。");
  if(!window.confirm("确定下架《"+chosen.title+"》？\n公开书架和全部章节将立即停止访问。\n已有购买权益与学习记录仍会保留，请按售后承诺处理。"))return;
  const result=await api("/api/ops/books/"+encodeURIComponent(chosen.id)+"/withdraw","POST",{
    confirmTitle:$("withdrawTitle").value,reason:$("withdrawReason").value.trim(),
    confirmAction:"WITHDRAW_PUBLIC_ACCESS",requestId:requestId()
  });
  status("已撤回公开访问。"+(result.supportActionRequired?"该分类存在有效权益，请依售后政策处理已购用户。":""));
  await loadBooks(chosen.id);
}
// Published-book editor: all changes require the existing publisher-only
// credential and a fresh content version. Never store novel text in storage.
function resetLiveEditor(){
  liveEditorState=null;liveRevision=null;liveHistory=[];
  $("liveEditorControls").hidden=true;
  $("liveEditorStatus").textContent="先在④书籍目录中选择一部已发布小说。";
  $("liveRevisionDiff").hidden=true;
  $("liveRevisionSample").hidden=true;
  $("liveRevisionFile").value="";
  $("liveHistory").replaceChildren(byId("p","尚未有修改记录。","soft"));
}
function syncLiveEditorButtons(){
  const active=connected()&&chosen?.status==="published"&&
    liveEditorState?.bookId===chosen?.id&&liveEditorState.editable;
  $("liveDownloadSource").disabled=!active||busy;
  $("cet4ExportBatch").disabled=!connected()||busy||
    !["staging","production"].includes(identity?.environment)||
    !catalogBooks.some(b=>b.category_id==="cet4"&&b.status==="published");
  $("cet6ExportBatch").disabled=!connected()||busy||
    !["staging","production"].includes(identity?.environment)||
    !catalogBooks.some(b=>b.category_id==="cet6"&&b.status==="published");
  $("liveEditTitle").disabled=!active||busy;
  $("liveEditDescription").disabled=!active||busy;
  $("liveRevisionFile").disabled=!active||busy;
  $("liveRefreshHistory").disabled=!active||busy;
  $("liveSaveMetadata").disabled=!active||busy||
    (!$("liveEditTitle").value.trim()||
     ($("liveEditTitle").value.trim()===liveEditorState?.book.title&&
      $("liveEditDescription").value===liveEditorState?.book.description));
  $("liveCheckRevision").disabled=!active||busy||!$("liveRevisionFile").files?.length;
  $("livePublishRevision").disabled=!active||busy||!liveRevision||
    liveRevision.bookId!==chosen?.id||liveRevision.version!==liveEditorState.version;
}
async function refreshLiveHistory(bookId){
  const result=await api("/api/ops/books/"+encodeURIComponent(bookId)+"/live-editor/history");
  if(chosen?.id!==bookId||liveEditorState?.bookId!==bookId)return;
  liveHistory=result.versions||[];
  renderLiveHistory();
}
function renderLiveHistory(){
  const root=$("liveHistory");root.replaceChildren();
  if(!liveHistory.length){
    root.append(byId("p","暂无历史版本；第一次保存修改后会生成旧版备份。","soft"));return;
  }
  for(const item of liveHistory){
    const entry=byId("div",undefined,"ops-live-history-entry");
    const details=byId("div",undefined,"ops-live-history-text");
    const actions={content:"正文修订",metadata:"资料修改",restore:"恢复操作"};
    details.append(byId("strong",actions[item.action]||"版本变更"));
    details.append(byId("small",item.createdAt+" · 原内容版本 "+item.baseVersion));
    const summary=item.summary||{};
    const description=summary.changedChapters?
      summary.changedChapters.slice(0,5).map(ch=>"第"+ch.number+"章 "+ch.kind).join("、"):
      summary.oldTitle?"原标题："+summary.oldTitle:
      summary.restoredFrom?"恢复前的内容快照":"";
    if(description)details.append(byId("p",description,"soft"));
    const restore=byId("button","恢复到此版本","secondary");
    restore.type="button";
    restore.disabled=!connected()||!liveEditorState?.editable;
    restore.addEventListener("click",async()=>{
      if(busy||!chosen||!liveEditorState)return;
      const id=chosen.id,title=chosen.title,version=liveEditorState.version;
      if(!window.confirm("确认将《"+title+"》恢复至这个历史版本？\n恢复前会自动保存当前内容作为一个新版本。"+
        "\n若涉及已被读者阅读的新增章节，系统将拒绝删除以保护进度。"))return;
      busy=true;restore.disabled=true;syncLiveEditorButtons();
      try{
        const result=await api("/api/ops/books/"+encodeURIComponent(id)+
          "/live-editor/restore","POST",{
            historyId:item.id,expectedVersion:version,
            confirmRestore:true,requestId:requestId()
          });
        await loadBooks(id);
        $("liveEditorStatus").textContent="已恢复历史版本，当前版本也已自动保存。"+
          "读者重新进入该书即可看到恢复后的正文。";
        status("《"+title+"》历史版本恢复成功。");
      }catch(e){
        $("liveEditorStatus").textContent="恢复未执行："+e.message;
      }finally{busy=false;syncButtons();}
    });
    entry.append(details,restore);root.append(entry);
  }
}
async function loadLiveEditor(book){
  if(book.status!=="published")return;
  const id=book.id;
  $("liveEditorStatus").textContent="正在读取已上架版本……";
  try{
    const data=await api("/api/ops/books/"+encodeURIComponent(id)+"/live-editor");
    if(chosen?.id!==id)return;
    liveEditorState={...data,bookId:id};
    $("liveEditorControls").hidden=false;
    $("liveEditorBook").textContent="《"+data.book.title+"》";
    $("liveEditorVersion").textContent="内容版本 "+data.version+" · "+data.chapterCount+" 章";
    $("liveEditTitle").value=data.book.title;
    $("liveEditDescription").value=data.book.description||"";
    $("liveEditorStatus").textContent=data.editable?
      "可编辑已发布小说：资料修改直接保存；正文替换需先预览差异。":
      "当前运营身份可以查看书籍，但尚未开放发布修订权限。";
    await refreshLiveHistory(id);
  }catch(e){
    if(chosen?.id===id){
      liveEditorState=null;
      $("liveEditorControls").hidden=true;
      $("liveEditorStatus").textContent=e.message.includes("LIVE_EDIT_SCHEMA_REQUIRED")?
        "在线版本功能尚未初始化，需先完成数据库安全迁移。":
        "无法读取版本管理："+e.message;
    }
  }
  syncLiveEditorButtons();
}
function renderLiveRevisionSample(pkg){
  const root=$("liveRevisionSample");root.replaceChildren();
  root.append(byId("strong","新版本前两章内容抽样预览"));
  for(const ch of (pkg.chapters||[]).slice(0,2)){
    root.append(byId("h4","第"+ch.number+"章 · "+ch.title));
    for(const para of (ch.paragraphs||[]).slice(0,3)){
      const line=byId("p");
      for(const seg of para.segments||[]){
        if(seg.wordId){
          const w=byId("span",seg.surface,"ops-live-word");
          w.title=seg.gloss||seg.wordId;
          line.append(w);
        }else line.append(document.createTextNode(seg.text||""));
      }
      root.append(line);
    }
  }
  root.hidden=false;
}
function liveRevisionSummary(data){
  const diff=data.diff||{};
  const changed=diff.changedChapters||[];
  return [
    "当前书籍版本："+data.expectedVersion,
    "修订章节："+changed.filter(x=>x.kind==="revised").length+" 章",
    "新增章节："+diff.addedChapters+" 章",
    "新增词卡："+diff.newWords+" 个",
    "新版本总章数："+diff.totalChapters+" 章",
    "英文词汇标注："+diff.studyAnchors+" 处",
    "书名或简介变更："+(diff.metadataChanged?"是":"否"),
    changed.length?"变更清单："+changed.slice(0,25).map(x=>"第"+x.number+"章「"+x.title+"」("+x.kind+")").join("；"):"没有章节内容变更",
    ...changed.slice(0,8).flatMap(x=>[
      "【第"+x.number+"章 · 原文节选】"+(x.beforeExcerpt||"新增章节"),
      "【第"+x.number+"章 · 修订节选】"+(x.afterExcerpt||"无")
    ]),
    ...(data.warnings||[])
  ].join("\n");
}
$("liveEditTitle").addEventListener("input",syncLiveEditorButtons);
$("liveEditDescription").addEventListener("input",syncLiveEditorButtons);
$("liveRevisionFile").addEventListener("change",()=>{
  liveRevision=null;
  $("liveRevisionDiff").hidden=true;$("liveRevisionSample").hidden=true;
  $("liveEditorStatus").textContent=$("liveRevisionFile").files?.length?
    "文件已选择，请先点击「预览新旧内容差异」。":
    "已清除修订稿。";
  syncLiveEditorButtons();
});
button("liveSaveMetadata",async()=>{
  if(!liveEditorState||!chosen||chosen.id!==liveEditorState.bookId)
    throw Error("先从目录选择已发布小说。");
  const id=chosen.id,version=liveEditorState.version;
  const result=await api("/api/ops/books/"+encodeURIComponent(id)+
    "/live-editor/metadata","POST",{
      title:$("liveEditTitle").value.trim(),
      description:$("liveEditDescription").value,
      expectedVersion:version,requestId:requestId()
    });
  await loadBooks(id);
  $("liveEditorStatus").textContent="书名和简介已更新，旧版已保存到历史记录。";
  status("书籍资料修改成功。");
});
button("cet6ExportBatch",async()=>{
 if(!connected()||!["production","staging"].includes(identity?.environment))
   throw Error("请先验证运营发布者身份。");
 if(!window.confirm("确认只读导出已上架六级小说的当前正文和词卡？内容可能涉及付费作品，仅保存在本地安全目录，不上传公共仓库或聊天。"))return;
 const progress=$("cet6ExportStatus");
 progress.textContent="正在读取六级已上架书籍并逐本校验版本……";
 const {collectPublishedExamBatch}=await import("/ops-cet4-export.js?v=20261110-cet6");
 try{
  const data=await collectPublishedExamBatch({
   category:"cet6",catalog:catalogBooks,
   fetchExport:id=>api("/api/ops/books/"+encodeURIComponent(id)+"/live-editor/export"),
   fetchOverview:id=>api("/api/ops/books/"+encodeURIComponent(id)+"/live-editor"),
   refreshCatalog:async()=>{const fresh=await api("/api/ops/books");return fresh.books;},
   onProgress:p=>{progress.textContent="只读导出六级 "+p.done+"/"+p.total+
     (p.title?" · "+p.title:" · 完整性校验已完成");}
  });
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],
    {type:"application/json;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;link.download="miaowu-cet6-live-batch-"+data.capturedAt.slice(0,10)+".json";
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  progress.textContent="已本地导出 "+data.bookCount+" 本六级小说。无用户数据；请安全保管并在离线环境审核。";
 }catch(e){
  progress.textContent="已中止导出，不提供不完整的六级文件："+String(e.message||e);
  throw e;
 }
});
button("cet4ExportBatch",async()=>{
 if(!connected()||!["production","staging"].includes(identity?.environment))
   throw Error("请先验证运营发布者身份。");
 if(!window.confirm("确认只读下载四级已上架小说的正文和词卡？导出文件含付费小说内容，请只在本机保存，不上传公共仓库、聊天或网盘。"))return;
 const progress=$("cet4ExportStatus");
 progress.textContent="正在核对四级书架与内容版本……";
 const {collectPublishedCET4Batch}=await import("/ops-cet4-export.js?v=20261110-batch1");
 try{
  const result=await collectPublishedCET4Batch({
   catalog:catalogBooks,
   fetchExport:id=>api("/api/ops/books/"+encodeURIComponent(id)+"/live-editor/export"),
   fetchOverview:id=>api("/api/ops/books/"+encodeURIComponent(id)+"/live-editor"),
   refreshCatalog:async()=>{const current=await api("/api/ops/books");return current.books;},
   onProgress:s=>{progress.textContent="只读导出 "+s.done+"/"+s.total+(s.title?" · "+s.title:" · 正在验证完整性");}
  });
  const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],
   {type:"application/json;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;link.download="miaowu-cet4-live-batch-"+result.capturedAt.slice(0,10)+".json";
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  progress.textContent="已导出 "+result.bookCount+" 本。每本含原版 ID、版本、章节数和 SHA-256；请私下保存。";
 }catch(e){
  progress.textContent="导出中止，未生成不完整的审核文件："+String(e.message||e);
  throw e;
 }
});
button("liveDownloadSource",async()=>{
  if(!liveEditorState||!chosen)throw Error("请先选择已上架小说");
  const id=chosen.id;
  const data=await api("/api/ops/books/"+encodeURIComponent(id)+"/live-editor/export");
  const blob=new Blob([JSON.stringify(data.package,null,2)],{type:"application/json;charset=utf-8"});
  const link=document.createElement("a");
  const url=URL.createObjectURL(blob);
  link.href=url;link.download=id+"-revision-v"+data.version+".json";
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
  $("liveEditorStatus").textContent="已导出当前内容包。可修改正文并保留原有章节/词汇编号后重新上传。";
});
button("liveCheckRevision",async()=>{
  if(!chosen||!liveEditorState||chosen.id!==liveEditorState.bookId)
    throw Error("请先选择已上架小说");
  const file=$("liveRevisionFile").files?.[0];
  if(!file)throw Error("请选择新版 JSON 文件。");
  if(file.size>1_800_000)throw Error("修订稿超过1.8MB，请分批修改或联系管理员。");
  let data;
  try{data=JSON.parse(await file.text())}catch{throw Error("修订稿不是有效的 JSON 文件")}
  const pkg=data?.package??data;
  if(pkg?.book?.id!==chosen.id)throw Error("小说内部编号必须与选中书籍一致，不可创建另一部书。");
  const id=chosen.id,version=liveEditorState.version;
  const preview=await api("/api/ops/books/"+encodeURIComponent(id)+
    "/live-editor/preview","POST",{package:pkg});
  if(chosen?.id!==id||liveEditorState?.version!==version)return;
  liveRevision={bookId:id,version,digest:preview.digest,package:pkg};
  $("liveRevisionDiff").textContent=liveRevisionSummary(preview);
  $("liveRevisionDiff").hidden=false;
  renderLiveRevisionSample(pkg);
  $("liveEditorStatus").textContent="预览检查通过。确认没有误改书籍编号、章节关联和学习词汇后，可以发布新版。";
});
button("livePublishRevision",async()=>{
  if(!chosen||!liveEditorState||!liveRevision||
    liveRevision.version!==liveEditorState.version||
    liveRevision.bookId!==chosen.id)throw Error("预览已失效，请重新上传并检查。");
  const id=chosen.id,version=liveRevision.version,doc=liveRevision.package;
  if(!window.confirm("确认将《"+chosen.title+"》的已发布正文替换为刚才预览的新版本？"+
    "\n旧版会自动保存；读者阅读权益、已学单词与章节进度不会被删除。"))return;
  const result=await api("/api/ops/books/"+encodeURIComponent(id)+
    "/live-editor/publish","POST",{
      package:doc,expectedVersion:version,
      previewDigest:liveRevision.digest,requestId:requestId()
    });
  await loadBooks(id);
  $("liveEditorStatus").textContent="新版已正式生效，共"+
    result.diff.totalChapters+"章，旧版本已保存到历史记录。";
  status("《"+chosen.title+"》正文更新成功。");
});
button("liveRefreshHistory",async()=>{
  if(!chosen||!liveEditorState)throw Error("请先选择已上架小说");
  await refreshLiveHistory(chosen.id);
  $("liveEditorStatus").textContent="历史版本列表已刷新。";
});

// Upload images are browser-resized and converted to safe raster formats.
// No raw image filename or bytes are stored in cookies or persistent storage.
let coverPreviewUrl=null;
function showCoverPreview(url,statusText){
 const image=$("selectedCoverImage"),empty=$("selectedCoverEmpty");
 if(coverPreviewUrl){URL.revokeObjectURL(coverPreviewUrl);coverPreviewUrl=null}
 if(url){image.src=url;image.hidden=false;empty.hidden=true;}
 else{image.removeAttribute("src");image.hidden=true;empty.hidden=false;
  empty.textContent="尚未上传封面，可在此添加";}
 $("coverUploadStatus").textContent=statusText||"";
}
async function loadCurrentCover(book){
 if(!connected()||!book)return;
 const id=book.id;
 const fallback=id==="rainy-night-archives-cet4-v1"?"/rainy-night-cover-v2.svg":"";
 try{
  const response=await fetch("/api/ops/books/"+encodeURIComponent(id)+"/cover",{
   headers:{"X-Mw-Ops-Key":key},cache:"no-store",credentials:"same-origin"
  });
  if(chosen?.id!==id)return;
  if(!response.ok){
   showCoverPreview(fallback,"尚未上传自定义封面；可以选择图片进行替换。");
   return;
  }
  const blob=await response.blob();
  if(chosen?.id!==id)return;
  const url=URL.createObjectURL(blob);
  showCoverPreview(url,"已读取当前书籍封面，可选择新图替换。");
  coverPreviewUrl=url;
 }catch{
  if(chosen?.id===id)showCoverPreview(fallback,"封面预览暂时不可用，可以重新选择书籍或尝试上传。");
 }
}
function makeCoverBlob(file){
 return new Promise(async(resolve,reject)=>{
  if(!file||!["image/jpeg","image/png","image/webp"].includes(file.type))
   return reject(Error("只接受 JPG、PNG 或 WEBP 图片"));
  if(file.size>15_000_000||file.size<100)return reject(Error("原图片大小须在15MB以内"));
  const src=URL.createObjectURL(file);
  const image=new Image();
  image.onerror=()=>{URL.revokeObjectURL(src);reject(Error("图片无法读取或格式损坏"))};
  image.onload=async()=>{
   URL.revokeObjectURL(src);
   if(image.naturalWidth<600||image.naturalHeight<800)
    return reject(Error("图片清晰度不足，请选择至少600×800像素的原图，推荐900×1200以上"));
   try{
    const canvas=document.createElement("canvas");
    canvas.width=900;canvas.height=1200;
    const ctx=canvas.getContext("2d");
    if(!ctx)throw Error("浏览器不支持处理封面图片");
    // Center-crop to a consistent portrait cover. Never upscale tiny images.
    const scale=Math.max(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight);
    const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
    ctx.drawImage(image,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
    const toBlob=(mime,quality)=>new Promise(done=>canvas.toBlob(done,mime,quality));
    let output=null;
    for(const quality of [.84,.76,.66,.54]){
      const trial=await toBlob("image/webp",quality);
      if(trial?.type==="image/webp"&&trial.size<=768000){output=trial;break}
      const jpg=await toBlob("image/jpeg",quality);
      if(jpg?.size<=768000){output=jpg;break}
    }
    if(!output)throw Error("图片压缩后仍然太大，请换用更简洁的封面图片");
    resolve(output);
   }catch(e){reject(e)}
  };
  image.src=src;
 });
}
async function uploadCoverForBook(bookId,file){
 const raster=await makeCoverBlob(file);
 const form=new FormData();
 form.append("cover",raster,raster.type==="image/webp"?"cover.webp":"cover.jpg");
 const result=await fetch("/api/ops/books/"+encodeURIComponent(bookId)+"/cover",{
  method:"POST",headers:{"X-Mw-Ops-Key":key,"Accept":"application/json"},
  credentials:"same-origin",cache:"no-store",body:form,referrerPolicy:"same-origin"
 });
 let data;try{data=await result.json()}catch{throw Error("封面上传失败：服务器未返回有效响应")}
 if(!result.ok)throw Error("封面上传失败："+(data.error||"UNKNOWN")+
  "（HTTP "+result.status+"）；请确认生产D1已执行004封面表迁移。");
 return data;
}
$("selectedCoverFile").addEventListener("change",()=>{
 const file=$("selectedCoverFile").files?.[0];
 syncButtons();
 if(!file)return;
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)){
  $("coverUploadStatus").textContent="格式不支持，请选择 JPG、PNG、WEBP";
  return;
 }
 const url=URL.createObjectURL(file);
 showCoverPreview(url,"正在预览选中的本地图片，尚未保存到网站。");
 coverPreviewUrl=url;
});
button("saveSelectedCover",async()=>{
 if(!chosen)throw Error("请先选择一本书");
 const id=chosen.id,file=$("selectedCoverFile").files?.[0];
 if(!file)throw Error("请先选择封面图片");
 $("coverUploadStatus").textContent="正在压缩并上传封面……";
 const uploaded=await uploadCoverForBook(id,file);
 $("selectedCoverFile").value="";
 if(chosen?.id===id){
  chosen.cover_key=uploaded.coverKey;
  await loadCurrentCover(chosen);
  $("coverUploadStatus").textContent="封面已保存，书架重新打开后会展示高清图片。";
 }
});
// Curated suggestions for the 23 published books audited on 2026-11-06.
// Every write uses the authenticated publisher tag API, never a DB bypass.
const storyTagPlanV38=[
  {
    "id": "mw26-fresh-7bb98dbbe0c9",
    "title": "他认错白月光的那一年",
    "category": "cet4",
    "tags": [
      [
        "白月光",
        "#8d5262"
      ],
      [
        "女性成长",
        "#526e68"
      ]
    ]
  },
  {
    "id": "mw26-fresh-581d2b8ed258",
    "title": "假千金退场后，全家都慌了",
    "category": "cet4",
    "tags": [
      [
        "真假千金",
        "#9f753e"
      ],
      [
        "亲情",
        "#7d8a5b"
      ]
    ]
  },
  {
    "id": "postgrad-contract",
    "title": "假婚沦陷：陆总的眼底星光",
    "category": "postgrad",
    "tags": [
      [
        "契约婚姻",
        "#8d5262"
      ],
      [
        "先婚后爱",
        "#af6078"
      ]
    ]
  },
  {
    "id": "mw-cet4-heiress-reveal-20261105-v1",
    "title": "全家嫌我穷，没想到我是千亿继承人",
    "category": "cet4",
    "tags": [
      [
        "豪门",
        "#9f753e"
      ],
      [
        "打脸",
        "#a34a52"
      ]
    ]
  },
  {
    "id": "mw-cet4-actress-reversal-20261105-v1",
    "title": "全网嘲我花瓶，颁奖夜我成了影后",
    "category": "cet4",
    "tags": [
      [
        "职场逆袭",
        "#507e9a"
      ],
      [
        "打脸",
        "#a34a52"
      ]
    ]
  },
  {
    "id": "mw26-fresh-96e7f1ee233c",
    "title": "合租室友藏了七年的秘密",
    "category": "cet4",
    "tags": [
      [
        "合租日常",
        "#7d8a5b"
      ],
      [
        "暗恋",
        "#af6078"
      ]
    ]
  },
  {
    "id": "mw26-fresh-006ef86dab61",
    "title": "契约婚姻到期那天",
    "category": "cet4",
    "tags": [
      [
        "契约婚姻",
        "#8d5262"
      ],
      [
        "女性成长",
        "#526e68"
      ]
    ]
  },
  {
    "id": "mw26-fresh-140d06599cec",
    "title": "替嫁当天，我撕了婚约",
    "category": "cet4",
    "tags": [
      [
        "替嫁",
        "#9f753e"
      ],
      [
        "女主觉醒",
        "#a34a52"
      ]
    ]
  },
  {
    "id": "cet6-last-tram-reply-2026",
    "title": "末班车前请回信",
    "category": "cet6",
    "tags": [
      [
        "治愈",
        "#7d8a5b"
      ],
      [
        "秘密揭晓",
        "#455a78"
      ]
    ]
  },
  {
    "id": "mw26-fresh-6f31e202e357",
    "title": "死对头突然开始对我好",
    "category": "cet4",
    "tags": [
      [
        "死对头",
        "#455a78"
      ],
      [
        "误会",
        "#8d5262"
      ]
    ]
  },
  {
    "id": "mw-cet4-real-heir-old-street-20261105-v1",
    "title": "真少爷回家那天，我把豪门群聊退了",
    "category": "cet4",
    "tags": [
      [
        "豪门逆袭",
        "#9f753e"
      ],
      [
        "打脸",
        "#a34a52"
      ],
      [
        "爽文",
        "#9f753e"
      ]
    ]
  },
  {
    "id": "postgrad-rise",
    "title": "破光而上",
    "category": "postgrad",
    "tags": [
      [
        "职场",
        "#507e9a"
      ],
      [
        "女性成长",
        "#526e68"
      ]
    ]
  },
  {
    "id": "editorial-ex-husband-extended-8ch-v2",
    "title": "离婚后，前夫公司成了我的客户",
    "category": "cet4",
    "tags": [
      [
        "离婚",
        "#713848"
      ],
      [
        "女性成长",
        "#526e68"
      ]
    ]
  },
  {
    "id": "mw26-fresh-166e2a985823",
    "title": "穿成恶毒女配后，我不演了",
    "category": "cet4",
    "tags": [
      [
        "反套路",
        "#713848"
      ],
      [
        "女主觉醒",
        "#a34a52"
      ]
    ]
  },
  {
    "id": "postgrad-thirteenth-glass-2026",
    "title": "第十三张底片",
    "category": "postgrad",
    "tags": [
      [
        "悬疑",
        "#455a78"
      ],
      [
        "中长篇",
        "#526e68"
      ]
    ]
  },
  {
    "id": "mw-cet4-office-20261105",
    "title": "被开除当天，霸总买下了整栋楼",
    "category": "cet4",
    "tags": [
      [
        "霸总",
        "#9f753e"
      ],
      [
        "职场逆袭",
        "#507e9a"
      ]
    ]
  },
  {
    "id": "mw26-fresh-5517fc581a6e",
    "title": "被赶出豪门后我成了继承人",
    "category": "cet4",
    "tags": [
      [
        "身份反转",
        "#713848"
      ],
      [
        "女性成长",
        "#526e68"
      ]
    ]
  },
  {
    "id": "mw-cet4-marriage-sweet-20261105-v1",
    "title": "说好只领证，霸总却天天求亲亲",
    "category": "cet4",
    "tags": [
      [
        "先婚后爱",
        "#af6078"
      ],
      [
        "契约婚姻",
        "#8d5262"
      ]
    ]
  },
  {
    "id": "mw-cet4-jingquan-romance-20261105",
    "title": "退婚后，京圈太子爷非要娶我",
    "category": "cet4",
    "tags": [
      [
        "退婚",
        "#713848"
      ],
      [
        "霸总",
        "#9f753e"
      ]
    ]
  },
  {
    "id": "postgrad-tide-signal-2026",
    "title": "逆潮信号",
    "category": "postgrad",
    "tags": [
      [
        "悬疑",
        "#455a78"
      ],
      [
        "中长篇",
        "#526e68"
      ]
    ]
  },
  {
    "id": "mw26-fresh-43aa86b6b07f",
    "title": "重生后我不再讨好他们",
    "category": "cet4",
    "tags": [
      [
        "女主觉醒",
        "#a34a52"
      ],
      [
        "家庭反击",
        "#a34a52"
      ]
    ]
  },
  {
    "id": "mw-cet4-ceo-fan-20261105-v1",
    "title": "闪婚后，冷面总裁成了我的头号粉丝",
    "category": "cet4",
    "tags": [
      [
        "先婚后爱",
        "#af6078"
      ],
      [
        "霸总",
        "#9f753e"
      ]
    ]
  },
  {
    "id": "rainy-night-archives-cet4-v1",
    "title": "雨夜档案",
    "category": "cet4",
    "tags": [
      [
        "失踪谜案",
        "#455a78"
      ]
    ]
  }
];
// The curated original 23 retain their reviewed suggestions. All later books
// use conservative story-text cues instead of hardcoded IDs, without an AI API.
async function proposeTags(book,novel=null){
  const fixed=novel?null:storyTagPlanV38.find(x=>x.id===book.id&&x.title===book.title&&x.category===book.category_id);
  if(fixed)return fixed.tags.map(([label,color])=>({label,color,basis:"已审核的历史故事方案"}));
  const {suggestStoryTags}=await import("/novel-file-parser.js?v=20261106-v40");
  const input=novel||book;
  const body=novel?(novel.chapters||[]).flatMap(ch=>(ch.paragraphs||[])
    .slice(0,5).flatMap(p=>(p.segments||[]).map(s=>s.text||s.surface||""))).join("").slice(0,4500):"";
  return suggestStoryTags({
    title:input.book?.title||input.title,
    description:input.book?.description||input.description,
    chapters:novel?.chapters,
    chapter_titles:input.chapter_titles,
    body
  });
}
async function addMissingTagsToBook(book,tags,minimum=3){
  const path="/api/ops/books/"+encodeURIComponent(book.id)+"/tags";
  const existing=await api(path);
  const have=new Set((existing.tags||[]).map(x=>x.label));
  let added=0,skipped=0;
  const quota=Math.max(0,minimum-have.size);
  for(const tag of tags.slice(0,5)){
    if(have.has(tag.label)){skipped++;continue}
    if(added>=quota)break;
    await api(path,"POST",{label:tag.label,color:tag.color,requestId:requestId()});
    have.add(tag.label);added++;
  }
  return {added,skipped};
}
let suggestionBookId=null;
function renderTagSuggestChoices(book,tags){
  const root=$("suggestedTags");root.replaceChildren();
  const notice=$("suggestTagsStatus");
  const existing=new Set(coverTags.map(x=>x.label));
  const available=tags.filter(t=>!existing.has(t.label));
  suggestionBookId=book.id;
  for(const tag of available){
    const label=byId("label",undefined,"ops-suggest-label");
    const input=document.createElement("input");input.type="checkbox";input.checked=true;
    input.value=tag.label;input.dataset.tagColor=tag.color;
    const span=byId("span",tag.label+"（"+tag.basis+"）");
    label.append(input,span);root.append(label);
  }
  notice.textContent=available.length?"已生成 "+available.length+" 项建议，可取消勾选；确认后只添加缺少的标签。":
    "没有可可靠推荐的新标签；可继续从下拉列表手动选择。";
  $("saveSuggestedTags").disabled=!available.length;
}
button("suggestTags",async()=>{
  if(!connected()||!chosen)throw Error("请选择一本书并验证运营身份");
  const book=chosen;
  const result=await proposeTags(book);
  if(chosen?.id!==book.id)return;
  renderTagSuggestChoices(book,result);
});
button("saveSuggestedTags",async()=>{
  if(!chosen||chosen.id!==suggestionBookId)throw Error("请重新查看当前书籍的标签建议");
  const book=chosen;
  const tags=[...$("suggestedTags").querySelectorAll("input:checked")].map(el=>({
    label:el.value,color:el.dataset.tagColor
  }));
  if(!tags.length){$("suggestTagsStatus").textContent="未勾选任何标签，未修改书籍。";return}
  const result=await addMissingTagsToBook(book,tags,Math.max(3,coverTags.length+tags.length));
  if(chosen?.id===book.id){
    await loadCoverTags(book);
    $("suggestTagsStatus").textContent="已补充 "+result.added+" 项；已有标签及颜色均保持不变。";
  }
});
button("applyStoryTags",async()=>{
  if(!connected())throw Error("请先验证运营身份");
  const books=catalogBooks.filter(b=>b.status==="published");
  if(!books.length)throw Error("没有可补充标签的已发布小说");
  const plan=[];
  for(const book of books){
    const tags=await proposeTags(book);
    if(tags.length)plan.push({book,tags});
  }
  if(!plan.length)throw Error("目前没有足够的剧情线索生成标签建议，请先补充小说简介。");
  if(!window.confirm("将根据已审核旧书方案及当前书架简介/章节标题，为 "+plan.length+
    " 本书补齐缺少的推荐标签。已有标签、颜色及正文均不改动；未来新书也在范围内。确认执行吗？"))return;
  let added=0,finished=0,skipped=0;
  const feedback=$("bulkStoryTagsStatus");
  try{
    for(const entry of plan){
      const result=await addMissingTagsToBook(entry.book,entry.tags);
      added+=result.added;skipped+=result.skipped;finished++;
      feedback.textContent="已检查 "+finished+"/"+plan.length+" 本；已新增 "+added+" 项。";
    }
    if(chosen)await loadCoverTags(chosen);
    feedback.textContent="已检查 "+finished+" 本，新增 "+added+" 项，跳过已有 "+skipped+" 项；以后上传新书也可重复使用。";
  }catch(e){
    feedback.textContent="完成 "+finished+" 本后中断，已添加 "+added+" 项："+e.message+"。再次执行会跳过已有标签。";
    throw e;
  }
});

// Cover tags stay separate from artwork; changes update the shelf immediately.
// Keep the original options. Extra genre/plot/length labels are UI presets only:
// they are not persisted or attached to a book until an operator saves them.
const defaultTagGroups=[
  ["原有常用",[
    ["新书上架","#a34a52"],
    ["已完结","#526e68"],
    ["高能反转","#713848"],
    ["甜宠","#af6078"],
    ["悬疑","#455a78"],
    ["治愈","#7d8a5b"],
    ["热门推荐","#9f753e"],
    ["持续更新","#507e9a"]
  ]],
  ["题材类型",[
    ["豪门","#9f753e"],
    ["都市","#455a78"],
    ["职场","#507e9a"],
    ["双男主","#455a78"],
    ["重生","#713848"],
    ["穿书","#713848"],
    ["霸总","#9f753e"],
    ["豪门逆袭","#9f753e"],
    ["职场逆袭","#507e9a"],
    ["霸总甜宠","#af6078"],
    ["都市情感","#af6078"]
  ]],
  ["感情关系",[
    ["虐恋","#8d5262"],
    ["双向暗恋","#af6078"],
    ["暗恋","#af6078"],
    ["先婚后爱","#af6078"],
    ["契约婚姻","#8d5262"],
    ["追妻火葬场","#a34a52"],
    ["白月光","#8d5262"],
    ["死对头","#455a78"],
    ["暧昧拉扯","#af6078"],
    ["合租日常","#7d8a5b"],
    ["误会","#8d5262"],
    ["离婚","#713848"],
    ["退婚","#713848"],
    ["先退婚后恋爱","#af6078"]
  ]],
  ["剧情亮点",[
    ["爽文","#9f753e"],
    ["逆袭","#9f753e"],
    ["打脸","#a34a52"],
    ["身份反转","#713848"],
    ["真假千金","#9f753e"],
    ["女主觉醒","#a34a52"],
    ["女性成长","#526e68"],
    ["反套路","#713848"],
    ["追悔莫及","#8d5262"],
    ["家族纷争","#713848"],
    ["家庭反击","#a34a52"],
    ["替嫁","#9f753e"],
    ["秘密揭晓","#455a78"],
    ["秘密","#455a78"],
    ["失踪谜案","#455a78"],
    ["亲情","#7d8a5b"]
  ]],
  ["篇幅类型",[
    ["短篇","#526e68"],
    ["中长篇","#526e68"]
  ]]
];
const defaultTagColors=defaultTagGroups.flatMap(([,tags])=>tags);
let coverTags=[],tagPresets=[],editingTag=null;
const validTagColor=x=>/^#[0-9a-fA-F]{6}$/.test(x||"")?x:"#713848";
function renderCoverTagOverlay(){
  const root=$("selectedCoverTagOverlay");
  root.replaceChildren();
  for(const tag of coverTags){
    const pill=byId("span",tag.label,"ops-tag-pill");
    pill.style.setProperty("--tag-color",validTagColor(tag.color));
    root.append(pill);
  }
}
function renderTagChoices(){
  const input=$("tagPreset"),selected=input.value;
  input.replaceChildren(new Option("自己输入标签",""));
  const known=new Map(defaultTagColors);
  for(const [groupName,tags] of defaultTagGroups){
    const group=document.createElement("optgroup");
    group.label=groupName;
    for(const [label] of tags)group.append(new Option(label,label));
    input.add(group);
  }
  const customGroup=document.createElement("optgroup");
  customGroup.label="已有自定义标签";
  for(const preset of tagPresets){
    if(!preset?.label||known.has(preset.label))continue;
    known.set(preset.label,preset.color);
    customGroup.append(new Option(preset.label,preset.label));
  }
  if(customGroup.children.length)input.add(customGroup);
  if(known.has(selected))input.value=selected;
}
function renderTags(){
  renderCoverTagOverlay();
  const root=$("tagList");
  root.replaceChildren();
  if(!chosen){root.append(byId("span","请选择一本书。","hint"));return}
  if(!coverTags.length){root.append(byId("span","这本书还没有标签。","hint"));return}
  for(const entry of coverTags){
    const row=byId("div",undefined,"ops-tag-entry");
    const pill=byId("span",entry.label,"ops-tag-pill");
    pill.style.setProperty("--tag-color",validTagColor(entry.color));
    const color=document.createElement("input");
    color.type="color";color.value=validTagColor(entry.color);
    color.title="修改「"+entry.label+"」的颜色";
    color.addEventListener("change",async()=>{
      try{await saveTag(entry.label,color.value)}catch(e){$("tagStatus").textContent=e.message}
    });
    const edit=byId("button","改名","secondary");
    edit.type="button";edit.onclick=()=>{
      editingTag=entry.label;$("tagText").value=entry.label;
      $("tagColor").value=validTagColor(entry.color);
      $("tagSave").textContent="保存修改";
      syncButtons();$("tagText").focus();
    };
    const remove=byId("button","删除","secondary");
    remove.type="button";
    remove.onclick=async()=>{
      try{
        const result=await api("/api/ops/books/"+encodeURIComponent(chosen.id)+"/tags","DELETE",
          {label:entry.label,requestId:requestId()});
        coverTags=result.tags;tagPresets=result.presets;editingTag=null;
        $("tagSave").textContent="添加标签";renderTagChoices();renderTags();
        $("tagStatus").textContent="已删除标签「"+entry.label+"」。";
      }catch(e){$("tagStatus").textContent=e.message}
    };
    row.append(pill,color,edit,remove);root.append(row);
  }
}
async function loadCoverTags(book){
  coverTags=[];tagPresets=[];editingTag=null;
  $("tagText").value="";$("tagColor").value="#713848";
  $("tagSave").textContent="添加标签";
  renderTagChoices();renderTags();syncButtons();
  try{
    const result=await api("/api/ops/books/"+encodeURIComponent(book.id)+"/tags");
    if(chosen?.id!==book.id)return;
    coverTags=result.tags||[];tagPresets=result.presets||[];
    renderTagChoices();renderTags();
    $("tagStatus").textContent="标签已加载；可选择现有标签，也可输入新标签。";
  }catch(e){
    if(chosen?.id===book.id)
      $("tagStatus").textContent="标签管理暂不可用："+e.message+"。可能需要先执行005标签数据库迁移。";
  }
  syncButtons();
}
async function saveTag(label,color,previousLabel=null){
  if(!chosen)throw Error("请先选择书籍");
  const id=chosen.id;
  const result=await api("/api/ops/books/"+encodeURIComponent(id)+"/tags","POST",{
    label,color,previousLabel,requestId:requestId()
  });
  if(chosen?.id!==id)return;
  coverTags=result.tags||[];tagPresets=result.presets||[];
  editingTag=null;$("tagText").value="";$("tagPreset").value="";
  $("tagSave").textContent="添加标签";
  renderTagChoices();renderTags();syncButtons();
  $("tagStatus").textContent="封面标签已保存，用户重新打开书架即可看到更新。";
}
$("tagPreset").addEventListener("change",()=>{
  const label=$("tagPreset").value;
  const selected=[...tagPresets,...defaultTagColors.map(([label,color])=>({label,color}))]
    .find(x=>x.label===label);
  if(label)$("tagText").value=label;
  if(selected)$("tagColor").value=validTagColor(selected.color);
  editingTag=null;$("tagSave").textContent="添加标签";syncButtons();
});
button("tagSave",async()=>{
  const label=$("tagText").value.trim().replace(/\s+/gu," ");
  if(!label||label.length>24)throw Error("标签文字需要1～24个字符");
  await saveTag(label,$("tagColor").value,editingTag);
});

let pendingNovel=null;
function selectedImportTags(){return [...$("uploadTagSuggestions").querySelectorAll("input:checked")]
  .map(el=>({label:el.value,color:el.dataset.tagColor}));}
async function renderImportTagSuggestions(pkg){
  const suggestions=await proposeTags({id:pkg.book.id,title:pkg.book.title,category_id:pkg.book.category},pkg);
  const root=$("uploadTagSuggestions");root.replaceChildren();
  for(const tag of suggestions){
    const label=byId("label",undefined,"ops-suggest-label");
    const input=document.createElement("input");input.type="checkbox";input.value=tag.label;
    input.dataset.tagColor=tag.color;input.checked=true;
    label.append(input,byId("span",tag.label+"（"+tag.basis+"）"));root.append(label);
  }
  $("uploadTagStatus").textContent=suggestions.length?"建议标签已选中；确认上传并上架后自动添加，可在上架前取消勾选。":
    "未找到足够明确的题材线索，暂不自动添加标签；可在上架后手动选择。";
}

const uploadMsg=message=>{$("uploadStatus").textContent=message;};
function resetNovel(){
 dictionaryV2Source=null;dictionaryV2Decisions=[];dictionaryV2ModeConverted=false;
 globalMatchDecisions=[];globalManifestPreview=null;globalSavedManifestRequestId=null;
 const reviewChoices=$("globalMatchChoices");
 if(reviewChoices){reviewChoices.hidden=true;reviewChoices.replaceChildren();}
 pendingNovel=null;$("importNovel").disabled=true;$("reviseNovel").disabled=true;
 $("uploadTagSuggestions").replaceChildren();$("uploadTagStatus").textContent="识别小说后显示可选标签建议。";
 $("uploadReport").hidden=true;$("uploadPreview").hidden=true;
 const matchReport=$("globalMatchReport");
 if(matchReport){matchReport.hidden=true;matchReport.textContent="";}
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
function previewNovelPackage(pkg){
 const wrap=$("uploadPreviewSample");wrap.replaceChildren();
 const cards=new Map((pkg.words||[]).map(w=>[w.id,w]));
 for(const ch of (pkg.chapters||[]).slice(0,2)){
  const heading=document.createElement("strong");heading.textContent="第"+ch.number+"章 · "+ch.title;wrap.append(heading);
  for(const paragraph of (ch.paragraphs||[]).slice(0,3)){
   const line=document.createElement("p");
   for(const seg of paragraph.segments||[]){
    if(!seg.wordId){line.append(document.createTextNode(seg.text||""));continue}
    const word=cards.get(seg.wordId);
    const b=document.createElement("button");
    b.type="button";b.className="secondary";b.style.margin="0 3px";
    b.style.padding="1px 5px";b.textContent=seg.surface;
    b.title=(word?.meaningZh||seg.gloss||"")+" · "+(word?.phoneticUs||word?.phoneticUk||"");
    b.addEventListener("click",()=>{
     $("uploadPreviewWord").textContent=(word?.headword||seg.surface)+" · "+
      (word?.phoneticUk||"")+" / "+(word?.phoneticUs||"")+" · "+
      (word?.meaningZh||seg.gloss||"")+"；"+(word?.exampleEn||"");
     if("speechSynthesis" in window){
      speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(word?.headword||seg.surface);
      utterance.lang="en-US";utterance.rate=.85;speechSynthesis.speak(utterance);
     }
    });
    line.append(b);
   }
   wrap.append(line);
  }
 }
 $("uploadPreview").hidden=false;
}

async function reviewDictionaryV2(result){
 const blocked=result.review_queue||[];
 const panel=$("uploadReport");
 panel.hidden=false;
 panel.textContent=[
   "统一词典小说 V2（无需提交 words[]）",
   "目标词出现："+result.source_target_occurrences,
   "自动匹配且教学合格："+result.approved_occurrences,
   "待人工处理："+blocked.length,
   ...blocked.slice(0,45).map(x=>
     "第"+x.chapter_number+"章·第"+(x.paragraph_index+1)+"段 · "+
     x.surface+"："+x.reason+"；候选："+(x.candidates||[])
       .map(c=>c.headword).join("/"))
 ].join("\n");
 const container=$("globalMatchChoices");
 container.replaceChildren();
 const reviewable=blocked.filter(x=>x.reason==="AMBIGUOUS_HEADWORD_OR_INFLECTION"&&
   (x.candidates||[]).some(c=>c.teaching_ready&&c.form_reviewed));
 container.hidden=reviewable.length===0;
 if(reviewable.length){
   container.append(byId("h3","按句子语境确认歧义词（仅预览，不直接发布）"));
   for(const item of reviewable.slice(0,40)){
     const row=byId("div",undefined,"row");
     const label=byId("label",
       "第"+item.chapter_number+"章，第"+(item.paragraph_index+1)+
       "段：「"+item.surface+"」 — "+(item.context||""));
     const select=document.createElement("select");
     select.setAttribute("aria-label",item.surface+" 对应的主词条");
     for(const candidate of item.candidates.filter(c=>c.teaching_ready&&c.form_reviewed)){
       const option=document.createElement("option");
       option.value=candidate.entry_id;
       option.textContent=candidate.headword;
       select.append(option);
     }
     const confirm=byId("button","确认本句词头","secondary");
     confirm.type="button";
     confirm.addEventListener("click",async()=>{
       if(!dictionaryV2Source||!connected()||confirm.disabled)return;
       confirm.disabled=true;
       const next={chapter_number:item.chapter_number,
         paragraph_index:item.paragraph_index,segment_index:item.segment_index,
         entry_id:select.value,confirmed:true};
       const before=[...dictionaryV2Decisions];
       dictionaryV2Decisions=[
         ...before.filter(x=>x.chapter_number!==next.chapter_number||
           x.paragraph_index!==next.paragraph_index||
           x.segment_index!==next.segment_index),next
       ];
       try{
         const r=await api("/api/ops/import/dictionary-v2/preflight","POST",{
           package:dictionaryV2Source,decisions:dictionaryV2Decisions
         });
         if(r.ready_to_convert&&r.converted_package){
           container.hidden=true;container.replaceChildren();
           uploadMsg("词典主词卡已按句子确认，生成完整兼容小说包。");
           dictionaryV2ModeConverted=true;
           await applyPreparedNovel(r.converted_package,
             localReport(r.converted_package,null));
         }else await reviewDictionaryV2(r);
       }catch(error){
         dictionaryV2Decisions=before;
         uploadMsg("歧义词核对失败："+(error.message||"请重新尝试"));
       }finally{confirm.disabled=false;syncButtons();}
     });
     row.append(label,select,confirm);
     container.append(row);
   }
 }
 uploadMsg("已识别小说，但还需处理"+blocked.length+
   "处缺词、教学资料或词形歧义。全部审核通过前不能导入。");
 syncButtons();
}
async function applyPreparedNovel(pkg,report){ if(pkg?.version!==1||!pkg.book?.id||!Array.isArray(pkg.chapters)||
  !pkg.chapters.length||!Array.isArray(pkg.words)||!pkg.words.length)
  throw Error("小说文件缺少书籍、章节或目标词卡，无法导入");
 if(report.anchors===0)throw Error("没有可点击的英文词汇标注，请检查词库匹配");
 if(JSON.stringify(pkg).length>1_500_000)throw Error("内容包过大，请缩短单次上传文件");
 if(report.metadataIncomplete.length)uploadMsg("预检发现"+report.metadataIncomplete.length+"个词卡缺少音标/例句。可以导入草稿，但必须补齐后才能正式上架。");
 else uploadMsg("文件识别成功。请检查下面的预览，选择封面，然后点击「确认上传并上架」。");
 pendingNovel=pkg;
 await renderImportTagSuggestions(pkg);
 syncButtons();
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
 previewNovelPackage(pkg);
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
  if(pkg?.version===2){
    if(identity?.environment!=="staging")
      throw Error("无需附带词卡的新版小说 JSON 暂只在预览站支持。");
    const result=await api("/api/ops/import/dictionary-v2/preflight","POST",{
      package:pkg
    });
    dictionaryV2Source=pkg;
    dictionaryV2Decisions=[];
    if(!result.ready_to_convert||!result.converted_package){
      await reviewDictionaryV2(result);
      return;
    }
    pkg=result.converted_package;
    dictionaryV2ModeConverted=true;
    uploadMsg("已从审核后的统一词典自动生成"+result.unique_main_cards+
      "张共享主词卡，保持原文与词义标注不变。下一步检查预览及封面。");
  }
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
 await applyPreparedNovel(pkg,report);
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
async function previewGlobalMatch(){
 globalManifestPreview=null;globalSavedManifestRequestId=null;
 if(!pendingNovel||identity?.environment!=="staging")
   throw Error("请在预览站先识别小说，再检查统一词典匹配。");
 const result=await api("/api/ops/import/preflight","POST",{
   package:pendingNovel,decisions:globalMatchDecisions
 });
 const c=result.summary?.target||{};
 const lines=[
   "统一词典匹配预检（只读，不上架、不覆盖旧词卡）",
   "等级："+(result.category||"未知")+"；明确标注的目标词："+(result.summary?.target_unique??0),
   "匹配成功："+(c.matched||0)+"；旧词库有词但教学待审："+(c.dictionary_only||0),
   "歧义待确认："+(c.needs_review||0)+"；词典缺词："+(c.missing||0),
   "正文其余英文："+(result.summary?.discovered_unique||0)+"个不同词形（仅供参考，不作为强制目标）",
   "词典索引状态："+(result.dictionary_status||"未知"),
   "主词典索引："+(result.dictionary_index_ready?"已连接预览词典":"尚未接入；正在使用旧词卡只读对照")
 ];
 const exceptions=(result.targets||[]).filter(x=>x.status!=="matched");
 if(exceptions.length)lines.push("需复核的目标词（最多展示30个）：");
 for(const x of exceptions.slice(0,30)){
   const why=x.status==="needs_review"?"同形或多个词卡待确认":
     x.status==="dictionary_only"?"旧卡可查但尚未按新标准审核":"当前词库未找到";
   lines.push("第"+(x.chapters||[]).join("、")+"章 "+
     x.surface+" → "+why+"；建议："+(x.candidates||[]).map(y=>y.headword).join("/") );
 }
 const binding=result.binding_proposal;
 if(binding){
   lines.push("逐次出现绑定候选："+binding.confirmed_occurrences+
     "；需要人工检查的位置："+binding.review_required_occurrences);
   const review=binding.review_queue||[];
   if(review.length)lines.push("按章节/段落/词位置定位异常（前30个）：");
   for(const entry of review.slice(0,30)){
     lines.push("第"+entry.chapter_number+"章，第"+(entry.paragraph_index+1)+
       "段，第"+(entry.segment_index+1)+"段元 · "+entry.surface+
       "： "+entry.reason+"\n  语境："+entry.context);
   }
   if(binding.conflicting_legacy_ids?.length){
     lines.push("警告：旧 wordId 指向不同主词头，必须先人工核对："+
       binding.conflicting_legacy_ids.map(x=>x.legacy_word_id).join("、"));
   }
   lines.push("本报告不会直接生成正式上传包，也不会修改用户学习状态。");
 }
 if(result.dictionary_index_ready){
   try{
     globalManifestPreview=await api("/api/ops/import/bindings/preview","POST",{
       package:pendingNovel,decisions:globalMatchDecisions
     });
     lines.push("候选关联审核："+
       (globalManifestPreview.ready_to_stage?"全部目标词可保存候选（不会上架）":
       "仍有"+globalManifestPreview.blockers.length+"个异常须先处理"));
     if(globalManifestPreview.ready_to_stage&&!globalManifestPreview.save_available)
       lines.push("候选保存功能尚未启用；仅可预览，不可持久化。");
   }catch(error){
     lines.push("关联清单预览暂不可用："+error.message);
   }
 }
 const panel=$("globalMatchReport");
 panel.textContent=lines.join("\n");panel.hidden=false;
 syncButtons();
 const choices=$("globalMatchChoices");
 if(choices){
   choices.replaceChildren();
   const review=(binding?.review_queue||[]).filter(x=>
     x.reason!=="LEGACY_ID_MULTIPLE_CANONICAL_LEMMAS"&&
     (x.candidates||[]).some(c=>c.teaching_ready&&c.form_reviewed));
   choices.hidden=review.length===0;
   if(review.length){
     choices.append(byId("h3","待核对的上下文（只在当前浏览器预览，不会保存）"));
     for(const item of review.slice(0,30)){
       const candidates=(item.candidates||[]).filter(c=>
         c.teaching_ready&&c.form_reviewed);
       const group=byId("div",undefined,"row");
       const label=byId("label",
         "第"+item.chapter_number+"章·第"+(item.paragraph_index+1)+
         "段：「"+item.surface+"」 — "+item.context);
       const select=document.createElement("select");
       select.setAttribute("aria-label",item.surface+" 的词典词头选择");
       for(const candidate of candidates){
         const option=document.createElement("option");
         option.value=candidate.entry_id;
         option.textContent=candidate.headword+" ("+candidate.evidence+")";
         select.append(option);
       }
       const confirm=byId("button","仅预览确认","secondary");
       confirm.type="button";
       confirm.addEventListener("click",async()=>{
         if(busy||!pendingNovel||!connected())return;
         busy=true;confirm.disabled=true;
         const decision={
           chapter_number:item.chapter_number,
           paragraph_index:item.paragraph_index,
           segment_index:item.segment_index,
           entry_id:select.value,confirmed:true
         };
         globalMatchDecisions.push(decision);
         try{await previewGlobalMatch();}
         catch(error){
           globalMatchDecisions.pop();
           uploadMsg(error.message||"本次匹配预览失败");
         }finally{busy=false;confirm.disabled=false;syncButtons();}
       });
       group.append(label,select,confirm);choices.append(group);
     }
   }
 }
}

if($("previewGlobalMatch"))button("previewGlobalMatch",async()=>{
  globalMatchDecisions=[];await previewGlobalMatch();
});

if($("stageGlobalBindings"))button("stageGlobalBindings",async()=>{
 if(identity?.environment!=="staging"||!pendingNovel||
    !globalManifestPreview?.ready_to_stage||
    !globalManifestPreview?.save_available)
   throw Error("此阶段尚不能保存词典关联。请先完成匹配预检。");
 if(!window.confirm("确认保存当前审核通过的词典关联候选？"+
    "只会在预览站记录候选，不会上传或上架小说，也不会修改学习状态。"))return;
 const newRequestId=requestId();
 const data=await api("/api/ops/import/bindings/confirm","POST",{
   package:pendingNovel,decisions:globalMatchDecisions,
   requestId:newRequestId,confirmSave:true,
   expectedPackageSha256:globalManifestPreview.package_sha256,
   expectedBindingSha256:globalManifestPreview.binding_sha256
 });
 globalSavedManifestRequestId=newRequestId;
 syncButtons();
 uploadMsg("词典关联候选已保存到预览站（"+(data.count||0)+
   "处目标词）；小说尚未上架，用户状态未变。");
});
if($("downloadGlobalBindingBundle"))button("downloadGlobalBindingBundle",async()=>{
 if(identity?.environment!=="staging"||!pendingNovel||
    !globalSavedManifestRequestId||!globalManifestPreview?.ready_to_stage)
   throw Error("请先完成词卡审核并在预览站保存关联候选。");
 const packageData=await api("/api/ops/import/bindings/export","POST",{
   package:pendingNovel,decisions:globalMatchDecisions,
   requestId:globalSavedManifestRequestId,
   expectedPackageSha256:globalManifestPreview.package_sha256,
   expectedBindingSha256:globalManifestPreview.binding_sha256
 });
 if(packageData.status!=="STAGING_VERIFIED_NOT_IMPORTED"||
    packageData.publication_ready!==false)
   throw Error("返回的候选关联包状态不正确，已取消下载。");
 const filename=(pendingNovel.book?.id||"novel")+"-dictionary-bindings.json";
 const blob=new Blob([JSON.stringify(packageData,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob);
 try{
   const anchor=document.createElement("a");
   anchor.href=url;anchor.download=filename;
   document.body.append(anchor);anchor.click();anchor.remove();
 }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
 uploadMsg("已生成词典关联候选 JSON（仅供审核；尚未上架或更改用户数据）。");
});
$("uploadCoverWithNovel").addEventListener("change",syncButtons);
button("importNovel",async()=>{
  if(!pendingNovel)throw Error("请先识别并预览小说内容");
  const coverFile=$("uploadCoverWithNovel").files?.[0];
  if(!coverFile)throw Error("请先选择小说封面");
  const title=pendingNovel.book.title;
  const attachVerified=identity?.environment==="staging"&&Boolean(globalSavedManifestRequestId);
  if(attachVerified&&!globalManifestPreview?.attach_available)
    throw Error("统一词典草稿关联功能尚未启用，不能以已绑定模式上传。");
  let created=null;
  try{
    uploadMsg("正在保存《"+title+"》的正文和词卡……");
    created=await api("/api/ops/import","POST",{package:pendingNovel});
    uploadMsg("草稿已保存，正在上传封面……");
    await uploadCoverForBook(created.bookId,coverFile);
    if(attachVerified){
      uploadMsg("草稿与封面已保存，正在核对并关联统一词典……");
      const result=await api("/api/ops/import/bindings/attach","POST",{
        package:pendingNovel,decisions:globalMatchDecisions,
        requestId:globalSavedManifestRequestId,confirmAttach:true,
        expectedPackageSha256:globalManifestPreview.package_sha256,
        expectedBindingSha256:globalManifestPreview.binding_sha256
      });
      if(!result.attached||result.published!==false)
        throw Error("词典关联未通过最终校验，草稿不会发布。");
      const savedTitle=title;
      $("uploadCoverWithNovel").value="";
      resetNovel();await loadBooks(created.bookId);
      uploadMsg("《"+savedTitle+"》已保存为未发布草稿，"+
        result.bindings+"处学习目标已对应统一词典；"+
        "阅读器共享词卡功能上线前，不自动发布。");
      return;
    }
    uploadMsg("封面上传成功，正在核对上架条件……");
    const snapshot=await api("/api/ops/books/"+encodeURIComponent(created.bookId)+"/readiness");
    if(!snapshot.quickPublishAvailable){
      const problems=(snapshot.blockers||[]).map(x=>x.message).join("；");
      throw Error(problems||"当前发布条件未满足，请在⑤查看报告");
    }
    await quickPublishBook(created.bookId,snapshot);
    const tags=selectedImportTags();
    let tagNotice="";
    if(tags.length){
      try{
        const saved=await addMissingTagsToBook({id:created.bookId},tags,Math.max(3,tags.length));
        tagNotice="；已添加 "+saved.added+" 个剧情标签";
      }catch(tagError){
        tagNotice="；小说已上架，但部分标签未保存："+tagError.message+"（可在封面标签中补充）";
      }
    }
    $("uploadCoverWithNovel").value="";
    resetNovel();await loadBooks(created.bookId);
    uploadMsg("《"+title+"》已成功上架，"+created.chapters+"章、"+
      created.wordCards+"个词卡。已上传封面"+tagNotice+"，付费章节仍由会员权限保护。");
  }catch(e){
    if(!created)throw e;
    resetNovel();await loadBooks(created.bookId);
    uploadMsg("《"+title+"》已保存为草稿，但尚未上架："+e.message+
      "。无需重复导入，请在④选择该书，修复问题后在⑤点击确认上架。");
  }
});

button("useSelectedDraft",async()=>{
 if(!chosen||chosen.status!=="draft")throw Error("请先选择一部未发布草稿");
 $("uploadBookTitle").value=chosen.title;
 $("uploadBookId").value=chosen.id;
 $("uploadCategory").value=chosen.category_id;
 resetNovel();syncButtons();
 uploadMsg("已填入《"+chosen.title+"》的书籍信息。选择修订稿并预览，然后点击“替换当前未发布草稿”。");
});
button("reviseNovel",async()=>{
 if(!chosen||chosen.status!=="draft"||!pendingNovel||
  pendingNovel.book?.id!==chosen.id||pendingNovel.book?.title!==chosen.title)
  throw Error("修订稿编号/书名必须与当前选中的未发布草稿一致");
 if(!readiness?.contentFingerprint)throw Error("无法取得草稿版本，请重新选择书籍");
 if(!window.confirm("确认用刚才预览的文件更新《"+chosen.title+
  "》的未发布正文和词卡？系统将保留书籍编号、用户购买权益与已有学习记录；原版本审核会失效。"))return;
 const changed=await api("/api/ops/import/revise","POST",{
  package:pendingNovel,expectedFingerprint:readiness.contentFingerprint,
  confirmTitle:chosen.title,requestId:requestId()
 });
 uploadMsg("已安全更新未发布草稿《"+chosen.title+"》，"+
  changed.chapters+"章、"+changed.newAnchors+"处词汇标注。请重新审核最新版后再发布。");
 resetNovel();await loadBooks(chosen.id);
});

// Merchant issuance shares the publisher's short-lived operator credential.
// The API uses the production Worker secret internally. No plaintext is
// persisted to storage, URL or analytics.
let saleReady=false;
function saleStatus(message){$("saleStatus").textContent=message;}
function syncSaleButtons(){
 const ok=connected()&&saleReady;
 const orderEntered=Boolean($("saleOrder").value.trim());
 const receiptOpen=!$("saleReceipt").hidden;
 $("saleCategory").disabled=!ok;
 // Never replace an unrecoverable one-time code display before the merchant
 // copies it. Clear the receipt after delivery to unlock the next order.
 $("saleStatusButton").disabled=!ok||!orderEntered||receiptOpen;
 $("saleIssueButton").disabled=!ok||!$("saleCategory").value||
  !orderEntered||receiptOpen;
}
let categoryCatalog=[];
function categoryState(product){
 if(!product.isVisible)return product.publishedBooks>0?
  "内容已发布 · 尚未向读者开放":"筹备中 · 读者不可见";
 if(!product.issuable)return "已显示在书架 · 暂无正式内容";
 return "已开放 · 可以发码";
}
function renderCategoryCatalog(){
 const root=$("categoryCatalog");
 root.replaceChildren();
 if(!categoryCatalog.length){
  root.append(byId("p","暂无已配置分类。请先添加隐藏分类。","soft"));
  return;
 }
 for(const product of categoryCatalog){
  const item=byId("div",undefined,"book-entry");
  item.append(byId("strong",product.title+"（"+product.slug+"）"));
  item.append(byId("p",categoryState(product)+" · 草稿 "+
    product.draftBooks+" 本 · 已发布 "+product.publishedBooks+" 本"));
  // A new category is created hidden. Its publication remains a separate
  // action only after at least one real chapter has been published.
  if(!product.isVisible&&product.publishedBooks>0){
   const activate=byId("button","开放此分类书架与售卖","secondary");
   activate.type="button";
   activate.addEventListener("click",async()=>{
    if(busy)return;
    if(!window.confirm("此操作会向读者展示「"+product.title+
      "」的已发布内容，并允许为它发放专属激活码。确认已审核内容与售卖范围？"))return;
    busy=true;activate.disabled=true;
    try{
     await api("/api/ops/sales/categories/launch","POST",{slug:product.slug});
     $("categoryManageStatus").textContent="分类已经开放："+product.title;
     await loadSaleCategories();
    }catch(e){$("categoryManageStatus").textContent=e.message;}
    finally{busy=false;syncButtons();}
   });
   item.append(activate);
  }
  root.append(item);
 }
}
async function loadSaleCategories(){
 saleReady=false;syncSaleButtons();
 const data=await api("/api/ops/sales/categories");
 categoryCatalog=Array.isArray(data.categories)?data.categories:[];
 customerAdmin?.categories(categoryCatalog);
 renderCategoryCatalog();
 const select=$("saleCategory"),prior=select.value;
 select.replaceChildren(byId("option","选择可售的商品分类"));
 select.firstChild.value="";
 for(const product of categoryCatalog){
  if(!product.issuable)continue;
  const option=byId("option",product.title+"（"+product.slug+"）");
  option.value=product.slug;select.append(option);
 }
 if([...select.options].some(x=>x.value===prior))select.value=prior;
 saleReady=select.options.length>1;
 const upload=$("uploadCategory"),old=upload.value;
 upload.replaceChildren();
 for(const product of categoryCatalog){
  const option=byId("option",product.title+"（"+product.slug+"）");
  option.value=product.slug;upload.append(option);
 }
 if([...upload.options].some(x=>x.value===old))upload.value=old;
 saleStatus(saleReady?"已验证发布者身份；只有具备已发布内容、已开放的分类可以发码。":
   "目前没有可售类别，请先在分类管理中准备并发布商品内容。");
 syncButtons();
}
function clearSaleReceipt(){
 $("saleDelivery").value="";$("saleReceipt").hidden=true;
}
for(const id of ["saleCategory","saleOrder"])
 $(id).addEventListener("input",syncSaleButtons);
button("saleStatusButton",async()=>{
 clearSaleReceipt();
 const result=await api("/api/ops/sales/status","POST",{
  orderReference:$("saleOrder").value.trim()
 });
 saleStatus(result.found?
  "已存在此订单：分类 "+result.order.title+"，激活状态 "+result.order.status+
    (result.order.redeemed_at?"，已激活":"，尚未激活")+
    "。请勿重复发码。":
  "没有找到此订单的发码记录。确认收款和类目可交付后再生成。");
});
button("saleIssueButton",async()=>{
 if(!connected()||!saleReady)throw Error("请先验证发布者身份");
 if(!$("saleReceipt").hidden)throw Error("请先复制上一笔订单的发货内容并清除凭证");
 const order=$("saleOrder").value.trim();
 const category=$("saleCategory").value;
 if(!order||!category)throw Error("请先选择商品并填写订单编号");
 // Clicking "生成激活码" is the operator's action to attest that the
 // external Xiaohongshu order has been paid and the category is deliverable.
 // This is NOT an external payment verification or a user-entered checkbox.
 const result=await api("/api/ops/sales/issue","POST",{
   categoryId:category,orderReference:order,
   paymentConfirmed:true,contentConfirmed:true
 });
 const name=$("saleCategory").selectedOptions[0]?.textContent||category;
 $("saleDelivery").value=[
  "妙屋英语｜订单交付说明",
  "学习网址：https://miaowu-english-pages.pages.dev/",
  "购买商品："+name,
  "小红书-订单编号："+result.orderReference.replace(/^ORD-/,""),
  "本单一次性激活码："+result.activationCode,
  "订单专属密码找回凭证："+result.recoveryKey,
  "",
  "首次使用：注册并激活，设置用户名和密码。",
  "忘记密码：登录页面点击「订单找回」，输入用户名、订单编号及独立找回凭证。",
  "请私下保存以上信息；找回凭证使用后会自动失效并生成新凭证。"
 ].join("\n");
 $("saleReceipt").hidden=false;
 saleStatus("已为订单预留并入库一次性激活码，请立即复制交付。重新进入无法获取明文。");
 syncSaleButtons();
});
$("saleCopy").addEventListener("click",async()=>{
 const field=$("saleDelivery");
 if(!field.value)return;
 try{await navigator.clipboard.writeText(field.value);saleStatus("已复制交付信息，请通过小红书私聊发送给对应买家。");}
 catch{field.select();saleStatus("浏览器不允许自动复制，已选中内容，请手动复制。");}
});
$("saleClear").addEventListener("click",()=>{
 clearSaleReceipt();
 $("saleOrder").value="";
 syncSaleButtons();
 $("saleOrder").focus();
 saleStatus("已清除本笔发货凭证，可输入下一笔已付款订单。");
});
// Create hidden content categories without writing anything to the public shelf.
function syncCategoryCreateButton(){
 $("categoryCreateButton").disabled=!connected()||busy||
  !$("categoryName").value.trim()||!$("categorySlug").value.trim();
}
["categoryName","categorySlug"].forEach(id=>
 $(id).addEventListener("input",syncCategoryCreateButton));
button("categoryCreateButton",async()=>{
 const title=$("categoryName").value.trim();
 const slug=$("categorySlug").value.trim();
 if(!/^[a-z][a-z0-9-]{2,29}$/.test(slug))
  throw Error("分类标识只能是 3–30 位小写英文字母、数字或连字符，需以字母开头");
 if(title.length<2||title.length>40)throw Error("分类名称需要 2–40 个字符");
 const created=await api("/api/ops/sales/categories/create","POST",{slug,title});
 $("categoryName").value="";$("categorySlug").value="";
 $("categoryManageStatus").textContent="已创建隐藏分类「"+created.title+
  "」。它不会出现在读者书架，也不能发码；请先上传小说并完成内容审核。";
 await loadSaleCategories();
});
// Local filtering: no extra API calls or updates to publication state.
for(const id of ["bookSearch","bookCategory","bookStatus"]){
  $(id).addEventListener(id==="bookSearch"?"input":"change",()=>{
    catalogPage=1;renderBookDirectory();
  });
}
$("bookClearFilters").addEventListener("click",()=>{
  $("bookSearch").value="";$("bookCategory").value="";$("bookStatus").value="";
  catalogPage=1;renderBookDirectory();
});
$("bookPagePrev").addEventListener("click",()=>{
  if(catalogPage>1){catalogPage--;renderBookDirectory();}
});
$("bookPageNext").addEventListener("click",()=>{
  catalogPage++;renderBookDirectory();
});
button("connect",verify);button("refresh",()=>loadBooks());
button("publish",doPublish);button("withdraw",doWithdraw);
button("disconnect",async()=>{
  key="";identity=null;chosen=null;clearActions();clearSaleReceipt();customerAdmin?.reset();claimAdmin?.reset();updatesAdmin?.reset();
  catalogBooks=[];catalogPage=1;
  $("bookSearch").value="";$("bookStatus").value="";updateBookCategoryOptions();
  renderBookDirectory();
  saleReady=false;categoryCatalog=[];renderCategoryCatalog();
  syncSaleButtons();$("opsKey").value="";
  $("operatorIdentity").textContent="未登录";$("books").replaceChildren(byId("p","已清除密钥。","soft"));
  $("audit").replaceChildren(byId("p","请先验证身份。","soft"));
  $("selected").textContent="请选择一本书";status("本页内存中的运营密钥已清除。");
});
window.addEventListener("pagehide",()=>{key="";identity=null;clearSaleReceipt();customerAdmin?.reset();claimAdmin?.reset();updatesAdmin?.reset();});
syncButtons();
})();