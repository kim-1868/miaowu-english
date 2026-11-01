// Non-publishing manuscript health report. It never touches public/ or D1.
// Every metric is calculated from the *assembled private draft*, not inferred
// from filenames or marketing labels.
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {resolve} from "node:path";
import {mkdirSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const cjkCount=s=>(s.match(/\p{Script=Han}/gu)||[]).length;
// Editorial planning heuristic only, not a published learning-science standard.
const MIN_CROSS_CHAPTER_REPEAT_SHARE=0.30;
const validIpa=s=>typeof s==="string"&&s.trim().length>0;
export function auditRainyNight(bundle){
 const wordMap=new Map(bundle.words.map(w=>[w.id,w]));
 const usage=new Map([...wordMap.keys()].map(id=>[id,{mentions:0,chapters:new Set()}]));
 const chapters=[];
 for(const chapter of bundle.chapters){
  let hanCharacters=0,mentions=0,unannotatedEnglish=0;
  const distinctWords=new Set();
  for(const paragraph of chapter.paragraphs){
   const parts=paragraph.segments??[];
   for(const part of parts){
    if(typeof part.text==="string"){
      hanCharacters+=cjkCount(part.text);
      unannotatedEnglish+=(part.text.match(/\b[a-zA-Z]{3,}\b/g)||[]).length;
    }else if(typeof part.wordId==="string"){
      const word=wordMap.get(part.wordId);
      if(!word)throw new Error("UNKNOWN_WORD_IN_CHAPTER_"+part.wordId);
      const record=usage.get(part.wordId);
      record.mentions++;
      record.chapters.add(chapter.number);
      distinctWords.add(part.wordId);
      mentions++;
    }
   }
  }
  chapters.push({
   number:chapter.number,title:chapter.title,
   paragraphs:chapter.paragraphs.length,
   hanCharacters,wordMentions:mentions,distinctWords:distinctWords.size,
   unannotatedEnglishSegments:unannotatedEnglish
  });
 }
 const allUsage=[...usage.values()];
 const wordsWithNoMentions=allUsage.filter(r=>r.mentions===0).length;
 const wordsOnlyOnce=allUsage.filter(r=>r.mentions===1).length;
 const repeatedAcrossChapters=allUsage.filter(r=>r.chapters.size>=2).length;
 const wordsWithoutIpa=bundle.words.filter(w=>!validIpa(w.phoneticUk)||!validIpa(w.phoneticUs)).length;
 const wordsWithoutTranslations=bundle.words.filter(w=>!
  (typeof w.exampleEn==="string"&&w.exampleEn.trim()&&typeof w.exampleZh==="string"&&w.exampleZh.trim())).length;
 const wordsWithoutVerifiedLevel=bundle.words.filter(w=>w.verifiedCET4!==true).length;
 const repeatTarget=Math.ceil(bundle.words.length*MIN_CROSS_CHAPTER_REPEAT_SHARE);
 const repeatGap=Math.max(0,repeatTarget-repeatedAcrossChapters);
 const findings=[];
 if(wordsWithoutIpa)findings.push({code:"IPA_UNVERIFIED",count:wordsWithoutIpa,
  message:"英美音标或发音资料未全部核对"});
 if(wordsWithoutVerifiedLevel)findings.push({code:"CET4_LEVEL_UNVERIFIED",count:wordsWithoutVerifiedLevel,
  message:"不能仅凭书籍所属分类认定词汇已通过CET4等级审核"});
 if(wordsWithNoMentions)findings.push({code:"ORPHAN_VOCABULARY",count:wordsWithNoMentions,
  message:"存在未在正文中出现的词汇"});
 if(repeatGap)findings.push({code:"CROSS_CHAPTER_REUSE_TARGET_NOT_MET",count:repeatGap,
  message:"内部暂定至少30%的候选词在后续章节自然再现；这是编辑目标，不是官方考试标准或教学成效证明"});
 if(wordsWithoutTranslations)findings.push({code:"MISSING_TRANSLATIONS",count:wordsWithoutTranslations,
  message:"仍缺少完整双语例句"});
 if(chapters.length!==12)findings.push({code:"INCOMPLETE_SEASON",count:12-chapters.length,
  message:"首季章节未全部编写"});
 return {
  releaseStatus:findings.length?"BLOCKED_FOR_EDITORIAL_REVIEW":"REQUIRES_HUMAN_SIGNOFF",
  draftId:bundle.book.id,
  chapters:chapters,
  chapterCount:chapters.length,
  targetWords:bundle.words.length,
  totalMentions:allUsage.reduce((a,r)=>a+r.mentions,0),
  wordsWithNoMentions,wordsOnlyOnce,repeatedAcrossChapters,
  crossChapterReusePlanningTarget:repeatTarget,crossChapterReuseGap:repeatGap,
  wordsWithoutIpa,wordsWithoutVerifiedLevel,wordsWithoutTranslations,
  findings
 };
}
export function reportMarkdown(report){
 const header="# 《雨夜档案》第一季内部质量审计\n\n"+
  "**仅供人工编辑，不能视为达到正式发行标准。**\n\n"+
  "版本："+report.draftId+"；状态："+report.releaseStatus+"\n\n"+
  "| 核对项 | 数量 |\n|---|---:|\n"+
  "| 草稿章节 | "+report.chapterCount+" |\n"+
  "| 词条候选 | "+report.targetWords+" |\n"+
  "| 词汇总标注次数 | "+report.totalMentions+" |\n"+
  "| 正文未出现的词条 | "+report.wordsWithNoMentions+" |\n"+
  "| 仅标注一次的词条 | "+report.wordsOnlyOnce+" |\n"+
  "| 至少跨两章出现的词条 | "+report.repeatedAcrossChapters+" |\n"+
  "| 编辑规划跨章复现目标（内部暂定30%） | "+report.crossChapterReusePlanningTarget+" |\n"+
  "| 尚需增加跨章复现的词条 | "+report.crossChapterReuseGap+" |\n"+
  "| 未完成英美音标核验 | "+report.wordsWithoutIpa+" |\n"+
  "| 未完成CET4等级独立核验 | "+report.wordsWithoutVerifiedLevel+" |\n"+
  "| 缺少完整双语例句 | "+report.wordsWithoutTranslations+" |\n\n";
 const chapters="## 分章统计\n\n| 章 | 段落数 | 汉字数 | 标注次数 | 不重复词 | 待编辑核查的未标注英文词 |\n|---:|---:|---:|---:|---:|---:|\n"+
  report.chapters.map(c=>"| "+c.number+" | "+c.paragraphs+" | "+
   c.hanCharacters+" | "+c.wordMentions+" | "+c.distinctWords+" | "+
   c.unannotatedEnglishSegments+" |").join("\n")+"\n\n"+
  "长度仅是汉字计数；不推断用户真实阅读时长。\n\n";
 const findings="## 待编辑核验\n\n"+
  report.findings.map(f=>"- **"+f.code+"（"+f.count+"）**："+f.message).join("\n")+"\n\n"+
  "自动检查不能替代词典IPA、官方等级表、发音、文字自然度、版权与跨章逻辑的人审。\n";
 return header+chapters+findings;
}
function main(){
 const args=process.argv.slice(2);
 if(args.some(x=>!["--json","--write-private","--strict"].includes(x))){
  throw new Error("Usage: node scripts/audit-rainy-night-s1.mjs [--json] [--write-private] [--strict]");
 }
 const {bundle}=composeRainyNightSeasonDraft();
 const report=auditRainyNight(bundle);
 if(args.includes("--write-private")){
  const output=resolve("private-output");
  mkdirSync(output,{recursive:true,mode:0o700});
  writeFileSync(resolve(output,"rainy-night-s1-editorial-audit.md"),
    reportMarkdown(report),{mode:0o600});
 }
 process.stdout.write(args.includes("--json")?JSON.stringify(report,null,2)+"\n":reportMarkdown(report));
 if(args.includes("--strict")&&report.releaseStatus!=="REQUIRES_HUMAN_SIGNOFF")process.exitCode=1;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1}
}
