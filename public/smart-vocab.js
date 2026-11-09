// Smart study is an optional third mode in the existing bookplate.
// No code in this file runs against an unavailable / unverified catalog.
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const names={cet4:'英语四级',cet6:'英语六级',postgrad:'考研英语',ielts:'雅思英语'};
  let api=null,account=null,checked=false,checking=null,levels=[],available=false;
  let session=null,opening=false,busy=false,guideShown=false;
  const stage=()=>$('smartVocabStage');
  const original=()=>$('flashcardTrainer');
  const current=()=>session?.queue[session.index]||null;

  const storageKey=()=> 'mw-bookplate-entry-guide-v1-'+(account||'guest');
  function hasSeenGuide(){
    try{return window.localStorage.getItem(storageKey())==='1'}catch{return guideShown}
  }
  function rememberGuide(){
    guideShown=true;
    try{window.localStorage.setItem(storageKey(),'1')}catch{}
  }
  function closeGuide(){
    const dialog=$('smartVocabGuide');if(!dialog)return;
    if(dialog.open&&typeof dialog.close==='function')dialog.close();
    else dialog.removeAttribute('open');
    rememberGuide();
  }
  function firstEntry(){
    if(!available||!account||hasSeenGuide()||!$('view-words')?.classList.contains('active'))return;
    const dialog=$('smartVocabGuide');if(!dialog||dialog.open)return;
    if(typeof dialog.showModal==='function')dialog.showModal();
    else dialog.setAttribute('open','');
  }

  function renderAvailability(){
    // If a flashcard session is already running, its existing UI must stay intact.
    api?.renderWords?.();
  }
  async function refreshStatus(){
    if(checking)return checking;
    if(!api?.user?.())return;
    const identity=account;
    checking=(async()=>{
      try{
        const data=await api.request('/api/me/smart-vocab/status');
        if(account!==identity)return;
        levels=(data.categories||[]).filter(x=>x.available===true&&names[x.slug])
          .map(x=>x.slug);
        available=!!data.enabled&&levels.length>0;
      }catch{if(account===identity){levels=[];available=false}}
      finally{
        if(account===identity){checked=true;renderAvailability();firstEntry()}
        checking=null;
      }
    })();
    return checking;
  }
  function sync(){
    const next=api?.user?.()||null;
    if(next!==account){
      account=next;checked=false;available=false;levels=[];guideShown=false;
      // Sessions must never leak cards between accounts.
      if(session||stage()?.hidden===false)hideStage(false);
      session=null;
    }
    if(account&&!checked&&!checking)void refreshStatus();
  }

  function hideStage(refresh=true){
    if(stage()){stage().hidden=true;stage().innerHTML=''}
    if(original())original().hidden=false;
    opening=false;busy=false;session=null;
    if(refresh)void api?.refresh?.();
  }
  function button(id,label,cls=''){
    return '<button type="button" class="mw-smart-button '+cls+'" id="'+id+'">'+label+'</button>';
  }
  function heading(heading,desc){
    return '<div class="mw-smart-top"><div><span class="eyebrow">MIAOWU · SMART VOCAB</span>'+
      '<h2>'+esc(heading)+'</h2><p>'+esc(desc)+'</p></div>'+
      '<button type="button" class="mw-smart-exit" id="mwSmartExit" aria-label="返回记忆藏书票">× 返回</button></div>';
  }
  function draw(html){
    const root=stage();if(!root)return;
    root.innerHTML=html;
    const exit=$('mwSmartExit');
    if(exit)exit.onclick=()=>{
      if(session?.queue&&session.index<session.queue.length&&session.answers.length&&
        !window.confirm('退出本轮吗？已经提交的学习记录会保留。'))return;
      hideStage();
    };
  }
  function showChooser(){
    const options=levels.map(l=>
      '<button type="button" class="mw-smart-level" data-smart-level="'+esc(l)+'">'+
      '<strong>'+esc(names[l])+'</strong><small>已解锁 · 按词频推荐</small></button>').join('');
    draw(heading('选择学习词纲','只显示你已购买并通过审核的等级。')+
      '<div class="mw-smart-levels">'+options+'</div>');
    stage()?.querySelectorAll('[data-smart-level]').forEach(btn=>{
      btn.onclick=()=>void begin(btn.dataset.smartLevel);
    });
  }
  function progress(){
    const num=session.index+1,total=session.queue.length||1;
    return '<div class="mw-smart-progress-label"><span>'+
      esc(names[session.category]||session.category)+'</span><strong>'+num+' / '+total+'</strong></div>'+
      '<div class="mw-smart-track" role="progressbar" aria-valuenow="'+Math.round((num-1)/total*100)+'" aria-valuemin="0" aria-valuemax="100">'+
      '<span style="width:'+Math.round((num-1)/total*100)+'%"></span></div>';
  }
  function drawWord(){
    if(!session)return;
    if(session.index>=session.queue.length){drawFinish();return}
    const item=current(),w=item.word,feedback=item.feedback;
    const title=item.retry?'再记一次 · 巩固记忆':w.review?'到期复习':'词频推荐 · 新词';
    const pronunciation=esc(w.phonetic_us||w.phonetic_uk||'');
    const detail='<div class="mw-smart-detail">'+
      '<div class="mw-smart-meaning">'+esc(w.part_of_speech||'')+' '+esc(w.meaning_zh)+'</div>'+
      '<p>'+esc(w.example_en)+'</p><small>'+esc(w.example_zh)+'</small></div>';
    let actions='';
    if(feedback){
      actions='<p class="mw-smart-feedback" role="status">'+
        (feedback.remembered?'✓ 已记录「记得」，后续仍会安排验证':'↻ 已记录「不记得」，稍后再见这张词卡')+
        ' · 已同步</p>'+button('mwSmartNext','下一张 →','primary');
    }else if(item.pendingAnswer&&item.saveError){
      actions='<p class="mw-smart-error" role="alert">网络异常，当前反馈尚未确认保存。</p>'+
        button('mwSmartRetry','重新保存本次反馈','primary');
    }else{
      actions='<div class="mw-smart-votes">'+
        button('mwSmartForgot','不记得 · 看释义')+
        button('mwSmartKnown','记得 · 下一步','primary')+'</div>';
    }
    draw(heading('智能背单词','根据已解锁的考试词纲，按可靠词频优先学习。')+
      progress()+'<div class="mw-smart-paper"><span class="mw-smart-kind">'+esc(title)+'</span>'+
      '<div class="mw-smart-word">'+esc(w.headword)+'</div>'+
      '<div class="mw-smart-pronounce">'+pronunciation+
      ' <button type="button" id="mwSmartVoice" aria-label="朗读英文单词">♫ 朗读</button></div>'+
      (feedback?detail:'<p class="mw-smart-memory">先想一想它的意思，再选择记得或不记得。</p>')+
      '<div class="mw-smart-bookmark">'+button('mwSmartBookmark',
        item.bookmarked?'♥ 已收藏 · 点击取消':'♡ 收藏到藏书票')+'</div></div>'+
      actions+'<p class="mw-smart-footnote">收藏与记忆状态独立；记得不等于永久掌握。退出后已提交记录仍保留。</p>');
    $('mwSmartVoice').onclick=()=>api.speak?.(w.headword);
    $('mwSmartBookmark').onclick=()=>void bookmark();
    if($('mwSmartKnown'))$('mwSmartKnown').onclick=()=>void vote(true);
    if($('mwSmartForgot'))$('mwSmartForgot').onclick=()=>void vote(false);
    if($('mwSmartRetry'))$('mwSmartRetry').onclick=()=>void vote(item.pendingAnswer.remembered);
    if($('mwSmartNext'))$('mwSmartNext').onclick=()=>{session.index++;drawWord()};
    for(const el of stage().querySelectorAll('button'))el.disabled=busy;
  }
  async function bookmark(){
    if(busy||!session||!current())return;
    const item=current(),next=!item.bookmarked,identity=account,oldSession=session;
    busy=true;drawWord();
    try{
      await api.request('/api/me/smart-vocab/bookmark','POST',{
        category:session.category,wordId:item.word.word_id,bookmarked:next});
      if(identity!==account||session!==oldSession)return;
      item.bookmarked=next;
      api.toast?.(next?'已加入记忆藏书票':'已取消收藏，学习记录不变');
    }catch(e){api.toast?.('收藏暂未保存：'+(e.message||'请重试'))}
    finally{busy=false;if(session===oldSession)drawWord()}
  }
  async function vote(remembered){
    if(busy||!session||!current()||current().feedback)return;
    const item=current(),oldSession=session,identity=account;
    if(!item.pendingAnswer)item.pendingAnswer={
      category:session.category,wordId:item.word.word_id,
      requestId:crypto.randomUUID(),remembered
    };
    // Never change the choice or request ID on a retry after a lost response.
    busy=true;item.saveError=false;drawWord();
    try{
      const result=await api.request('/api/me/smart-vocab/answer','POST',item.pendingAnswer);
      if(identity!==account||session!==oldSession)return;
      item.feedback={remembered:result.remembered===true};
      session.answers.push({id:item.word.word_id,remembered:item.feedback.remembered,
        retry:item.retry});
      item.saveError=false;
      if(!item.feedback.remembered){
        const count=session.retried.get(item.word.word_id)||0;
        if(count<2){
          session.retried.set(item.word.word_id,count+1);
          const later=Math.min(session.index+5,session.queue.length);
          session.queue.splice(later,0,{word:item.word,bookmarked:item.bookmarked,
            retry:true,feedback:null,pendingAnswer:null,saveError:false});
        }
      }
    }catch(e){
      item.saveError=true;
      api.toast?.('学习反馈未确认保存，重试不会重复计数');
    }finally{busy=false;if(session===oldSession)drawWord()}
  }
  function drawFinish(){
    const distinct=new Set(session.answers.map(x=>x.id)).size;
    const correct=session.answers.filter(x=>x.remembered).length;
    draw(heading('本轮结束啦！','每一个有效反馈都已保存到你的学习记录。')+
      '<div class="mw-smart-finish"><strong>'+distinct+'</strong><span>本轮学习词义</span>'+
      '<p>记得 '+correct+' 次 · 需要巩固 '+(session.answers.length-correct)+' 次</p></div>'+
      button('mwSmartAgain','继续学习下一轮','primary'));
    $('mwSmartAgain').onclick=()=>void begin(session.category);
  }
  async function begin(category){
    if(opening||busy||!available||!levels.includes(category))return;
    opening=true;
    try{
      draw(heading('正在准备词卡','从已购买的词纲挑选适合你的词义……')+
        '<p class="mw-smart-loading" role="status">正在加载，不会修改之前的学习进度。</p>');
      const identity=account;
      const result=await api.request('/api/me/smart-vocab?category='+encodeURIComponent(category));
      if(identity!==account||stage()?.hidden)return;
      if(!Array.isArray(result.words)||!result.words.length){
        draw(heading('今天暂时没有推荐词','当前词纲没有待学新词或到期复习。')+
          button('mwSmartReturn','返回记忆藏书票'));
        $('mwSmartReturn').onclick=()=>hideStage();
        return;
      }
      try{localStorage.setItem('mw-smart-last-level',category)}catch{}
      session={category,queue:result.words.map(w=>({word:w,retry:false,
        bookmarked:!!w.bookmarked,feedback:null,pendingAnswer:null,saveError:false})),
        index:0,answers:[],retried:new Map()};
      drawWord();
    }catch(e){
      draw(heading('暂时无法开始学习','未能读取经过审核的词卡，请稍后再试。')+
        '<p class="mw-smart-error" role="alert">'+esc(e?.message||'读取失败')+'</p>'+
        button('mwSmartReturn','返回藏书票'));
      $('mwSmartReturn').onclick=()=>hideStage();
    }finally{opening=false}
  }
  function start(){
    sync();
    if(!available){api?.toast?.('智能词库尚未开放');return}
    if(!api?.user?.()){api?.login?.();return}
    if(stage())stage().hidden=false;
    if(original())original().hidden=true;
    session=null;
    if(levels.length===1){void begin(levels[0]);return}
    let remembered=null;try{remembered=localStorage.getItem('mw-smart-last-level')}catch{}
    showChooser();
    // Multiple owned levels remain manually selectable; remembering a preference
    // never selects or exposes a revoked / unpurchased level.
    if(remembered&&levels.includes(remembered)){
      stage()?.querySelector('[data-smart-level="'+remembered+'"]')?.classList.add('mw-smart-recent');
    }
    stage()?.scrollIntoView?.({behavior:'smooth',block:'start'});
  }
  function configure(adapter){
    api=adapter;
    const guide=$('smartVocabGuide');
    if(guide){
      guide.querySelector('[data-smart-guide-dismiss]')?.addEventListener('click',closeGuide);
      guide.addEventListener('cancel',()=>rememberGuide());
    }
  }
  window.MiaowuSmartVocab=Object.freeze({
    configure,isAvailable:()=>available,sync,onEnter(){sync();firstEntry()},start,
    close:hideStage
  });
})();
