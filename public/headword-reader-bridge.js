/* V1.2: opt-in staging reader for a SINGLE fully reviewed multi-sense card.
 * Existing chapter word popup and legacy learn/bookmark API remain available.
 * Never infer a card by spelling: accepts only the server's approved anchor map.
 */
(function(root){
 'use strict';
 let api=null,sequence=0;
 const ID=/^gdict_[a-f0-9]{24}$/u;
 const CHAPTER=/^[a-zA-Z0-9_-]{1,80}$/u;
 const ANCHOR=/^p(?:0|[1-9][0-9]*):s(?:0|[1-9][0-9]*)$/u;
 const escaped=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const button=(id)=>document.getElementById(id);
 const url=(entry,chapter,anchor)=>'/api/me/dictionary/headwords/'+encodeURIComponent(entry)+
   '?chapterId='+encodeURIComponent(chapter)+'&anchor='+encodeURIComponent(anchor);
 const validCard=x=>x&&ID.test(x.entry_id||'')&&typeof x.headword==='string'&&
   x.headword.length<100&&Array.isArray(x.senses)&&x.senses.length>0&&
   x.senses.length<=25&&x.senses.every(s=>s&&typeof s.sense_id==='string'&&
     typeof s.pos==='string'&&typeof s.meaningZh==='string'&&
     typeof s.exampleEn==='string'&&typeof s.exampleZh==='string')&&
   Array.isArray(x.collocations)&&x.collocations.length<=8;
 function render(ctx,data,token){
   if(token!==sequence)return;
   const c=data?.card;
   if(!validCard(c)||c.entry_id!==ctx.entryId)throw Error('HEADWORD_CARD_INVALID');
   const own=(c.senses||[]).filter(s=>s.sense_id===c.context_sense_id);
   if(own.length!==1)throw Error('HEADWORD_CONTEXT_SENSE_MISSING');
   const order=[...own,...c.senses.filter(s=>s.sense_id!==c.context_sense_id)];
   const state=data.study||{}, revision=data.revision;
   if(!Number.isSafeInteger(revision)||revision<0)throw Error('HEADWORD_REVISION_INVALID');
   const row=order.map(s=>'<section class="word-extra v12-headword-sense"'+
       (s.sense_id===c.context_sense_id?' data-current-sense="true"':'')+'>'+
      '<strong>'+escaped(s.pos)+' · '+escaped(s.meaningZh)+'</strong>'+
      (s.sense_id===c.context_sense_id?'<small> · 本章用法</small>':'')+
      '<div class="v11-example-heading"><span>例句</span> '+
      '<button type="button" data-v12-example="'+escaped(s.sense_id)+'">♫ 朗读例句</button></div>'+
      '<p>'+escaped(s.exampleEn)+'</p><span class="study-translation">'+
      escaped(s.exampleZh)+'</span></section>').join('');
   const collocations=c.collocations.length?'<section class="word-extra"><strong>常用搭配</strong>'+
     c.collocations.map(s=>'<div>'+escaped(s.en)+' · '+escaped(s.zh)+'</div>').join('')+'</section>':'';
   const mastered=state.status==='mastered';
   const status=mastered?'已掌握':state.is_due?'待复习':state.stage?'学习中 · 第'+state.stage+'阶段':'首次学习';
   const tray=button('wordPop');
   tray.innerHTML='<button type="button" class="modal-close" id="wordClose" aria-label="关闭词卡">×</button>'+
    '<span class="eyebrow">MIAOWU · UNIFIED WORD CARD</span><h3>'+escaped(c.headword)+'</h3>'+
    '<div class="pron">美 '+escaped(c.phoneticUs||'')+' · 英 '+escaped(c.phoneticUk||'')+
    ' <button type="button" id="v12WordSpeak" aria-label="播放单词发音">♫</button></div>'+
    '<p class="study-loading" role="status">'+escaped(status)+(state.due_at?' · 下次复习 '+escaped(state.due_at.slice(0,10)):'')+'</p>'+
    row+collocations+
    '<div class="word-actions"><button type="button" id="v12Remember">✓ 认识</button>'+
    '<button type="button" id="v12Forgot">↻ 再记一次</button>'+
    '<button type="button" id="v12Master">'+(mastered?'↩ 继续学习':'★ 标记已掌握')+'</button></div>'+
    '<div class="word-actions"><button type="button" id="v12LegacySave">♡ 收藏藏书票</button></div>';
   button('wordClose').onclick=api.close;
   button('v12WordSpeak').onclick=()=>api.speak(c.headword);
   for(const b of tray.querySelectorAll('[data-v12-example]')){
     b.onclick=()=>{const s=c.senses.find(x=>x.sense_id===b.dataset.v12Example);
       if(s)api.speak(s.exampleEn);};
   }
   button('v12LegacySave').onclick=()=>api.saveLegacy(ctx.legacyWordId);
   const feedback=async(kind)=>{
     if(token!==sequence||!api.user())return;
     for(const id of ['v12Remember','v12Forgot','v12Master'])button(id).disabled=true;
     const eventId=root.crypto?.randomUUID?.();
     if(!eventId){
       api.toast('当前环境暂不支持安全学习记录');
       for(const id of ['v12Remember','v12Forgot','v12Master'])button(id).disabled=false;
       return;
     }
     try{
       const next=await api.request('/api/me/dictionary/headwords/'+
         encodeURIComponent(ctx.entryId)+'/feedback','POST',{
         chapterId:ctx.chapterId,anchor:ctx.anchor,kind,
         eventId,expectedRevision:revision});
       if(token!==sequence)return;
       api.toast(kind==='remembered'?'已记录认识':kind==='forgotten'?'已安排近期复习':'学习状态已同步');
       // GET is authoritative for state + approved card on the next render.
       const fresh=await api.request(url(ctx.entryId,ctx.chapterId,ctx.anchor));
       if(token===sequence)render(ctx,fresh,token);
       return next;
     }catch(e){
       if(token!==sequence)return;
       api.toast(e?.code==='HEADWORD_STALE_REVISION'?'另一设备已更新，请再次点击':
          (e?.message||'学习记录同步失败'));
       try{const fresh=await api.request(url(ctx.entryId,ctx.chapterId,ctx.anchor));
         if(token===sequence)render(ctx,fresh,token);
       }catch{if(token===sequence)api.close();}
     }
   };
   button('v12Remember').onclick=()=>feedback('remembered');
   button('v12Forgot').onclick=()=>feedback('forgotten');
   button('v12Master').onclick=()=>feedback(mastered?'unmark_mastered':'mark_mastered');
 }
 async function open(ctx){
   if(!api||!api.user()||!ID.test(ctx?.entryId||'')||
      !CHAPTER.test(ctx?.chapterId||'')||!ANCHOR.test(ctx?.anchor||'')||
      typeof ctx.legacyWordId!=='string'||!ctx.legacyWordId)return false;
   // The existing tray handles desktop anchoring, mobile bottom sheet,
   // active-word styling, and click-outside close. Its legacy pending fetch
   // must not replace this authorized, structured card.
   api.pause();
   api.openLegacy(ctx.legacyWordId,ctx.element);
   api.supersedeLegacy();
   const token=++sequence;
   const tray=button('wordPop');
   tray.innerHTML='<button type="button" class="modal-close" id="wordClose" aria-label="关闭词卡">×</button>'+
       '<span class="eyebrow">MIAOWU · UNIFIED WORD CARD</span>'+
       '<p class="study-loading" role="status">正在读取已审核的统一词卡…</p>';
   button('wordClose').onclick=api.close;
   try{
     const result=await api.request(url(ctx.entryId,ctx.chapterId,ctx.anchor));
     if(token===sequence)render(ctx,result,token);
   }catch(e){
     if(token!==sequence)return true;
     api.toast(e?.message||'统一词卡暂不可用，已恢复原阅读词卡');
     api.openLegacy(ctx.legacyWordId,ctx.element);
   }
   return true;
 }
 root.MiaowuHeadwordReaderBridge={
   configure(x){if(!x||['user','request','speak','pause','close','openLegacy',
     'supersedeLegacy','saveLegacy','toast'].some(k=>typeof x[k]!=='function'))
       throw Error('INVALID_HEADWORD_READER_BRIDGE');api=x;},
   open,invalidate(){sequence++;}
 };
})(window);