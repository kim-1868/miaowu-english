(()=>{
"use strict";
const $=id=>document.getElementById(id);
let secret="",verified=false,checked=null;
const status=(id,s)=>$(id).textContent=s;
const allowed=()=>verified && secret.length>=32;
const mapErrors={
 EDITOR_NOT_CONFIGURED:"Cloudflare 尚未配置独立 S3_EDITOR_SECRET（至少32字符）。",
 EDITOR_FORBIDDEN:"独立编辑管理员密钥不正确；网站 reviewer 密码不能代替它。",
 INVALID_ORIGIN:"请求被来源验证拦截，请刷新页面重试。",
 EDITOR_PACKAGE_INVALID:"内容包不符合规范。请检查书本、章节、单词ID和正文标注。",
 EDITOR_PACKAGE_LIMIT:"内容包太大，请分批导入。",
 DRAFT_ID_EXISTS:"此书目 ID 已存在，为避免覆盖，本次未导入。",
 VOCAB_ID_CONFLICT:"某个已有词汇 ID 对应的英文或中文释义与本次内容不一致。",
 IMPORT_CONFLICT:"数据库发现重复 ID 或关联冲突，整批导入已回滚。",
 DRAFT_NOT_FOUND:"找不到这份尚未发布的草稿。",
 EDITOR_SCHEMA_CHECK_FAILED:"后台数据库检查未通过，请检查 D1 绑定与最新部署。",
 EDITOR_BACKEND_ERROR:"后台读取草稿时发生异常。",
 STAGING_ACCESS_REQUIRED:"测试站 reviewer 访问已过期。请返回首页重新验证。"
 ,
 EDITOR_REVISION_SCHEMA_REQUIRED:"章节编辑历史表尚未升级，请先完成 005 增量迁移",
 EDIT_CONFLICT:"该内容已经被另一处修改。请刷新书目后重新编辑，避免覆盖新版本",
 SHARED_WORD_LOCKED:"该词汇被别的书或已发布章节共用，暂时不能直接修改",
 INVALID_EDITOR_PAYLOAD:"章节或词汇填写不完整，请检查段落内容和词汇 ID",
 EDITOR_SAVE_FAILED:"保存时服务器出现异常，请检查 Cloudflare 日志"
};
function setVerified(value){verified=value;$("import").disabled=!value;$("refresh").disabled=!value}
async function api(path,method="GET",body){
  if(!secret)throw Error("请先输入独立编辑管理员密钥");
  const options={method,credentials:"same-origin",cache:"no-store",
    headers:{"Accept":"application/json","X-Mw-Editor-Key":secret}};
  if(body!==undefined){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(body)}
  let response;
  try{response=await fetch(path,options)}
  catch{throw Error("网络请求失败，请检查网络连接后刷新后台。")}
  const contentType=response.headers.get("content-type")||"";
  let raw="";
  try{raw=await response.text()}catch{throw Error("服务器响应中断（HTTP "+response.status+"），请检查最新 Cloudflare 部署。")}
  let payload;
  try{payload=raw.trim()?JSON.parse(raw):null}
  catch{payload=null}
  if(!payload || typeof payload!=="object" || Array.isArray(payload)){
    // This may be an empty Cloudflare platform response, an HTML error page,
    // or an unexpectedly cached old Worker. Do not reveal server HTML or secrets.
    throw Error("后台返回空白或非 JSON 数据（HTTP "+response.status+"，类型 "+(contentType||"未注明")+
      "，长度 "+raw.length+"）。请确认最新 GitHub Build 已部署。");
  }
  if(!response.ok){
    const stage=typeof payload.diagnosticStage==="string"?"；诊断阶段："+payload.diagnosticStage:"";
    throw Error((mapErrors[payload.error]||payload.error||"请求失败")+"（HTTP "+response.status+"）"+stage);
  }
  return payload;
}
async function busy(button,fn){
  button.disabled=true;
  try{await fn()}catch(e){status("status",e.message); }
  finally{button.disabled=false}
}
function summary(input){
  if(!input || input.version!==1 || !input.book || !Array.isArray(input.chapters) || !Array.isArray(input.words))
    throw Error("JSON 结构不完整，需要 version:1、book、chapters、words");
  const cs=input.chapters;
  return "书名："+(input.book.title||"未填写")+"\n分类："+(input.book.category||"未填写")+
    "\n章节："+cs.length+"章（免费试读："+cs.filter(c=>c.preview===true).length+"章）"+
    "\n单词："+input.words.length+"个\n注意：这是本地初步检查，导入时服务器会再次严格校验。";
}
async function drafts(){
  const data=await api("/api/staging/editor/drafts");
  if(!Array.isArray(data.drafts))throw Error("草稿 API 返回字段异常：缺少 drafts 数组。");
  const root=$("drafts");root.replaceChildren();
  if(!data.drafts.length){root.textContent="暂无草稿。可以从左侧导入一份新内容包。";return}
  for(const draft of data.drafts){
    const item=document.createElement("div");item.className="item";
    const strong=document.createElement("strong");strong.textContent=draft.title;
    const meta=document.createElement("div");meta.className="meta";
    meta.textContent=draft.category.toUpperCase()+" · "+draft.chapter_count+"章 · "+draft.word_count+"词 · 草稿未发布";
    const btn=document.createElement("button");btn.className="secondary";btn.textContent="预览章节与词汇";
    btn.onclick=()=>busy(btn,async()=>{
      const details=await api("/api/staging/editor/drafts/"+encodeURIComponent(draft.id));
      renderPreview(details);status("status","已加载草稿："+draft.title);
    });
    item.append(strong,meta,btn);root.append(item);
  }
}
function renderPreview(data){
  const root=$("previewArea");root.replaceChildren();
  const h=document.createElement("h2");h.textContent=data.book.title;root.append(h);
  const info=document.createElement("p");info.textContent=data.book.category.toUpperCase()+
    " · "+data.chapters.length+"章 · "+data.words.length+"个关联单词 · 未发布";root.append(info);
  const wordTitle=document.createElement("h3");wordTitle.textContent="词汇检查";root.append(wordTitle);
  const glossary=document.createElement("p");glossary.textContent=data.words.length?
    data.words.map(w=>w.headword+"（"+w.meaning_zh+"）").join("、"):"暂无已标注词汇";root.append(glossary);
  for(const chapter of data.chapters){
    const section=document.createElement("section");section.className="chapter";
    const title=document.createElement("h3");title.textContent="第"+chapter.number+"章 · "+chapter.title+
      (chapter.preview?" · 免费试看":" · 付费章节");section.append(title);
    const paragraphs=chapter.content?.paragraphs||[];
    for(const p of paragraphs){
      const line=document.createElement("p");line.className="paragraph";
      if(typeof p==="string")line.textContent=p;
      else for(const seg of p.segments||[]){
        if(typeof seg.text==="string")line.append(document.createTextNode(seg.text));
        else if(typeof seg.wordId==="string"){
          const word=document.createElement("span");word.className="word";
          word.textContent=seg.surface;word.title=seg.wordId;
          line.append(word,document.createTextNode("（"+(seg.gloss||"")+"）"));
        }
      }
      section.append(line);
    }
    root.append(section);
  }
  window.dispatchEvent(new CustomEvent("miaowu:draft-preview",{detail:data}));
}
$("verify").onclick=()=>busy($("verify"),async()=>{
  setVerified(false);
  secret=$("editorKey").value;
  if(secret.length<32)throw Error("请输入至少32位的独立编辑管理员密钥");
  status("status","正在验证编辑权限、Cloudflare D1 数据库及草稿目录…");
  const check=await api("/api/staging/editor/check");
  if(!check.ok || !check.schemaReady)throw Error("数据库表结构尚未就绪。");
  await drafts();
  setVerified(true);
  status("status","编辑密钥验证成功，D1 表结构正常，草稿列表已加载。");
});
$("forget").onclick=()=>{
  secret="";checked=null;$("editorKey").value="";$("source").value="";
  setVerified(false);$("drafts").textContent="验证编辑权限后加载。";
  $("previewArea").textContent="已清除页面中的草稿预览。";
  status("status","已清除当前页的编辑管理员密钥。");
};
$("refresh").onclick=()=>busy($("refresh"),drafts);
$("importFile").onchange=async()=>{
  const file=$("importFile").files?.[0];
  if(!file)return;
  if(file.size>350000){status("importMessage","文件超过350KB，请缩减内容包。");return}
  try{$("source").value=await file.text();checked=null;
    status("importMessage","已读取本地文件，点击“检查 JSON”继续。")}
  catch{status("importMessage","读取本地文件失败")}
};
$("previewJson").onclick=()=>{
  try{checked=JSON.parse($("source").value);status("importMessage",summary(checked))}
  catch(e){checked=null;status("importMessage","无法检查："+e.message)}
};
$("import").onclick=()=>busy($("import"),async()=>{
  if(!allowed())throw Error("请先验证独立的编辑管理员密钥");
  const parsed=JSON.parse($("source").value);
  status("importMessage",summary(parsed));
  const name=parsed?.book?.title||"新草稿";
  if(!confirm("确认将《"+name+"》写入 D1 测试数据库？\n只创建未发布草稿，不会覆盖任何已有书目。"))return;
  const result=await api("/api/staging/editor/drafts","POST",{package:parsed});
  status("importMessage","已保存未发布草稿："+result.bookId+"；"+result.chapters+"章、"+result.words+"词。");
  await drafts();status("status","导入成功：未公开、未发布、不影响真实购买权限。");
});
window.MiaowuDraftEditor=Object.freeze({
  request:(path,method="GET",payload)=>api(path,method,payload),
  canEdit:()=>allowed(),
  load:async bookId=>{
    const detail=await api("/api/staging/editor/drafts/"+encodeURIComponent(bookId));
    renderPreview(detail);
    return detail;
  },
  notice:text=>status("status",text)
});
setVerified(false);
})();
