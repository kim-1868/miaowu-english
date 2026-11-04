// Build eight original six-chapter CET4 stories for offline editorial delivery.
// No production D1 writes, AI API, payment access or publication.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {validatePackage} from "../src/editorial-content.js";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const text=path=>readFileSync(join(root,path),"utf8");
const json=path=>JSON.parse(text(path));
const fail=msg=>{throw Error("CET4_BATCH: "+msg)};
const refs={
 src:"content/drafts/season-cet4-v1/",
 out:"private-output/cet4-eight-novels-20261104/"
};
const catalog=[
 ["fake-heiress-refuses-game","假千金退场后，全家都慌了","宋知禾在生日宴上拒绝放弃公益项目，追查助学资金的异常，开始独立经营阅读室。",false],
 ["heartbreak-mistaken-love","他认错白月光的那一年","婚礼前夜的误会让许星遥离开旧关系，经营海边改造项目，重新认识真相与自己的选择。",false],
 ["rejected-family-second-life","重生后我不再讨好他们","重回家人为弟弟担保的那一天，温予宁拒绝重蹈覆辙，与好友展开独立设计事业。",true],
 ["revenge-heiress-returns","被赶出豪门后我成了继承人","离开家族修复馆的沈栀找回祖母留下的线索，在普通人的老器物里理解继承。",true],
 ["contract-marriage-expires","契约婚姻到期那天","三年婚姻协议到期，林听雪选择远行；陆沉舟学会尊重她的事业，也重新学习如何相处。",true],
 ["villainess-refuses-script","穿成恶毒女配后，我不演了","穿进都市小说的许知微拒绝按照恶毒女配剧本行动，与苏棠一道查清公益资金疑点。",true],
 ["rivals-secret-care","死对头突然开始对我好","毕业七年后江望与沈行舟意外合租，从合作设计公共阅读灯开始重新了解彼此。",true],
 ["roommate-secret-promise","合租室友藏了七年的秘密","一段录音泄露让程野与顾景声失联七年，意外合租后七封旧信揭开误会。",true]
];
const allowedId=/^[a-z][a-z0-9_-]{2,79}$/;
const anchor=/\[\[([a-z]+)\]\]/gu;
const han=s=>(s.match(/\p{Script=Han}/gu)||[]).length;
const uniqText=s=>s.replace(/\*\*/gu,"");
const deep=x=>structuredClone(x);

function dictionary(){
 const base=composeRainyNightSeasonDraft().bundle.words.map(deep);
 const lex=new Map(base.map(w=>[w.headword,w]));
 const uk=json("content/editorial/rainy-night-s1-britfone-uk-ipa-candidates.json");
 const us=json("content/editorial/rainy-night-s1-us-ipa-candidates-UNVERIFIED.json");
 const gaps=json("content/editorial/rainy-night-s1-uk-ipa-seven-gap-reference-UNVERIFIED.json");
 const brit=new Map(uk.words.map(w=>[w.headword,w.phoneticUkCandidates||[]]));
 const american=new Map(us.words.map(w=>[w.headword,w.usIpaCandidates||[]]));
 const fallback=new Map(gaps.items.map(w=>[w.headword,w.ukReferenceIpa]));
 for(const w of lex.values()){
  w.id="mwv26-cet4-"+w.headword;
  const candidate=(brit.get(w.headword)||[])[0];
  w.phoneticUk=candidate?"/"+candidate.replace(/\s+/gu,"")+"/":fallback.get(w.headword)||null;
  w.phoneticUs=(american.get(w.headword)||[])[0]||null;
 }
 const extras=json("content/editorial/20261104-shared-45-word-cards-WORKING-COPY-NOT-APPROVED.json").words;
 const more=json("content/editorial/20261104-library-11-additional-cards.json").words;
 const everyday=json("content/editorial/20261104-library-41-basic-cards.json").words;
 const theme=json("content/editorial/20261104-library-25-theme-cards.json").words;
 for(const w of [...extras,...more,...everyday,...theme])
  lex.set(w.headword,{id:"mwv26-cet4-"+w.headword,headword:w.headword,
   meaningZh:w.meaningZh,partOfSpeech:w.partOfSpeech,phoneticUk:w.phoneticUk,
   phoneticUs:w.phoneticUs,exampleEn:w.exampleEn,exampleZh:w.exampleZh,
   collocations:w.collocations||[]});
 const previouslyPublished=new Map();
 for(const id of ["ex-husband-business-client","substitute-bride-tears-contract"]){
  const p=json("content/release-packages/20261104-"+id+"-FIXED-LEXICON-IDS.json");
  for(const w of p.words){
   const v=previouslyPublished.get(w.headword);
   if(v&&JSON.stringify(v)!==JSON.stringify(w))fail("PUBLISHED_CARD_DIFFERENCE_"+w.headword);
   previouslyPublished.set(w.headword,w);
   lex.set(w.headword,deep(w));
  }
 }
 return {lex,previouslyPublished};
}

