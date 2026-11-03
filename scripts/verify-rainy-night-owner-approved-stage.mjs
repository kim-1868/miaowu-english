// Offline verification of remote D1 read-only query responses AFTER a staged
// chapter/IPA update. Never changes or publishes anything.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {buildRainyNightFullDensityReviewDraft} from "./assemble-rainy-night-high-density-review-draft.mjs";
const sha=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const content=ch=>({version:1,paragraphs:ch.paragraphs.map(p=>({segments:p.segments.map(s=>
 s.wordId?{wordId:s.wordId,surface:s.surface,gloss:s.gloss}:{text:s.text})}))});
const extract=path=>{
 const data=JSON.parse(readFileSync(resolve(path),"utf8"));
 return (Array.isArray(data)?data:[data]).flatMap(x=>x.results||[]);
};
export function verifyProductionStaged({books,chapters,counts}){
 const {draft,report}=buildRainyNightFullDensityReviewDraft();
 if(books.length!==1||books[0].id!==draft.book.id||books[0].status!=="draft"||
  books[0].category_id!=="cet4")throw Error("D1_NOT_STAGED_DRAFT");
 if(chapters.length!==12)throw Error("D1_CHAPTERS_NOT_12");
 const byId=new Map(chapters.map(x=>[x.id,x]));
 if(byId.size!==12)throw Error("D1_CHAPTER_IDS_DUPLICATE");
 for(const chapter of draft.chapters){
  const row=byId.get(chapter.id);
  if(!row||row.chapter_no!==chapter.number||Number(row.is_preview)!==0||
    row.published_at!==null||sha(JSON.parse(row.content_json))!==sha(content(chapter)))
   throw Error("D1_STAGED_CHAPTER_NOT_IDENTICAL_"+chapter.id);
 }
 if(counts.length!==1)throw Error("D1_NO_POSTSTAGE_COUNTS");
 const c=counts[0];
 for(const [key,n] of Object.entries({
   chapters:12,anchors:1892,distinct_words:188,missing_ipa:0,previews:0,
   published_chapters:0,approvals:0})){
  if(Number(c[key])!==n)throw Error("D1_POSTSTAGE_"+key+"_EXPECTED_"+n+"_GOT_"+c[key]);
 }
 return {bookId:draft.book.id,chapters:12,words:188,anchors:report.proposalAnchors,
  missingIPA:0,allPrivate:true,publicationCompleted:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==5)throw Error("Usage: node scripts/verify-rainy-night-owner-approved-stage.mjs <books.json> <chapters.json> <counts.json>");
  const result=verifyProductionStaged({books:extract(process.argv[2]),
   chapters:extract(process.argv[3]),counts:extract(process.argv[4])});
  console.log("RAINY_NIGHT_PRIVATE_D1_POSTSTAGE_CHECK "+JSON.stringify(result));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
