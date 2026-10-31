// Shared pure validator for D1 editor and offline SQL importer. No Node dependencies.
const ID = /^[a-z][a-z0-9_-]{2,79}$/;
const CATEGORIES = new Set(["cet4", "cet6", "postgrad", "ielts"]);
const fail = message => { throw new Error("Content validation: " + message); };
function string(value, where, min = 1, max = 4000) {
  if (typeof value !== "string" || value.trim().length < min || value.length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(where + " must be valid text (" + min + "-" + max + ")");
  return value;
}
function optional(value, where, max = 4000) {
  return value == null || value === "" ? null : string(value, where, 1, max);
}
function id(value, where) {
  if (typeof value !== "string" || !ID.test(value)) fail(where + " must match " + ID);
  return value;
}
function array(value, where, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(where + " must contain " + min + "-" + max + " items");
  return value;
}
export function validatePackage(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || input.version !== 1) fail("version must be 1");
  if (!input.book || typeof input.book !== "object") fail("book is required");
  const book=input.book;
  id(book.id,"book.id");
  string(book.title,"book.title",1,120);
  if (!CATEGORIES.has(book.category)) fail("book.category must be cet4/cet6/postgrad/ielts");
  optional(book.description,"book.description",2000);
  optional(book.coverKey,"book.coverKey",200);
  const chapters=array(input.chapters,"chapters",1,60);
  const words=array(input.words,"words",1,1500);
  const wordIds=new Set(), chapterIds=new Set(), chapterNumbers=new Set();
  for (const [i,w] of words.entries()) {
    id(w.id,"words["+i+"].id");
    if (wordIds.has(w.id)) fail("duplicate word id: "+w.id);
    wordIds.add(w.id);
    string(w.headword,"word headword",1,70);
    string(w.meaningZh,"word Chinese meaning",1,300);
    optional(w.phoneticUk,"phoneticUk",120);
    optional(w.phoneticUs,"phoneticUs",120);
    optional(w.partOfSpeech,"partOfSpeech",60);
    optional(w.exampleEn,"exampleEn",700);
    optional(w.exampleZh,"exampleZh",700);
    const cs=array(w.collocations || [],"collocations",0,8);
    cs.forEach((pair,j)=>{
      if (!pair || typeof pair !== "object") fail("invalid collocation "+i+":"+j);
      string(pair.en,"collocation.en",1,200);
      string(pair.zh,"collocation.zh",1,200);
    });
  }
  let mentionCount=0;
  for(const [i,ch] of chapters.entries()){
    id(ch.id,"chapters["+i+"].id");
    if(chapterIds.has(ch.id))fail("duplicate chapter id "+ch.id);
    chapterIds.add(ch.id);
    if(!Number.isInteger(ch.number) || ch.number<1 || ch.number>500)fail("invalid chapter number");
    if(chapterNumbers.has(ch.number))fail("duplicate chapter number "+ch.number);
    chapterNumbers.add(ch.number);
    string(ch.title,"chapter title",1,120);
    if(typeof ch.preview!=="boolean")fail("chapter.preview must be true/false");
    array(ch.paragraphs,"chapter paragraphs",1,150).forEach((paragraph,p)=>{
      if(!paragraph || typeof paragraph!=="object" || !Array.isArray(paragraph.segments))fail("paragraph must have segments");
      const segments=array(paragraph.segments,"paragraph segments",1,100);
      let length=0;
      segments.forEach((seg,k)=>{
        if(!seg || typeof seg!=="object")fail("bad segment");
        const text=seg.text, wordId=seg.wordId;
        if(typeof text==="string" && wordId===undefined){
          string(text,"paragraph text",1,5000);length+=text.length;
        }else if(typeof wordId==="string" && text===undefined){
          id(wordId,"word segment wordId");
          if(!wordIds.has(wordId))fail("unknown wordId "+wordId+" in chapter "+ch.id);
          const surface=string(seg.surface,"word surface",1,80);
          string(seg.gloss,"word gloss",1,200);
          length+=surface.length;mentionCount++;
        } else fail("segment requires either text or wordId/surface/gloss");
        if(length>6000)fail("paragraph exceeds 6000 characters");
      });
    });
  }
  const label=optional(input.sourceLabel,"sourceLabel",120) || "original-editorial";
  return { book, chapters, words, label, mentionCount };
}