function forbidden(s,i,zh){
 const before=s.slice(Math.max(0,i-7),i);
 const after=s.slice(i+zh.length,i+zh.length+10);
 if(zh==="记录"&&/^(下|着|了|过|为|到|在|好|起|员|本|簿)/u.test(after))return true;
 if(zh==="录音"&&/^(笔|机|师|室|棚|设备|文件)/u.test(after))return true;
 if(zh==="档案"&&/^(馆|室|员|袋)/u.test(after))return true;
 if(zh==="审核"&&/^(了|着|过|者|员|人|机构|系统|过程|中|并)/u.test(after))return true;
 if(zh==="选择"&&/^(了|过|着|去|从|把|加入|继续|离开|做|相信|改变)/u.test(after))return true;
 if(zh==="承诺"&&/^(了|过|将|会|不|继续|给|让|把|尊重)/u.test(after))return true;
 if(zh==="决定"&&/^(了|去|先|要|不|把|让|将|再|怎么|离开|留下)/u.test(after))return true;
 if(zh==="设计"&&/^(师|师傅|室|院|专业|团队|人员|比赛|课程|行业|大赛)/u.test(after))return true;
 if(zh==="确认"&&/^(函|书|人|码|键|按钮|页面|方式)/u.test(after))return true;
 if(zh==="调查"&&/^(报告|结果|资料|员|队|小组|表)/u.test(after))return true;
 if(zh==="修复"&&/^(馆|室|师|站|中心|工艺|人员|技术)/u.test(after))return true;
 if(zh==="尊重"&&/^(的|感|是)/u.test(after))return true;
 if(zh==="关系"&&/^(户|部门|到|着)/u.test(after))return true;
 if(zh==="房间"&&/^(号|编号)/u.test(after))return true;
 if(zh==="建筑"&&/^(师|院|学|行业|设计|公司|专业|结构|图纸)/u.test(after))return true;
 if(zh==="生活"&&/^(着|过|在|中|条件|方式|习惯)/u.test(after))return true;
 if(zh==="生活"&&/(一起|共同|好好|独立|继续|开始|重新)$/u.test(before))return true;
 if(zh==="努力"&&/^(地|学习|工作|修复|生活|改变|争取|经营|解释|证明|赚钱|完成)/u.test(after))return true;
 if(zh==="家人"&&/(一|两|全)$/u.test(before.slice(-1)))return true;
 if(zh==="晚上"&&/^(好|见)/u.test(after))return true;
 if(zh==="夜里"&&/^(了|一直|还|又|没有)/u.test(after))return true;
 if(zh==="书本"&&/^(业|来|上)/u.test(after))return true;
 if(zh==="工作"&&/^(了|着|到|以来|完成|者|安排|过程|日|岗位|时间|方式)/u.test(after))return true;
 if(zh==="工作"&&/(继续|开始|正在|不停|在|去|来|快点|努力|一起)$/u.test(before))return true;
 if(zh==="竞争"&&/^(对手|者|性|优势|力)/u.test(after))return true;
 if(zh==="测试"&&/^(员|仪|人员|环境|工具)/u.test(after))return true;
 if(zh==="基金"&&/^(会|经理|业务|事务)/u.test(after))return true;
 if(zh==="现场"&&/^(感|演员|录音|表演)/u.test(after))return true;
 if(zh==="图纸"&&/^(上|里|中)/u.test(after))return false;
 if(zh==="审核"&&/^(请|可|能|来|要|会|由|得)$/u.test(before.slice(-1)))return true;
 if(["承诺","决定","选择"].includes(zh)&&
    /^(我|你|他|她|还|也|就|才|终于|忽然|随后)$/u.test(before.slice(-2)))return true;
 return false;
}
function enrich(src,enabled,lex,ruleList,pattern){
 if(!enabled)return src;
 const parts=src.split(/(\[\[[a-z]+\]\])/gu);
 let count=0;
 return parts.map(p=>{
  if(/^\[\[[a-z]+\]\]$/u.test(p))return p;
  return p.replace(pattern,(zh,i,s)=>{
   const en=ruleList.get(zh);
   if(!en||!lex.has(en)||forbidden(s,i,zh))return zh;
   if(++count>70)fail("OVERLOADED_PARAGRAPH");
   return "[["+en+"]]";
  });
 }).join("");
}
function createPackage(spec,lex,rules,regex){
 const [id,title,description,improve]=spec;
 const src=text(refs.src+id+".md");
 const fm=src.match(/^---\n([\s\S]*?)\n---\n/);
 if(!fm||!fm[1].includes("id: "+id)||!fm[1].includes("title: "+title))fail("BAD_SOURCE_HEADER_"+id);
 const body=src.slice(fm[0].length);
 const heads=[...body.matchAll(/^## 第([1-6])章[　 ]+(.+)$/gm)];
 if(heads.length!==6||heads.some((m,i)=>Number(m[1])!==i+1))fail("CHAPTERS_"+id);
 const used=new Set(),chapStat=[];
 const chapters=heads.map((head,index)=>{
  const para=body.slice(head.index+head[0].length,heads[index+1]?.index??body.length)
   .trim().split(/\n\s*\n/).map(s=>uniqText(s.trim())).filter(Boolean);
  if(para.length<5)fail("SHORT_CHAPTER_"+id);
  const paragraphs=para.map(original=>{
   const p=enrich(original,improve,lex,rules,regex);
   let cursor=0;const segments=[];
   for(const m of p.matchAll(anchor)){
    if(m.index>cursor&&p.slice(cursor,m.index).trim())segments.push({text:p.slice(cursor,m.index)});
    const card=lex.get(m[1]);if(!card)fail("MISSING_CARD_"+id+"_"+m[1]);
    used.add(m[1]);
    segments.push({wordId:card.id,surface:card.headword,gloss:card.meaningZh.split("；")[0]});
    cursor=m.index+m[0].length;
   }
   if(cursor<p.length&&p.slice(cursor).trim())segments.push({text:p.slice(cursor)});
   if(!segments.length||segments.length>100)fail("INVALID_SEGMENTS_"+id);
   return {segments};
  });
  const mentions=paragraphs.reduce((sum,p)=>sum+p.segments.filter(s=>s.wordId).length,0);
  const n=para.reduce((sum,p)=>sum+han(p),0);
  chapStat.push({chapter:index+1,han:n,paragraphs:paragraphs.length,anchors:mentions});
  return {id:"mwstory26-"+id+"-ch"+String(index+1).padStart(2,"0"),
   number:index+1,title:head[2].trim(),preview:false,paragraphs};
 });
 const wordCards=[...used].sort().map(hw=>{
  const w=lex.get(hw);
  const keys=["id","headword","meaningZh","partOfSpeech","phoneticUk","phoneticUs","exampleEn","exampleZh"];
  const missing=keys.filter(k=>!w[k]);
  if(missing.length)fail("INCOMPLETE_CARD_"+id+"_"+hw+"_"+missing.join(","));
  if(!allowedId.test(w.id))fail("BAD_WORD_ID_"+w.id);
  return deep({id:w.id,headword:w.headword,meaningZh:w.meaningZh,
   partOfSpeech:w.partOfSpeech,phoneticUk:w.phoneticUk,phoneticUs:w.phoneticUs,
   exampleEn:w.exampleEn,exampleZh:w.exampleZh,collocations:w.collocations||[]});
 });
 const pkg={version:1,sourceLabel:"miaowu-cet4-20261104-batch-editorial",
  book:{id:"mwstory26-"+id,title,category:"cet4",description,coverKey:null},
  words:wordCards,chapters};
 const validated=validatePackage(pkg);
 const paras=chapStat.reduce((n,s)=>n+s.paragraphs,0),n=chapStat.reduce((n,s)=>n+s.han,0);
 const report={id,title,chapters:chapters.length,paidChapters:6,freeChapters:0,
  uniqueWords:wordCards.length,wordMentions:validated.mentionCount,paragraphs:paras,
  han:n,anchorsPerParagraph:Number((validated.mentionCount/paras).toFixed(2)),
  mentionsPer100Han:Number((100*validated.mentionCount/n).toFixed(2)),
  chapterStats:chapStat,
  sourceRevision:improve?"CONSERVATIVE_CONTEXTUAL_EMBEDDING":"AS_DRAFTED_HIGH_DENSITY",
  requiresFinalNaturalnessReview:true};
 return {pkg,report};
}
function main(){
 const arg=process.argv[2];
 if(!["--write","--check"].includes(arg))fail("EXPECTED --write|--check");
 const {lex,previouslyPublished}=dictionary();
 const ruleList=new Map(Object.entries(json("content/editorial/20261104-library-density-enrichment-map.json").rules));
 const pattern=new RegExp([...ruleList.keys()].sort((a,b)=>b.length-a.length).join("|"),"gu");
 const rows=catalog.map(item=>createPackage(item,lex,ruleList,pattern));
 const distinct=new Map();
 for(const {pkg} of rows)for(const w of pkg.words){
  const previous=distinct.get(w.id);
  if(previous&&JSON.stringify(previous)!==JSON.stringify(w))fail("CROSS_PACKAGE_CARD_MISMATCH_"+w.headword);
  const old=previouslyPublished.get(w.headword);
  if(old&&["id","headword","meaningZh","partOfSpeech","phoneticUk","phoneticUs",
      "exampleEn","exampleZh","collocations"].some(k=>JSON.stringify(old[k])!==JSON.stringify(w[k])))
    fail("EXISTING_PUBLISHED_WORD_CHANGED_"+w.headword);
  distinct.set(w.id,w);
 }
 const summary={category:"cet4",books:rows.length,chapters:rows.length*6,
  uniqueWordCards:distinct.size,wordMentions:rows.reduce((n,r)=>n+r.report.wordMentions,0),
  outputs:rows.map(x=>x.report),existingPublishedUntouched:true,
  metadataComplete:true,fullyAutomatedPublication:false};
 if(arg==="--write"){
  const dir=join(root,refs.out);
  mkdirSync(dir,{recursive:true});
  for(const {pkg,report} of rows)
   writeFileSync(join(dir,report.id+".json"),JSON.stringify(pkg,null,2)+"\n");
  writeFileSync(join(dir,"AUDIT-REPORT.json"),JSON.stringify(summary,null,2)+"\n");
  const doc=[
   "# 妙屋英语 · 剩余八部短篇上架文件（2026-11-04）",
   "",
   "包含八部、48章；全部付费章节（免费章节为0）。已上架的三部小说不在本批。",
   "文本中的英语标注由既有文本及上下文词汇替换生成；剧情主线与章节顺序未改。",
   "本包已进行格式及词卡字段校验；部分增强后的中英混排仍需要最终人工抽检。",
   "",
   "| 书名 | 对应文件 | 英文标注 | 不同单词 | 每自然段平均英文数 |",
   "|---|---|---:|---:|---:|",
   ...rows.map(x=>"|"+x.report.title+"|"+x.report.id+".json|"+x.report.wordMentions+
    "|"+x.report.uniqueWords+"|"+x.report.anchorsPerParagraph+"|"),
   "",
   "在运营台选择一个 JSON、检查预览、上传对应封面，然后点击确认上架。",
   "请勿重复导入已上架小说。新的英语词卡ID采用 mwv26-cet4-*，对已上架两本里的同词严格复用相同ID与释义、例句。",
   "小说篇幅为短篇，请不要以多万字中长篇宣传。朗读使用网站浏览器语音合成而非预制音频。",
   "没有执行远程数据库迁移、账号操作或发布。",
   ""
  ].join("\n");
  writeFileSync(join(dir,"README-上传说明.md"),doc);
 }
 process.stdout.write(JSON.stringify({location:refs.out,...summary},null,2)+"\n");
}
main();
