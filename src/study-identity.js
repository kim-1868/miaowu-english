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
      else prev.bookmarked ||= !!row.bookmarked;
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


// V1.1: one shared due/overdue counter for home, quick flashcards and Story Echo.
// A word is due only after an explicit learning/review event scheduled a due_at;
// passive tapping/reading alone never enters this pool.
export async function countUserDueSenses(env,userId){
 const rows=await stmt(env,
  "SELECT uw.word_id,w.headword,w.part_of_speech,w.meaning_zh "+
  "FROM user_words uw JOIN words w ON w.id=uw.word_id "+
  "WHERE uw.user_id=? AND uw.status!='mastered' AND uw.due_at IS NOT NULL "+
  "AND datetime(uw.due_at)<=CURRENT_TIMESTAMP "+
  "AND EXISTS(SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id "+
  "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
  "WHERE cw.word_id=uw.word_id AND b.status='published' AND c.is_visible=1 "+
  "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
  "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e "+
  "WHERE e.user_id=uw.user_id AND e.category_id=b.category_id AND e.revoked_at IS NULL "+
  "AND NOT EXISTS(SELECT 1 FROM activation_codes v "+
  "WHERE v.id=e.source_code_id AND v.status='revoked'))))",userId).all();
 return uniqueStudyRows(rows.results||[]).length;
}
