// Read-only operator customer directory; credentials stay inside ops-console.js.
// All displayed values originate from authenticated APIs and use textContent.
export function initCustomerAdmin({api,connected}){
 const $=id=>document.getElementById(id);
 const make=(tag,value,cls)=>{
  const el=document.createElement(tag);
  if(value!==undefined)el.textContent=String(value);
  if(cls)el.className=cls;
  return el;
 };
 let mode="codes",page=1,total=0,serial=0;
 let debounce=null;
 const pageSize=20;
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
 function draw(items){
  const root=$("customerList");root.replaceChildren();
  if(!items.length){root.append(make("p","没有找到符合条件的记录。","ops-book-empty"));return;}
  for(const x of items){
   const item=make("article",undefined,"ops-customer-entry");
   const head=make("div",undefined,"ops-customer-entry-header");
   if(mode==="users"){
    head.append(make("strong",x.username));
    head.append(make("span",Number(x.redeemed_count||0)+" 次兑换","ops-customer-badge"));
    item.append(head);
    item.append(line("已开通套餐",x.packages||"暂无有效权益"));
    item.append(line("注册时间",date(x.created_at)));
    item.append(line("最近兑换",date(x.last_redeemed_at)));
    const show=make("button","查看兑换记录","secondary");
    show.type="button";
    show.addEventListener("click",()=>{
      mode="codes";page=1;
      $("customerSearch").value=x.username;
      $("customerCodeStatus").value="";$("customerCategory").value="";
      void load().catch(displayError);
    });
    item.append(show);
   }else{
    head.append(make("strong",x.category_title||x.category_slug||"未知套餐"));
    head.append(make("span",states[x.status]||"未知状态",
     "ops-customer-badge"+(x.status==="redeemed"?" is-redeemed":"")));
    item.append(head);
    item.append(line("订单号",x.order_reference?
      String(x.order_reference).replace(/^ORD-/,""):"未关联订单"));
    item.append(line("兑换账号",x.redeemed_username||"尚未兑换"));
    item.append(line("兑换时间",date(x.redeemed_at)));
    item.append(line("生成时间",date(x.created_at)));
    if(x.status==="redeemed"&&!x.entitlement_active)
     item.append(line("权益提醒","此兑换记录没有对应的有效权益"));
   }
   root.append(item);
  }
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
