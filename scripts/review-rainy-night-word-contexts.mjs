// Reproducible 733-occurrence source-context review, no deployment or D1 access.
// Export only to private-output/ (gitignored); all statuses begin UNREVIEWED.
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {buildRainyNightTeachingTrackPlan} from "./plan-rainy-night-teaching-tracks.mjs";
import {createVocabularyReviewQueue} from "./prepare-rainy-night-vocabulary-review.mjs";
import {codeSwitchPosRisk} from "../src/editorial-code-switch-lint.js";

function csvCell(value){
 const t=String(value??"");
 return /[",\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;
}
export function buildRainyNightOccurrenceReview(bundle){
 const trackPlan=buildRainyNightTeachingTrackPlan(bundle);
 const vocab=createVocabularyReviewQueue(bundle);
 const tracks=new Map(trackPlan.rows.map(x=>[x.wordId,x]));
 const words=new Map(bundle.words.map(w=>[w.id,w]));
 const flagsByWord=new Map(vocab.rows.map(w=>[w.wordId,w.reviewFlags]));
 const rows=[];
 const totalsByChapter=new Map();
 for(const chapter of bundle.chapters){
  for(let pi=0;pi<chapter.paragraphs.length;pi++){
   const para=chapter.paragraphs[pi],segments=para.segments;
   const paraWordIds=segments.filter(s=>s.wordId).map(s=>s.wordId);
   const counts=new Map();
   for(const id of paraWordIds)counts.set(id,(counts.get(id)||0)+1);
   for(let si=0;si<segments.length;si++){
    const segment=segments[si];
    if(!segment.wordId)continue;
    const word=words.get(segment.wordId);
    if(!word||segment.surface!==word.headword)throw Error("WORD_SURFACE_DRIFT_"+chapter.id);
    const plan=tracks.get(word.id);
    if(!plan)throw Error("MISSING_TEACHING_TRACK_"+word.headword);
    const sourceContext=segments.map(s=>s.text??s.surface).join("");
    const earlier=segments.slice(0,si).map(s=>s.text??s.surface).join("");
    const later=segments.slice(si+1).map(s=>s.text??s.surface).join("");
    const risk=new Set(["POS_SENSE_CONTEXT_UNREVIEWED","ENGLISH_CHINESE_MIX_UNREVIEWED"]);
    for(const f of codeSwitchPosRisk({partOfSpeech:word.partOfSpeech,before:earlier,after:later}))
      risk.add(f);
    if(counts.get(word.id)>1)risk.add("SAME_WORD_REPEATED_IN_PARAGRAPH");
    if(paraWordIds.length>4)risk.add("DENSE_WORD_PARAGRAPH");
    const wordFlags=flagsByWord.get(word.id)||[];
    for(const f of wordFlags){
     if(["UK_IPA_NOT_IN_SOURCE","UK_IPA_VARIANT_NEEDS_SENSE_REVIEW",
         "US_ARPA_VARIANT_NEEDS_SENSE_REVIEW"].includes(f))risk.add(f);
    }
    if(plan.track!=="CET4_FORM_CANDIDATE")risk.add("NON_CET4_CORE_TARGET");
    const ref=chapter.id+":p"+String(pi+1).padStart(2,"0")+
      ":s"+String(si+1).padStart(2,"0");
    rows.push({ref,chapter:chapter.number,chapterId:chapter.id,
      paragraph:pi+1,segment:si+1,wordId:word.id,
      word:word.headword,partOfSpeech:word.partOfSpeech,
      declaredMeaning:word.meaningZh,gloss:segment.gloss,
      track:plan.track,paragraphWordCount:paraWordIds.length,
      before:earlier.slice(-70),after:later.slice(0,70),
      originalContext:sourceContext,reviewFlags:[...risk],
      verifiedBy:"",reviewStatus:"UNREVIEWED",approvedReplacement:"",editorNotes:""});
    totalsByChapter.set(chapter.number,(totalsByChapter.get(chapter.number)||0)+1);
   }
  }
 }
 const flaggedName=[
  "NON_CET4_CORE_TARGET","UK_IPA_NOT_IN_SOURCE",
  "UK_IPA_VARIANT_NEEDS_SENSE_REVIEW","US_ARPA_VARIANT_NEEDS_SENSE_REVIEW",
  "DENSE_WORD_PARAGRAPH","SAME_WORD_REPEATED_IN_PARAGRAPH",
  "CODE_SWITCH_VERB_AFTER_NOMINAL_CLASSIFIER",
  "CODE_SWITCH_VERB_IN_NOUN_MODIFIER_SLOT",
  "CODE_SWITCH_ADJECTIVE_HEAD_NOUN_MISSING",
  "CODE_SWITCH_ADJECTIVE_LINKER_REVIEW"];
 const flags=Object.fromEntries(flaggedName.map(s=>[s,rows.filter(r=>r.reviewFlags.includes(s)).length]));
 const overview={source:"private 12-chapter actual composed draft",
  status:"FULL_CONTEXT_REVIEW_NOT_APPROVED",
  chapterCount:bundle.chapters.length,wordCount:words.size,occurrenceCount:rows.length,
  perChapter:[...totalsByChapter].map(([chapter,occurrences])=>({chapter,occurrences})),
  flags,unreviewed:rows.length,publicationAllowed:false,
  syntaxRiskFlagsAreReviewHintsOnly:true};
 if(rows.length!==vocab.overview.totalMentions)
  throw Error("WORD_CONTEXT_REVIEW_COUNT_DRIFT");
 if(new Set(rows.map(r=>r.ref)).size!==rows.length)
  throw Error("NON_UNIQUE_CONTEXT_REFERENCE");
 return {overview,rows};
}
export function contextReviewCsv(review){
 const columns=["ref","chapter","paragraph","segment","wordId","word","partOfSpeech",
  "declaredMeaning","gloss","track","paragraphWordCount","before","after",
  "originalContext","reviewFlags","verifiedBy","reviewStatus","approvedReplacement","editorNotes"];
 return [columns.join(","),
  ...review.rows.map(row=>columns.map(k=>csvCell(Array.isArray(row[k])?
   row[k].join("|"):row[k])).join(","))].join("\n")+"\n";
}
function main(){
 const args=process.argv.slice(2);
 if(args.some(x=>!["--summary","--write-private"].includes(x)))
  throw Error("Usage: node scripts/review-rainy-night-word-contexts.mjs --summary|--write-private");
 const review=buildRainyNightOccurrenceReview(composeRainyNightSeasonDraft().bundle);
 if(args.includes("--write-private")){
  const dir=resolve("private-output");
  mkdirSync(dir,{recursive:true,mode:0o700});
  writeFileSync(resolve(dir,"rainy-night-733-occurrences-UNREVIEWED.csv"),
   contextReviewCsv(review),{encoding:"utf8",mode:0o600});
  writeFileSync(resolve(dir,"rainy-night-733-occurrences-summary.json"),
   JSON.stringify(review.overview,null,2)+"\n",{encoding:"utf8",mode:0o600});
 }
 process.stdout.write(JSON.stringify(review.overview,null,2)+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1}
}
