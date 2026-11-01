// S67: LOCAL-FILE ONLY. Never fetch, persist to browser storage or POST manuscript.
// User explicitly exports JSON to keep progress; reload starts from PENDING otherwise.
(function(){
 "use strict";
 const dataNode=document.getElementById("human-ledger-data");
 if(!dataNode)return;
 const base=JSON.parse(dataNode.textContent);
 const immutable=["id","kind","sourceHash","chapter","headword","preview"];
 const decisionValues=["PENDING","REVIEWED_OK","CHANGES_REQUESTED"];
 const root=document.getElementById("review-workbench");
 const count=document.getElementById("human-review-count");
 const editor=document.getElementById("human-review-editor");
 const itemTitle=document.getElementById("human-review-item");
 const status=document.getElementById("human-review-message");
 const decision=document.getElementById("human-review-decision");
 const reviewer=document.getElementById("human-review-reviewer");
 const note=document.getElementById("human-review-note");
 const evidence=document.getElementById("human-review-evidence");
 let rows=base.rows.map(x=>({...x})),active=null;
 const byId=new Map(rows.map((r,i)=>[r.id,i]));
 const setMessage=(value,error=false)=>{
  status.textContent=value;
  status.setAttribute("data-error",error?"yes":"no");
 };
 const updateCounts=()=>{
  const ok=rows.filter(x=>x.decision==="REVIEWED_OK").length;
  const fix=rows.filter(x=>x.decision==="CHANGES_REQUESTED").length;
  count.textContent="已标记复核 "+ok+" 项 · 待返工 "+fix+" 项 · 未处理 "+
   (rows.length-ok-fix)+" 项 / "+rows.length+" 项。仅供人工进度记录，不代表作品获准发布。";
  for(const el of root.ownerDocument.querySelectorAll("[data-human-review-button]")){
   const item=rows[byId.get(el.getAttribute("data-human-review-button"))];
   el.textContent=item.decision==="PENDING"?"填写此条审核":item.decision==="REVIEWED_OK"?"已复核 · 修改记录":"待返工 · 修改记录";
  }
 };
 const openItem=id=>{
  const index=byId.get(id);
  if(index===undefined)return;
  active=index;
  const r=rows[index];
  itemTitle.textContent=r.kind+" · "+r.headword+" · "+id;
  decision.value=r.decision;
  reviewer.value=r.reviewer;
  note.value=r.note;
  evidence.value=r.evidenceRef;
  editor.hidden=false;
  editor.scrollIntoView({behavior:"auto",block:"nearest"});
  setMessage("当前选择 "+id+"。修改前请先阅读对应原文及来源候选。");
 };
 const entryPanels={
  word:Array.from(document.querySelectorAll('[data-kind="word"]')),
  context:Array.from(document.querySelectorAll('[data-kind="context"]')),
  echo:Array.from(document.querySelectorAll('[data-kind="echo"]'))
 };
 for(const kind of Object.keys(entryPanels)){
  const sources=base.rows.filter(r=>r.kind===kind);
  const cards=entryPanels[kind];
  if(sources.length!==cards.length)throw Error("EDITOR_SOURCE_CARD_COUNT_MISMATCH_"+kind);
  cards.forEach((el,i)=>{
   const btn=document.createElement("button");
   btn.type="button";
   btn.className="human-review-trigger";
   btn.setAttribute("data-human-review-button",sources[i].id);
   btn.textContent="填写此条审核";
   btn.addEventListener("click",()=>openItem(sources[i].id));
   el.appendChild(btn);
  });
 }
 document.getElementById("human-review-save").addEventListener("click",()=>{
  if(active===null){setMessage("请先选择一项内容。",true);return}
  const next=decision.value,who=reviewer.value.trim(),
   why=note.value.trim(),ref=evidence.value.trim();
  if(!decisionValues.includes(next)){setMessage("选择的状态无效。",true);return}
  if(next!=="PENDING"&&(who.length<3||why.length<12||ref.length<3)){
   setMessage("非待审状态必须填写审稿人标识、至少12个字符的具体审稿说明及可追溯的证据编号。",true);
   return;
  }
  const r=rows[active];
  r.decision=next;
  r.reviewer=next==="PENDING"?"":who;
  r.note=next==="PENDING"?"":why;
  r.evidenceRef=next==="PENDING"?"":ref;
  r.reviewedAt=next==="PENDING"?"":new Date().toISOString();
  updateCounts();
  setMessage("已记录到当前浏览器内存。要保留进度，请立即使用“导出审核记录”；本页不会自动保存到网站或浏览器存储。");
 });
 const verifyImported=payload=>{
  if(!payload||typeof payload!=="object"||Array.isArray(payload)||
    payload.schemaVersion!==base.schemaVersion||payload.bookId!==base.bookId||
    payload.manuscriptDigest!==base.manuscriptDigest||
    !Array.isArray(payload.rows)||payload.rows.length!==base.rows.length)
    throw Error("来源版本不同或审核记录数量不符；拒绝导入。");
  const seen=new Set();
  const newRows=[];
  for(const item of payload.rows){
   if(!item||typeof item!=="object"||Array.isArray(item)||
    typeof item.id!=="string"||seen.has(item.id))
     throw Error("记录格式错误或存在重复ID；拒绝导入。");
   seen.add(item.id);
   const source=base.rows[byId.get(item.id)];
   if(!source)throw Error("记录含未知ID；拒绝导入。");
   if(Object.keys(item).sort().join("|")!==Object.keys(source).sort().join("|"))
    throw Error("记录字段被修改；拒绝导入。");
   if(immutable.some(key=>item[key]!==source[key]))
    throw Error("正文指纹或来源字段已变化；拒绝导入。");
   if(!decisionValues.includes(item.decision)||
    !["reviewer","reviewedAt","note","evidenceRef"].every(k=>
      typeof item[k]==="string"&&item[k].length<=1800))
    throw Error("记录包含无法识别的审核状态或字段；拒绝导入。");
   if(item.decision==="PENDING"){
    if(item.reviewer||item.reviewedAt||item.note||item.evidenceRef)
     throw Error("待审项目不能携带审核签名。");
   }else{
    if(item.reviewer.trim().length<3||item.note.trim().length<12||
       item.evidenceRef.trim().length<3||!Number.isFinite(Date.parse(item.reviewedAt))||
       !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(item.reviewedAt))
     throw Error("发现没有审稿身份、说明或时间的审核记录；拒绝导入。");
   }
   newRows.push({...item});
  }
  return base.rows.map(source=>newRows.find(item=>item.id===source.id));
 };
 document.getElementById("human-review-import").addEventListener("change",async event=>{
  const input=event.currentTarget,selection=input.files&&input.files[0];
  if(!selection)return;
  try{
   if(selection.size>5_000_000)throw Error("文件超过5MB，不应是本工具的记录格式。");
   const raw=await selection.text();
   const payload=JSON.parse(raw);
   const imported=verifyImported(payload);
   rows=imported;
   if(active!==null){active=null;editor.hidden=true;}
   updateCounts();
   setMessage("已导入匹配当前原稿的审核记录。继续编辑后记得重新导出；上线审核仍需要另行核实。");
  }catch(err){
   setMessage("导入失败："+String(err.message||err),true);
  }finally{input.value="";}
 });
 document.getElementById("human-review-export").addEventListener("click",()=>{
  const snapshot={...base,rows};
  const blob=new Blob([JSON.stringify(snapshot,null,2)+"\n"],
   {type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download="rainy-night-s1-HUMAN-REVIEW-LEDGER.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  setMessage("已向浏览器请求导出JSON文件。请保存到可信的本地位置，并用仓库命令 --validate-private 复核。");
 });
 updateCounts();
 setMessage("审校进度默认全部待审；选择下方词卡、正文或练习题的“填写此条审核”开始。");
})();
