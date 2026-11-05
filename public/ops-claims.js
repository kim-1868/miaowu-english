export function initClaimsAdmin({api,connected}){
 const $=id=>document.getElementById(id);
 const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text||"";return e};
 let page=1,total=0,serial=0;
 function reset(){
  serial++;page=1;total=0;
  $("claimsList").replaceChildren();
  $("claimsStatus").textContent="请验证身份后查询。";
 }
 async function action(row,kind){
  const note=prompt("请填写操作原因（至少8字）");
  if(note===null)return;
  if(note.trim().length<8){$("claimsStatus").textContent="原因至少8字";return}
  if(!confirm("确认对小红书-订单编号 "+row.order_reference.replace(/^ORD-/,"")+" 执行 "+kind+"？"))return;
  try{
   await api("/api/ops/claims/action","POST",{
    claimId:row.id,action:kind,reason:note.trim(),requestId:crypto.randomUUID()
   });
   await load();
  }catch(e){$("claimsStatus").textContent=e.message;}
 }
 async function load(){
  if(!connected())return;
  const current=++serial;
  const data=await api("/api/ops/claims/query","POST",{
   page,search:$("claimsSearch").value.trim(),reviewStatus:$("claimsReviewFilter").value
  });
  if(current!==serial)return;
  total=data.total||0;
  $("claimsOverview").textContent="总计 "+(data.overview?.all||0)+" 笔 · 待核对 "+
   (data.overview?.pending||0)+" · 已确认 "+(data.overview?.verified||0)+
   " · 异常 "+(data.overview?.abnormal||0);
  const root=$("claimsList");root.replaceChildren();
  for(const row of data.items||[]){
   const card=el("article");card.className="ops-customer-entry";
   const title=el("strong",row.category_title+" · 小红书-订单编号："+row.order_reference.replace(/^ORD-/,""));
   const detail=el("p","兑换："+row.code_status+" · 账号："+(row.username||"未兑换")+
    " · 对账："+row.review_status+" · 领取："+row.claimed_at);
   card.append(title,detail);
   const actions=el("div");actions.className="ops-claim-actions";
   for(const [name,label] of row.code_status==="revoked"?
    [["restore","恢复本单权益"]]:
    [["verify","核实通过"],["flag","标记异常"],["revoke","撤销本单权益"]]){
    if(name==="verify"&&row.review_status==="verified")continue;
    if(name==="flag"&&row.review_status==="abnormal")continue;
    const btn=el("button",label);btn.type="button";
    btn.className=name==="revoke"?"danger":"secondary";
    btn.addEventListener("click",()=>void action(row,name));actions.append(btn);
   }
   card.append(actions);root.append(card);
  }
  if(!total)root.append(el("p","暂无符合条件的订单。"));
  const pages=Math.ceil(total/20);
  $("claimsPageInfo").textContent="第 "+(pages?page:0)+" / "+pages+" 页";
  $("claimsPrev").disabled=page<=1;$("claimsNext").disabled=page*20>=total;
  $("claimsStatus").textContent="已加载 "+total+" 笔记录。";
 }
 function refresh(){page=1;void load().catch(e=>$("claimsStatus").textContent=e.message);}
 $("claimsRefresh").addEventListener("click",refresh);
 $("claimsReviewFilter").addEventListener("change",refresh);
 let task;
 $("claimsSearch").addEventListener("input",()=>{
  clearTimeout(task);task=setTimeout(refresh,250);
 });
 $("claimsPrev").addEventListener("click",()=>{if(page>1){page--;void load();}});
 $("claimsNext").addEventListener("click",()=>{if(page*20<total){page++;void load();}});
 reset();return {refresh:load,reset};
}
