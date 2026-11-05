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
  const statuses={pending:"待核对",verified:"已确认",abnormal:"异常"};
  const shortOrder=value=>{
   const n=String(value||"").replace(/^ORD-/,"");
   return n.length<=8?"尾号 "+n.slice(-4):n.slice(0,4)+"••••"+n.slice(-4);
  };
  for(const row of data.items||[]){
   const card=el("details");card.className="ops-customer-entry ops-record";
   const summary=el("summary");summary.className="ops-record-summary";
   const title=el("strong",row.category_title||row.category_slug||"未知套餐");
   title.className="ops-record-name";
   const reference=el("span","订单 "+shortOrder(row.order_reference)+" · "+(row.username||"未兑换"));
   reference.className="ops-record-meta";
   const status=el("span",statuses[row.review_status]||"未知状态");
   status.className="ops-customer-badge"+(row.review_status==="verified"?" is-redeemed":"");
   const arrow=el("span","⌄");arrow.className="ops-record-chevron";
   arrow.setAttribute("aria-hidden","true");
   summary.append(title,reference,status,arrow);
   const body=el("div");body.className="ops-record-body";
   const orderBox=el("div");orderBox.className="ops-record-order-copy";
   const orderText=el("p","小红书-订单编号："+String(row.order_reference||"").replace(/^ORD-/,""));
   orderText.className="ops-customer-detail";orderBox.append(orderText);
   if(row.order_reference){
    const copy=el("button","复制订单号");copy.type="button";copy.className="secondary";
    copy.addEventListener("click",()=>{
     const value=String(row.order_reference).replace(/^ORD-/,"");
     if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(value).then(()=>{copy.textContent="✓ 已复制";},
       ()=>window.prompt("复制下面的订单编号",value));
     }else window.prompt("复制下面的订单编号",value);
    });
    orderBox.append(copy);
   }
   body.append(orderBox);
   const detail=el("p","兑换："+row.code_status+" · 账号："+(row.username||"未兑换")+
    " · 对账："+row.review_status+" · 领取："+row.claimed_at);
   detail.className="ops-customer-detail";body.append(detail);
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
   body.append(actions);card.append(summary,body);root.append(card);
  }
  if(!total)root.append(el("p","暂无符合条件的订单。"));
  const pages=Math.ceil(total/10);
  $("claimsPageInfo").textContent="第 "+(pages?page:0)+" / "+pages+" 页";
  $("claimsPrev").disabled=page<=1;$("claimsNext").disabled=page*10>=total;
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
 $("claimsNext").addEventListener("click",()=>{if(page*10<total){page++;void load();}});
 reset();return {refresh:load,reset};
}
