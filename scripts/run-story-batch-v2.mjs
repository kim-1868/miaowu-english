// S80: parallelize independent books, never parallelize chapters within one book.
// Every generated file is PRIVATE (gitignored), every learning item stays unapproved.
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildStoryBatchPlans,planAll,produce,review} from "./story-batch.mjs";

const idPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const abort=reason=>{throw Error("STORY_BATCH_V2: "+reason)};
export function batchSelection(ids){
 const all=buildStoryBatchPlans();
 if(!Array.isArray(ids)||!ids.length)abort("SELECT_AT_LEAST_ONE_BOOK");
 const chosen=new Set(ids);
 if(chosen.size!==ids.length||ids.some(x=>!idPattern.test(x)))abort("DUPLICATE_OR_INVALID_ID");
 if(chosen.size>8)abort("TOO_MANY_BOOKS");
 if([...chosen].some(id=>!all.some(p=>p.id===id)))abort("UNKNOWN_BOOK");
 return all.filter(p=>chosen.has(p.id));
}
export function batchPreview(ids){
 const selection=batchSelection(ids);
 return {stage:"PRIVATE_BATCH_PREVIEW_ONLY",publicationAllowed:false,apiCallsMade:0,
  books:selection.map(p=>({id:p.id,title:p.title,chapters:p.chapterCount})),
  estimatedStoryCalls:selection.reduce((a,p)=>a+p.chapterCount*2,0),
  reviewNote:"Story writing, language embedding, POS, senses, pronunciation, exercise answers and originality need review. This preview never calls the AI API."};
}
export async function runBatchedPhase(ids,phase,{concurrency=2,plan=planAll,write=produce,qa=review}={}){
 const selection=batchSelection(ids);
 if(!["plan","write","embed","qa"].includes(phase))abort("UNKNOWN_PHASE");
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3)abort("CONCURRENCY_MUST_BE_1_TO_3");
 // Prevent one novel's chapter N from racing ahead of its chapter N-1.
 let next=0;
 const rows=new Array(selection.length);
 const worker=async()=>{
  while(next<selection.length){
   const idx=next++,story=selection[idx];
   try{
    let value;
    if(phase==="plan")value=plan(story.id);
    else if(phase==="qa")value=qa(story.id);
    else value=await write(story.id,phase);
    rows[idx]={id:story.id,title:story.title,status:"candidate-ready",value};
   }catch(e){
    rows[idx]={id:story.id,title:story.title,status:"blocked",
      error:String(e?.message||e).slice(0,280)};
   }
  }
 };
 await Promise.all(Array.from({length:Math.min(concurrency,selection.length)},worker));
 return {status:rows.some(r=>r.status==="blocked")?"NEEDS_RETRY":"PRIVATE_BATCH_STAGE_COMPLETE",
  phase,publicationAllowed:false,books:rows,
  passed:rows.filter(r=>r.status==="candidate-ready").length,
  blocked:rows.filter(r=>r.status==="blocked").length,
  note:"Completed phase is a private draft milestone, not commercial/publication approval."};
}
function usage(){
 return "USAGE: node scripts/run-story-batch-v2.mjs preview|plan|write|embed|qa --books <id[,id,...]|all> [--concurrency 1-3]\n"+
 "Run plan before write; write before embed; embed before qa. Preview makes 0 API calls.";
}
export async function main(args=process.argv.slice(2)){
 const [phase,...tail]=args;
 const at=tail.indexOf("--books"),cc=tail.indexOf("--concurrency");
 if(!["preview","plan","write","embed","qa"].includes(phase)||
    at<0||!tail[at+1]||
    tail.some((x,i)=>x.startsWith("--")&&!["--books","--concurrency"].includes(x))||
    cc>=0&&!tail[cc+1])abort(usage());
 const ids=tail[at+1]==="all"
   ?buildStoryBatchPlans().map(x=>x.id)
   :tail[at+1].split(",");
 if(tail.length!==(cc>=0?4:2)||
    (cc>=0&&(at===cc||cc===at+1||at===cc+1)))abort(usage());
 const concurrency=cc>=0?Number(tail[cc+1]):2;
 const out=phase==="preview"?batchPreview(ids):
   await runBatchedPhase(ids,phase,{concurrency});
 process.stdout.write(JSON.stringify(out,null,2)+"\n");
 if(out.blocked)process.exitCode=1;
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(e=>{process.stderr.write(String(e.message||e)+"\n");process.exitCode=1});
}
