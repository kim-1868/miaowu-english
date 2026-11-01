// Editorial preview of cloud Story Echo prompts anchored to real unpublished paragraphs.
// Only write locally into private-output; no production D1, payment or public web changes.
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {buildRainyNightTeachingTrackPlan} from "./plan-rainy-night-teaching-tracks.mjs";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export function buildEchoReviewPack(bundle){
 const byId=new Map(bundle.words.map(w=>[w.id,w]));
 const track=new Map(buildRainyNightTeachingTrackPlan(bundle).rows.map(x=>[x.wordId,x.track]));
 const selectedWords=new Set();
 const perChapter=3;
 const questions=[];
 for(const chapter of bundle.chapters){
  const candidates=[];
  for(const [pIndex,p] of chapter.paragraphs.entries()){
   const words=p.segments.filter(x=>x.wordId);
   const occurrenceCount=new Map();
   for(const s of words)occurrenceCount.set(s.wordId,(occurrenceCount.get(s.wordId)||0)+1);
   const combined=p.segments.map(s=>s.text??s.surface).join("");
   const chinese=(combined.match(/\p{Script=Han}/gu)||[]).length;
   if(chinese<35)continue;
   for(const [sIndex,seg] of p.segments.entries()){
    if(!seg.wordId||occurrenceCount.get(seg.wordId)!==1||
      track.get(seg.wordId)!=="CET4_FORM_CANDIDATE"||
      !byId.get(seg.wordId)?.meaningZh)continue;
    const w=byId.get(seg.wordId);
    const surrounding=p.segments.map((s,i)=>i===sIndex?"______":(s.text??s.surface)).join("");
    // Avoid prompts that contain the answer outside the blank (case insensitive).
    if(surrounding.toLowerCase().includes(w.headword.toLowerCase()))continue;
    candidates.push({chapterId:chapter.id,chapterNo:chapter.number,
      chapterTitle:chapter.title,wordId:w.id,headword:w.headword,
      correctAnswer:w.headword,meaningZh:w.meaningZh,partOfSpeech:w.partOfSpeech||"",
      paragraphNo:pIndex+1,segmentNo:sIndex+1,
      prompt:"在原故事句中，根据语境与中文词义填写空缺英文词。",
      originalContext:combined,blankContext:surrounding,
      reviewStatus:"EDITORIAL_NOT_APPROVED",forCloudUse:false});
   }
  }
  // Distinct target words and a mix of paragraphs give 3 meaningful prompts/12 chapters.
  const chosen=[],paragraphs=new Set();
  for(const c of candidates){
   if(selectedWords.has(c.wordId)||paragraphs.has(c.paragraphNo))continue;
   chosen.push(c);selectedWords.add(c.wordId);paragraphs.add(c.paragraphNo);
   if(chosen.length===perChapter)break;
  }
  if(chosen.length!==perChapter)throw Error("ECHO_REVIEW_NOT_ENOUGH_CANDIDATES_CH"+chapter.number);
  questions.push(...chosen);
 }
 for(const q of questions){
  const chapter=bundle.chapters.find(c=>c.id===q.chapterId);
  const paragraph=chapter.paragraphs[q.paragraphNo-1];
  const seg=paragraph.segments[q.segmentNo-1];
  if(!seg||seg.wordId!==q.wordId||seg.surface!==q.correctAnswer)
   throw Error("ECHO_REVIEW_ANSWER_DRIFT_CH"+q.chapterNo);
  if(q.blankContext.includes(q.correctAnswer))throw Error("ECHO_REVIEW_ANSWER_LEAK");
 }
 return {status:"PRIVATE_EDITORIAL_REVIEW_ONLY",
  questions,chapterCount:bundle.chapters.length,
  questionsPerChapter:perChapter,releaseAllowed:false,
  total:questions.length,independentWords:selectedWords.size};
}
function main(){
 const args=process.argv.slice(2);
 if(args.some(x=>!["--summary","--write-private"].includes(x)))
  throw Error("Usage: node scripts/build-rainy-night-echo-review-pack.mjs [--summary|--write-private]");
 const {bundle}=composeRainyNightSeasonDraft();
 const pack=buildEchoReviewPack(bundle);
 if(args.includes("--write-private")){
  const directory=resolve("private-output");
  mkdirSync(directory,{recursive:true,mode:0o700});
  writeFileSync(resolve(directory,"rainy-night-s1-story-echo-36-UNREVIEWED.json"),
   JSON.stringify(pack,null,2)+"\n",{encoding:"utf8",mode:0o600});
 }
 const {questions,...overview}=pack;
 process.stdout.write(JSON.stringify({...overview,wordSamples:questions.slice(0,6).map(
  x=>({chapter:x.chapterNo,word:x.headword,paragraph:x.paragraphNo}))},null,2)+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1}
}
