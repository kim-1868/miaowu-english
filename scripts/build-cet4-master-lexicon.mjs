// Editable CET4 candidate pool across stories. NO official CET4 compliance claim.
// Never updates existing D1 IDs, account mastery states, or any public assets.
// Use the real Rainy Night private draft and explicitly noncommercial Rose demo seed.
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";

const ROSE_SOURCE=new URL("../content/editorial/cet4-rose-demo-word-seed.json",import.meta.url);
const HAN=/\p{Script=Han}/gu;
const SAFE=/^[a-z]+$/;
export const CET4_PLANNING_POOL_SIZE=4500;
function fail(msg){throw Error("CET4_CURRICULUM: "+msg)}
export function canonicalHeadword(value){
 if(typeof value!=="string")fail("BAD_HEADWORD_TYPE");
 const lemma=value.normalize("NFKC").trim().toLowerCase();
 if(!SAFE.test(lemma))fail("HEADWORD_REQUIRES_LEMMA_REVIEW_"+lemma);
 return lemma;
}
export function proposedWordId(lemma){return "lex-en-"+canonicalHeadword(lemma)}
function makeRecord(lemma){
 return {id:proposedWordId(lemma),lemma,
   reviewStatus:"pending-source-and-sense-review",
   cet4Source:null,cet4Verified:false,
   phoneticVerified:false,senseApproved:false,
   sourceBooks:[],draftIds:[],draftMeanings:[],partOfSpeech:[],
   totalRainyMentions:0,rainyChapterNumbers:[],crossBookReuse:false,
   requiresSenseComparison:false};
}
export function buildCET4CandidatePlan(bundle,roseInput){
 if(bundle?.book?.category!=="cet4"||!Array.isArray(bundle?.words)||
    !Array.isArray(bundle?.chapters))fail("INVALID_RAINY_INPUT");
 if(roseInput?.id!=="rose-v03-browser-demo"||
    roseInput?.candidateOnly!==true||roseInput?.publishable!==false||
    !Array.isArray(roseInput?.headwords))fail("INVALID_ROSE_DEMO_INPUT");
 const all=new Map(),byDraftId=new Map();
 for(const row of bundle.words){
   if(typeof row?.id!=="string"||!row.id.startsWith("rns1-")||
      byDraftId.has(row.id))fail("BAD_OR_DUPLICATED_RAINY_DRAFT_ID");
   const lemma=canonicalHeadword(row.headword);
   if(all.has(lemma))fail("COLLIDING_RAINY_LEMMA_"+lemma);
   const entry=makeRecord(lemma);
   entry.sourceBooks.push("rainy-night-s1");
   entry.draftIds.push(row.id);
   if(typeof row.meaningZh==="string")entry.draftMeanings.push(row.meaningZh);
   if(typeof row.partOfSpeech==="string")entry.partOfSpeech.push(row.partOfSpeech);
   byDraftId.set(row.id,entry);
   all.set(lemma,entry);
 }
 const chapterMentions=new Map(),chapterSeen=new Map(),chapters=[];
 for(const chapter of bundle.chapters){
  if(!Number.isInteger(chapter.number)||!Array.isArray(chapter.paragraphs)||
     chapterMentions.has(chapter.number))fail("BAD_OR_DUPLICATE_CHAPTER");
  const mentions=new Map(),seen=new Set();let han=0,total=0;
  for(const p of chapter.paragraphs){
   if(!Array.isArray(p.segments))fail("INVALID_PARAGRAPH");
   for(const segment of p.segments){
    if(typeof segment.text==="string")han+=(segment.text.match(HAN)||[]).length;
    if(typeof segment.wordId==="string"){
     const record=byDraftId.get(segment.wordId);
     if(!record)fail("UNRECOGNIZED_DRAFT_WORD_"+segment.wordId);
     if(canonicalHeadword(segment.surface)!==record.lemma)
       fail("SURFACE_NEEDS_EDITOR_REVIEW_"+record.lemma);
     record.totalRainyMentions++;
     seen.add(record.lemma);
     mentions.set(record.lemma,(mentions.get(record.lemma)||0)+1);
     total++;
    }
   }
  }
  for(const lemma of seen)all.get(lemma).rainyChapterNumbers.push(chapter.number);
  chapters.push({number:chapter.number,title:chapter.title,hanCharacters:han,
    wordMentions:total,uniqueWords:seen.size});
  chapterMentions.set(chapter.number,mentions);
  chapterSeen.set(chapter.number,seen);
 }
 for(const entry of all.values()){
  if(entry.totalRainyMentions===0)fail("UNUSED_RAINY_WORD_"+entry.lemma);
  entry.rainyChapterNumbers.sort((a,b)=>a-b);
 }
 const roseSeen=new Set();let roseOld=0,roseNew=0;
 for(const word of roseInput.headwords){
   const lemma=canonicalHeadword(word);
   if(roseSeen.has(lemma))fail("DUPLICATED_ROSE_DEMO_LEMMA_"+lemma);
   roseSeen.add(lemma);
   const previous=all.get(lemma);
   const item=previous||makeRecord(lemma);
   if(previous){roseOld++;item.crossBookReuse=true;
     // A word with the same spelling can mean something different in the
     // second story. Never auto-merge sense-level learning progress.
     item.requiresSenseComparison=true;
   } else {roseNew++;all.set(lemma,item)}
   item.sourceBooks.push("rose-v03-browser-demo");
 }
 const entries=[...all.values()].sort((a,b)=>a.lemma.localeCompare(b.lemma,"en"));
 const repeatedAcrossRainyChapters=entries.filter(x=>x.rainyChapterNumbers.length>=2).length;
 const proposedIds=new Set(entries.map(e=>e.id));
 if(proposedIds.size!==entries.length)fail("COLLIDING_PROPOSED_IDS");
 return {
  status:"UNVERIFIED_EDITORIAL_CANDIDATES_NO_RELEASE",
  category:"cet4",targetSizePlanningOnly:CET4_PLANNING_POOL_SIZE,
  actualVerifiedOfficialLexiconSize:0,
  candidateUniqueHeadwords:entries.length,
  pendingLevelVerification:entries.filter(x=>!x.cet4Verified).length,
  pendingPhoneticVerification:entries.filter(x=>!x.phoneticVerified).length,
  pendingSenseApproval:entries.filter(x=>!x.senseApproved).length,
  proposedIdsAreNotDatabaseIds:true,
  overlappingDemoWordsNeedingSenseReview:roseOld,
  books:[
   {id:"rainy-night-s1",status:"private-unreviewed",
    uniqueHeadwords:bundle.words.length,newCandidateHeadwords:bundle.words.length,
    reusedFromPreviousBooks:0,actualParagraphs:bundle.chapters.reduce((sum,ch)=>sum+ch.paragraphs.length,0),
    wordMentions:chapters.reduce((sum,ch)=>sum+ch.wordMentions,0),
    acrossChaptersRepeatedWords:repeatedAcrossRainyChapters,
    hanCharacters:chapters.reduce((sum,ch)=>sum+ch.hanCharacters,0)},
   {id:roseInput.id,status:"browser-demo-not-for-sale",
    uniqueHeadwords:roseSeen.size,newCandidateHeadwords:roseNew,
    reusedFromPreviousBooks:roseOld,wordMentions:null,
    note:"Rose's 12 words are from UI demo vocabulary, not an audited full-length novel. Do not add its unknown prose counts to real draft metrics."}
  ],
  chapters,entries,
  warnings:[
   "4500 is a planning target until a licensed/authoritative CET4 lexical source/version is audited.",
   "Rainy Night and Rose are NOT released; candidate counts must never be presented as verified official coverage.",
   "lex-en-* IDs are mapping proposals; preserve existing rns1-* draft IDs and do not mutate existing D1.",
   "Multi-sense and polysemy require editorial review before consolidating cross-book word cards."
  ]
 };
}
export function renderCET4Report(plan){
 const summary=plan.books.map(b=>
  "| "+b.id+" | "+b.uniqueHeadwords+" | "+b.newCandidateHeadwords+
  " | "+b.reusedFromPreviousBooks+" | "+
  (b.wordMentions??"未统计（浏览器演示）")+" |").join("\n");
 return "# 妙屋英语 CET4 跨小说候选词库\n\n"+
  "**全部未经词源、等级、IPA及义项审核，不可商用/发布。**\n\n"+
  "| 项目 | 数量 |\n|---|---:|\n"+
  "| 四级长期计划词库容量（示例，非官方词数） | "+plan.targetSizePlanningOnly+" |\n"+
  "| 当前跨作品去重候选词条 | "+plan.candidateUniqueHeadwords+" |\n"+
  "| 等级来源待审核词条 | "+plan.pendingLevelVerification+" |\n"+
  "| 音标待审核词条 | "+plan.pendingPhoneticVerification+" |\n"+
  "| 义项待审核词条 | "+plan.pendingSenseApproval+" |\n"+
  "| 两部候选之间重叠的同形词（尚待义项核对） | "+plan.overlappingDemoWordsNeedingSenseReview+" |\n\n"+
  "| 作品 | 候选词 | 首次进入候选池 | 与前作重复 | 正文标注数 |\n"+
  "|---|---:|---:|---:|---:|\n"+summary+"\n\n"+
  "《雨夜档案》中文汉字数："+plan.books[0].hanCharacters+
  "；跨章复现的候选词："+plan.books[0].acrossChaptersRepeatedWords+
  "。数据来自真实12章私有手稿，不能推断阅读时长。\n\n"+
  "**当前禁止：**把候选当成官方四级词、把 Rose 浏览器演示当成正式小说、"+
  "把候选词算作用户已掌握，或将计划 ID 直接写入运行中的 D1。\n";
}
const csvCell=value=>'"'+String(value??"").replaceAll('"','""')+'"';
export function reviewQueueCsv(plan){
 const header=["candidate_id","lemma","source_books","draft_word_ids","rainy_mentions",
  "rainy_chapters","draft_meanings","draft_pos","cet4_source","level_verified",
  "ipa_uk_verified","ipa_us_verified","sense_approved","editor_note"];
 const rows=plan.entries.map(e=>[
  e.id,e.lemma,e.sourceBooks.join("|"),e.draftIds.join("|"),
  e.totalRainyMentions,e.rainyChapterNumbers.join("|"),
  e.draftMeanings.join("|"),e.partOfSpeech.join("|"),
  "",false,false,false,false,e.requiresSenseComparison?"COMPARE_MEANINGS_BETWEEN_BOOKS":"REVIEW_REQUIRED"
 ]);
 return [header,...rows].map(row=>row.map(csvCell).join(",")).join("\n")+"\n";
}
function main(){
 const args=process.argv.slice(2);
 if(args.some(a=>!["--json","--strict","--write-private"].includes(a)))
  fail("UNKNOWN_ARG");
 const {bundle}=composeRainyNightSeasonDraft();
 const rose=JSON.parse(readFileSync(ROSE_SOURCE,"utf8"));
 const report=buildCET4CandidatePlan(bundle,rose);
 if(args.includes("--write-private")){
  const dir=resolve("private-output");
  mkdirSync(dir,{recursive:true,mode:0o700});
  writeFileSync(join(dir,"cet4-candidate-review-queue-UNVERIFIED.csv"),
    reviewQueueCsv(report),{encoding:"utf8",mode:0o600});
  writeFileSync(join(dir,"cet4-candidate-plan-UNVERIFIED.json"),
    JSON.stringify(report,null,2)+"\n",{encoding:"utf8",mode:0o600});
 }
 if(args.includes("--json"))process.stdout.write(JSON.stringify(report,null,2)+"\n");
 else process.stdout.write(renderCET4Report(report));
 if(args.includes("--strict")&&(report.pendingLevelVerification||
  report.pendingPhoneticVerification||report.pendingSenseApproval))process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1}
}
