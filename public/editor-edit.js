(()=>{
"use strict";
const $=id=>document.getElementById(id);
const service=()=>window.MiaowuDraftEditor;
let current=null,selection=null;
function node(tag,klass,txt){
  const x=document.createElement(tag);
  if(klass)x.className=klass;
  if(txt!==undefined)x.textContent=txt;
  return x;
}
function button(text,callback,klass="secondary"){
  const b=node("button",klass,text);b.type="button";b.onclick=callback;return b;
}
function input(label,value="",kind="text"){
  const holder=node("div");
  const l=node("label",null,label);holder.append(l);
  const element=document.createElement(kind==="long"?"textarea":"input");
  if(kind!=="long")element.type=kind;
  element.value=value==null?"":String(value);
  if(kind==="long")element.rows=3;
  holder.append(element);
  return {holder,element};
}
function notice(txt){
  service()?.notice(txt);
}
async function perform(btn,action){
  btn.disabled=true;
  try{await action()}catch(e){notice(e.message||"操作未完成，请稍后重试")}
  finally{btn.disabled=false}
}
function clearEditor(){
  $("editorPanel").replaceChildren();
  $("historyPanel").replaceChildren();
}
function unavailable(){
  const p=node("p","edit-info","请先在草稿书库中选择一本未发布的书，然后选择章节或词汇。");
  $("editorPanel").append(p);
}
function editHeader(text){
  const h=node("h3",null,text);
  $("editorPanel").append(h);
}
function fieldRow(parent,items){
  const row=node("div","edit-field-row");items.forEach(f=>row.append(f.holder));parent.append(row);
}
function addToken(host,segment={},words=[]){
  const type=segment.wordId?"word":"text";
  const row=node("div","segment-row");row.dataset.kind=type;
  const content=node("div");
  const lbl=node("label",null,type==="word"?"英文标注词":"普通正文");
  content.append(lbl);
  let first,second,third;
  if(type==="text"){
    first=document.createElement("textarea");first.rows=2;first.value=segment.text??"";
    content.append(first);
  }else{
    first=document.createElement("select");
    for(const w of words){
      const opt=node("option",null,w.headword+" · "+w.meaning_zh);
      opt.value=w.id;first.append(opt);
    }
    first.value=segment.wordId||words[0]?.id||"";
    const extra=node("div","edit-field-row");
    const a=input("页面显示的英文",segment.surface||"");
    const b=input("括号中文提示",segment.gloss||"");
    second=a.element;third=b.element;extra.append(a.holder,b.holder);
    content.append(first,extra);
  }
  row.append(content,button("移除这段",()=>row.remove(),"secondary"));
  host.append(row);
  row._get=()=>type==="text"?{text:first.value}:
    {wordId:first.value,surface:second.value,gloss:third.value};
}
function addParagraph(host,data={segments:[{text:""}]},words=[]){
  const card=node("div","edit-section paragraph-item");
  const top=node("div","row");
  const name=node("strong",null,"正文段落");
  const segments=node("div");segments.className="edit-segments";
  top.append(name,button("删除段落",()=>card.remove(),"secondary"));
  card.append(top,segments);
  for(const seg of data.segments||[])addToken(segments,seg,words);
  const add=node("div","edit-actions");
  add.append(
    button("＋ 普通文字",()=>addToken(segments,{text:""},words)),
    button("＋ 标注英语单词",()=>{
      if(!words.length)return notice("当前书目还没有可使用的单词；请先导入词汇");
      addToken(segments,{wordId:words[0].id,surface:words[0].headword,gloss:words[0].meaning_zh},words);
    })
  );
  card.append(add);
  host.append(card);
}
function extractChapter(form){
  const title=form.querySelector(".chapter-title").value;
  const preview=form.querySelector(".chapter-preview").checked;
  const paragraphs=Array.from(form.querySelectorAll(".paragraph-item"),p=>({
    segments:Array.from(p.querySelectorAll(".segment-row"),seg=>seg._get())
  }));
  return {title,preview,paragraphs};
}
function chapterEditor(data,chapter){
  clearEditor();
  const bookId=data.book.id,id=chapter.id;
  selection={type:"chapter",id};
  editHeader("编辑第 "+chapter.number+" 章 · "+chapter.title);
  const desc=node("p","edit-info","保留章节 ID 与章节序号。单词标注位置会随正文一起重建，保存前请确认英文和中文提示。");
  $("editorPanel").append(desc);
  const form=node("form","edit-panel");
  const name=input("章节标题",chapter.title);
  name.element.className="chapter-title";
  const checkbox=input("免费试读章节", "", "checkbox");
  checkbox.element.className="chapter-preview";checkbox.element.checked=chapter.preview;
  fieldRow(form,[name,checkbox]);
  const paragraphs=node("div");
  paragraphs.className="chapter-paragraphs";
  const parts=chapter.content?.paragraphs||[];
  for(const para of parts){
    const prepared=typeof para==="string"?{segments:[{text:para}]}:para;
    addParagraph(paragraphs,prepared,data.words);
  }
  form.append(paragraphs);
  const actions=node("div","edit-actions");
  actions.append(
    button("＋ 新增段落",()=>addParagraph(paragraphs,{segments:[{text:""}]},data.words)),
    button("查看历史版本",()=>showHistory("chapter",bookId,id,chapter.version))
  );
  const save=button("保存章节修改",()=>perform(save,async()=>{
    const changes=extractChapter(form);
    const result=await service().request("/api/staging/editor/drafts/"+bookId+"/chapters/"+id,
      "PUT",{...changes,expectedVersion:chapter.version});
    notice(result.saved?"保存成功，上一版已存档。":"内容没有变化，不需要重复保存。");
    await service().load(bookId);
  }),"");
  actions.append(save);
  form.append(actions);
  form.onsubmit=e=>e.preventDefault();
  $("editorPanel").append(form);
  $("editingArea").scrollIntoView({behavior:"smooth",block:"start"});
}
function collectWord(form){
  const object={};
  for(const field of ["headword","meaningZh","phoneticUk","phoneticUs","partOfSpeech","exampleEn","exampleZh"]){
    object[field]=form.querySelector('[data-field="'+field+'"]').value;
  }
  object.collocations=Array.from(form.querySelectorAll(".collocation-row"),r=>({
    en:r.querySelector(".phrase-en").value,zh:r.querySelector(".phrase-zh").value
  }));
  return object;
}
function collocation(host,pair={}){
  const row=node("div","edit-field-row collocation-row");
  const a=input("搭配英文",pair.en||"");
  const b=input("中文释义",pair.zh||"");
  a.element.className="phrase-en";b.element.className="phrase-zh";
  row.append(a.holder,b.holder,button("删除搭配",()=>row.remove()));
  host.append(row);
}
function wordEditor(data,word){
  clearEditor();
  selection={type:"word",id:word.id};
  editHeader("编辑词卡 · "+word.headword);
  $("editorPanel").append(node("p","edit-info","词汇 ID 保持不变。若同一单词已被其他书或已发布章节引用，后台会拒绝修改，以免影响已有用户。"));
  const form=node("form","edit-panel");
  const fields=[
    ["headword","英文原词"],["meaningZh","中文释义"],["phoneticUk","英式音标"],["phoneticUs","美式音标"],
    ["partOfSpeech","词性"],["exampleEn","英文例句"],["exampleZh","例句中文翻译"]
  ];
  let a=[];
  for(const [key,label] of fields){
    const value=key==="meaningZh"?word.meaning_zh:key==="phoneticUk"?word.phonetic_uk:
      key==="phoneticUs"?word.phonetic_us:key==="partOfSpeech"?word.part_of_speech:
      key==="exampleEn"?word.example_en:key==="exampleZh"?word.example_zh:word.headword;
    const f=input(label,value||"",key==="exampleEn"?"long":"text");
    f.element.dataset.field=key;
    a.push(f);
    if(a.length===2){fieldRow(form,a);a=[]}
  }
  if(a.length)fieldRow(form,a);
  form.append(node("h3",null,"常用搭配"));
  const pairs=node("div");
  for(const p of word.collocations||[])collocation(pairs,p);
  form.append(pairs);
  const actions=node("div","edit-actions");
  actions.append(
    button("＋ 添加搭配",()=>collocation(pairs)),
    button("查看历史版本",()=>showHistory("word",data.book.id,word.id,word.version))
  );
  const save=button("保存词卡修改",()=>perform(save,async()=>{
    const result=await service().request("/api/staging/editor/drafts/"+data.book.id+"/words/"+word.id,
      "PUT",{...collectWord(form),expectedVersion:word.version});
    notice(result.saved?"词汇修改已保存，并保留了之前的版本。":"没有检测到词汇变化。");
    await service().load(data.book.id);
  }),"");
  actions.append(save);
  form.append(actions);
  form.onsubmit=e=>e.preventDefault();
  $("editorPanel").append(form);
  $("editingArea").scrollIntoView({behavior:"smooth",block:"start"});
}
async function showHistory(type,book,id,currentVersion){
  const host=$("historyPanel");
  host.replaceChildren();
  host.append(node("h3",null,"历史版本 · 仅限草稿"));
  try{
    const data=await service().request("/api/staging/editor/drafts/"+book+"/revisions/"+type+"/"+id);
    if(!data.revisions.length){host.append(node("p",null,"暂无历史版本。第一次保存后会自动保留上一个版本。"));return}
    for(const rev of data.revisions){
      const line=node("div","history-row");
      const summary=type==="chapter"?rev.snapshot.title:rev.snapshot.headword+" · "+rev.snapshot.meaningZh;
      line.append(node("strong",null,summary),node("p","edit-info",rev.savedAt+" · "+rev.version.slice(0,12)));
      const restore=button("恢复这一版",()=>perform(restore,async()=>{
        if(!confirm("将当前草稿内容恢复到这一历史版本？当前版本也会另存为历史记录。"))return;
        const result=await service().request("/api/staging/editor/drafts/"+book+
          (type==="chapter"?"/chapters/":"/words/")+id,"PUT",
          {...rev.snapshot,expectedVersion:currentVersion});
        notice(result.saved?"已恢复指定版本，修改前的内容也已存档。":"版本内容没有变化。");
        await service().load(book);
      }));
      line.append(restore);host.append(line);
    }
  }catch(e){notice(e.message||"读取历史版本失败")}
}
window.addEventListener("miaowu:draft-preview",event=>{
  const data=event.detail;
  if(!data?.book || !Array.isArray(data.chapters))return;
  current=data;
  clearEditor();
  const root=$("previewArea");
  const controls=node("div","edit-actions");
  controls.append(node("strong",null,"直接编辑："));
  const selector=document.createElement("select");
  selector.style.maxWidth="290px";
  selector.setAttribute("aria-label","选择要编辑的单词");
  for(const w of data.words||[]){
    const opt=node("option",null,w.headword+" · "+w.meaning_zh);
    opt.value=w.id;selector.append(opt);
  }
  controls.append(selector,button("编辑选中词汇",()=>{
    const word=data.words.find(w=>w.id===selector.value);
    if(word)wordEditor(data,word);
  }));
  root.insertBefore(controls,root.children[4]||null);
  const chapters=Array.from(root.querySelectorAll(".chapter"));
  data.chapters.forEach((ch,i)=>{
    chapters[i]?.insertBefore(button("编辑这一章",()=>chapterEditor(data,ch)),chapters[i].children[1]||null);
  });
  if(selection){
    const choice=selection.type==="chapter"?data.chapters.find(x=>x.id===selection.id):
      data.words.find(x=>x.id===selection.id);
    if(choice){
      // Recreate the form with the latest server revision stamp.
      if(selection.type==="chapter")chapterEditor(data,choice);
      else wordEditor(data,choice);
      return;
    }
  }
  $("editorPanel").append(node("p","edit-info","点击上方「编辑这一章」或「编辑选中词汇」，开始直接修改未发布草稿。"));
});
})();
