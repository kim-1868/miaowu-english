(()=>{
"use strict";
const host=document.getElementById("reviewPanel");
const make=(tag,value,className)=>{
  const item=document.createElement(tag);
  if(value!==undefined)item.textContent=value;
  if(className)item.className=className;
  return item;
};
const state={bookId:null,title:""};
const service=()=>window.MiaowuDraftEditor;
function renderIssueList(parent,items,heading){
  const title=make("h3",heading);parent.append(title);
  if(!items.length){parent.append(make("p","无"));return}
  const list=make("div","", "draft-list");
  for(const x of items){
    const item=make("div",undefined,"item");
    const label=make("strong",x.message);
    const ctx=[x.chapterId?"章节："+x.chapterId:null,x.wordId?"单词："+x.wordId:null,
      x.anchor?"位置："+x.anchor:null].filter(Boolean).join(" · ");
    item.append(label);
    if(ctx)item.append(make("p",ctx,"edit-info"));
    item.append(make("small",x.code));
    list.append(item);
  }
  parent.append(list);
}
async function run(button){
  if(!state.bookId)return;
  button.disabled=true;
  host.replaceChildren(make("p","正在从 D1 读取草稿并检查章节与词汇索引……"));
  try{
    const result=await service().request("/api/staging/editor/drafts/"+
      encodeURIComponent(state.bookId)+"/review");
    host.replaceChildren();
    host.append(make("h3",result.book.title+" · 内容检查结果"));
    const metrics=result.metrics;
    const info=make("p","章节 "+metrics.chapters+" · 免费试读 "+metrics.previewChapters+
      " · 非试读 "+metrics.paidChapters+" · 不同词汇 "+metrics.distinctWords+
      " · 英文标注 "+metrics.wordOccurrences,"edit-info");
    host.append(info);
    const resultText=result.technicalCheckPassed
      ?"自动化结构检查未发现阻断问题；但仍需完成下方人工审核"
      :"发现 "+result.blockerCount+" 项需要先修复的结构问题";
    host.append(make("p",resultText,result.technicalCheckPassed?"status":"note"));
    renderIssueList(host,result.blockers,"必须修复（"+result.blockerCount+"）");
    renderIssueList(host,result.warnings,"建议完善（"+result.warningCount+"）");
    const human=make("div","", "edit-section");
    human.append(make("h3","必须由你人工审核"));
    for(const item of result.manualChecks){
      const line=make("p","□ "+item.title);
      line.className="edit-info";
      human.append(line);
    }
    host.append(human);
    host.append(make("p","当前仅生成审核报告，不会发布、修改草稿或改变用户权益。","edit-info"));
    const again=make("button","重新检查","secondary");
    again.type="button";again.onclick=()=>run(again);host.append(again);
  }catch(e){
    host.replaceChildren(make("p","检查失败："+(e.message||"未知原因"),"note"));
    const retry=make("button","重新尝试","secondary");
    retry.type="button";retry.onclick=()=>run(retry);host.append(retry);
  }finally{button.disabled=false}
}
window.addEventListener("miaowu:draft-preview",event=>{
  const data=event.detail;
  if(!data?.book)return;
  state.bookId=data.book.id;state.title=data.book.title;
  host.replaceChildren();
  host.append(make("p","当前草稿：《"+data.book.title+"》。检查不会改变正文或发布状态。"));
  const button=make("button","运行内容审核");
  button.type="button";button.onclick=()=>run(button);
  host.append(button);
});
})();
