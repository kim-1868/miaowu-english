// S3-C1: read-only, private manuscript quality checks. Never publish anything.
const H={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:H});
const bound=(db,sql,...p)=>db.prepare(sql).bind(...p);
const ID=/^[a-z][a-z0-9_-]{2,79}$/;
const nonempty=x=>typeof x==="string"?x.trim():"";
const flag=(list,code,message,extra={})=>list.push({code,message,...extra});
const sha256=async value=>{
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  return Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
};
function validateChapter(chapter,allWords,membership,blockers,warnings,seen) {
  let content;try{content=JSON.parse(chapter.content_json)}
  catch{flag(blockers,"INVALID_CHAPTER_JSON","章节正文不是有效 JSON",{chapterId:chapter.id});return}
  if(!content||!Array.isArray(content.paragraphs)||!content.paragraphs.length) {
    flag(blockers,"EMPTY_CHAPTER","章节没有有效段落",{chapterId:chapter.id});return;
  }
  for(let p=0;p<content.paragraphs.length;p++){
    const item=content.paragraphs[p];
    const segments=typeof item==="string"?[{text:item}]:item?.segments;
    if(!Array.isArray(segments)||!segments.length) {
      flag(blockers,"INVALID_PARAGRAPH","段落缺少正文片段",{chapterId:chapter.id,paragraph:p+1});continue;
    }
    let joined="";
    for(let s=0;s<segments.length;s++){
      const seg=segments[s];
      if(!seg||typeof seg!=="object"){
        flag(blockers,"INVALID_SEGMENT","正文存在无效片段",{chapterId:chapter.id});continue;
      }
      if(typeof seg.text==="string"&&seg.wordId===undefined){
        joined+=seg.text;
        if(!nonempty(seg.text))flag(warnings,"EMPTY_TEXT","存在空白文字片段",{chapterId:chapter.id});
      }else if(typeof seg.wordId==="string"&&typeof seg.surface==="string"&&typeof seg.gloss==="string"){
        joined+=seg.surface;
        const anchor="p"+p+":s"+s;
        const key=chapter.id+"\u0000"+seg.wordId+"\u0000"+anchor;
        seen.set(key,{chapterId:chapter.id,wordId:seg.wordId,anchor});
        if(!allWords.has(seg.wordId))flag(blockers,"MISSING_WORD","标注引用的单词不存在",{chapterId:chapter.id,wordId:seg.wordId});
        else if(!membership.has(seg.wordId))flag(blockers,"WORD_CATEGORY_MISMATCH","标注单词未关联本书考试分类",{chapterId:chapter.id,wordId:seg.wordId});
        if(!nonempty(seg.surface)||!nonempty(seg.gloss))flag(blockers,"EMPTY_WORD_ANNOTATION","标注英文或中文提示为空",{chapterId:chapter.id,wordId:seg.wordId});
      }else flag(blockers,"INVALID_SEGMENT","正文片段结构不符合规范",{chapterId:chapter.id});
    }
    if(!nonempty(joined))flag(blockers,"EMPTY_PARAGRAPH","段落没有有效文字",{chapterId:chapter.id,paragraph:p+1});
  }
}
export async function reviewDraft(env,bookId){
  if(!ID.test(bookId))return response({error:"INVALID_ID"},400);
  const db=env.DB;
  const book=await bound(db,"SELECT id,title,description,cover_key,category_id,status FROM books WHERE id=? AND status='draft'",bookId).first();
  if(!book)return response({error:"DRAFT_NOT_FOUND"},404);
  const [cr,wr,ar,categoryr,revisionr]=await Promise.all([
    bound(db,"SELECT id,chapter_no,title,is_preview,content_json,published_at FROM chapters WHERE book_id=? ORDER BY chapter_no",bookId).all(),
    bound(db,"SELECT DISTINCT w.id,w.headword,w.phonetic_uk,w.phonetic_us,w.part_of_speech,w.meaning_zh,w.example_en,w.example_zh,w.collocations_json FROM words w JOIN chapter_words cw ON cw.word_id=w.id JOIN chapters ch ON ch.id=cw.chapter_id WHERE ch.book_id=?",bookId).all(),
    bound(db,"SELECT cw.chapter_id,cw.word_id,cw.context_anchor,cw.context_sentence FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id WHERE ch.book_id=?",bookId).all(),
    bound(db,"SELECT word_id FROM word_categories WHERE category_id=?",book.category_id).all(),
    bound(db,"SELECT id FROM editorial_revisions WHERE book_id=? ORDER BY rowid",bookId).all()
  ]);
  const chapters=cr.results||[],words=wr.results||[],annotations=ar.results||[];
  const memberships=categoryr.results||[];
  // The digest covers every persisted editorial field involved in the review.
  // Explicit sorting keeps it stable across different D1 query iteration orders.
  const sorted=(arr,fn)=>[...arr].sort((a,b)=>fn(a).localeCompare(fn(b)));
  const contentFingerprint=await sha256({
    book,
    chapters:sorted(chapters,c=>c.id),
    words:sorted(words,w=>w.id),
    annotations:sorted(annotations,r=>r.chapter_id+"|"+r.word_id+"|"+r.context_anchor),
    membership:sorted(memberships,r=>r.word_id),
    // Any saved revision permanently invalidates older manual acknowledgements,
    // even if an editor later restores exactly the previous text.
    editRevisionIds:(revisionr.results||[]).map(r=>r.id)
  });
  const membership=new Set(memberships.map(x=>x.word_id));
  const blockers=[],warnings=[];
  if(!chapters.length)flag(blockers,"NO_CHAPTERS","书目还没有章节");
  if(!nonempty(book.title))flag(blockers,"MISSING_BOOK_TITLE","书目没有标题");
  if(nonempty(book.description).length<20)flag(warnings,"SHORT_DESCRIPTION","简介较短，建议补全故事背景");
  if(!nonempty(book.cover_key))flag(warnings,"MISSING_COVER","尚未配置书籍封面");
  if(/示例|测试|sample|demo/i.test(book.title))flag(warnings,"DEMO_BOOK","书名含测试或示例标记");
  const previews=chapters.filter(x=>x.is_preview===1).length;
  if(chapters.length&&!previews)flag(blockers,"NO_FREE_PREVIEW","没有免费试读章节");
  if(chapters.length&&previews===chapters.length)flag(blockers,"NO_PAID_CHAPTER","没有非试读章节");
  if(chapters.some(x=>x.published_at!==null))flag(blockers,"PARTIALLY_PUBLISHED","书目存在已发布章节");
  for(let i=0;i<chapters.length;i++){
    const c=chapters[i];
    if(c.chapter_no!==i+1)flag(blockers,"CHAPTER_GAP","章节排序不是从1开始连续排列",{chapterId:c.id,number:c.chapter_no});
    if(!nonempty(c.title))flag(blockers,"MISSING_CHAPTER_TITLE","章节标题为空",{chapterId:c.id});
  }
  // Check all word references, not just words currently indexed by chapter_words.
  const wordMap=new Map(words.map(w=>[w.id,w]));
  const observed=new Map();
  for(const ch of chapters)validateChapter(ch,wordMap,membership,blockers,warnings,observed);
  const stored=new Set();
  for(const row of annotations){
    const key=row.chapter_id+"\u0000"+row.word_id+"\u0000"+row.context_anchor;
    stored.add(key);
    if(!observed.has(key))flag(blockers,"ORPHAN_WORD_ANCHOR","词汇索引找不到对应正文位置",{chapterId:row.chapter_id,wordId:row.word_id,anchor:row.context_anchor});
  }
  for(const [key,v] of observed)if(!stored.has(key))
    flag(blockers,"MISSING_WORD_ANCHOR","正文标注缺少词汇位置索引",v);
  for(const w of words){
    if(!nonempty(w.headword)||!nonempty(w.meaning_zh))flag(blockers,"WORD_MISSING_MEANING","英文词或释义缺失",{wordId:w.id});
    if(!membership.has(w.id))flag(blockers,"WORD_CATEGORY_MISMATCH","单词缺少当前分类关联",{wordId:w.id});
    if(!nonempty(w.phonetic_uk)&&!nonempty(w.phonetic_us))flag(warnings,"WORD_MISSING_PHONETIC","词汇缺少音标",{wordId:w.id});
    if(!nonempty(w.part_of_speech))flag(warnings,"WORD_MISSING_POS","词汇缺少词性",{wordId:w.id});
    if(!nonempty(w.example_en)||!nonempty(w.example_zh))flag(warnings,"WORD_MISSING_EXAMPLE","词汇缺少例句或翻译",{wordId:w.id});
    let collocations;try{collocations=JSON.parse(w.collocations_json||"[]")}catch{collocations=null}
    if(!Array.isArray(collocations)||collocations.length<2)
      flag(warnings,"WORD_FEW_COLLOCATIONS","建议至少两组常用搭配",{wordId:w.id});
  }
  if(chapters.length&&words.length<10)flag(warnings,"LOW_VOCABULARY","目标词量较低，需要人工评估课程覆盖率");
  const humanChecks=[
    {code:"ORIGINALITY_AND_RIGHTS",title:"确认原创性、版权和封面素材授权",status:"manual_required"},
    {code:"LANGUAGE_PROOFREADING",title:"人工检查英语用法、中文释义及阅读自然度",status:"manual_required"},
    {code:"PRODUCT_SCOPE",title:"人工确认故事完整度、考试词表覆盖和试看边界",status:"manual_required"}
  ];
  return response({book:{id:book.id,title:book.title,category:book.category_id,status:book.status},
    metrics:{chapters:chapters.length,previewChapters:previews,paidChapters:chapters.length-previews,
      distinctWords:words.length,wordOccurrences:observed.size},
    technicalCheckPassed:blockers.length===0,
    blockers:blockers.slice(0,150),blockerCount:blockers.length,
    warnings:warnings.slice(0,150),warningCount:warnings.length,
    manualChecks:humanChecks,contentFingerprint,publicationEnabled:false,
    note:"自动检查不等于人工审核；此页面不会修改草稿或发布内容。"});
}
