(()=>{
"use strict";
const $=id=>document.getElementById(id);
let ready=false,claimed=false,submitting=false;
const RECEIPT_KEY="mw:claim:receipt:v36";
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
 try{payload=await response.json();}
 catch{throw Error("服务器返回异常，请稍后再试。")}
 if(!response.ok)throw Error(messages[payload.error]||"请求未成功，请稍后重试。");
 return payload;
}
// Preserve the one-time-issued receipt in this browser TAB; never reissue on refresh.
function showReceipt(data,save=true){
 if(!data||typeof data.categoryTitle!=="string"||
    typeof data.activationCode!=="string"||!data.activationCode.startsWith("MW-")||
    typeof data.recoveryKey!=="string"||!data.recoveryKey.startsWith("MW-REC-"))
   throw Error("领取结果不完整，请联系店铺客服，不要重新提交订单编号。");
 $("packageName").textContent=data.categoryTitle;
 $("voucher").textContent=data.activationCode;
 $("recovery").textContent=data.recoveryKey;
 $("claimForm").hidden=true;$("claimIntro").hidden=true;
 $("receipt").hidden=false;claimed=true;ready=false;
 if(save){
  try{window.sessionStorage?.setItem(RECEIPT_KEY,JSON.stringify(data));}catch{}
  $("receipt").scrollIntoView({block:"start",behavior:"smooth"});
 }
 feedback("领取成功！请分别保存学习兑换码与账号找回备用凭证。");
}
function restoreReceipt(){
 try{
  const raw=window.sessionStorage?.getItem(RECEIPT_KEY);
  if(!raw)return false;
  const data=JSON.parse(raw);
  if(typeof data?.categoryTitle!=="string"||data.categoryTitle.length>80||
     !/^MW-[A-Z0-9-]{20,100}$/.test(data.activationCode||"")||
     !/^MW-REC-[A-Z0-9-]{20,100}$/.test(data.recoveryKey||""))return false;
  showReceipt(data,false);return true;
 }catch{return false}
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
  feedback(ready?"请核对小红书-订单编号和套餐，领取成功后记得保存兑换码。":
    "当前没有开放的自助领取商品，请联系店铺客服。",!ready);
 }catch(e){feedback(e.message,true);}
}
$("claimForm").addEventListener("submit",async event=>{
 event.preventDefault();
 if(!ready||claimed||submitting)return;
 const order=$("order").value.normalize("NFKC").trim();
 const category=$("package").value;
 if(!/^[A-Za-z0-9_-]{10,60}$/.test(order)||!/[0-9]/.test(order)||!category){
  feedback("请填写完整订单编号，并选择购买的学习套餐。",true);return;
 }
 submitting=true;
 const submit=$("submit");submit.disabled=true;
 feedback("正在生成专属学习兑换码，请勿重复点击。");
 try{
  const data=await api("/api/claim/issue",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({orderReference:order,categoryId:category})
  });
  showReceipt({categoryTitle:data.category?.title,
   activationCode:data.activationCode,recoveryKey:data.recoveryKey});
 }catch(error){submit.disabled=false;feedback(error.message,true);}
 finally{submitting=false;}
});
function fallbackCopy(value){
 const field=document.createElement("textarea");
 field.value=value;
 field.setAttribute("readonly","");
 field.style.position="fixed";
 field.style.top="-1000px";
 field.style.opacity="0";
 document.body.append(field);
 field.focus();field.select();field.setSelectionRange(0,value.length);
 let copied=false;
 try{copied=document.execCommand("copy");}catch{}
 field.remove();
 return copied;
}
function selectForManualCopy(id){
 const node=$(id);
 try{
  const range=document.createRange();range.selectNodeContents(node);
  const selected=window.getSelection();selected.removeAllRanges();selected.addRange(range);
 }catch{}
}
async function copySingle(id){
 const value=$(id).textContent.trim();
 if(!value)return;
 const isVoucher=id==="voucher";
 let copied=false;
 try{
  if(navigator.clipboard?.writeText){
   await navigator.clipboard.writeText(value);
   copied=true;
  }
 }catch{}
 if(!copied)copied=fallbackCopy(value);
 if(copied){
  if(isVoucher){
   $("copyVoucher").textContent="✓ 已复制！现在可以前往妙屋英语";
   $("copyVoucher").classList.add("is-copied");
   $("copyVoucherHint").textContent="复制成功！只复制了学习兑换码。点击下方「前往妙屋英语」，注册时粘贴到兑换码输入框即可。";
   feedback("已复制学习兑换码，可以前往妙屋英语注册激活。");
  }else{
   $("copyRecovery").textContent="✓ 已复制备用凭证";
   $("copyRecoveryHint").textContent="备用凭证已复制。它仅用于忘记密码时辅助找回账号，请单独保存，不要粘贴到学习兑换框。";
  }
 }else{
  selectForManualCopy(id);
  if(isVoucher){
   $("copyVoucherHint").textContent="当前浏览器限制了自动复制。请长按上方学习兑换码，选择「复制」并保存。不要复制其他文字。";
  }else{
   $("copyRecoveryHint").textContent="当前浏览器限制了自动复制，请长按上方备用凭证手动复制并单独保存。";
  }
  feedback("浏览器未允许自动复制，请长按凭证手动复制。",true);
 }
}
$("copyVoucher").addEventListener("click",()=>copySingle("voucher"));
$("copyRecovery").addEventListener("click",()=>copySingle("recovery"));
// Copying or navigating MUST NOT erase the unredeemed claim result.
if(!restoreReceipt())void getProducts();
})();