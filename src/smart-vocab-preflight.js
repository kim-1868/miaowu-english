// Smart-vocabulary selection contract (offline; intentionally not wired to production).
// This module never reads novel chapters, changes saved words, or writes user state.
// A caller must supply SERVER-VERIFIED active entitlements and a curated ranked lexicon.
import {studyKey} from './study-identity.js';

export const SMART_EXAMS=Object.freeze(['cet4','cet6','postgrad','ielts']);
const RANK_SOURCES=new Set(['COCA','BNC','POSTGRAD_EXAM']);
const validRank=n=>Number.isSafeInteger(n)&&n>0;

function normalizedWord(row){
  if(!row||typeof row!=='object')return null;
  const id=String(row.word_id||'').trim();
  const headword=String(row.headword||'').trim();
  const meaning=String(row.meaning_zh||'').trim();
  const pos=String(row.part_of_speech||'').trim();
  const category=String(row.category_slug||'').trim();
  const rank=Number(row.frequency_rank);
  const source=String(row.frequency_source||'').trim().toUpperCase();
  // Never make up a ranking, invent a meaning, or infer a product category.
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||!headword||!meaning||
     !SMART_EXAMS.includes(category)||!validRank(rank)||!RANK_SOURCES.has(source))return null;
  return {
    word_id:id,headword,part_of_speech:pos,meaning_zh:meaning,
    category_slug:category,frequency_rank:rank,frequency_source:source,
    phonetic_uk:String(row.phonetic_uk||''),phonetic_us:String(row.phonetic_us||''),
    example_en:String(row.example_en||''),example_zh:String(row.example_zh||'')
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
    (typeof e==='string'?e:e?.slug)===slug);
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
    if(!existing||w.frequency_rank<existing.frequency_rank||
       (w.frequency_rank===existing.frequency_rank&&w.word_id<existing.word_id)){
      unique.set(key,w);
    }
  }
  const ordered=[...unique.values()].sort((a,b)=>a.frequency_rank-b.frequency_rank||
    a.headword.localeCompare(b.headword,'en')||a.word_id.localeCompare(b.word_id,'en'));
  return {available:true,reason:null,words:ordered.slice(0,limit),
    remaining:Math.max(0,ordered.length-limit)};
}
