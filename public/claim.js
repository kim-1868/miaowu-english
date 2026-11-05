(()=>{
"use strict";
const $=id=>document.getElementById(id);
let ready=false,claimed=false;
const messages={
 INVALID_CLAIM_INPUT:"订单编号格式或套餐选择不正确，请核对后再提交。",
 ORDER_ALREADY_CLAIMED:"这个订单编号已有发码记录，请不要重复领取。若遗失兑换码，请联系小红书店铺客服。",
 ORDER_ALREADY_CLAIMED_OR_UNAVAILABLE:"该订单已领取，或当前无法发码。请联系店铺客服确认。",
 PACKAGE_UNAVAILABLE:"该学习套餐暂未开放领取，请选择已上架商品。",
 CLAIM_LIMIT_REACHED:"领取人数或领取频率达到临时上限，请稍后联系店铺客服。",
 TOO_MANY_ATTEMPTS:"提交次数过多，请稍后再试。",
 CLAIM_CLOSED:"领取中心暂未开放，请稍后再试。",
 CLAIM_UNAVAILABLE:"领取服务暂时不可用，请稍后重试。"
};
function feedback(message,error=false){
 $("status").textContent=message;
 $("status").classList.toggle("error",error);
}
async function api(path,options={}){
 let response;
 try{response=await fetch(path,{credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",...options});}
 catch{throw Error("无法连接妙屋服务器，请检查网络后重试。")}
 let payload;
 try{payload=await response.json();}catch{throw Error("服务器返回异常，请稍后再试。")}
 if(!response.ok)throw Error(messages[payload.error]||"请求未成功，请稍后重试。");
 return payload;
}
async function getProducts(){
 try{
  const data=await api("/api/claim/categories");
  const select=$("package");
  select.replaceChildren(new Option("请选择你购买的套餐",""));
  for(const item of data.categories||[])select.add(new Option(item.title,item.slug));
  ready=data.enabled&&select.options.length>1;
  select.disabled=!ready;
  $("submit").disabled=!ready;
  feedback(ready?"领取成功后请立即保存，激活码不能重复显示。":"当前没有开放的自助领取商品，请联系店铺客服。",!ready);
 }catch(e){feedback(e.message,true);}
}
$("claimForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!ready||claimed)return;
 const order=$("order").value.normalize("NFKC").trim();
 const category=$("package").value;
 if(!/^[A-Za-z0-9_-]{10,60}$/.test(order)||!/[0-9]/.test(order)||!category){
  feedback("请填写完整订单编号，并选择购买的学习套餐。",true);return;
 }
 const submit=$("submit");submit.disabled=true;feedback("正在生成专属兑换码，请勿重复点击。");
 try{
  const data=await api("/api/claim/issue",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({orderReference:order,categoryId:category})
  });
  claimed=true;ready=false;
  $("packageName").textContent=data.category.title;
  $("voucher").textContent=data.activationCode;
  $("recovery").textContent=data.recoveryKey;
  $("claimForm").hidden=true;$("receipt").hidden=false;
  feedback("兑换码已生成。请先保存两份凭证，再前往妙屋网站注册。");
  $("receipt").scrollIntoView({block:"start",behavior:"smooth"});
 }catch(error){submit.disabled=false;feedback(error.message,true);}
});
async function copy(id){
 const field=$(id),value=field.textContent.trim();
 if(!value)return;
 try{await navigator.clipboard.writeText(value);feedback("已复制，请妥善保存。");}
 catch{feedback("复制受浏览器限制，请长按下方文字手动复制。",true);field.focus?.();}
}
$("copyVoucher").addEventListener("click",()=>copy("voucher"));
$("copyRecovery").addEventListener("click",()=>copy("recovery"));
window.addEventListener("pagehide",()=>{
 $("voucher").textContent="";$("recovery").textContent="";
});
void getProducts();
})();