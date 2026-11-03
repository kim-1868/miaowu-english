// Private 188-word IPA / sense working copy, explicitly NOT publisher-approved.
// Uses MIT US IPA candidate list and local eSpeak as an independent British
// pronunciation CHECK. No network, no production data, no user credentials.
// UK pronunciation from eSpeak is phonetic working output and requires
// qualified editorial correction before commercial release.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {prepareRainyNightMemberCandidate} from "./prepare-rainy-night-member-candidate.mjs";

const usa=JSON.parse(readFileSync(new URL("../content/editorial/rainy-night-s1-us-ipa-candidates-UNVERIFIED.json",import.meta.url),"utf8"));
const uk=JSON.parse(readFileSync(new URL("../content/editorial/rainy-night-s1-britfone-uk-ipa-candidates.json",import.meta.url),"utf8"));
const selectedUS={
 accept:1,accountability:1,address:0,automatic:0,community:0,
 conflict:0,contrast:0,cooperate:1,damage:0,detail:0,
 digital:0,direct:0,disappear:0,document:0,duplicate:1,
 emergency:0,enlarge:0,forgive:0,insert:1,justice:1,
 notice:1,operate:0,option:0,outage:0,predict:1,
 preserve:0,receipt:1,record:0,recording:0,regret:1,
 relief:1,reluctance:1,replace:0,request:1,resemble:1,
 respond:1,retain:1,return:1,reveal:1,reverse:1,
 schedule:0,secret:1,separate:2,shortage:0,storage:0,
 suspect:1,transfer:0
};
// UK stress variants selected from phoneme candidates by the primary
// teaching sense (original raw Britfone transcriptions stay in review data).
const selectedUK={
 conflict:0,contact:1,contrast:1,direct:1,document:1,
 duplicate:0,enlarge:0,insert:0,privacy:1,record:0,
 schedule:0,separate:1,suspect:0,transfer:1
};
const specificallyReviewedBritishSenseDRAFT={
 record:"/ˈrekɔːd/",suspect:"/səˈspekt/",conflict:"/ˈkɒnflɪkt/",
 contrast:"/ˈkɒntrɑːst/",transfer:"/ˈtrænsfɜː/",insert:"/ɪnˈsɜːt/",
 duplicate:"/ˈdjuːplɪkət/",separate:"/ˈsepərət/",
 contact:"/ˈkɒntækt/",address:"/əˈdres/",document:"/ˈdɒkjʊmənt/",
 schedule:"/ˈʃedjuːl/",privacy:"/ˈprɪvəsi/",direct:"/dɪˈrekt/",
 blurred:"/blɜːd/",discrepancy:"/dɪˈskrepənsi/",falsify:"/ˈfɔːlsɪfaɪ/",
 handwriting:"/ˈhændraɪtɪŋ/",outage:"/ˈaʊtɪdʒ/",
 reunite:"/ˌriːjuːˈnaɪt/",watermark:"/ˈwɔːtəmɑːk/"
};
// Independently written editorial phonetic suggestions from the model,
// NOT verified by an accredited proofreader. Do not assign commercial rights
// or approval on this basis.
const splitPhrases=["duplicate","separate","damage","emergency","regret"];
const multiSenseWordNotes={
 record:"noun: record (not verb re-CORD)",
 suspect:"verb: suspect (not noun SUS-pect)",
 conflict:"noun; initial stress",
 contrast:"noun; initial stress",
 transfer:"noun; initial stress",
 insert:"verb; second-syllable stress",
 duplicate:"noun/adj reading; verb has different final vowel",
 separate:"adjective reading chosen; verb differs and requires teaching note",
 address:"noun in story; American stress may vary",
 contact:"verb in story; UK initial stress commonly acceptable",
 privacy:"UK primary /ˈprɪvəsi/; /ˈpraɪvəsi/ is also used",
 schedule:"UK /ʃ-/ preferred; US /sk-/",
 direct:"adj: both UK dɪ-/daɪ- accepted",
 document:"noun reading; noun/verb stress can differ"
};
const checkShape=x=>typeof x==="string"&&x.startsWith("/")&&x.endsWith("/")&&x.length>3&&!/\r|\n|<|>/.test(x);
export function pronunciationDraft({britishRead}={}){
 if(typeof britishRead!=="function")throw Error("BRITISH_PRONUNCIATION_READER_REQUIRED");
 const {candidate}=prepareRainyNightMemberCandidate();
 const US=new Map(usa.words.map(w=>[w.headword,w]));
 const UK=new Map(uk.words.map(w=>[w.headword,w]));
 if(candidate.words.length!==188||US.size!==188||UK.size!==188)throw Error("WORD_INVENTORY_CHANGED");
 const proposed=[];
 for(const w of candidate.words){
  const us=US.get(w.headword),gb=UK.get(w.headword);
  if(!us||!gb||!us.usIpaCandidates.length)throw Error("IPA_SOURCE_WORD_MISSING_"+w.headword);
  const index=selectedUS[w.headword]??0;
  if(index>=us.usIpaCandidates.length)throw Error("SENSE_VARIANT_INVALID_"+w.headword);
  const selectedUs=us.usIpaCandidates[index];
  const british=specificallyReviewedBritishSenseDRAFT[w.headword]||britishRead(w.headword);
  if(!checkShape(selectedUs)||!checkShape(british))throw Error("IPA_NOT_WELLFORMED_"+w.headword);
  const manualSense=splitPhrases.includes(w.headword);
  proposed.push({
   wordId:w.id,headword:w.headword,partOfSpeech:w.partOfSpeech,
   meaningZh:w.meaningZh,exampleEn:w.exampleEn,exampleZh:w.exampleZh,
   americanSuggested:selectedUs,americanAllCandidates:us.usIpaCandidates,
   americanCandidateIndex:index,americanSource:"open-dict-data/ipa-dict en_US MIT (CMU lineage)",
   britishSuggested:british,britishAllRawCandidates:gb.phoneticUkCandidates,
   britishSelectedRawIndex:gb.phoneticUkCandidates.length?(selectedUK[w.headword]??0):null,
   britishComparisonSource:"JoseLlarena/Britfone MIT; eSpeak synthetic UK reading (not preapproved)",
   comparisonNeedsCheck:gb.phoneticUkCandidates.length===0,
   needsQualifiedReview:manualSense||us.usIpaCandidates.length>1||gb.phoneticUkCandidates.length!==1,
   senseNote:multiSenseWordNotes[w.headword]||"",
   normalizedIpaAndCommercialPermissionChecked:false,
   textMeaningAndPronunciationApproved:false
  });
 }
 return {schema:"RAINY_NIGHT_188_IPA_REVIEW_WORKING_COPY_V2",bookId:candidate.book.id,
  count:proposed.length,ukGaps:proposed.filter(w=>w.comparisonNeedsCheck).length,
  multipleOrGap:proposed.filter(w=>w.needsQualifiedReview).length,
  humanApproved:false,productionD1Touched:false,rows:proposed};
}
function espeakBritish(word){
 const p=spawnSync("espeak",["-q","--ipa","-v","en-gb",word],
  {encoding:"utf8",maxBuffer:5000,timeout:5000});
 if(p.error||p.status!==0)throw Error("ESPEAK_NOT_AVAILABLE_"+word);
 let raw=p.stdout.trim().replace(/[\u200c\u200d]/g,"").replace(/\s+/g,"");
 if(raw.length<2||raw.length>85)throw Error("INVALID_ESPEAK_RESULT_"+word);
 return "/"+raw+"/";
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const mode=process.argv[2];
  if(mode!=="--summary"&&mode!=="--write-private")throw Error("Usage --summary | --write-private");
  const d=pronunciationDraft({britishRead:espeakBritish});
  if(mode==="--write-private"){
   mkdirSync(resolve("private-output"),{recursive:true,mode:0o700});
   writeFileSync(resolve("private-output/rainy-night-188-IPA-AI-DRAFT-NEEDS-REVIEW.json"),
    JSON.stringify(d,null,2)+"\n",{mode:0o600,flag:"wx"});
  }
  const {rows,...report}=d;console.log(JSON.stringify(report,null,2));
 }catch(e){console.error(String(e.message||e));process.exitCode=1;}
}
