// Customer directory with publisher-only explicit voucher revoke/restore actions.
// All displayed values originate from authenticated APIs and use textContent.
export function initCustomerAdmin({api,connected,onChanged=()=>{}}){
 const $=id=>document.getElementById(id);
 const make=(tag,value,cls)=>{
  const el=document.createElement(tag);
  if(value!==undefined)el.textContent=String(value);
  if(cls)el.className=cls;
  return el;
 };
 let mode="codes",page=1,total=0,serial=0;
 let debounce=null;
 const pageSize=10;
 const states={unused:"未兑换",redeemed:"已兑换",revoked:"已作废"};
 function date(value){
  if(!value)return "—";
  const d=new Date(String(value).replace(" ","T")+"Z");
  return Number.isNaN(d.getTime())?String(value):
   d.toLocaleString("zh-CN",{hour12:false});
 }
 function line(label,value){
  return make("p",label+"："+(value==null||value===""?"—":value),"ops-customer-detail");
 }
 function sync(){
  const active=connected();
  for(const id of ["customerTabCodes","customerTabUsers","customerSearch","customerRefresh"])
   $(id).disabled=!active;
  $("customerCategory").disabled=!active||mode!=="codes";
  $("customerCodeStatus").disabled=!active||mode!=="codes";
  $("customerTabCodes").setAttribute("aria-pressed",String(mode==="codes"));
  $("customerTabUsers").setAttribute("aria-pressed",String(mode==="users"));
  $("customerPrev").disabled=!active||page<=1;
  $("customerNext").disabled=!active||page*pageSize>=total;
 }
 function overview(data){
  const root=$("customerOverview");root.replaceChildren();
  for(const [label,value] of [["注册用户",data.users],["已兑换",data.redeemed],
    ["未兑换",data.unused],["已作废",data.revoked]]){
   root.append(make("span",label+" · "+Number(value||0)));
  }
 }
 function shortOrder(value){
  if(!value)return "未关联订单";
  const n=String(value).replace(/^ORD-/,"");
  return n.length<=8?"尾号 "+n.slice(-4):n.slice(0,4)+"••••"+n.slice(-4);
 }
 function copyOrder(value,button){
  const order=String(value||"").replace(/^ORD-/,"");
  if(!order)return;
  const original=button.textContent;
  const copied=()=>{button.textContent="✓ 已复制";button.setAttribute("aria-label","订单号已复制");};
  if(navigator.clipboard?.writeText){
   navigator.clipboard.writeText(order).then(copied,()=>{
    window.prompt("复制下面的订单编号",order);
   });
  }else window.prompt("复制下面的订单编号",order);
  button.title=original;
 }
 function draw(items){
  const root=$("customerList");root.replaceChildren();
  if(!items.length){root.append(make("p","没有找到符合条件的记录。","ops-book-empty"));return;}
  for(const x of items){
   const item=make("details",undefined,"ops-customer-entry ops-record");
   const head=make("summary",undefined,"ops-record-summary");
   const body=make("div",undefined,"ops-record-body");
   const arrow=make("span","⌄","ops-record-chevron");arrow.setAttribute("aria-hidden","true");
   if(mode==="users"){
    head.append(make("strong",x.username,"ops-record-name"));
    head.append(make("span","最近兑换 "+date(x.last_redeemed_at),"ops-record-meta"));
    head.append(make("span",Number(x.redeemed_count||0)+" 次兑换","ops-customer-badge"));
    head.append(arrow);
    body.append(line("已开通套餐",x.packages||"暂无有效权益"));
    body.append(line("注册时间",date(x.created_at)));
    body.append(line("最近兑换",date(x.last_redeemed_at)));
    const show=make("button","查看兑换记录","secondary");
    show.type="button";
    show.addEventListener("click",()=>{
      mode="codes";page=1;
      $("customerSearch").value=x.username;
      $("customerCodeStatus").value="";$("customerCategory").value="";
      void load().catch(displayError);
    });
    body.append(show);
   }else{
    head.append(make("strong",x.category_title||x.category_slug||"未知套餐","ops-record-name"));
    head.append(make("span","订单 "+shortOrder(x.order_reference)+" · "+(x.redeemed_username||"未兑换"),"ops-record-meta"));
    head.append(make("span",states[x.status]||"未知状态",
     "ops-customer-badge"+(x.status==="redeemed"?" is-redeemed":"")));
    head.append(arrow);
    const order=make("div",undefined,"ops-record-order-copy");
    order.append(line("小红书-订单编号",x.order_reference?
      String(x.order_reference).replace(/^ORD-/,""):"未关联订单"));
    if(x.order_reference){
     const copy=make("button","复制订单号","secondary");copy.type="button";
     copy.addEventListener("click",()=>copyOrder(x.order_reference,copy));
     order.append(copy);
    }
    body.append(order);
    body.append(line("兑换账号",x.redeemed_username||"尚未兑换"));
    body.append(line("兑换时间",date(x.redeemed_at)));
    body.append(line("生成时间",date(x.created_at)));
    if(x.status==="redeemed"&&!x.entitlement_active)
     body.append(line("权益提醒","此兑换记录没有对应的有效权益"));
    if(x.status==="revoked")
     body.append(line("权限状态","已作废；此前通过此码获得的套餐权限已停用"));
    const action=x.status==="revoked"?"restore":"revoke";
    const actionLabel=action==="revoke"?"作废此兑换码":"恢复此兑换码";
    const change=make("button",actionLabel,action==="revoke"?"danger":"secondary");
    change.type="button";change.disabled=!connected();
    change.addEventListener("click",()=>void changeVoucher(x,action,change));
    body.append(change);
   }
   item.append(head,body);root.append(item);
  }
 }
 async function changeVoucher(x,action,button){
  if(!connected()||button.disabled)return;
  const revoke=action==="revoke";
  const confirmWord=revoke?"作废":"恢复";
  const order=x.order_reference?String(x.order_reference).replace(/^ORD-/,""):"未关联订单";
  const buyer=x.redeemed_username||"尚未兑换";
  const category=x.category_title||x.category_slug||"未知套餐";
  const implication=revoke?(x.status==="redeemed"?
   "此码已经兑换。作废后，该账号将立即失去此码授予的「"+category+"」付费阅读权限，其他套餐不受影响。":
   "这枚兑换码尚未兑换，作废后将无法再注册或兑换。"):
   "恢复后，若此码已兑换，会恢复对应账号的「"+category+"」阅读权限；未兑换的码可重新使用。";
  if(!window.confirm("请先核对以下信息：\\n小红书-订单编号："+order+
   "\\n购买套餐："+category+"\\n关联账号："+buyer+
   "\\n\\n"+implication+"\\n\\n确认要继续"+confirmWord+"吗？"))return;
  const typed=window.prompt("最后一道安全确认：请输入「"+confirmWord+"」两个字，然后点击确定。","");
  if(typed!==confirmWord){
   $("customerResult").textContent="已取消操作：确认文字不匹配。";return;
  }
  const reason=window.prompt("填写操作原因（至少 12 个字符，将留存不可修改的审计记录）","");
  if(reason===null)return;
  if(reason.trim().length<12||reason.trim().length>200){
   $("customerResult").textContent="操作原因需为 12–200 个字符，本次未提交。";return;
  }
  button.disabled=true;
  try{
   const result=await api("/api/ops/customers/voucher-action","POST",{
    codeId:x.id,action,confirmation:confirmWord,expectedStatus:x.status,
    reason:reason.trim(),requestId:crypto.randomUUID()
   });
   await load();
   $("customerResult").textContent=result.note||"兑换码状态已更新。";
   void onChanged();
  }catch(e){$("customerResult").textContent=e?.message||"操作失败，请刷新记录后重试。";}
  finally{button.disabled=false;}
 }
 function displayError(error){
  if(connected())$("customerResult").textContent=error?.message||"查询失败";
 }
 async function load(){
  if(!connected())return;
  const request=++serial;
  $("customerResult").textContent="正在查询记录…";
  const data=await api("/api/ops/customers/query","POST",{
   mode,page,search:$("customerSearch").value.trim(),
   category:mode==="codes"?$("customerCategory").value:"",
   status:mode==="codes"?$("customerCodeStatus").value:""
  });
  if(!connected()||request!==serial)return;
  total=Number(data.total||0);
  const pages=Math.ceil(total/pageSize);
  if(pages>0&&page>pages){page=pages;return load();}
  overview(data.overview||{});
  draw(data.items||[]);
  $("customerPageInfo").textContent="第 "+(pages?page:0)+" / "+pages+" 页";
  $("customerResult").textContent=(mode==="codes"?"激活记录":"用户列表")+
   " · 查询结果 "+total+" 条，每页最多 "+pageSize+" 条";
  sync();
 }
 function reload(){page=1;void load().catch(displayError);}
 function categories(list){
  const menu=$("customerCategory"),old=menu.value;
  menu.replaceChildren(new Option("全部套餐",""));
  for(const c of list)menu.add(new Option(c.title,c.slug));
  if([...menu.options].some(x=>x.value===old))menu.value=old;
  sync();
 }
 function reset(){
  serial++;clearTimeout(debounce);
  mode="codes";page=1;total=0;
  $("customerSearch").value="";$("customerCategory").value="";
  $("customerCodeStatus").value="";
  $("customerResult").textContent="请先验证运营身份。";
  $("customerOverview").replaceChildren();
  $("customerList").replaceChildren(make("p","验证后显示真实记录。","soft"));
  $("customerPageInfo").textContent="第 0 / 0 页";
  sync();
 }
 async function click(fn){
  try{await fn();}catch(e){displayError(e);}
 }
 $("customerTabCodes").addEventListener("click",()=>click(async()=>{
  mode="codes";page=1;await load();
 }));
 $("customerTabUsers").addEventListener("click",()=>click(async()=>{
  mode="users";page=1;await load();
 }));
 $("customerRefresh").addEventListener("click",()=>click(load));
 $("customerPrev").addEventListener("click",()=>click(async()=>{
  if(page>1){page--;await load();}
 }));
 $("customerNext").addEventListener("click",()=>click(async()=>{
  if(page*pageSize<total){page++;await load();}
 }));
 $("customerSearch").addEventListener("input",()=>{
  clearTimeout(debounce);debounce=setTimeout(reload,300);
 });
 for(const id of ["customerCategory","customerCodeStatus"])
  $(id).addEventListener("change",reload);
 reset();
 return {refresh:load,categories,reset};
}
