(()=>{
"use strict";
const area=document.getElementById("publicationReadinessPanel");
const service=()=>window.MiaowuDraftEditor;
let currentId=null;
function el(tag,text,cls){
  const x=document.createElement(tag);
  if(text!==undefined)x.textContent=text;
  if(cls)x.className=cls;
  return x;
}
function issueList(parent,items,title){
  parent.append(el("h3",title));
  if(!items.length){parent.append(el("p","没有新增项目"));return}
  for(const i of items){
    const box=el("div",undefined,"item");
    box.append(el("strong",i.title));
    if(i.detail)box.append(el("p",i.detail,"edit-info"));
    box.append(el("small",i.code));
    parent.append(box);
  }
}
async function refresh(){
  const bookId=currentId;
  if(!bookId)return;
  area.replaceChildren(el("p","正在检查发布前置条件……"));
  try{
    const report=await service().request("/api/staging/editor/drafts/"+
      encodeURIComponent(bookId)+"/publication-readiness");
    if(currentId!==bookId)return;
    area.replaceChildren();
    area.append(el("h3","《"+report.book.title+"》 · 发布准备报告"));
    area.append(el("p","当前环境："+report.environment+" · "+report.metrics.chapters+
      " 章 · "+report.metrics.distinctWords+" 个目标词","edit-info"));
    area.append(el("p","状态：发布功能未开放。该报告只读，不能上架或撤回内容。","note"));
    const human=report.humanReview.status==="current"?"当前版本的人工审核记录有效":
      report.humanReview.status==="outdated"?"旧人工审核已失效，请重新复核":
      report.humanReview.status==="missing"?"尚未记录人工审核确认":"审核记录表尚未就绪";
    area.append(el("p","人工审核："+human,"status"));
    issueList(area,report.blockers,"当前禁止发布的原因（"+report.blockers.length+"）");
    issueList(area,report.advisories,"内容完善提醒（"+report.advisories.length+"）");
    area.append(el("p","未来正式发布必须另外实现独立的双重确认、权限核验、记录与安全撤回；测试书籍一律不得发布。","edit-info"));
    const retry=el("button","重新评估");
    retry.className="secondary";retry.onclick=refresh;area.append(retry);
  }catch(err){
    if(currentId!==bookId)return;
    area.replaceChildren(el("p","检查失败："+err.message,"note"));
    const again=el("button","重试");
    again.className="secondary";again.onclick=refresh;area.append(again);
  }
}
window.addEventListener("miaowu:draft-preview",event=>{
  if(!event.detail?.book)return;
  currentId=event.detail.book.id;
  area.replaceChildren(el("p","当前草稿：《"+event.detail.book.title+"》。这项检查不会公开或改变任何正文。"));
  const button=el("button","查看上架准备结果");
  button.onclick=refresh;
  area.append(button);
});
})();