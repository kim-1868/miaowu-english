// V1.1 onboarding is server-authorized and per-account. No local completion flag.
(()=>{
  "use strict";
  const root=document.getElementById("mwWelcomeDialog");
  const clue=document.getElementById("mwWordHint");
  if(!root||!clue)return;
  const cards=[
    {title:"欢迎来到妙屋英语！",text:"把英语单词藏进中文故事里，边追剧情边学英语。",mark:"🐈"},
    {title:"遇到英文单词，点一点。",text:"查看词义、音标和发音，喜欢的单词可以加入生词本。",mark:"📖"},
    {title:"喜欢的故事，随时回来读。",text:"收藏小说、记录阅读进度，再用生词本和剧情回声复习。",mark:"✧"}
  ];
  let index=0,eligible=false,pending=false,wordTipPending=false,bookmarkTipPending=false,session=0,busy=false;
  const request=async(method="GET",data)=>{
    const options={method,credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json"}};
    if(data!==undefined){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(data)}
    const response=await fetch("/api/me/onboarding",options);
    if(!response.ok)throw Error("ONBOARDING_UNAVAILABLE");
    return response.json();
  };
  function draw(){
    const card=cards[index];
    document.getElementById("mwWelcomePosition").textContent=(index+1)+" / "+cards.length;
    document.getElementById("mwWelcomeMark").textContent=card.mark;
    document.getElementById("mwWelcomeTitle").textContent=card.title;
    document.getElementById("mwWelcomeBody").textContent=card.text;
    document.getElementById("mwWelcomeBack").disabled=index===0||busy;
    document.getElementById("mwWelcomeNext").textContent=index===cards.length-1?
      (root.dataset.unlocked==="true"?"开始探索":"去兑换激活码"):"下一步";
    document.getElementById("mwWelcomeNext").disabled=busy;
    document.getElementById("mwWelcomeInstall").hidden=index!==cards.length-1||!window.MiaowuInstallGuide?.open;
    document.getElementById("mwWelcomeSkip").disabled=busy;
  }
  function hide(){if(!root.open)return; if(typeof root.close==="function")root.close();else root.removeAttribute("open")}
  function show(){
    if(root.open)return;
    index=0;busy=false;
    document.getElementById("mwWelcomeError").hidden=true;
    draw();
    if(typeof root.showModal==="function")root.showModal();else root.setAttribute("open","");
  }
  async function complete(kind,showInstall=false){
    if(busy)return;
    busy=true;
    document.getElementById("mwWelcomeError").hidden=true;
    draw();
    try{
      await request("PUT",{complete:kind});
      pending=false;hide();
      if(showInstall)window.MiaowuInstallGuide?.open();
      else if(kind==="finished"&&index===cards.length-1){
        if(root.dataset.unlocked==="true")window.MiaowuOnboardingNavigate?.("library");
        else window.MiaowuOnboardingRedeem?.();
      }
    }catch{
      document.getElementById("mwWelcomeError").hidden=false;
    }finally{busy=false;draw()}
  }
  document.getElementById("mwWelcomeBack").addEventListener("click",()=>{if(index>0){index--;draw()}});
  document.getElementById("mwWelcomeNext").addEventListener("click",()=>{if(index<cards.length-1){index++;draw()}else void complete("finished")});
  document.getElementById("mwWelcomeSkip").addEventListener("click",()=>void complete("skipped"));
  document.getElementById("mwWelcomeInstall").addEventListener("click",()=>void complete("finished",true));
  // Prevent bypass via Escape/backdrop while a completion write is pending.
  root.addEventListener("cancel",e=>{if(pending){e.preventDefault();void complete("skipped")}});
  async function sync(isSignedIn,unlocked){
    const current=++session;
    hide();clue.dataset.open="false";
    eligible=false;pending=false;wordTipPending=false;bookmarkTipPending=false;
    if(!isSignedIn)return;
    try{
      const data=await request();
      if(current!==session)return;
      eligible=!!data.eligible;pending=!!data.pending;
      wordTipPending=!!data.wordTipPending;bookmarkTipPending=!!data.bookmarkTipPending;
      root.dataset.unlocked=unlocked?"true":"false";
      if(eligible&&pending)show();
    }catch{ /* Fail closed when the server has not enabled onboarding. */ }
  }
  function wordTapped(){
    if(!eligible||pending||!wordTipPending||clue.dataset.open==="true")return;
    wordTipPending=false;clue.dataset.open="true";
    void request("PUT",{dismissTip:"word"}).catch(()=>{wordTipPending=true});
  }
  clue.querySelector("button").addEventListener("click",()=>{clue.dataset.open="false"});
  window.MiaowuOnboarding=Object.freeze({sync,wordTapped,
    bookmarkTapped(){
      if(!eligible||pending||!bookmarkTipPending)return false;
      bookmarkTipPending=false;
      void request("PUT",{dismissTip:"bookmark"}).catch(()=>{bookmarkTipPending=true});
      return true;
    }
  });
})();
