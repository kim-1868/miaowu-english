// Assemble private original manuscript for internal review only.
// Never write the output into public/ or a Cloudflare-bound directory.
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {validatePackage} from "../src/editorial-content.js";
import {continuation} from "../content/drafts/rainy-night-s1-ch03-ch06.mjs";

const sourceUrl=new URL("../content/drafts/rainy-night-archives-two-chapter-pilot.json",import.meta.url);
const old=JSON.parse(readFileSync(sourceUrl,"utf8"));
const WORD=/\[\[([a-z]+)\]\]/g;
function fail(code){throw Error("RAINY_NIGHT_ASSEMBLY: "+code)}
export function composeRainyNightDraft(){
 const bundle=structuredClone(old);
 bundle.sourceLabel="rainy-night-season-one-ch01-ch06-private-unreviewed";
 bundle.book.title="【测试】雨夜档案 · 第1—6章内部校对稿";
 bundle.book.description="原创轻悬疑《雨夜档案》第一季的前六章内部校对稿，包含六章连续情节及语境词汇标注。当前缺少后六章，首批章节的音标、词汇等级、复习题与语言表达仍待复核，禁止公开发布或收费。";
 bundle.book.coverKey="rainy-night-draft-not-for-sale";
 const seenWords=new Map(bundle.words.map(w=>[w.headword,w.id]));
 const added=new Map();
 for(const row of continuation.words){
  if(!Array.isArray(row)||row.length!==7)fail("INVALID_WORD_ROW");
  const [headword,partOfSpeech,meaningZh,exampleEn,exampleZh,collocation,collocationZh]=row;
  if(!/^[a-z]+$/.test(headword)||seenWords.has(headword)||added.has(headword))
    fail("DUPLICATE_OR_INVALID_WORD_"+headword);
  const wordId="rns1-"+headword;
  const word={id:wordId,headword,partOfSpeech,meaningZh,exampleEn,exampleZh,
     phoneticUk:null,phoneticUs:null,collocations:[{en:collocation,zh:collocationZh}]};
  added.set(headword,word);seenWords.set(headword,wordId);
  bundle.words.push(word);
 }
 const countByChapter=[];
 for(const ch of continuation.chapters){
  let anchors=0;const usedNew=new Set();const paragraphs=[];
  for(const text of ch.paragraphs){
    if(typeof text!=="string"||!text.trim())fail("EMPTY_PARAGRAPH_"+ch.id);
    const segments=[];let start=0;
    for(const m of text.matchAll(WORD)){
      if(m.index>start)segments.push({text:text.slice(start,m.index)});
      const headword=m[1];const id=seenWords.get(headword);
      if(!id)fail("UNKNOWN_WORD_"+headword);
      const entry=added.get(headword)||bundle.words.find(w=>w.headword===headword);
      segments.push({wordId:id,surface:headword,gloss:entry.meaningZh.split("；")[0]});
      anchors++;if(added.has(headword))usedNew.add(headword);
      start=m.index+m[0].length;
    }
    if(start<text.length)segments.push({text:text.slice(start)});
    if(segments.some(seg=>seg.text?.includes("[[")||seg.text?.includes("]]")))
      fail("MALFORMED_ANNOTATION_"+ch.id);
    paragraphs.push({segments});
  }
  if(usedNew.size<12||anchors<12)fail("INSUFFICIENT_VOCABULARY_"+ch.id);
  countByChapter.push({chapter:ch.number,paragraphs:ch.paragraphs.length,
     newWords:usedNew.size,anchors});
  bundle.chapters.push({id:ch.id,number:ch.number,title:ch.title,
    preview:false,paragraphs});
 }
 const expectedNew=new Set(added.keys());
 const used= new Set(continuation.chapters.flatMap(ch=>ch.paragraphs.flatMap(p=>
   [...p.matchAll(WORD)].map(m=>m[1]))));
 for(const word of expectedNew)if(!used.has(word))fail("ORPHAN_WORD_"+word);
 if(bundle.chapters.length!==6||bundle.chapters.map(ch=>ch.number).join(",")!=="1,2,3,4,5,6")
  fail("INVALID_CHAPTER_SEQUENCE");
 if(bundle.chapters.filter(ch=>ch.preview).length!==1||bundle.chapters[0].preview!==true)
  fail("INVALID_PREVIEW_SCOPE");
 const validated=validatePackage(bundle);
 return {bundle,summary:{sourceLabel:bundle.sourceLabel,chapterCount:bundle.chapters.length,
    totalVocabulary:bundle.words.length,newVocabulary:added.size,
    totalWordMentions:validated.mentionCount,continuationChapters:countByChapter,
    publishable:false,description:"Unreviewed original manuscript; contains test markers and incomplete season."}};
}
function main(){
 const args=process.argv.slice(2);
 if(args.length&&!args.every(a=>a==="--check"||a==="--write-private"))
  fail("Usage: node scripts/compose-rainy-night-s1.mjs [--check|--write-private]");
 const {bundle,summary}=composeRainyNightDraft();
 if(args.includes("--write-private")){
  const folder=resolve("private-output");
  mkdirSync(folder,{recursive:true,mode:0o700});
  writeFileSync(resolve(folder,"rainy-night-s1-ch01-ch06-internal-only.json"),
    JSON.stringify(bundle,null,2)+"\n",{encoding:"utf8",mode:0o600});
 }
 process.stdout.write(JSON.stringify(summary,null,2)+"\n");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1}
}
