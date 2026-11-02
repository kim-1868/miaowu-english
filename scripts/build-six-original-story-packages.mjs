// S82: convert six ORIGINAL human-authored-with-ChatGPT short stories to private
// D1 editor candidates. The book genre is internal-only, never a site category.
// No AI API calls, no network access, no production SQL execution, no publishing.
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {validatePackage} from "../src/editorial-content.js";
import {generateSql} from "./build-content-import.mjs";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
export const S82_BOOK_IDS=[
 "rejected-family-second-life",
 "revenge-heiress-returns",
 "contract-marriage-expires",
 "villainess-refuses-script",
 "rivals-secret-care",
 "roommate-secret-promise"
];
const descriptions={
 "rejected-family-second-life":"重回家庭债务签约的那一天，温予宁第一次拒绝为别人牺牲未来。她和好友从零开始创业，要证明自己的设计不是谁都能拿走的。",
 "revenge-heiress-returns":"被家族修复馆解聘后，沈栀找回祖母留下的青禾计划，在普通人的老器物里重新理解继承的意义。",
 "contract-marriage-expires":"三年契约婚姻到期，林听雪选择独自远行。陆沉舟终于学会在不挽留、不控制的前提下告诉她心意。",
 "villainess-refuses-script":"穿进一本都市小说成为恶毒女配后，许知微放下泼酒剧本，靠自己的工作能力走出原本注定失败的剧情。",
 "rivals-secret-care":"毕业七年后，江望和沈行舟从竞争对手变成室友。一封旧邮件揭开误会，两人慢慢学会并肩而不是争胜。",
 "roommate-secret-promise":"一场录音泄露让程野和顾景声失联七年。意外合租后，七封没寄出的信让他们重新认识过去和彼此。"
};
const fail=message=>{throw Error("S82_ORIGINAL_STORY_IMPORT: "+message)};
const WORD=/\[\[([a-z]+)\]\]/g;
const linesToFields=text=>{
 const fields={};
 for(const line of text.split("\n")){
  const m=line.match(/^([a-z_]+): (.+)$/);
  if(!m)fail("INVALID_FRONT_MATTER");
  fields[m[1]]=m[2].trim();
 }
 return fields;
};
export function parseS82Markdown(id,source,byWord,allowed){
 if(!S82_BOOK_IDS.includes(id))fail("UNEXPECTED_STORY_ID");
 const header=source.match(/^---\n([\s\S]*?)\n---\n/);
 if(!header)fail("MISSING_FRONT_MATTER_"+id);
 const meta=linesToFields(header[1]);
 if(meta.id!==id||meta.product!=="cet4"||meta.chapters!=="6"||
    meta.status!=="PRIVATE_ORIGINAL_FIRST_DRAFT_UNREVIEWED")
   fail("METADATA_NOT_PRIVATE_CET4_"+id);
 if(!meta.title||meta.title.length>120||!meta.genre_internal||
    !meta.authoring?.includes("no model API used"))fail("METADATA_INVALID_"+id);
 const body=source.slice(header[0].length);
 const headings=[...body.matchAll(/^## 第([1-6])章[　 ]+(.+)$/gm)];
 if(headings.length!==6||headings.some((m,i)=>Number(m[1])!==i+1))
   fail("CHAPTERS_NOT_SIX_IN_ORDER_"+id);
 const ids=new Set();
 const chapters=headings.map((heading,i)=>{
  const from=heading.index+heading[0].length;
  const to=i+1<headings.length?headings[i+1].index:body.length;
  const paragraphs=body.slice(from,to).trim().split(/\n\s*\n/)
    .map(p=>p.trim()).filter(Boolean);
  if(paragraphs.length<8||paragraphs.length>150)fail("CHAPTER_PARAGRAPH_COUNT_"+id+"_"+(i+1));
  const han=(paragraphs.join("").match(/\p{Script=Han}/gu)||[]).length;
  if(han<300)fail("CHAPTER_TOO_SHORT_"+id+"_"+(i+1));
  let anchors=0;
  const segments=paragraphs.map(p=>{
   const chunk=p.replace(/\*\*/g,"");
   const parts=[],matches=[...chunk.matchAll(WORD)];
   let last=0;
   for(const token of matches){
    if(token.index>last)parts.push({text:chunk.slice(last,token.index)});
    const w=token[1];
    if(!allowed.has(w))fail("UNVERIFIED_CET4_FORM_"+id+"_"+w);
    const word=byWord.get(w);
    if(!word)fail("NO_SHARED_WORD_DATA_"+w);
    ids.add(w);anchors++;
    parts.push({wordId:word.id,surface:word.headword,gloss:word.meaningZh.split("；")[0]});
    last=token.index+token[0].length;
   }
   if(last<chunk.length)parts.push({text:chunk.slice(last)});
   if(!parts.length||parts.some(x=>x.text?.includes("[[")||x.text?.includes("]]")))
    fail("MALFORMED_ANCHORS_"+id);
   return {segments:parts};
  });
  if(anchors<2||anchors>45)fail("BAD_WORD_DENSITY_"+id+"_"+(i+1));
  return {id:"s82-"+id+"-ch"+String(i+1).padStart(2,"0"),
   number:i+1,title:heading[2].trim(),preview:i===0,paragraphs:segments};
 });
 const words=[...ids].map(w=>structuredClone(byWord.get(w)));
 const bundle={version:1,sourceLabel:"s82-cet4-6-originals-private-first-draft-not-approved",
  book:{id:"s82-"+id,category:"cet4",title:meta.title,
   description:descriptions[id],coverKey:null},words,chapters};
 const checked=validatePackage(bundle);
 return {bundle,summary:{id,title:meta.title,internalGenre:meta.genre_internal,
  chapters:chapters.length,words:words.length,mentions:checked.mentionCount,
  chaptersLength:chapters.map(ch=>({number:ch.number,
   han:(ch.paragraphs.map(p=>p.segments.map(s=>s.text||s.surface).join("")).join("")
    .match(/\p{Script=Han}/gu)||[]).length})),
  publicationAllowed:false,firstChapterPreviewOnly:true}};
}
export function buildS82DraftBundles(){
 const original=composeRainyNightSeasonDraft().bundle;
 const byWord=new Map(original.words.map(w=>[w.headword,w]));
 const official=JSON.parse(readFileSync(join(root,"content/editorial/rainy-night-s1-official-2016-pdf-form-audit.json"),"utf8"));
 const allowed=new Set(official.words.filter(w=>
   w.formStatus==="CET4_UNSTARRED_HEADWORD"||w.formStatus==="CET4_PRINTED_VARIANT").map(w=>w.headword));
 if(allowed.size!==172)fail("APPROVED_FORM_SOURCE_CHANGED");
 return S82_BOOK_IDS.map(id=>parseS82Markdown(id,readFileSync(join(root,
  "content/drafts/season-cet4-v1/"+id+".md"),"utf8"),byWord,allowed));
}
export function savePrivateS82Bundles(rows,destination=join(root,"private-output","s82-six-originals")){
 mkdirSync(destination,{recursive:true,mode:0o700});
 const files=[];
 for(const {bundle,summary} of rows){
  const result=generateSql(bundle);
  if(result.summary.publication!=="draft-only")fail("UNSAFE_IMPORT");
  const path=join(destination,summary.id+"-UNREVIEWED.json");
  writeFileSync(path,JSON.stringify(bundle,null,2)+"\n",{flag:"wx",mode:0o600});
  files.push({id:summary.id,path});
 }
 return files;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length>1||(args.length===1&&!["--check","--write-private"].includes(args[0])))
   fail("USAGE: build-six-original-story-packages.mjs --check|--write-private");
  const rows=buildS82DraftBundles();
  const report={status:"S82_PRIVATE_UNREVIEWED",books:rows.map(x=>x.summary),
   totalChapters:rows.reduce((n,r)=>n+r.summary.chapters,0),
   totalWordOccurrences:rows.reduce((n,r)=>n+r.summary.mentions,0),
   apiCalls:0,productionDbTouched:false,canSell:false};
  if(args.includes("--write-private"))report.privateFiles=savePrivateS82Bundles(rows);
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
 }catch(e){process.stderr.write(String(e.message||e)+"\n");process.exitCode=1}
}
