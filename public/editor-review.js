(()=>{
"use strict";
const host=document.getElementById("reviewPanel");
const create=(tag,value,style)=>{
  const item=document.createElement(tag);
  if(value!==undefined)item.textContent=value;
  if(style)item.className=style;
  return item;
};
const state={bookId:null,title:""};
const service=()=>window.MiaowuDraftEditor;
const manualLabels={
  ORIGINALITY_AND_RIGHTS:"确认原创性、版权和封面素材授权",
  LANGUAGE_PROOFREADING:"人工检查英语用法、中文释义及阅读自然度",
  PRODUCT_SCOPE:"人工确认故事完整度、考试词表覆盖和试看边界"
};
function issueList(parent,items,heading){
  parent.append(create("h3",heading));
  if(!items.length){parent.append(create("p","无"));return}
  const list=create("div",undefined,"draft-list");
  for(const x of items){
    const item=create("div",undefined,"item");
    item.append(create("strong",x.message));
    const ctx=[x.chapterId?"章节："+x.chapterId:null,x.wordId?"单词："+x.wordId:null,
      x.anchor?"位置："+x.anchor:null].filter(Boolean).join(" · ");
    if(ctx)item.append(create("p",ctx,"edit-info"));
    item.append(create("small",x.code));list.append(item);
  }
  parent.append(list);
}
function button(label,onclick,secondary=true){
  const x=create("button",label,secondary?"secondary":"");
  x.type="button";x.onclick=onclick;return x;
}
async function signoffs(report){
  const section=create("section",undefined,"edit-section");
  section.append(create("h3","S3-C2 · 人工审核确认与留痕"));
  section.append(create("p","仅用于测试流程。勾选表示你已亲自核对对应事项，不代表系统自动证明版权或作品质量；不会发布任何内容。","edit-info"));
  host.append(section);
  let saved;
  try{
    saved=await service().request("/api/staging/editor/drafts/"+
      encodeURIComponent(state.bookId)+"/review-signoffs");
  }catch(e){
    const message=/REVIEW_SCHEMA_REQUIRED/.test(e.message)
      ?"审核记录表尚未创建，请完成数据库 006 增量升级后再使用此项。"
      :"暂时不能读取审核确认记录："+e.message;
    section.append(create("p",message,"note"));return;
  }
  if(saved.current){
    section.append(create("p","已保存当前版本的人工审核确认："+saved.current.createdAt,"status"));
  }else if(saved.requiresRecheck){
    section.append(create("p","此前有审核记录，但草稿已发生修改或恢复。旧确认已失效，请重新检查并确认。","note"));
  }else{
    section.append(create("p","目前还没有人工审核确认记录。","edit-info"));
  }
  const existing=saved.history||[];
  if(existing.length){
    const details=document.createElement("details");
    const summary=create("summary","查看近期审核记录（"+existing.length+"）");
    details.append(summary);
    for(const item of existing){
      const line=create("div",undefined,"history-row");
      line.append(create("strong",item.stillMatches?"与当前稿件版本一致":"历史记录（版本已变化）"));
      line.append(create("p",item.createdAt+" · "+item.contentFingerprint.slice(0,12),"edit-info"));
      line.append(create("p",item.note,"edit-info"));details.append(line);
    }
    section.append(details);
  }
  if(!report.technicalCheckPassed){
    section.append(create("p","存在必须修复的技术问题，暂不可保存人工审核确认。","note"));return;
  }
  const fields=[];
  const options=create("div");
  for(const item of report.manualChecks){
    const label=create("label",undefined,"row");
    label.style.alignItems="flex-start";
    const check=document.createElement("input");
    check.type="checkbox";check.style.width="auto";check.style.marginTop="4px";
    const words=create("span",manualLabels[item.code]||item.title);
    label.append(check,words);options.append(label);
    fields.push({code:item.code,checkbox:check});
  }
  section.append(options);
  const lbl=create("label","人工审核备注（至少12个字符；请记录实际检查范围与未解决事项）");
  lbl.setAttribute("for","signoffNote");
  const note=document.createElement("textarea");
  note.id="signoffNote";note.rows=3;note.maxLength=800;
  note.placeholder="例如：仅验证两章测试文本的审核流程；不是正式上架批准。";
  section.append(lbl,note);
  const save=button("保存本版审核确认（不发布）",async()=>{
    if(fields.some(x=>!x.checkbox.checked)){
      section.append(create("p","请完成三项人工确认；未核实的项目不要勾选。","note"));return;
    }
    if(note.value.trim().length<12){
      section.append(create("p","请填写至少12字的真实审核说明。","note"));return;
    }
    if(!confirm("确认保存本次人工审核记录？这不会发布小说。"))return;
    save.disabled=true;
    try{
      const result=await service().request("/api/staging/editor/drafts/"+
        encodeURIComponent(state.bookId)+"/review-signoffs","POST",{
        expectedFingerprint:report.contentFingerprint,
        checks:fields.map(x=>x.code),note:note.value.trim()
      });
      if(result.saved)await run(null);
    }catch(e){
      section.append(create("p","保存失败："+e.message,"note"));
    }finally{save.disabled=false}
  },false);
  section.append(save);
  section.append(create("p","注意：任何后续章节或词汇保存都会让原确认失效。正式发布/撤回功能仍未开放。","edit-info"));
}
async function run(button){
  if(!state.bookId)return;
  if(button)button.disabled=true;
  const id=state.bookId;
  host.replaceChildren(create("p","正在检查 D1 中的章节与词汇索引……"));
  try{
    const result=await service().request("/api/staging/editor/drafts/"+encodeURIComponent(id)+"/review");
    if(state.bookId!==id)return;
    host.replaceChildren();
    host.append(create("h3",result.book.title+" · 内容检查结果"));
    const m=result.metrics;
    host.append(create("p","章节 "+m.chapters+" · 免费试读 "+m.previewChapters+" · 非试读 "+
      m.paidChapters+" · 不同单词 "+m.distinctWords+" · 英文标注 "+m.wordOccurrences,"edit-info"));
    const good=result.technicalCheckPassed;
    host.append(create("p",good?"结构检查无阻断问题，仍需人工审核":
      "发现 "+result.blockerCount+" 项需要先修复的结构问题",good?"status":"note"));
    issueList(host,result.blockers,"必须修复（"+result.blockerCount+"）");
    issueList(host,result.warnings,"建议完善（"+result.warningCount+"）");
    const review=create("div",undefined,"edit-section");
    review.append(create("h3","必须由你人工审核"));
    for(const item of result.manualChecks)review.append(create("p","□ "+item.title,"edit-info"));
    host.append(review);
    host.append(create("p","审核工具不会发布、修改章节或改变用户权限。","edit-info"));
    const again=buttonFactory("重新检查",()=>run(again));
    host.append(again);
    await signoffs(result);
  }catch(e){
    if(state.bookId!==id)return;
    host.replaceChildren(create("p","检查失败："+(e.message||"未知错误"),"note"));
    const retry=buttonFactory("重新尝试",()=>run(retry));
    host.append(retry);
  }finally{if(button)button.disabled=false}
}
function buttonFactory(label,fn){return button(label,fn)}
window.addEventListener("miaowu:draft-preview",event=>{
  const data=event.detail;
  if(!data?.book)return;
  state.bookId=data.book.id;state.title=data.book.title;
  host.replaceChildren(
    create("p","当前草稿：《"+data.book.title+"》。运行检查不会改变正文或上架状态。"),
    button("运行内容审核",()=>run(null),false)
  );
});
})();
