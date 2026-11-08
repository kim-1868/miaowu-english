// PUBLIC-11-02: read-only shelf pagination presentation extracted from private app.js.
// Only the private adapter owns book queries, category permissions and page state.
(function(root){
"use strict";
const asCount = (value, fallback=0) => {
  const n=Number(value);
  return Number.isFinite(n) && n>0 ? Math.floor(n) : fallback;
};
function create({document:doc=root.document}={}) {
  if(!doc || typeof doc.createElement!=="function")throw Error("SHELF_DOCUMENT_REQUIRED");
  function build({meta={},currentPage=1,pageSize=9,onPageChange}={}) {
    const totalPages=asCount(meta.totalPages), total=asCount(meta.total);
    const size=asCount(pageSize,9);
    if(totalPages<=1)return null;
    const page=Math.min(totalPages,Math.max(1,asCount(currentPage,1)));
    const nav=doc.createElement("nav");
    nav.className="shelf-pagination";
    nav.setAttribute("aria-label","小说书架分页");
    const info=doc.createElement("span");
    info.className="shelf-page-summary";
    info.textContent="共 "+total+" 本 · 每页 "+size+" 本";
    const controls=doc.createElement("div");
    controls.className="shelf-page-controls";
    function addButton(label,next,{current=false,disabled=false,ariaLabel=""}={}){
      const button=doc.createElement("button");
      button.type="button";
      button.className="shelf-page-button"+(current?" is-current":"");
      button.textContent=label;
      button.disabled=disabled||current;
      if(ariaLabel)button.setAttribute("aria-label",ariaLabel);
      if(current)button.setAttribute("aria-current","page");
      button.addEventListener("click",()=>{
        if(button.disabled||next<1||next>totalPages||next===page)return;
        if(typeof onPageChange==="function")onPageChange(next);
      });
      controls.append(button);
    }
    addButton("上一页",page-1,{disabled:page<=1,ariaLabel:"上一页小说"});
    const visible=[...new Set([1,totalPages,page-1,page,page+1].filter(p=>p>=1&&p<=totalPages))].sort((a,b)=>a-b);
    visible.forEach((p,i)=>{
      if(i&&p-visible[i-1]>1){
        const ellipsis=doc.createElement("span");
        ellipsis.className="shelf-page-ellipsis";
        ellipsis.textContent="…";
        ellipsis.setAttribute("aria-hidden","true");
        controls.append(ellipsis);
      }
      addButton(String(p),p,{current:p===page,ariaLabel:"第 "+p+" 页"});
    });
    addButton("下一页",page+1,{disabled:page>=totalPages,ariaLabel:"下一页小说"});
    nav.append(info,controls);
    return nav;
  }
  function render({container,...options}={}){
    if(!container||typeof container.append!=="function")throw Error("SHELF_CONTAINER_REQUIRED");
    const old=typeof container.querySelector==="function"?
      container.querySelector(":scope > .shelf-pagination"):null;
    old?.remove?.();
    const nav=build(options);
    if(nav)container.append(nav);
    return nav;
  }
  return Object.freeze({build,render});
}
root.MiaowuShelfPagination=Object.freeze({create});
})(window);
