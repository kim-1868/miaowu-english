// Shared learning identity without rewriting historical words.id or chapter content.
// V35 compatibility bridge: a study identity is a reviewed-looking, conservative
// normalized (headword, POS, primary Chinese teaching sense) tuple. Unlike
// headword-only grouping, clearly different POS/senses remain separate.
export function studyKey(row) {
  const clean = value => String(value || "").normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/gu,"");
  const lemma=clean(row.headword);
  const pos=clean(row.part_of_speech).replace(/[.。]/gu,"").replace(/[／]/gu,"/");
  const meaning=clean(String(row.meaning_zh||"").split(/[；;]/u)[0]);
  // Blank meanings do not prove shared identity; caller must use legacy IDs.
  if(!lemma||!pos||!meaning) return "legacy:"+String(row.word_id||row.id||"");
  return "sense:"+lemma+"|"+pos+"|"+meaning;
}
const stmt=(env,q,...args)=>env.DB.prepare(q).bind(...args);
const availablePredicate=
  "AND b.status='published' AND c.is_visible=1 "+
  "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
  "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e "+
  "WHERE e.user_id=? AND e.category_id=b.category_id AND e.revoked_at IS NULL "+
  "AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status=\'revoked\')))";
export async function relatedAccessibleWordIds(env,wordId,userId){
  const base=await stmt(env,"SELECT id,headword,part_of_speech,meaning_zh FROM words WHERE id=?",wordId).first();
  if(!base)return [wordId];
  const target=studyKey(base);
  const q="SELECT DISTINCT w.id,w.headword,w.part_of_speech,w.meaning_zh "+
    "FROM words w JOIN chapter_words cw ON cw.word_id=w.id "+
    "JOIN chapters ch ON ch.id=cw.chapter_id JOIN books b ON b.id=ch.book_id "+
    "JOIN categories c ON c.id=b.category_id "+
    "WHERE LOWER(TRIM(w.headword))=LOWER(TRIM(?)) "+availablePredicate;
  const found=await stmt(env,q,base.headword,userId).all();
  const matched=(found.results||[]).filter(w=>studyKey(w)===target).map(w=>w.id);
  if(!matched.includes(wordId))matched.push(wordId);
  return [...new Set(matched)].sort();
}
export async function annotateStudyWords(env,userId,words){
  if(!Array.isArray(words)||!words.length)return [];
  const keys=words.map(w=>studyKey(w));
  if(!userId)return words.map((w,i)=>({...w,study_key:keys[i],study_seen:false,
    study_status:null,study_bookmarked:false}));
  const headwords=[...new Set(words.map(w=>String(w.headword||"").trim().toLocaleLowerCase("en-US")).filter(Boolean))];
  const state=new Map();
  for(let i=0;i<headwords.length;i+=60){
    const batch=headwords.slice(i,i+60);
    const query="SELECT uw.word_id,uw.status,uw.bookmarked,uw.last_seen_at,uw.due_at,"+
      "w.headword,w.part_of_speech,w.meaning_zh "+
      "FROM user_words uw JOIN words w ON w.id=uw.word_id "+
      "WHERE uw.user_id=? AND LOWER(TRIM(w.headword)) IN ("+
      batch.map(()=>"?").join(",")+") ORDER BY uw.last_seen_at DESC,uw.rowid DESC";
    const result=await stmt(env,query,userId,...batch).all();
    for(const row of result.results||[]){
      const key=studyKey(row);
      const prev=state.get(key);
      if(!prev)state.set(key,{status:row.status,bookmarked:!!row.bookmarked,seen:true});
      else {
        // Legacy copies can disagree before a reviewed mapping migration.
        // Keep any explicit mastered status; never let a newer learning alias
        // resurrect the same sense as an unseen/unmastered card.
        prev.bookmarked ||= !!row.bookmarked;
        if(row.status==="mastered") prev.status="mastered";
      }
    }
  }
  return words.map((w,i)=>{
    const s=state.get(keys[i]);
    return {...w,study_key:keys[i],study_seen:!!s,
      study_status:s?.status||null,study_bookmarked:!!s?.bookmarked};
  });
}
export function uniqueStudyRows(rows){
  const taken=new Set();
  return (rows||[]).filter(row=>{
    const key=row.study_key||studyKey(row);
    if(taken.has(key))return false;
    taken.add(key);
    return true;
  });
}


