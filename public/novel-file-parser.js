// Browser/Node pure text-to-licensed-vocabulary import format.
// A story file never silently invents an IPA, translation or word definition.
// Inline [[word|meaning]] is explicit; ordinary English tokens are matched
// against approved existing word cards and left literal when ambiguous.
const ID=/^[a-z][a-z0-9_-]{2,79}$/;
const heading=/^(?:\s*#{2,3}\s+(.+)|\s*第\s*([0-9零一二三四五六七八九十百]+)\s*章\s*[：:、·.\s-]*(.*)|\s*Chapter\s+([0-9]+)\s*[：:.\s-]*(.*))$/i;
const token=/\[\[([a-z][a-z'-]{0,69})(?:\|([^\]\r\n]{1,200}))?\]\]|[a-z][a-z'-]*/gi;
const category=new Set(["cet4","cet6","postgrad","ielts"]);
const texts=x=>typeof x==="string"?x.trim():"";
const groupWord=name=>texts(name).toLowerCase();
const safeName=w=>({id:w.id,headword:w.headword,meaningZh:w.meaningZh,
 phoneticUk:w.phoneticUk||"",phoneticUs:w.phoneticUs||"",
 partOfSpeech:w.partOfSpeech||"",exampleEn:w.exampleEn||"",
 exampleZh:w.exampleZh||"",collocations:w.collocations||[]});
const addPlain=(segments,t)=>{
 if(!t)return;
 const last=segments[segments.length-1];
 if(last&&"text" in last)last.text+=t;
 else segments.push({text:t});
};
function splitChapters(text){
 const lines=text.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n").split("\n");
 const chapters=[];let current=null,para=[];
 const flushParagraph=()=>{
  if(!current||!para.length)return;
  const joined=para.join("").trim();if(joined)current.paragraphs.push(joined);
  para=[];
 };
 const flushChapter=()=>{if(!current)return;flushParagraph();if(current.paragraphs.length)chapters.push(current);current=null};
 for(const line of lines){
  const match=line.match(heading);
  if(match){
   flushChapter();
   const title=match[1]||match[3]||match[5]||"未命名章节";
   current={title:title.trim(),paragraphs:[]};continue;
  }
  if(!current){if(!line.trim()||/^\s*#\s+/.test(line))continue;current={title:"正文",paragraphs:[]};}
  if(!line.trim()){flushParagraph();continue;}
  // Novel formatting: single-line paragraphs (each natural newline).
  flushParagraph();para.push(line.trim());flushParagraph();
 }
 flushChapter();
 return chapters;
}
export function parseNovelTextFile(source,opts={}){
 const {bookId,title,description="",coverKey=null,category:kind="cet4",
  previewChapters=0,words=[]}=opts;
 if(!ID.test(bookId||""))throw Error("BOOK_ID_INVALID");
 if(!texts(title)||texts(title).length>120)throw Error("BOOK_TITLE_INVALID");
 if(!category.has(kind))throw Error("BOOK_CATEGORY_INVALID");
 if(!Number.isInteger(previewChapters)||previewChapters<0)throw Error("PREVIEW_COUNT_INVALID");
 if(typeof source!=="string"||!source.trim())throw Error("STORY_FILE_EMPTY");
 const list=splitChapters(source);
 if(list.length<1||list.length>60)throw Error("CHAPTER_COUNT_INVALID");
 if(previewChapters>=list.length)throw Error("REQUIRES_AT_LEAST_ONE_PAID_CHAPTER");
 const map=new Map();
 for(const card of words){
  if(!card||typeof card!=="object"||!card.id||!card.headword)continue;
  const key=groupWord(card.headword),arr=map.get(key)||[];
  arr.push(card);map.set(key,arr);
 }
 const used=new Map(),issues=[],unresolved=[],chapters=[],chapterDensity=[];
 for(const [ci,ch] of list.entries()){
  const paragraphs=[];
  for(const [pi,paragraph] of ch.paragraphs.entries()){
   const segments=[];let last=0,anchors=0;
   for(const match of paragraph.matchAll(token)){
    const explicit=match[0].startsWith("[[");
    const word=explicit?match[1]:match[0];
    const gloss=explicit?texts(match[2]):"";
    addPlain(segments,paragraph.slice(last,match.index));
    const candidates=map.get(groupWord(word))||[];
    const matching=gloss?candidates.filter(c=>texts(c.meaningZh)===gloss):candidates;
    if(matching.length===1){
     const card=matching[0];
     segments.push({wordId:card.id,surface:word,gloss:gloss||card.meaningZh});
     used.set(card.id,safeName(card));anchors++;
     if(!card.phoneticUk||!card.phoneticUs||!card.partOfSpeech||
        !card.exampleEn||!card.exampleZh)issues.push({
        kind:"INCOMPLETE_WORD_CARD",chapter:ci+1,paragraph:pi+1,word
       });
    }else{
     addPlain(segments,word);
     if(explicit)unresolved.push({chapter:ci+1,paragraph:pi+1,word,
      reason:matching.length>1?"AMBIGUOUS_WORD_CARD":"NO_MATCHING_WORD_CARD"});
     else if(!candidates.length)issues.push({
      kind:"UNTRACKED_ENGLISH",chapter:ci+1,paragraph:pi+1,word
     });
     else issues.push({kind:"AMBIGUOUS_WORD_CARD",chapter:ci+1,paragraph:pi+1,word});
    }
    last=match.index+match[0].length;
   }
   addPlain(segments,paragraph.slice(last));
   if(segments.length)paragraphs.push({segments});
   if(anchors<3)issues.push({kind:"LOW_DENSITY_PARAGRAPH",
    chapter:ci+1,paragraph:pi+1,count:anchors});
   if(segments.length>100)throw Error("TOO_MANY_SEGMENTS_IN_PARAGRAPH");
  }
  if(paragraphs.length<1||paragraphs.length>150)throw Error("CHAPTER_PARAGRAPH_LIMIT");
  chapterDensity.push(paragraphs.reduce((sum,p)=>sum+p.segments.filter(s=>s.wordId).length,0));
  chapters.push({id:bookId+"-ch"+(ci+1),number:ci+1,title:ch.title,
    preview:ci<previewChapters,paragraphs});
 }
 if(unresolved.length)throw Object.assign(Error("EXPLICIT_WORD_CARD_UNRESOLVED"),{details:unresolved});
 if(!used.size)throw Error("NO_LEARNING_VOCABULARY_MATCHED");
 if(used.size>500)throw Error("TOO_MANY_WORDS_IN_ONE_BOOK");
 const result={version:1,sourceLabel:"self-service-upload",book:{
  id:bookId,title:title.trim(),category:kind,description,coverKey},
  chapters,words:[...used.values()]};
 const all=chapterDensity.reduce((a,b)=>a+b,0);
 return {package:result,report:{
  chapters:chapters.length,wordCards:used.size,anchors:all,
  avgPerParagraph:Number((all/chapters.reduce((n,c)=>n+c.paragraphs.length,0)).toFixed(2)),
  warnings:issues,unresolved,previewChapters,
  allWordCardsComplete:![...used.values()].some(w=>!w.phoneticUk||!w.phoneticUs||
   !w.partOfSpeech||!w.exampleEn||!w.exampleZh)
 }};
}