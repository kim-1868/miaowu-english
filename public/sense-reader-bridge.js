/* Staging-only sense-id reader: approved, exact-context, READ ONLY.
 * Never infers sense from headword; never changes study state.
 * Legacy reading card is the fallback on every API/identity failure.
 */
(function(root){
  'use strict';
  const SENSE=/^gds_[a-f0-9]{24}$/u;
  const ENTRY=/^gdict_[a-f0-9]{24}$/u;
  const CHAPTER=/^[A-Za-z0-9_-]{1,80}$/u;
  const ANCHOR=/^p(?:0|[1-9][0-9]*):s(?:0|[1-9][0-9]*)$/u;
  const html=s=>String(s??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  let api=null,sequence=0;
  function validCard(result,ctx){
    const c=result?.card;
    return c&&c.sense_id===ctx.senseId&&c.entry_id===ctx.entryId&&
      SENSE.test(c.sense_id)&&ENTRY.test(c.entry_id)&&
      typeof c.headword==='string'&&c.headword.length>0&&c.headword.length<=100&&
      typeof c.pos==='string'&&typeof c.meaningZh==='string'&&
      typeof c.exampleEn==='string'&&typeof c.exampleZh==='string'&&
      c.meaningZh.trim()&&c.exampleEn.trim()&&c.exampleZh.trim()&&
      Number.isSafeInteger(result.revision)&&result.revision>=0;
  }
  function render(ctx,result,token){
    if(token!==sequence)return;
    if(!validCard(result,ctx))throw Error('INVALID_APPROVED_SENSE_CARD');
    const c=result.card,tray=document.getElementById('wordPop');
    if(!tray)throw Error('SENSE_READER_TRAY_MISSING');
    const writable=result.write_enabled===true&&result.read_only===false&&
      Number.isSafeInteger(result.revision);
    const study=result.study;
    const stage=Number.isSafeInteger(study?.stage)&&study.stage>=0&&study.stage<=5?
      study.stage:0;
    const mastered=study?.status==='mastered';
    tray.innerHTML='<button type="button" class="modal-close" id="wordClose" aria-label="关闭词卡">×</button>'+
      '<span class="eyebrow">MIAOWU · 统一词义预览（测试环境）</span><h3>'+html(c.headword)+'</h3>'+
      '<div class="pron">美 '+html(c.phoneticUs||'')+' · 英 '+html(c.phoneticUk||'')+
      ' <button type="button" id="senseWordSpeak">♫ 朗读</button></div>'+
      '<section class="word-extra" data-reviewed-sense="'+html(c.sense_id)+'"><strong>'+
      html(c.pos)+' · '+html(c.meaningZh)+'</strong><small> · 本章词义</small>'+
      '<div class="v11-example-heading"><span>例句</span> <button type="button" id="senseExampleSpeak">♫ 朗读例句</button></div>'+
      '<p>'+html(c.exampleEn)+'</p><span class="study-translation">'+html(c.exampleZh)+'</span></section>'+
      (writable?
        '<p class="study-loading">跨书统一复习 · 第 '+stage+' 阶段'+(mastered?' · 已掌握':'')+'</p>'+
        '<div class="word-actions"><button type="button" id="senseRemember">记得</button>'+
        '<button type="button" id="senseForget">再记一次</button>'+
        '<button type="button" id="senseMaster">'+(mastered?'取消已掌握':'标记已掌握')+'</button></div>':
        '<p class="study-loading">统一义项仅供预览 · 复习记录仍使用原版词卡</p>')+
      '<div class="word-actions"><button type="button" id="senseLegacyCard">查看原词卡与学习操作</button></div>';
    document.getElementById('wordClose').onclick=api.close;
    document.getElementById('senseWordSpeak').onclick=()=>api.speak(c.headword);
    document.getElementById('senseExampleSpeak').onclick=()=>api.speak(c.exampleEn);
    document.getElementById('senseLegacyCard').onclick=()=>{
      api.openLegacy(ctx.legacyWordId,ctx.element);
    };
    if(writable){
      const buttons=['senseRemember','senseForget','senseMaster']
        .map(id=>document.getElementById(id)).filter(Boolean);
      let busy=false;
      const submit=async kind=>{
        if(busy||token!==sequence)return;
        const eventId=root.crypto?.randomUUID?.();
        if(!eventId){api.toast('此浏览器无法安全生成复习记录，请使用原版词卡');return}
        busy=true;
        buttons.forEach(button=>{button.disabled=true});
        try{
          const posted=await api.request('/api/me/dictionary/senses/'+
            encodeURIComponent(ctx.senseId)+'/feedback','POST',{
            chapterId:ctx.chapterId,anchor:ctx.anchor,kind,eventId,
            expectedRevision:result.revision});
          if(token!==sequence)return;
          if(!Number.isSafeInteger(posted?.revision)||
            posted.revision<=result.revision)throw Error('SENSE_REVISION_INVALID');
          const updated=await api.request('/api/me/dictionary/senses/'+
            encodeURIComponent(ctx.senseId)+'?chapterId='+
            encodeURIComponent(ctx.chapterId)+'&anchor='+encodeURIComponent(ctx.anchor));
          if(token!==sequence)return;
          if(updated?.revision!==posted.revision||
            updated?.card?.sense_id!==ctx.senseId)
            throw Error('SENSE_FEEDBACK_REFRESH_MISMATCH');
          render(ctx,updated,token);
        }catch{
          if(token!==sequence)return;
          api.toast('本次复习未能确认，已恢复原词卡；请检查网络后重试');
          api.openLegacy(ctx.legacyWordId,ctx.element);
        }finally{
          busy=false;
          if(token===sequence)buttons.forEach(button=>{button.disabled=false});
        }
      };
      document.getElementById('senseRemember').onclick=()=>submit('remembered');
      document.getElementById('senseForget').onclick=()=>submit('forgotten');
      document.getElementById('senseMaster').onclick=()=>submit(
        mastered?'unmark_mastered':'mark_mastered');
    }
  }
  async function open(ctx){
    if(!api||!api.user()||!SENSE.test(ctx?.senseId||'')||
      !ENTRY.test(ctx?.entryId||'')||!CHAPTER.test(ctx?.chapterId||'')||
      !ANCHOR.test(ctx?.anchor||'')||typeof ctx.legacyWordId!=='string'||
      !ctx.legacyWordId)return false;
    api.pause();
    api.openLegacy(ctx.legacyWordId,ctx.element);
    api.supersedeLegacy();
    const token=++sequence;
    const tray=document.getElementById('wordPop');
    if(!tray)return false;
    tray.innerHTML='<button type="button" class="modal-close" id="wordClose" aria-label="关闭词卡">×</button>'+
      '<p class="study-loading" role="status">正在读取已审核的本句词义…</p>';
    document.getElementById('wordClose').onclick=api.close;
    try{
      const result=await api.request('/api/me/dictionary/senses/'+encodeURIComponent(ctx.senseId)+
        '?chapterId='+encodeURIComponent(ctx.chapterId)+'&anchor='+encodeURIComponent(ctx.anchor));
      if(token===sequence)render(ctx,result,token);
    }catch{
      if(token!==sequence)return true;
      api.toast('本句词义暂不可用，已恢复原词卡');
      api.openLegacy(ctx.legacyWordId,ctx.element);
    }
    return true;
  }
  root.MiaowuSenseReaderBridge={
    configure(x){
      if(!x||['user','request','speak','pause','close','openLegacy',
        'supersedeLegacy','toast'].some(k=>typeof x[k]!=='function'))
        throw Error('INVALID_SENSE_READER_BRIDGE');
      api=x;
    },
    open,
    invalidate(){sequence++;}
  };
})(window);
