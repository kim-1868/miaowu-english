// S73: real, resumable, private novel production queue. Never deploy drafts.
// Node 22+; optional OpenAI Responses API configured via env only.
// Syntax/word-list checks are automated; story, sense, IPA and rights are NOT approved.
import {readFileSync,mkdirSync,writeFileSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const out=join(root,"private-output","story-batch");
const official=JSON.parse(readFileSync(new URL(
 "../content/editorial/rainy-night-s1-official-2016-pdf-form-audit.json",import.meta.url),"utf8"));
const WORD=/\[\[([a-z]+)\]\]/g;
const idOK=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const presets=[
 {id:"heartbreak-mistaken-love",genre:"虐恋",title:"他认错白月光的那一年",
  premise:"成年男女之间一次救命恩情被误认；女主有清晰目标，拒绝无条件原谅；追悔要有现实代价。",
  beats:["误认与伤害","女主决定离开","失去后的错觉","证据逐步出现","真相与补偿","女主自主选择结局"]},
 {id:"villainess-refuses-script",genre:"爽文",title:"穿成恶毒女配后，我不演了",
  premise:"成年女主穿进原创都市小说，凭自己的策略与能力逆转困境；不能只靠男主施救。",
  beats:["穿书后第一次反套路","撕掉错误人设","发现隐藏利益","第一次主动反击","对手反扑与新盟友","靠自己兑现目标"]},
 {id:"sect-thinks-im-weak",genre:"玄幻",title:"全宗门都以为我是废物",
  premise:"原创修仙世界里的成年弟子发现自己能辨认功法缺陷；力量必须付出代价。",
  beats:["被轻视的新人","意外得到能力","秘密试炼","同门误会升级","宗门大比反转","付出代价并开启新路"]},
 {id:"rivals-secret-care",genre:"BL",title:"死对头突然开始对我好",
  premise:"两位成年男性从校园竞争走到职场再次重逢，因合租看见对方真实一面；自愿、平等的双向关系。",
  beats:["重逢与不得不合租","旧误会","照顾中出现新线索","冲突升级与和解","坦白少年旧事","双方主动选择同行"]}
];
const fail=(msg)=>{throw Error("STORY_BATCH: "+msg)};
export function buildStoryBatchPlans(){
 const {bundle}=composeRainyNightSeasonDraft();
 const byWord=new Map(bundle.words.map(w=>[w.headword,w]));
 const approvedForm=official.words.filter(w=>
  w.formStatus==="CET4_UNSTARRED_HEADWORD"||w.formStatus==="CET4_PRINTED_VARIANT");
 if(approvedForm.length!==172||official.sourceSha256.length!==64)
  fail("OFFICIAL_FORM_AUDIT_DRIFT");
 return presets.map((p,ix)=>{
  const selected=Array.from({length:64},(_,i)=>approvedForm[(ix*19+i*7)%approvedForm.length]);
  const vocabulary=selected.map(form=>{
   const w=byWord.get(form.headword);
   if(!w)fail("MISSING_WORD_SENSE_CANDIDATE");
   return {headword:w.headword,meaningZh:w.meaningZh,partOfSpeech:w.partOfSpeech,
    formSource:"OFFICIAL_2016_UNSTARRED_OR_VARIANT",senseReviewed:false,ipaReviewed:false};
  });
  if(new Set(vocabulary.map(x=>x.headword)).size!==64)fail("DUPLICATE_VOCAB_CANDIDATES");
  return {schemaVersion:"MIAOWU_STORY_BATCH_V1",id:p.id,title:p.title,genre:p.genre,
   premise:p.premise,beats:p.beats.map((brief,i)=>({number:i+1,brief})),
   chapterCount:6,language:"zh-CN",vocabulary,publicationStatus:"PRIVATE_AI_CANDIDATE",
   commercialApproved:false,sourceSyllabusSha:official.sourceSha256,
   warning:"Only form source was checked; word senses, all contexts, phonetics and originality require review."};
 });
}
const pathFor=(id,file)=>{if(!idOK.test(id)||!presets.some(p=>p.id===id))fail("UNKNOWN_STORY_ID");
 return join(out,id,file);};
const read=(id,name)=>JSON.parse(readFileSync(pathFor(id,name),"utf8"));
const put=(id,name,value)=>{const file=pathFor(id,name);mkdirSync(join(out,id),{recursive:true});
 // never overwrite privately edited drafts, and never produce a public artifact
 writeFileSync(file,JSON.stringify(value,null,2)+"\n",{flag:"wx",mode:0o600});return file;};
export function auditStoryChapter(plan,paragraphs,mode="plain",original=null){
 if(!plan||plan.publicationStatus!=="PRIVATE_AI_CANDIDATE"||
    plan.commercialApproved!==false)fail("NO_COMMERCIAL_AUTOPROMOTION");
 if(!Array.isArray(paragraphs)||paragraphs.length<10||paragraphs.length>32||
  paragraphs.some(p=>typeof p!=="string"||!p.trim()||p.length>750))fail("INVALID_PARAGRAPHS");
 const joined=paragraphs.join("");
 const han=(joined.match(/\p{Script=Han}/gu)||[]).length;
 if(han<650||han>7000)fail("CHAPTER_LENGTH_OUT_OF_BOUNDS");
 if(mode==="plain"){
  if(joined.includes("[[")||joined.includes("]]"))fail("PLAIN_CHAPTER_HAS_ANCHORS");
  return {paragraphs:paragraphs.length,han,anchors:0};
 }
 if(mode!=="embedded"||!Array.isArray(original)||original.length!==paragraphs.length)
  fail("EMBEDDED_PARAGRAPH_MISMATCH");
 const approved=new Set(plan.vocabulary.map(v=>v.headword));
 const uses=[...joined.matchAll(WORD)].map(m=>m[1]);
 const count=uses.length;
 if(count<6||count>32)fail("EMBEDDING_DENSITY_INVALID");
 if(uses.some(w=>!approved.has(w)))fail("UNLISTED_VOCABULARY_IN_MANUSCRIPT");
 if(paragraphs.some(p=>(p.match(/\[\[[a-z]+\]\]/g)||[]).length>3))
  fail("DENSE_VOCABULARY_PARAGRAPH");
 const removed=joined.replace(WORD,"");
 if(removed.includes("[[")||removed.includes("]]"))fail("MALFORMED_WORD_ANCHOR");
 const originalHan=(original.join("").match(/\p{Script=Han}/gu)||[]).length;
 if(han<originalHan*.55||han>originalHan*1.50)fail("EMBEDDING_ALTERED_SOURCE_TOO_MUCH");
 return {paragraphs:paragraphs.length,han,anchors:count,uniqueWords:new Set(uses).size,
  flags:["UNREVIEWED_POS_AND_SENSE","UNREVIEWED_STORY_CONTINUITY","UNREVIEWED_IPA_AND_RIGHTS"]};
}
const schema={type:"object",properties:{paragraphs:{type:"array",items:{type:"string"}}},
 required:["paragraphs"],additionalProperties:false};
export async function requestStoryChapter(instructions,prompt,{fetchImpl=fetch,apiKey=process.env.OPENAI_API_KEY,model=process.env.OPENAI_MODEL}={}){
 if(!apiKey||!model)fail("SET_OPENAI_API_KEY_AND_OPENAI_MODEL_IN_LOCAL_ENV");
 const response=await fetchImpl("https://api.openai.com/v1/responses",{
  method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
  body:JSON.stringify({model,store:false,max_output_tokens:6000,
   instructions,input:prompt,
   text:{format:{type:"json_schema",name:"story_chapter",strict:true,schema}}})
 });
 if(!response.ok)fail("API_HTTP_"+response.status);
 const data=await response.json();
 if(data.status!=="completed")fail("API_OUTPUT_NOT_COMPLETE");
 const output=(data.output||[]).flatMap(x=>x.content||[])
   .filter(x=>x.type==="output_text").map(x=>x.text||"").join("");
 let result;try{result=JSON.parse(output)}catch{fail("INVALID_MODEL_JSON")}
 if(!result||Object.keys(result).join("|")!=="paragraphs")fail("INVALID_SCHEMA_RESPONSE");
 return result.paragraphs;
}
function planAll(only){
 const selected=buildStoryBatchPlans().filter(x=>!only||x.id===only);
 if(!selected.length)fail("NO_MATCHING_PLAN");
 return selected.map(p=>({id:p.id,file:put(p.id,"plan.json",p)}));
}
async function produce(id,phase){
 const plan=read(id,"plan.json");
 if(!presets.some(p=>p.id===plan.id&&p.title===plan.title))fail("PLAN_DOES_NOT_MATCH_SEED");
 const done=[];
 for(const beat of plan.beats){
  const name=(phase==="write"?"plain":"embedded")+"-ch"+String(beat.number).padStart(2,"0")+".json";
  if(existsSync(pathFor(id,name))){done.push("already "+name);continue;}
  const previous=beat.number===1?"":phase==="write"?
   // The prior chapter must exist: continuity is not guessed.
   read(id,"plain-ch"+String(beat.number-1).padStart(2,"0")+".json")
    .paragraphs.slice(-5).join("\n").slice(-2100):"";
  const current=phase==="embed"?read(id,"plain-ch"+String(beat.number).padStart(2,"0")+".json"):null;
  const allowed=plan.vocabulary.map(v=>v.headword+"("+v.partOfSpeech+" "+v.meaningZh+")").join("、");
  const instructions=phase==="write"?
   "你是原创中文短篇网文作者。只写中文，剧情清晰、强钩子、情绪自然、反转有因果。绝不改写已有作品，不引用知名IP。不得出现英语锚点。严格返回 JSON 对象，其中 paragraphs 为10到32段、总字数尽量1200-1900字。不要写词汇教学。":
   "你是中英混排编辑。逐段保留原小说具体事件和对话，将部分自然语义片段替换为[[english]]目标词（例如[[promise]]），不强制覆盖单词表。必须返回严格 JSON paragraphs，段落数和原文完全相同。每段最多3个词，每章6-32个，英语词只能按给定词性和义项使用，宁可少量自然使用，不要硬拗，绝不补音标或词卡。";
  const prompt=phase==="write"?
   JSON.stringify({title:plan.title,genre:plan.genre,premise:plan.premise,
    chapter:beat.number,chapterBeat:beat.brief,
    plannedBeats:plan.beats,previousChapterEnding:previous}):
   JSON.stringify({title:plan.title,genre:plan.genre,
    chapter:beat.number,allowedCandidateWords:allowed,
    originalParagraphs:current.paragraphs});
  const paragraphs=await requestStoryChapter(instructions,prompt);
  const report=auditStoryChapter(plan,paragraphs,phase==="write"?"plain":"embedded",
   current?.paragraphs);
  put(id,name,{storyId:id,chapter:beat.number,stage:phase,paragraphs,report,
   reviewed:false,published:false});
  done.push(name);
 }
 return done;
}
function review(id){
 const plan=read(id,"plan.json"),rows=[];
 for(const beat of plan.beats){
  const ch=String(beat.number).padStart(2,"0");
  const plain=read(id,"plain-ch"+ch+".json");
  const embedded=read(id,"embedded-ch"+ch+".json");
  const plainQA=auditStoryChapter(plan,plain.paragraphs,"plain");
  const embeddedQA=auditStoryChapter(plan,embedded.paragraphs,"embedded",plain.paragraphs);
  rows.push({chapter:beat.number,plain:plainQA,embedded:embeddedQA,
   humanReviewed:false,releaseApproved:false});
 }
 const report={storyId:id,genre:plan.genre,title:plan.title,
  stage:"PRIVATE_QA_PASSED_REQUIRES_HUMAN_EDITOR",
  humanReviewRequired:true,publicationAllowed:false,
  totalChapters:rows.length,totalAnchors:rows.reduce((a,x)=>a+x.embedded.anchors,0),
  chapters:rows};
 put(id,"qa-report.json",report);return report;
}
async function main(){
 const [command,...args]=process.argv.slice(2),pos=args.indexOf("--book");
 const id=pos>=0?args[pos+1]:null;
 if(pos>=0&&(!id||!idOK.test(id)))fail("INVALID_BOOK_ARGUMENT");
 if(args.length!==(id?2:0)||!["plan","write","embed","qa"].includes(command))fail(
  "USAGE: story-batch.mjs plan [--book id] | write|embed|qa --book id");
 if(command!=="plan"&&!id)fail("BOOK_REQUIRED_FOR_MODEL_CALLS");
 const value=command==="plan"?planAll(id):
   command==="write"||command==="embed"?await produce(id,command):review(id);
 process.stdout.write(JSON.stringify(value,null,2)+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(e=>{process.stderr.write(String(e.message||e)+"\n");process.exitCode=1});
}
