// P5 LOCAL SQLITE SHADOW ONLY. The existing Worker does not import this file.
// Reuses the real V1.1 projectStudySenseRows and spaced-review engine while
// keeping reviewed mapping opt-in and preserving all historical rows.
import {studyKey,projectStudySenseRows} from "../src/study-identity.js";
import {scheduleRecallFeedback} from "../src/spaced-review.js";
import {readLocalSenseSnapshot} from "./v11-reviewed-sense-impact.mjs";
import {buildSenseShadow} from "./v11-shadow-sense-audit.mjs";

const fail=code=>{throw Error(code)};
const hasTable=(db,name)=>Boolean(db.prepare(
 "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
const norm=s=>String(s??"").normalize("NFKC").trim().toLocaleLowerCase("en-US");
const oldKey=w=>studyKey({word_id:w.word_id||w.id,...w});
const unique=xs=>[...new Set(xs)].sort();
const time=s=>{
 if(!s)return null;
 const d=Date.parse(String(s).includes("T")?String(s):String(s).replace(" ","T")+"Z");
 return Number.isFinite(d)?new Date(d).toISOString():null;
};
const required=["users","words","chapter_words","chapters","books","categories",
 "entitlements","activation_codes","user_words","review_events","reading_progress"];
const entitle=
 "b.status='published' AND c.is_visible=1 "+
 "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
 "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e "+
 "WHERE e.user_id=? AND e.category_id=b.category_id AND e.revoked_at IS NULL "+
 "AND NOT EXISTS(SELECT 1 FROM activation_codes v "+
 "WHERE v.id=e.source_code_id AND v.status='revoked')))";
function visibleWords(db,userId){
 const query="SELECT DISTINCT w.id word_id,w.headword,w.part_of_speech,w.meaning_zh,"+
  "w.phonetic_uk,w.phonetic_us,w.example_en,w.example_zh,w.collocations_json "+
  "FROM words w JOIN chapter_words cw ON cw.word_id=w.id "+
  "JOIN chapters ch ON ch.id=cw.chapter_id "+
  "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
  "WHERE "+entitle+" ORDER BY w.id";
 return db.prepare(query).all(userId);
}
function completedWordIds(db,userId,visible){
 const query="SELECT DISTINCT cw.word_id FROM reading_progress p "+
  "JOIN chapters ch ON ch.id=p.chapter_id "+
  "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
  "JOIN chapter_words cw ON cw.chapter_id=ch.id "+
  "WHERE p.user_id=? AND p.completed_at IS NOT NULL AND "+entitle;
 return new Set(db.prepare(query).all(userId,userId)
  .map(r=>r.word_id).filter(id=>visible.has(id)));
}
const sameSchedule=(a,b)=>["stage_index","due_at","last_positive_day",
 "last_reviewed_at","mastered","bookmarked"].every(k=>
  (k==="due_at"||k==="last_reviewed_at"?time(a[k])===time(b[k]):
   (a[k]??null)===(b[k]??null)));
function reviewedMap(db){
 for(const name of ["reviewed_sense_groups","reviewed_sense_aliases"])
  if(!hasTable(db,name))fail("REVIEWED_SHADOW_SCHEMA_MISSING");
 const groups=db.prepare("SELECT sense_id,snapshot_sha256 FROM reviewed_sense_groups").all();
 if(!groups.length)fail("REVIEWED_SHADOW_NO_APPROVED_GROUPS");
 const current=buildSenseShadow(readLocalSenseSnapshot(db)).sourceFingerprint;
 if(groups.some(g=>g.snapshot_sha256!==current))
  fail("REVIEWED_SHADOW_STALE_STORY_SNAPSHOT");
 const rows=db.prepare("SELECT a.word_id,a.sense_id,a.legacy_study_key,"+
  "w.headword,w.part_of_speech,w.meaning_zh FROM reviewed_sense_aliases a "+
  "JOIN words w ON w.id=a.word_id ORDER BY a.word_id").all();
 const map=new Map();
 const byLegacy=new Map();
 for(const r of rows){
  if(r.legacy_study_key!==oldKey(r))fail("REVIEWED_SHADOW_OLD_KEY_CHANGED");
  map.set(r.word_id,r.sense_id);
  const g=byLegacy.get(r.legacy_study_key)||new Set();
  g.add(r.sense_id);byLegacy.set(r.legacy_study_key,g);
 }
 const all=db.prepare("SELECT id,headword,part_of_speech,meaning_zh FROM words").all();
 for(const row of all){
  const key=oldKey(row),approved=byLegacy.get(key);
  if(approved&&(!map.has(row.id)||approved.size!==1))
   fail("REVIEWED_SHADOW_PARTIAL_OLD_KEY_COLLISION");
 }
 return map;
}
function rekeyPlans(studied,originalPlans,aliasKey){
 const groups=new Map();
 for(const row of studied){
  const key=aliasKey(row),list=groups.get(key)||[];
  list.push(row);groups.set(key,list);
 }
 const planMap=new Map(originalPlans.map(p=>[p.study_key,p]));
 const out=[];
 for(const [key,rows] of groups){
  const oldKeys=unique(rows.map(oldKey));
  const matching=oldKeys.map(k=>planMap.get(k)).filter(Boolean);
  if(matching.some(p=>!sameSchedule(p,matching[0])))
   fail("REVIEWED_SHADOW_CONFLICTING_SCHEDULES");
  // Current canonical decisions must not be overwritten by an old stale
  // mastered/bookmarked alias after a proposed semantic consolidation.
  const explicit=matching[0];
  if(explicit&&matching.some(p=>Number(p.mastered)===0)&&rows.some(r=>r.status==="mastered"))
   fail("REVIEWED_SHADOW_EXPLICIT_UNMASTER_CONFLICT");
  if(explicit&&matching.some(p=>Number(p.bookmarked)===0)&&rows.some(r=>Number(r.bookmarked)===1))
   fail("REVIEWED_SHADOW_EXPLICIT_UNBOOKMARK_CONFLICT");
  if(explicit)out.push({...explicit,study_key:key});
 }
 return out;
}
function snapshot(db,userId,{reviewed,now}){
 if(!db||typeof db.prepare!=="function"||typeof userId!=="string")
  fail("REVIEWED_SHADOW_LOCAL_DATABASE_REQUIRED");
 if(!required.every(name=>hasTable(db,name)))fail("REVIEWED_SHADOW_LEGACY_SCHEMA_MISSING");
 if(!db.prepare("SELECT id FROM users WHERE id=?").get(userId))
  fail("REVIEWED_SHADOW_USER_NOT_FOUND");
 const mapping=reviewed?reviewedMap(db):new Map();
 const keyForRow=w=>mapping.get(w.word_id)||oldKey(w);
 const visible=visibleWords(db,userId),visibleSet=new Set(visible.map(w=>w.word_id));
 const studied=db.prepare(
  "SELECT uw.word_id,uw.status,uw.bookmarked,uw.due_at,w.headword,"+
  "w.part_of_speech,w.meaning_zh,w.phonetic_uk,w.phonetic_us,w.example_en,"+
  "w.example_zh,w.collocations_json FROM user_words uw "+
  "JOIN words w ON w.id=uw.word_id WHERE uw.user_id=? ORDER BY uw.word_id"
 ).all(userId).filter(w=>visibleSet.has(w.word_id));
 const plans=hasTable(db,"user_study_schedules")?
  db.prepare("SELECT study_key,stage_index,due_at,last_positive_day,"+
   "last_reviewed_at,mastered,bookmarked FROM user_study_schedules "+
   "WHERE user_id=?").all(userId):[];
 const compatible=reviewed?rekeyPlans(studied,plans,keyForRow):plans;
 const rows=scope=>projectStudySenseRows(studied,compatible,scope,now,keyForRow);
 const due=rows("due"),bookmarked=rows("bookmarked");
 const learned=[...rows("learning"),...rows("mastered")];
 const learnedByKey=new Map(learned.map(r=>[r.study_key,r]));
 const completed=completedWordIds(db,userId,visibleSet);
 const completedKeys=new Set(visible.filter(w=>completed.has(w.word_id)).map(keyForRow));
 const byKey=new Map();
 for(const word of visible){
  const key=keyForRow(word),arr=byKey.get(key)||[];
  arr.push(word.word_id);byKey.set(key,arr);
 }
 // This is the same dataset a reading page, wordbook, quick cards,
 // listening spelling and Story Echo must ultimately agree on. No writes.
 const reading=visible.map(w=>{
  const key=keyForRow(w),learned=learnedByKey.get(key);
  return {wordId:w.word_id,studyKey:key,seen:Boolean(learned),
   status:learned?.status||null,bookmarked:Boolean(learned?.bookmarked)};
 });
 const echo=due.filter(r=>completedKeys.has(r.study_key));
 const expand=arr=>arr.map(row=>({
  studyKey:row.study_key,
  wordId:row.word_id,
  status:row.status,
  bookmarked:Boolean(row.bookmarked),
  dueAt:row.due_at,
  eligibleAliases:unique(byKey.get(row.study_key)||[])
 }));
 return {
  reviewedMappingEnabled:reviewed,
  keysByWord:Object.fromEntries(visible.map(w=>[w.word_id,keyForRow(w)])),
  visibleWords:visible,
  completed,byKey,studied,plans:compatible,
  rows,reading,
  homeDueCount:due.length,
  echoStatsDueCount:due.length,
  wordbook:expand(bookmarked),
  flashcardDue:expand(due),
  listeningSpellingDue:expand(due),
  storyEchoDue:expand(echo),
  answeredSenseByKey:learnedByKey,
  keyForRow
 };
}
export function previewReviewedLearningViews(db,userId,{reviewed=false,now=new Date()}={}){
 const s=snapshot(db,userId,{reviewed,now});
 return {
  mode:reviewed?"REVIEWED_SHADOW_ONLY":"LEGACY_DEFAULT_UNCHANGED",
  reading:s.reading,
  homeDueCount:s.homeDueCount,
  echoStatsDueCount:s.echoStatsDueCount,
  wordbook:s.wordbook,
  flashcardDue:s.flashcardDue,
  listeningSpellingDue:s.listeningSpellingDue,
  storyEchoDue:s.storyEchoDue,
  // Only reviewed identity labels and old word IDs; no customer data/content.
  productionTouched:false,reviewHistoryChanged:false,onlineEnabled:false
 };
}
// The rehearsal uses the production spaced-review pure engine, but applies
// NO write. One answer's next plan is the same across all learning modes.
export function previewReviewedFeedback(db,userId,{wordId,mode,answer=null,
 judgment=null,choiceId=null,reviewed=false,now=new Date()}={}){
 if(!["flip","spell","echo"].includes(mode))fail("REVIEWED_SHADOW_INVALID_MODE");
 const s=snapshot(db,userId,{reviewed,now});
 const w=s.visibleWords.find(x=>x.word_id===wordId);
 if(!w)fail("REVIEWED_SHADOW_WORD_NOT_ACCESSIBLE");
 if(mode==="echo"&&!s.completed.has(wordId))
  fail("REVIEWED_SHADOW_ECHO_CHAPTER_NOT_COMPLETED");
 let correct;
 if(mode==="flip") {
  if(!["known","unsure","forgot"].includes(judgment))fail("REVIEWED_SHADOW_INVALID_JUDGMENT");
  correct=judgment==="known";
 }else{
  if(typeof answer!=="string"||!answer.trim())fail("REVIEWED_SHADOW_ANSWER_REQUIRED");
  correct=norm(answer)===norm(w.headword);
  if(choiceId!==null){
   if(mode!=="echo")fail("REVIEWED_SHADOW_CHOICE_ONLY_FOR_ECHO");
   const choice=s.visibleWords.find(x=>x.word_id===choiceId);
   if(!choice)fail("REVIEWED_SHADOW_CHOICE_NOT_ACCESSIBLE");
   correct=correct&&s.keyForRow(choice)===s.keyForRow(w);
  }
 }
 const key=s.keyForRow(w);
 const prev=s.answeredSenseByKey.get(key);
 if(!prev)fail("REVIEWED_SHADOW_STUDY_PLAN_MISSING");
 const plan=s.plans.find(p=>p.study_key===key);
 const next=scheduleRecallFeedback({
  stageIndex:plan?.stage_index??0,
  dueAt:time(prev.due_at),
  lastPositiveDay:plan?.last_positive_day??null,
  lastReviewedAt:time(plan?.last_reviewed_at),
  mastered:prev.status==="mastered"
 },correct?"correct":"incorrect",now);
 return {
  mode,wordId,studyKey:key,correct,
  affectsVisibleWordIds:unique(s.byKey.get(key)||[]),
  projectedMastered:next.mastered,
  projectedDueAt:next.dueAt,
  stageIndex:next.stageIndex,
  persisted:false,reviewEventInserted:false,productionTouched:false
 };
}
