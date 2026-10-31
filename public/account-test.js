(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  let lastCode = "";
  const errorLabels={
    INVALID_CREDENTIALS:"用户名或密码不正确。",
    INVALID_USERNAME_OR_PASSWORD:"用户名或密码不符合规则。",
    INVALID_ACTIVATION:"激活码格式不正确。",
    INVALID_ACTIVATION_OR_USERNAME:"激活码无效/已被使用，或用户名已被占用。",
    INVALID_OR_ALREADY_OWNED:"激活码已兑换、无效，或该分类已开通。",
    LOGIN_REQUIRED:"请先登录测试账号。",
    TOO_MANY_ATTEMPTS:"尝试次数较多，请15分钟后重试。",
    STAGING_VOUCHER_LIMIT_REACHED:"测试激活码已达到20枚上限。",
    SERVICE_NOT_CONFIGURED:"后台配置尚未完成。",
    INVALID_ORIGIN:"请求来源验证失败，请刷新后重试。",
    INTERNAL_ERROR:"服务端暂时出错，请检查测试数据库和部署日志。"
  };
  function feedback(text, bad=false){
    const node=$('feedback');node.textContent=text;
    node.style.borderLeft=bad?"4px solid #b74e56":"4px solid #6b8b66";
  }
  async function api(path, method="GET", payload){
    const init={method,credentials:"same-origin",cache:"no-store",headers:{"accept":"application/json"}};
    if(payload!==undefined){init.headers["content-type"]="application/json";init.body=JSON.stringify(payload)}
    const response=await fetch(path,init);
    let data;try{data=await response.json()}catch{throw new Error("接口没有返回 JSON（HTTP "+response.status+"）")}
    if(!response.ok) {
      const label = errorLabels[data.error] || data.message || ("接口返回 HTTP " + response.status);
      const stage = typeof data.diagnosticStage === "string" ? "（诊断阶段：" + data.diagnosticStage + "）" : "";
      throw new Error(label + stage);
    }
    return data;
  }
  async function busy(button, job){
    button.disabled=true;
    try{await job()}catch(e){feedback(e.message||"网络请求失败",true)}
    finally{button.disabled=false}
  }
  async function me(){
    try{
      const data=await api("/api/auth/me");
      $('state').textContent="已登录用户："+data.user.username+"\n已开通分类："+(data.categories.map(c=>c.title).join("、")||"无");
    }catch(e){$('state').textContent=e.message.includes("登录")?"当前没有登录账号。":"当前没有登录账号，或服务端尚未准备好。"+e.message}
  }
  $('refresh').onclick=()=>busy($('refresh'),me);
  $('createCode').onclick=()=>busy($('createCode'),async()=>{
    const data=await api("/api/staging/test-voucher","POST",{category:$('category').value});
    lastCode=data.activationCode;
    $('codeOutput').textContent=lastCode;
    $('copyCode').disabled=false;
    feedback("生成成功：这是一枚仅限 D1 测试库的一次性激活码。");
  });
  $('copyCode').onclick=()=>busy($('copyCode'),async()=>{
    if(!lastCode)return;
    await navigator.clipboard.writeText(lastCode);
    feedback("测试码已复制，可粘贴到注册或增购表单。");
  });
  $('registerForm').onsubmit=e=>{
    e.preventDefault();
    const btn=e.currentTarget.querySelector('button[type=submit]');
    busy(btn,async()=>{
      const result=await api("/api/auth/register","POST",{
        username:$('registerName').value.trim(),password:$('registerPass').value,
        activationCode:$('registerCode').value.trim()
      });
      $('registerPass').value="";
      feedback("注册并激活成功！"+result.user.username+"；已开通："+result.categories.map(x=>x.title).join("、"));
      await me();
    });
  };
  $('loginForm').onsubmit=e=>{
    e.preventDefault();const btn=e.currentTarget.querySelector('button[type=submit]');
    busy(btn,async()=>{
      const result=await api("/api/auth/login","POST",{username:$('loginName').value.trim(),password:$('loginPass').value});
      $('loginPass').value="";
      feedback("登录成功："+result.user.username);
      await me();
    });
  };
  $('redeemForm').onsubmit=e=>{
    e.preventDefault();const btn=e.currentTarget.querySelector('button[type=submit]');
    busy(btn,async()=>{
      const result=await api("/api/activate","POST",{activationCode:$('redeemCode').value.trim()});
      feedback("兑换成功，目前拥有："+result.categories.map(x=>x.title).join("、"));
      $('redeemCode').value="";
      await me();
    });
  };
  $('logout').onclick=()=>busy($('logout'),async()=>{
    await api("/api/auth/logout","POST",{});
    feedback("已退出账号，服务端会话已撤销。");
    await me();
  });
  me();
})();