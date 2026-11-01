// Combine original pilot + draft continuation into ONE importable but never
// publishable package for editorial QA. This command has no Cloudflare access.
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {composeRainyNightDraft} from "./compose-rainy-night-s1.mjs";
import {chapters as chapters7to9,wordRows as words7to9} from "../content/drafts/rainy-night-s1-ch07-ch09.mjs";
import {chapters as chapters10to12,wordRows as words10to12} from "../content/drafts/rainy-night-s1-ch10-ch12.mjs";
import {validatePackage} from "../src/editorial-content.js";
const TOKEN=/\[\[([a-z]+)\]\]/g;
const fail=code=>{throw Error("RAINY_NIGHT_S1: "+code)};
export function composeRainyNightSeasonDraft(){
  const {bundle}=composeRainyNightDraft();
  bundle.sourceLabel="rainy-night-s1-all12-private-first-draft-not-approved";
  bundle.book.title="【测试】雨夜档案 · 第一季全12章待审核初稿";
  bundle.book.description="原创轻悬疑《雨夜档案》第一季12章内部初稿：包含23:47归还信箱、被错误分类的档案、社区防汛物资登记、姐妹重聚等完整故事主线。文字自然度、CET4词汇等级、音标、读音、语境义与教学效果仍待人工审核。仅供开发校对，禁止公开展示或收费。";
  const seen=new Map(bundle.words.map(w=>[w.headword,w]));
  const added=new Map();
  for(const row of [...words7to9,...words10to12]){
    if(!Array.isArray(row)||row.length!==7)fail("INVALID_VOCAB_ROW");
    const [headword,partOfSpeech,meaningZh,exampleEn,exampleZh,collocation,collocationZh]=row;
    if(!/^[a-z]+$/.test(headword)||seen.has(headword))fail("DUPLICATE_VOCAB_"+headword);
    const word={id:"rns1-"+headword,headword,partOfSpeech,meaningZh,exampleEn,exampleZh,
      phoneticUk:null,phoneticUs:null,collocations:[{en:collocation,zh:collocationZh}]};
    seen.set(headword,word);added.set(headword,word);bundle.words.push(word);
  }
  const stats=[];
  const referenced=new Set();
  for(const chapter of [...chapters7to9,...chapters10to12]){
    let anchors=0;const active=new Set();
    const paragraphs=chapter.paragraphs.map(paragraph=>{
      if(typeof paragraph!=="string"||paragraph.length<40)fail("PARAGRAPH_TOO_SHORT_"+chapter.id);
      let cursor=0;const segments=[];
      for(const match of paragraph.matchAll(TOKEN)){
        if(match.index>cursor)segments.push({text:paragraph.slice(cursor,match.index)});
        const word=seen.get(match[1]);
        if(!word)fail("UNKNOWN_VOCAB_"+match[1]);
        segments.push({wordId:word.id,surface:word.headword,gloss:word.meaningZh.split("；")[0]});
        if(added.has(match[1])){referenced.add(match[1]);active.add(match[1])}
        anchors++;cursor=match.index+match[0].length;
      }
      if(cursor<paragraph.length)segments.push({text:paragraph.slice(cursor)});
      if(segments.length===0||segments.some(s=>s.text?.includes("[[")||s.text?.includes("]]")))
        fail("UNPARSED_VOCAB_"+chapter.id);
      return {segments};
    });
    if(paragraphs.length<14||active.size<14||anchors<14)
      fail("UNDER_DEVELOPED_CHAPTER_"+chapter.id);
    stats.push({chapter:chapter.number,paragraphs:paragraphs.length,newWords:active.size,anchors});
    bundle.chapters.push({number:chapter.number,id:chapter.id,title:chapter.title,
      preview:false,paragraphs});
  }
  for(const word of added.keys())if(!referenced.has(word))fail("UNUSED_VOCAB_"+word);
  if(bundle.chapters.map(x=>x.number).join(",")!=="1,2,3,4,5,6,7,8,9,10,11,12")
    fail("BAD_SEASON_SEQUENCE");
  if(bundle.chapters.filter(x=>x.preview).length!==1||bundle.chapters[0].preview!==true)
    fail("FREE_SCOPE_ERROR");
  const result=validatePackage(bundle);
  const summary={status:"INTERNAL_FIRST_DRAFT_NEEDS_MANUAL_REVIEW",chapters:result.chapters.length,
    words:result.words.length,wordMentions:result.mentionCount,
    newlyAddedWords:added.size,
    laterChapterCoverage:stats,category:bundle.book.category,
    notForSale:true,notDeployed:true,releaseBlockedByDraftId:true};
  if(summary.words<180||summary.words>240)fail("WORD_TOTAL_OUTSIDE_PLANNED_POOL");
  return {bundle,summary};
}
function main(){
  const args=process.argv.slice(2);
  if(args.some(x=>x!=="--check"&&x!=="--write-private"))fail("UNSUPPORTED_ARG");
  const {bundle,summary}=composeRainyNightSeasonDraft();
  if(args.includes("--write-private")){
    const directory=resolve("private-output");
    mkdirSync(directory,{recursive:true,mode:0o700});
    writeFileSync(resolve(directory,"rainy-night-s1-12chapters-UNREVIEWED.json"),
      JSON.stringify(bundle,null,2)+"\n",{encoding:"utf8",mode:0o600});
  }
  process.stdout.write(JSON.stringify(summary,null,2)+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1}
}