// V1.1 P4: one visible, account-scoped projection for home, fast cards and
// Story Echo due scope. Read ALL accessible aliases before filtering any
// status, so a stale learning copy cannot resurrect an explicitly mastered
// sense or inflate today's counter. Do not mutate historical user_words.
const utcTime=value=>{
 if(!value)return NaN;
 const s=String(value);
 return Date.parse(s.includes("T")?s:s.replace(" ","T")+"Z");
};
// Fifth argument is used ONLY by isolated reviewed-sense shadow tests.
// Production callers keep the existing default studyKey behavior.
export function projectStudySenseRows(rows,plans=[],scope="due",now=new Date(),keyForRow=studyKey){
 if(!["due","learning","all","saved","bookmarked","mastered"].includes(scope))throw Error("INVALID_STUDY_SCOPE");
 const current=now instanceof Date?now.getTime():new Date(now).getTime();
 const schedule=new Map((plans||[]).map(s=>[s.study_key,s]));
 const groups=new Map();
 for(const row of rows||[]){
  const key=keyForRow(row);
  const g=groups.get(key);
  if(!g)groups.set(key,{...row,study_key:key,
   alias_word_ids:[row.word_id],_mastered:row.status==="mastered",
   _bookmarked:Boolean(row.bookmarked),
   _legacyDue:row.due_at&&Number.isFinite(utcTime(row.due_at))?row.due_at:null});
  else{
   g.alias_word_ids.push(row.word_id);
   g._mastered ||= row.status==="mastered";
   g._bookmarked ||= Boolean(row.bookmarked);
   if(row.due_at&&Number.isFinite(utcTime(row.due_at))&&
      (!g._legacyDue||utcTime(row.due_at)<utcTime(g._legacyDue)))
    g._legacyDue=row.due_at;
  }
 }
 const out=[];
 for(const g of groups.values()){
  const plan=schedule.get(g.study_key);
  // Once a canonical schedule exists, it overrides legacy projections,
  // including a deliberate explicit unmaster or bookmark removal.
  const mastered=plan?Boolean(plan.mastered):g._mastered;
  const bookmarked=plan?Boolean(plan.bookmarked):g._bookmarked;
  const dueAt=mastered?null:(plan?plan.due_at:g._legacyDue);
  const due=Number.isFinite(utcTime(dueAt))&&utcTime(dueAt)<=current;
  const allowed=scope==="due"?!mastered&&due:
   scope==="mastered"?mastered:
   scope==="saved"?!mastered&&bookmarked:
   scope==="bookmarked"?bookmarked:!mastered;
  if(!allowed)continue;
  const {_mastered,_bookmarked,_legacyDue,...publicRow}=g;
  out.push({...publicRow,status:mastered?"mastered":"learning",
   bookmarked:bookmarked?1:0,due_at:dueAt||null});
 }
 out.sort((a,b)=>scope==="due"?
   utcTime(a.due_at)-utcTime(b.due_at)||a.word_id.localeCompare(b.word_id):
   a.headword.localeCompare(b.headword,"en")||a.word_id.localeCompare(b.word_id));
 return out;
}
export async function listUserStudySenses(env,userId,scope="due",{detail=false,now=new Date()}={}){
 const fields="uw.word_id,uw.status,uw.bookmarked,uw.due_at,w.headword,w.part_of_speech,w.meaning_zh"+
  (detail?",w.phonetic_uk,w.phonetic_us,w.example_en,w.example_zh,w.collocations_json":"");
 const found=await stmt(env,"SELECT "+fields+
  " FROM user_words uw JOIN words w ON w.id=uw.word_id WHERE uw.user_id=? "+
  "AND EXISTS(SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id "+
  "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
  "WHERE cw.word_id=uw.word_id AND b.status='published' AND c.is_visible=1 "+
  "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
  "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e "+
  "WHERE e.user_id=uw.user_id AND e.category_id=b.category_id AND e.revoked_at IS NULL "+
  "AND NOT EXISTS(SELECT 1 FROM activation_codes v "+
  "WHERE v.id=e.source_code_id AND v.status='revoked')))) "+
  "ORDER BY w.headword COLLATE NOCASE ASC,uw.word_id ASC",userId).all();
 const table=await stmt(env,
  "SELECT name FROM sqlite_master WHERE type='table' AND name='user_study_schedules'").first();
 const plans=table?.name==="user_study_schedules"?
  (await stmt(env,"SELECT study_key,mastered,bookmarked,due_at FROM user_study_schedules WHERE user_id=?",userId).all()).results||[]:[];
 return projectStudySenseRows(found.results||[],plans,scope,now);
}
export async function countUserDueSenses(env,userId){
 return (await listUserStudySenses(env,userId,"due")).length;
}
