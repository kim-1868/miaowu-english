// REVIEW-ONLY candidate for chapters 2–12. No production writes or auto approval.
// Replace Chinese words ONLY when a corresponding existing English word card
// has the same meaning and part of speech. Retain all original word anchors.
// Conservative substitutions are traceable; do not invent new plot events.
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {prepareRainyNightMemberCandidate} from "./prepare-rainy-night-member-candidate.mjs";
import {auditChapterDensity} from "./audit-cet4-word-density.mjs";

// Ordered: specific, grounded phrases first. No inference or text generation.
const RULES=[
 ["旧档案","旧 [[archive]]"],["档案馆","[[archive]] 馆"],["图书管理员","[[librarian]]"],
 ["目击证人","[[witness]]"],["目击者","[[witness]]"],["一份证词","一份 [[testimony]]"],
 ["证人证言","[[testimony]]"],["证言","[[testimony]]"],
 ["临时安置点","临时 [[shelter]]"],["社区居民","[[community]] [[resident]]"],
 ["居民","[[resident]]"],["社区","[[community]]"],["物资清单","物资 [[inventory]]"],
 ["物资供应","[[supply]]"],["物资","[[supply]]"],
 ["借阅记录","借阅 [[record]]"],["登记记录","登记 [[record]]"],["通话记录","通话 [[record]]"],
 ["一条记录","一条 [[record]]"],["旧记录","旧 [[record]]"],
 ["记录表","[[record]] 表"],["原始记录","原始 [[record]]"],
 ["调拨记录","调拨 [[record]]"],["移交记录","移交 [[record]]"],
 ["文字记录","[[transcript]]"],["访谈记录","访谈 [[transcript]]"],
 ["录音笔","[[recording]] 设备"],["录音文件","[[recording]] 文件"],
 ["这段录音","这段 [[recording]]"],["一段录音","一段 [[recording]]"],
 ["录音","[[recording]]"],["笔录","[[transcript]]"],
 ["身份证明","[[identity]] 证明"],["身份信息","[[identity]] 信息"],
 ["个人身份","个人 [[identity]]"],["真实身份","真实 [[identity]]"],
 ["身份","[[identity]]"],["使用权限","[[access]]"],
 ["访问权限","[[access]]"],["权限","[[permission]]"],
 ["调查报告","调查 [[document]]"],["书面文件","书面 [[document]]"],
 ["原始文件","原始 [[document]]"],["一份文件","一份 [[document]]"],["文件","[[document]]"],
 ["原始照片","原始 [[photograph]]"],["一张照片","一张 [[photograph]]"],
 ["照片","[[photograph]]"],["书脊","[[spine]]"],
 ["封条","[[seal]]"],["印章","[[stamp]]"],["邮戳","[[stamp]]"],
 ["签名","[[signature]]"],["水印","[[watermark]]"],["信封","[[envelope]]"],
 ["笔迹","[[handwriting]]"],["便条上的日期","便条上的 [[date]]"],
 ["签署日期","签署 [[date]]"],["日期","[[date]]"],
 ["一条线索","一条 [[clue]]"],["这条线索","这条 [[clue]]"],["线索","[[clue]]"],
 ["可靠的证据","可靠的 [[evidence]]"],["相关证据","相关 [[evidence]]"],
 ["证据","[[evidence]]"],["可靠的证明","可靠的 [[proof]]"],
 ["证明材料","[[proof]] 材料"],
 ["细节","[[detail]]"],["痕迹","[[trace]]"],["资料来源","资料 [[source]]"],
 ["信息来源","信息 [[source]]"],["来源","[[source]]"],
 ["责任","[[responsibility]]"],["承诺","[[promise]]"],
 ["隐私","[[privacy]]"],["秘密","[[secret]]"],
 ["错误记录","错误 [[record]]"],["错误","[[mistake]]"],
 ["差异","[[discrepancy]]"],["问题的后果","问题的 [[consequence]]"],
 ["后果","[[consequence]]"],
 ["书面请求","书面 [[request]]"],
 ["提出申请","提出 [[request]]"],["收到请求","收到 [[request]]"],
 ["一份申请","一份 [[request]]"],["正式申请","正式 [[request]]"],
 ["回执","[[receipt]]"],["收据","[[receipt]]"],
 ["更正","[[correction]]"],["备份","[[backup]]"],
 ["登记簿","[[register]]"],["一条证词","一条 [[testimony]]"],
 ["标签","[[label]]"],["位置","[[position]]"],["轮廓","[[outline]]"],
 ["顺序","[[sequence]]"],["规律","[[pattern]]"],["时间表","[[schedule]]"],
 ["值班表","值班 [[schedule]]"],["计划表","[[schedule]]"],
 ["设备","[[device]]"],["装置","[[device]]"],
 ["风险","[[risk]]"],["警告","[[warning]]"],
 ["做出决定","做出 [[decision]]"],["作出决定","作出 [[decision]]"],
 ["一项选择","一项 [[choice]]"],["另一种选择","另一种 [[choice]]"],
 ["底片","[[negative]]"],["署名","[[signature]]"],
 ["声音","[[voice]]"],["地址","[[address]]"],
 ["技术问题","技术 [[problem]]"], // skipped unless headword exists
 ["认可","[[approve]]"],["批准","[[approve]]"],
 ["核对","[[verify]]"],["核实","[[verify]]"],["查证","[[verify]]"],
 ["确认","[[confirm]]"],["识别","[[identify]]"],["认出","[[recognize]]"],
 ["放大","[[enlarge]]"],["保存","[[preserve]]"],["保留","[[retain]]"],
 ["恢复","[[restore]]"],["修复","[[repair]]"],["修补","[[repair]]"],
 ["删除","[[remove]]"],["移除","[[remove]]"],
 ["解释","[[explain]]"],["承认","[[admit]]"],["回应","[[respond]]"],
 ["答复","[[respond]]"],["否认","[[deny]]"],
 ["保护","[[protect]]"],["保持","[[maintain]]"],
 ["比较","[[compare]]"],["收集","[[collect]]"],["整理收集","整理 [[collect]]"],
 ["调查清楚","[[investigate]] 清楚"],["调查","[[investigate]]"],
 ["搜索","[[locate]]"],["找到","[[locate]]"],
 ["发现","[[notice]]"],["注意到","[[notice]]"],

 ["紧急情况","[[emergency]]"],["紧急","[[urgent]]"],
 ["模糊的","[[blurred]] 的"],["匿名的","[[anonymous]]"],
 ["熟悉的","[[familiar]] 的"],["独立的","[[independent]]"],
 ["原始的","[[original]] 的"],["官方的","[[official]]"],
 ["数字化的","[[digital]]"],["自动的","[[automatic]]"],
 ["安全的","[[secure]]"],["合法的","[[legal]]"],
 ["公开透明的","[[transparent]]"],["最近的","[[recent]]"],
 ["可疑的","[[suspicious]]"],["失踪的","[[missing]]"],
 ["隐藏的","[[hidden]]"],["以前的","[[former]]"],
 ["承认错误","[[admit]] [[mistake]]"],["签署申请","签署 [[request]]"],
 ["一封道歉信","一封 [[apology]] 信"],
 ["误会","[[confuse]]"], // skipped if unnatural; audit required
 ["个人信息","个人 [[detail]]"], // skipped if semantically imprecise via excluded below
];
const UNUSABLE=new Set(["problem","confuse"]); // no headword or wrong grammatical usage
const forbidden=new Set(["个人信息"]);
const TOKEN=/\[\[([a-z]+)\]\]/g;
const hanCount=s=>(s.match(/\p{Script=Han}/gu)||[]).length;
const packText=p=>p.segments.map(x=>x.wordId?"[["+x.surface+"]]":x.text).join("");
const segmentize=(text,wordByName)=>{
 const s=[];let from=0;
 for(const match of text.matchAll(TOKEN)){
  if(match.index>from)s.push({text:text.slice(from,match.index)});
  const w=wordByName.get(match[1]);if(!w)throw Error("MISSING_WORD_ID_"+match[1]);
  s.push({wordId:w.id,surface:w.headword,gloss:w.meaningZh.split("；")[0]});
  from=match.index+match[0].length;
 }
 if(from<text.length)s.push({text:text.slice(from)});
 return {segments:s};
};
function replaceOnlyPlain(text,before,after){
 const parts=text.split(/(\[\[[a-z]+\]\])/g);
 let used=0;
 for(let i=0;i<parts.length;i+=2){
  const p=parts[i];
  const idx=p.indexOf(before);
  if(idx<0)continue;
  parts[i]=p.slice(0,idx)+after+p.slice(idx+before.length);
  used++;break;
 }
 return used?parts.join(""):text;
}
export function buildChapters2to12DensityCandidate(){
 const {candidate}=prepareRainyNightMemberCandidate();
 const byName=new Map(candidate.words.map(w=>[w.headword,w]));
 if(candidate.chapters.length!==12||candidate.words.length!==188)throw Error("SOURCE_INVENTORY_DRIFT");
 const rules=RULES.filter(([from,to])=>!forbidden.has(from)&&
  [...to.matchAll(TOKEN)].every(match=>byName.has(match[1])&&!UNUSABLE.has(match[1])));
 const output=[],audit=[];
 for(const original of candidate.chapters.slice(1)){
  let replacements=0,underfilled=0,sourceMentions=0;
  const paragraphs=original.paragraphs.map((p,pi)=>{
   const source=packText(p);
   const originalWords=(source.match(TOKEN)||[]).length;
   const counts=new Map();
   for(const m of source.matchAll(TOKEN))counts.set(m[1],(counts.get(m[1])||0)+1);
   const added=[];
   // Spread word exposures across sentences rather than concentrating all in
   // one introductory clause. The review gate still checks human readability.
   const sentences=source.split(/(?<=[。！？])/u);
   const countIn=t=>(t.match(TOKEN)||[]).length;
   const total=()=>sentences.reduce((n,t)=>n+countIn(t),0);
   const insertIn=(i)=>{
    if(total()>=6)return false;
    for(const [from,to] of rules){
     const inserted=[...to.matchAll(TOKEN)].map(m=>m[1]);
     const currentSentenceWords=new Set([...sentences[i].matchAll(TOKEN)].map(m=>m[1]));
     if(inserted.some(w=>(counts.get(w)||0)>=2||currentSentenceWords.has(w))||
        total()+inserted.length>6)continue;
     const next=replaceOnlyPlain(sentences[i],from,to);
     if(next===sentences[i])continue;
     sentences[i]=next;replacements+=inserted.length;
     inserted.forEach(w=>{counts.set(w,(counts.get(w)||0)+1);added.push(w)});
     return true;
    }
    return false;
   };
   // First, cover substantive sentences that would otherwise have zero or
   // one word exposure (at least 25 Chinese characters each).
   for(let i=0;i<sentences.length;i++){
    if(hanCount(sentences[i])<25)continue;
    while(countIn(sentences[i])<2&&total()<6&&insertIn(i)){}
   }
   // Then fill paragraph minimum; prefer long underexposed sentences.
   for(let attempt=0;attempt<7&&total()<5;attempt++){
    const order=sentences.map((t,i)=>({i,words:countIn(t),han:hanCount(t)}))
     .sort((a,b)=>(a.words-b.words)||(b.han-a.han));
    let changed=false;
    for(const item of order){
     if(insertIn(item.i)){changed=true;break;}
    }
    if(!changed)break;
   }
   const draft=sentences.join("");
   const next=segmentize(draft,byName);
   const wordCount=next.segments.filter(x=>x.wordId).length;
   if(wordCount<3)underfilled++;
   if(wordCount>6)throw Error("TOO_MANY_WORDS_"+original.number+"_"+pi);
   if(originalWords>wordCount)throw Error("ORIGINAL_ANCHOR_LOST");
   // Check every original annotation is preserved and in original order.
   const oldIds=p.segments.filter(x=>x.wordId).map(x=>x.wordId);
   const allIds=next.segments.filter(x=>x.wordId).map(x=>x.wordId);
   let cursor=0;for(const id of oldIds){
    cursor=allIds.indexOf(id,cursor);
    if(cursor<0)throw Error("ANCHOR_ORDER_LOST_"+original.number+"_"+pi);
    cursor++;
   }
   sourceMentions+=originalWords;
   audit.push({chapter:original.number,paragraph:pi+1,originalWords,newWords:wordCount,
    proposedAdded:added,needsManualRewrite:wordCount<3,
    humanReviewRequired:true});
   return next;
  });
  output.push({...original,paragraphs});
 }
 const chapterReports=output.map(ch=>{
  const density=auditChapterDensity(ch);
  return {chapter:ch.number,paragraphs:ch.paragraphs.length,occurrences:density.occurrences,
   avgPerParagraph:density.averagePerParagraph,per100Han:density.occurrencesPer100Han,
   sentenceViolations:density.sentenceViolations,meetsStrictTarget:density.passedDensity,
   underfilledParagraphs:audit.filter(x=>x.chapter===ch.number&&x.needsManualRewrite).length};
 });
 const sum=chapterReports.reduce((a,x)=>a+x.occurrences,0);
 const originalCount=candidate.chapters.slice(1).flatMap(ch=>ch.paragraphs.flatMap(p=>p.segments)).filter(x=>x.wordId).length;
 return {chapters:output,audit,
  report:{sourceBookId:candidate.book.id,chapterCount:11,sourceAnchors:originalCount,
   candidateAnchors:sum,additionalAnchors:sum-originalCount,
   underfilledParagraphs:audit.filter(x=>x.needsManualRewrite).length,
   underfilledChapters:chapterReports.filter(x=>x.underfilledParagraphs>0).length,
   chapterReports,reviewStatus:"PROVISIONAL_WORD_REPLACEMENTS_NOT_APPROVED",
   productionD1Touched:false,readyToPublish:false}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const output=buildChapters2to12DensityCandidate();
  if(process.argv.includes("--write-private")){
   mkdirSync(resolve("private-output"),{recursive:true,mode:0o700});
   writeFileSync(resolve("private-output/rainy-night-ch02-ch12-LEXICAL-DRAFT.json"),
    JSON.stringify(output,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
  }else if(!process.argv.includes("--summary"))throw Error("Usage: --summary | --write-private");
  process.stdout.write(JSON.stringify(output.report,null,2)+"\n");
 }catch(e){console.error(e.message);process.exitCode=1}
}
