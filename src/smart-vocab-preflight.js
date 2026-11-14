// Smart-vocabulary selection contract (offline; intentionally not wired to production).
// This module never reads novel chapters, changes saved words, or writes user state.
// A caller must supply SERVER-VERIFIED active entitlements and a curated ranked lexicon.
import {studyKey} from './study-identity.js';
import {auditSmartWordCard} from './smart-vocab-card-quality.js';

export const SMART_EXAMS=Object.freeze(['cet4','cet6','postgrad','ielts']);
const RANK_SOURCES=new Set(['COCA','BNC','POSTGRAD_EXAM']);
const validRank=n=>Number.isSafeInteger(n)&&n>0;
// High-frequency function words remain in the full syllabus, but do not
// crowd the first rounds ahead of useful exam content words.
const BASIC_FUNCTION_WORDS=new Set([
  'the','a','an','of','to','in','on','at','and','or','but','for',
  'be','is','are','was','were','am','it','he','she','they','i',
  'you','we','me','my','your','our','their','this','that','these',
  'those','who','what','which','not'
]);
const isBasicFunctionWord=w=>BASIC_FUNCTION_WORDS.has(w.headword.toLocaleLowerCase('en-US'));

function normalizedWord(row){
  if(!row||typeof row!=='object')return null;
  const id=String(row.word_id||'').trim();
  const headword=String(row.headword||'').trim();
  const meaning=String(row.meaning_zh||'').trim();
  const pos=String(row.part_of_speech||'').trim();
  const category=String(row.category_slug||'').trim();
  const rank=row.frequency_rank==null||row.frequency_rank===''?null:Number(row.frequency_rank);
  const source=String(row.frequency_source||'').trim().toUpperCase();
  const ipaUk=String(row.phonetic_uk||'').trim();
  const ipaUs=String(row.phonetic_us||'').trim();
  const exampleEn=String(row.example_en||'').trim();
  const exampleZh=String(row.example_zh||'').trim();
  // A card with no pronunciation or example is not suitable for a paid lesson.
  // Never make up a ranking, invent a meaning, or infer a product category.
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||!headword||!meaning||
     !SMART_EXAMS.includes(category)||
     (source==='UNRANKED'?rank!==null||row.frequency_available===1||row.frequency_available===true:
       !validRank(rank)||!RANK_SOURCES.has(source)||row.frequency_available===0||row.frequency_available===false)||
     (source==='POSTGRAD_EXAM'&&row.frequency_available!==true&&row.frequency_available!==1)||
     (!ipaUk&&!ipaUs)||!exampleEn||!exampleZh)return null;
  // The same editorial lint used for draft review protects the runtime pool.
  // No "reviewed" database flag may silently approve a placeholder card.
  if(!auditSmartWordCard({
    ...row,word_id:id,category_slug:category,frequency_rank:rank,
    frequency_source:source,part_of_speech:pos,meaning_zh:meaning,
    phonetic_uk:ipaUk,phonetic_us:ipaUs,example_en:exampleEn,
    example_zh:exampleZh
  }).structurallyReady)return null;
  return {
    word_id:id,headword,part_of_speech:pos,meaning_zh:meaning,
    category_slug:category,frequency_rank:rank,frequency_source:source,
    phonetic_uk:ipaUk,phonetic_us:ipaUs,
    example_en:exampleEn,example_zh:exampleZh,
    ...(Array.isArray(row.collocations)&&row.collocations.length?
      {collocations:row.collocations.slice(0,5)}:{})
  };
}

function senseOf(row){
  return studyKey({word_id:row.word_id||row.id,headword:row.headword,
    part_of_speech:row.part_of_speech,meaning_zh:row.meaning_zh});
}

// Existing user_words rows, including unbookmarked words, are the source of
// prior learning. Bookmark flags MUST NOT control whether a word is "new".
export function previouslyLearnedKeys(studyRows=[]){
  const known=new Set();
  for(const row of Array.isArray(studyRows)?studyRows:[]){
    if(!row||typeof row!=='object')continue;
    if(row.status==='new'&&!row.last_seen_at)continue;
    if(!row.word_id&&!row.id)continue;
    known.add(senseOf(row));
  }
  return known;
}

export function selectSmartNewWords({
  category,activeEntitlements,rankedWords,studyRows=[],
  catalogVerified=false,limit=20
}={}){
  const slug=String(category||'').trim();
  // Authoritative backend entitlement check is mandatory BEFORE calling this
  // pure selector. The provided list must contain only active non-revoked grants.
  const authorized=Array.isArray(activeEntitlements)&&activeEntitlements.some(e=>
    typeof e==='string'?e===slug:
    e?.slug===slug&&e.revoked_at==null&&e.activation_status!=='revoked'&&e.active!==false);
  if(!SMART_EXAMS.includes(slug)||!authorized)
    return {available:false,reason:'CATEGORY_NOT_ENTITLED',words:[]};
  // No verified complete lexicon => do NOT silently pretend novel words are the exam list.
  if(catalogVerified!==true)
    return {available:false,reason:'CATALOG_NOT_VERIFIED',words:[]};
  if(!Number.isInteger(limit)||limit<1||limit>20)
    return {available:false,reason:'INVALID_BATCH_SIZE',words:[]};

  const known=previouslyLearnedKeys(studyRows),unique=new Map();
  for(const raw of Array.isArray(rankedWords)?rankedWords:[]){
    const w=normalizedWord(raw);
    if(!w||w.category_slug!==slug)continue;
    const key=senseOf(w);
    if(known.has(key))continue;
    const existing=unique.get(key);
    const rankValue=x=>x.frequency_rank??Infinity;
    if(!existing||rankValue(w)<rankValue(existing)||
       (rankValue(w)===rankValue(existing)&&w.word_id<existing.word_id)){
      unique.set(key,w);
    }
  }
  const ordered=[...unique.values()].sort((a,b)=>
    Number(a.frequency_rank===null)-Number(b.frequency_rank===null)||
    Number(isBasicFunctionWord(a))-Number(isBasicFunctionWord(b))||
    (a.frequency_rank??Number.MAX_SAFE_INTEGER)-(b.frequency_rank??Number.MAX_SAFE_INTEGER)||
    a.headword.localeCompare(b.headword,'en')||a.word_id.localeCompare(b.word_id,'en'));
  return {available:true,reason:null,words:ordered.slice(0,limit),
    remaining:Math.max(0,ordered.length-limit)};
}
