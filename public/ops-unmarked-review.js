// V1.2 staging-only operator review for English tokens in unmarked V2 novels.
// No credential persistence, D1 writes, novel publication or automatic signoff.
// Authenticated staging Publisher's API is supplied by the existing OPS shell.
const CHOICES=/^gds_[a-f0-9]{24}$/u;
const ENTRY=/^gdict_[a-f0-9]{24}$/u;
const SHA=/^[0-9a-f]{64}$/u;
const FILE_MAX=1_900_000;
const PAGE_SIZE=20;
const loc=r=>`${r.chapter_number}:${r.paragraph_index}:${r.segment_index}:${r.start_offset}`;
const element=(tag,value,cls)=>{const el=document.createElement(tag);if(value!==undefined)el.textContent=String(value);if(cls)el.className=cls;return el};
const valueOf=(obj,path)=>path.reduce((v,k)=>v?.[k],obj);
export function validateUnmarkedV2File(source){
 const novel=source?.package??source;
 if(!novel||typeof novel!=='object'||Array.isArray(novel)||novel.version!==2||
    novel.words!==undefined||!novel.book||!Array.isArray(novel.chapters)||
    novel.chapters.length<1||novel.chapters.length>60)
   throw Error('只能选择不包含 words[] 的 V2 小说 JSON；旧文件请继续使用原上架流程。');
 if(typeof novel.book.id!=='string'||!/^[a-z][a-z0-9_-]{2,79}$/.test(novel.book.id))
   throw Error('小说内部编号不符合 V2 格式。');
 return novel;
}
export function normalizeEditorPreview(preview,source){
 if(preview?.status!=='EDITOR_CONTEXT_SELECTION_REQUIRED'||
    preview.publication_allowed!==false||preview.write_count!==0||
    !SHA.test(preview.source_sha256||'')||!SHA.test(preview.plan_sha256||'')||
    !Array.isArray(preview.anchors)||!Array.isArray(preview.approved_cards)||
    !Array.isArray(preview.review_queue)||preview.anchors.length>12000)
    throw Error('服务端审核预览字段不完整，已停止确认。');
 const novel=validateUnmarkedV2File(source);
 if(preview.book_id!==novel.book.id)throw Error('返回的书籍编号与所选小说不一致。');
 const cards=new Map();
 for(const c of preview.approved_cards){
   if(!ENTRY.test(c?.entry_id||'')||!Array.isArray(c.senses)||!c.senses.length||
      cards.has(c.entry_id))throw Error('服务端主词卡审核信息不一致。');
   const senses=new Map();
   for(const s of c.senses){
     if(!CHOICES.test(s?.sense_id||'')||senses.has(s.sense_id)||
        typeof s.meaningZh!=='string'||!s.meaningZh.trim())
        throw Error('服务端审核词义信息不完整。');
     senses.set(s.sense_id,{id:s.sense_id,pos:s.pos||'',zh:s.meaningZh});
   }
   cards.set(c.entry_id,{headword:c.headword||'',senses});
 }
 const chByNumber=new Map(novel.chapters.map(ch=>[ch.number,ch]));
 const positions=new Set(),rows=[];
 for(const a of preview.anchors){
   if(!ENTRY.test(a?.entry_id||'')||!Number.isInteger(a.chapter_number)||
      !Number.isInteger(a.paragraph_index)||!Number.isInteger(a.segment_index)||
      !Number.isInteger(a.start_offset)||!Number.isInteger(a.end_offset)||
      !Array.isArray(a.approved_sense_options)||
      a.approved_sense_options.length===0||a.approved_sense_options.length>25||
      typeof a.surface!=='string')throw Error('审核候选位置或词义格式不正确。');
   const text=valueOf(chByNumber.get(a.chapter_number),
     ['paragraphs',a.paragraph_index,'segments',a.segment_index,'text']);
   if(typeof text!=='string'||text.slice(a.start_offset,a.end_offset)!==a.surface)
      throw Error('原文词语位置已经改变，请重新扫描。');
   const key=loc(a),card=cards.get(a.entry_id);
   if(positions.has(key)||!card||a.approved_sense_options.some(s=>!card.senses.has(s)))
      throw Error('词义与词头对应关系不一致。');
   positions.add(key);
   const excerpt=text.slice(Math.max(0,a.start_offset-30),Math.min(text.length,a.end_offset+35));
   rows.push({key,anchor:a,card,excerpt,options:a.approved_sense_options.map(id=>card.senses.get(id))});
 }
 if(preview.approved_word_candidates!==rows.length)
   throw Error('可审核位置数量不一致。');
 return rows;
}
export function makeEditorDecisions(rows,selected){
 if(!(selected instanceof Map))throw Error('审核选择状态无效。');
 const known=new Map(rows.map(row=>[row.key,row]));
 const decisions=[];
 for(const [key,sense_id] of selected){
   const row=known.get(key);
   if(!row||!row.options.some(s=>s.id===sense_id))
     throw Error('选中的词义与当前审核预览不一致，已阻止提交。');
   const a=row.anchor;
   decisions.push({chapter_number:a.chapter_number,paragraph_index:a.paragraph_index,
     segment_index:a.segment_index,start_offset:a.start_offset,
     entry_id:a.entry_id,sense_id,confirmed:true});
 }
 return decisions;
}
export function initUnmarkedReviewAdmin({api,connected,environment,root=document.getElementById('unmarkedReviewPanel')}){
 if(typeof api!=='function'||typeof connected!=='function'||!root)
    throw Error('MISSING_OPS_UNMARKED_ADMIN_DEPENDENCY');
 const $=id=>root.querySelector('#'+id);
 let seq=0,source=null,preview=null,rows=[],selected=new Map(),output=null,page=0,filter='all',busy=false;
 const active=()=>connected()&&environment()==='staging';
 const report=text=>{$('unmarkedStatus').textContent=String(text)};
 const reset=()=>{seq++;source=null;preview=null;rows=[];selected=new Map();output=null;page=0;filter='all';
   $('unmarkedRows').replaceChildren();$('unmarkedUnknown').textContent='';
   $('unmarkedFile').value='';$('unmarkedSummary').textContent='';
   report('请先选择不包含 words[] 的 V2 小说文件。');render();};
 function render(){
   root.hidden=!active();
   if(!active())return;
   $('unmarkedScan').disabled=busy||!source;
   $('unmarkedConfirm').disabled=busy||!preview||selected.size===0;
   $('unmarkedExportV2').disabled=busy||!output;
   $('unmarkedExportV1').disabled=busy||!output;
   $('unmarkedBatch').disabled=busy||!rows.length;
   const selectedText=selected.size+' / '+rows.length+' 处已确认';
   $('unmarkedSelectedCount').textContent=selectedText;
   const pool=rows.filter(r=>filter==='all'||(filter==='confirmed'?selected.has(r.key):!selected.has(r.key)));
   const pages=Math.ceil(pool.length/PAGE_SIZE)||1;page=Math.min(page,pages-1);
   $('unmarkedPageText').textContent=(page+1)+' / '+pages+' 页';
   $('unmarkedPrev').disabled=busy||page===0;
   $('unmarkedNext').disabled=busy||page>=pages-1;
   const view=pool.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
   const list=$('unmarkedRows');list.replaceChildren();
   for(const r of view){
     const wrapper=element('div',undefined,'ops-unmarked-item');
     const head=element('div',undefined,'ops-unmarked-item-head');
     head.append(element('strong',r.card.headword+' · '+r.anchor.surface));
     head.append(element('small','第'+r.anchor.chapter_number+'章 · 段'+(r.anchor.paragraph_index+1)+' · 原文位置'+r.anchor.start_offset));
     const context=element('p',r.excerpt,'ops-unmarked-excerpt');
     const actions=element('div',undefined,'row');
     const choice=element('select');choice.setAttribute('aria-label','选择 '+r.anchor.surface+' 在小说中的真实词义');
     choice.append(new Option('选择本句对应的词义',''));
     for(const s of r.options)choice.append(new Option((s.pos?s.pos+' ':'')+s.zh,s.id));
     choice.value=selected.get(r.key)||'';
     // A single dictionary option is a suggestion, never automatic editor confirmation.
     const confirm=element('button',selected.has(r.key)?'✓ 已确认':'确认本句词义','secondary');
     confirm.type='button';confirm.disabled=busy;
     confirm.onclick=()=>{
       if(!active())return;
       if(selected.has(r.key)){selected.delete(r.key);output=null;report('已撤销这处确认，需要重新生成文件。');}
       else if(choice.value&&r.options.some(s=>s.id===choice.value)){
         selected.set(r.key,choice.value);output=null;report('已确认本句词义；生成文件前服务器将再次审核。');
       }else{report('请先选择本句实际使用的词义。');return;}
       render();
     };
     choice.addEventListener('change',()=>{
       if(selected.has(r.key)){
         selected.delete(r.key);output=null;
         confirm.textContent='确认本句词义';
         report('本句词义已更改，请再次点击确认；原生成文件失效。');
       }
       $('unmarkedConfirm').disabled=!selected.size;
       $('unmarkedExportV2').disabled=true;
       $('unmarkedExportV1').disabled=true;
       $('unmarkedSelectedCount').textContent=selected.size+' / '+rows.length+' 处已确认';
     });
     actions.append(choice,confirm);wrapper.append(head,context,actions);list.append(wrapper);
   }
 }
 async function scan(){
   if(!active()||!source||busy)return;
   busy=true;const mySeq=++seq;output=null;rows=[];preview=null;selected.clear();render();report('正在通过预览站已审词典检查原文英文……');
   try{
     const response=await api('/api/ops/import/dictionary-v2/plan-unmarked','POST',{package:source});
     if(mySeq!==seq||!active())return;
     rows=normalizeEditorPreview(response,source);preview=response;
     $('unmarkedSummary').textContent='发现 '+response.total_detected+' 处英文，其中 '+rows.length+
       ' 处具有已审核词卡候选，'+response.unavailable_or_unreviewed+' 处缺少可直接使用的已审词卡。';
     $('unmarkedUnknown').textContent=(response.review_queue||[]).slice(0,35)
       .map(x=>x.surface+'：'+x.reason).join(' · ');
     report('扫描完成。请逐处核对上下文；可批量确认本页只有一种候选义项的词。');
   }catch(e){if(mySeq===seq){preview=null;rows=[];report('扫描未通过：'+(e?.message||'后台不可用'));}}
   finally{busy=false;render();}
 }
 async function confirm(){
   if(!active()||!preview||!selected.size||busy)return;
   busy=true;const mySeq=++seq;output=null;render();report('服务器正在重新核对小说指纹与已审词义，生成不发布的候选文件……');
   try{
     const response=await api('/api/ops/import/dictionary-v2/confirm-unmarked','POST',{
       package:source,source_sha256:preview.source_sha256,plan_sha256:preview.plan_sha256,
       decisions:makeEditorDecisions(rows,selected)});
     if(mySeq!==seq||!active())return;
     if(response?.status!=='EDITOR_CONFIRMED_V2_DRAFT_NOT_PUBLISHED'||
       response.publication_allowed!==false||response.d1_writes!==0||
       response.user_study_changes!==0||!response.marked_v2_package||
       !response.verified_v1_package||response.selected_occurrences!==selected.size||
       response.book_id!==source.book.id)throw Error('返回的审核结果不完整，拒绝导出');
     output=response;report('服务器审核通过，可下载待上架草稿。没有上架、没有写入学习记录。');
   }catch(e){if(mySeq===seq)report('确认失败，请重新扫描或修正选择：'+(e?.message||'后台不可用'));}
   finally{busy=false;render();}
 }
 function download(pkg,suffix){
   if(!active()||!output||!pkg)return;
   const blob=new Blob([JSON.stringify(pkg,null,2)],{type:'application/json;charset=utf-8'});
   const url=URL.createObjectURL(blob),a=element('a');a.href=url;
   a.download=source.book.id+'-'+suffix+'.json';document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),3000);
 }
 $('unmarkedFile').addEventListener('change',async()=>{
   seq++;source=null;preview=null;output=null;rows=[];selected.clear();page=0;
   const file=$('unmarkedFile').files?.[0];
   if(!file){render();return}
   const sequence=seq;
   try{
     if(file.size<10||file.size>FILE_MAX)throw Error('文件需小于 1.9MB。');
     const parsed=JSON.parse(await file.text());
     if(sequence!==seq)return;
     source=validateUnmarkedV2File(parsed);
     report('已读取《'+(source.book.title||source.book.id)+'》。点击扫描获取服务端已审核词义。');
   }catch(e){if(sequence===seq){source=null;report('文件无效：'+(e?.message||'无法读取 JSON'));}}
   render();
 });
 $('unmarkedScan').addEventListener('click',scan);
 $('unmarkedConfirm').addEventListener('click',confirm);
 $('unmarkedExportV2').addEventListener('click',()=>download(output?.marked_v2_package,'reviewed-targets-v2-draft'));
 $('unmarkedExportV1').addEventListener('click',()=>download(output?.verified_v1_package,'v1-compat-preflight-draft'));
 $('unmarkedPrev').addEventListener('click',()=>{page=Math.max(0,page-1);render()});
 $('unmarkedNext').addEventListener('click',()=>{page++;render()});
 $('unmarkedFilter').addEventListener('change',e=>{filter=e.target.value;page=0;render()});
 $('unmarkedBatch').addEventListener('click',()=>{
   if(!active()||busy||!preview)return;
   const pool=rows.filter(r=>filter==='all'||(filter==='confirmed'?selected.has(r.key):!selected.has(r.key)));
   const eligible=pool.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)
     .filter(r=>r.options.length===1&&!selected.has(r.key));
   if(!eligible.length){report('本页没有可批量确认的唯一义项候选。');return;}
   if(!window.confirm('你已经逐一阅读本页的句子，并确认以下 '+eligible.length+
      ' 处词义都准确吗？本操作只在浏览器里标记，不会发布。'))return;
   for(const r of eligible)selected.set(r.key,r.options[0].id);
   output=null;report('已确认本页 '+eligible.length+' 处唯一候选；其他歧义仍需逐条选义。');render();
 });
 root.hidden=!active();render();
 return {reset,refresh(){if(!active()){reset();return}render();},getState(){return {loaded:!!source,previewed:!!preview,confirmed:selected.size,exportReady:!!output}}};
}