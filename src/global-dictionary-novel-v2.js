// A4.3 converter for books whose author does NOT submit words[].
// Only explicitly marked learning target segments {surface,gloss} become
// required wordcards. Plain English in text is a nonblocking suggestion.
// Safe pure conversion: it neither approves a lesson nor writes to D1.
import {validatePackage} from './editorial-content.js';
import {normalizedLemma,matchDictionaryWord} from './global-dictionary-matcher.js';

const CJK=/[\u3400-\u9fff]/u;
const CLEAN=/\b(?:todo|tbd|placeholder)\b|待补充|例句待/iu;
const ID=/^[a-z][a-z0-9_-]{2,79}$/;
const TOKENS=/[a-z]+(?:['’][a-z]+)*(?:-[a-z]+)*/giu;
const MAX_TARGETS=10000,MAX_UNIQUE=500;
const examples=(s)=>typeof s==='string'?s.slice(0,260):'';

export function normalizeDictionaryNovelV2(source){
 if(!source||typeof source!=='object'||Array.isArray(source)||
   source.version!==2||!source.book||!Array.isArray(source.chapters))
   throw Error('INVALID_DICTIONARY_V2_PACKAGE');
 if(source.words!==undefined)throw Error('V2_WORDS_ARRAY_FORBIDDEN');
 const pseudoWords=[],temporaryBySurface=new Map(),targets=[];
 const seenChapters=new Set();
 let seenTargets=0;
 const chapters=source.chapters.map((ch,ci)=>{
  if(!ch||!Array.isArray(ch.paragraphs)||!Number.isInteger(ch.number)||
    seenChapters.has(ch.number))throw Error('INVALID_DICTIONARY_V2_CHAPTER');
  seenChapters.add(ch.number);
  return {...ch,paragraphs:ch.paragraphs.map((para,pi)=>{
   if(!para||!Array.isArray(para.segments))
     throw Error('INVALID_DICTIONARY_V2_PARAGRAPH');
   const context=para.segments.map(s=>s?.text??s?.surface??'').join('');
   return {segments:para.segments.map((seg,si)=>{
    if(!seg||typeof seg!=='object'||Array.isArray(seg))
      throw Error('INVALID_DICTIONARY_V2_SEGMENT');
    if(typeof seg.text==='string'&&seg.surface===undefined&&
       seg.gloss===undefined&&seg.wordId===undefined)return {text:seg.text};
    if(seg.wordId!==undefined||typeof seg.surface!=='string'||
      typeof seg.gloss!=='string'||seg.text!==undefined)
      throw Error('INVALID_DICTIONARY_V2_TARGET');
    const normalized=normalizedLemma(seg.surface);
    if(!normalized||seg.surface.length>80||!CJK.test(seg.gloss)||
      seg.gloss.length>200)throw Error('INVALID_DICTIONARY_V2_TARGET');
    seenTargets++;
    if(seenTargets>MAX_TARGETS)throw Error('DICTIONARY_V2_TARGET_LIMIT');
    if(!temporaryBySurface.has(normalized)){
     if(temporaryBySurface.size>=MAX_UNIQUE)throw Error('DICTIONARY_V2_UNIQUE_LIMIT');
     const tempId='v2_tmp_'+(temporaryBySurface.size+1);
     temporaryBySurface.set(normalized,tempId);
     pseudoWords.push({id:tempId,headword:normalized,
       meaningZh:'临时内容；仅供验证',collocations:[]});
    }
    targets.push({
     chapter_number:ch.number,paragraph_index:pi,segment_index:si,
     surface:seg.surface,normalized_surface:normalized,gloss:seg.gloss,
     context:examples(context)
    });
    return {wordId:temporaryBySurface.get(normalized),
      surface:seg.surface,gloss:seg.gloss};
   })};
  })};
 });
 if(!targets.length)throw Error('DICTIONARY_V2_NO_TARGETS');
 // Reuse the existing strict category, chapter, paragraph, anchor and
 // identifier contract before doing any dictionary lookup or D1 access.
 validatePackage({version:1,book:source.book,chapters,words:pseudoWords,
   sourceLabel:source.sourceLabel||'dictionary-v2'});
 return {book:source.book,chapters,targets,
  unique_surfaces:[...temporaryBySurface.keys()],
  sourceLabel:source.sourceLabel||'dictionary-v2'};
}

export function auditDictionaryLesson(row){
 if(!row||typeof row!=='object'||!ID.test(row.entry_id||'')||
   !normalizedLemma(row.headword)||!row.reviewed_by||!row.reviewed_at||
   !CJK.test(row.meaning_zh||'')||
   !row.part_of_speech||String(row.part_of_speech).length>60||
   !row.phonetic_uk||!row.phonetic_us||
   !row.example_en||!row.example_zh||
   String(row.example_en).length>700||
   !CJK.test(row.example_zh)||CLEAN.test(row.example_en)||
   CLEAN.test(row.example_zh)||CLEAN.test(row.meaning_zh))
   return {valid:false,reason:'INCOMPLETE_OR_UNREVIEWED_DICTIONARY_LESSON'};
 let senses,collocations;
 try{
  senses=typeof row.senses_json==='string'?
    JSON.parse(row.senses_json):row.senses_json;
  collocations=typeof row.collocations_json==='string'?
    JSON.parse(row.collocations_json):row.collocations_json;
 }catch{return {valid:false,reason:'INVALID_DICTIONARY_LESSON_JSON'}}
 if(!Array.isArray(senses)||!senses.length||senses.length>25||
    !senses.every(s=>s&&typeof s.pos==='string'&&s.pos.length<=60&&
     CJK.test(s.meaningZh||'')&&typeof s.exampleEn==='string'&&
     typeof s.exampleZh==='string'&&CJK.test(s.exampleZh))||
    !Array.isArray(collocations)||collocations.length>8||
    !collocations.every(x=>x&&typeof x.en==='string'&&
      CJK.test(x.zh||'')))
    return {valid:false,reason:'INVALID_DICTIONARY_LESSON_SENSES'};
 return {valid:true,senses,lesson:{
   id:row.entry_id,headword:normalizedLemma(row.headword),
   phoneticUk:row.phonetic_uk,phoneticUs:row.phonetic_us,
   partOfSpeech:row.part_of_speech,meaningZh:row.meaning_zh,
   exampleEn:row.example_en,exampleZh:row.example_zh,
   collocations
 }};
}

export function convertDictionaryNovelV2(source,index,lessons,{decisions=[]}={}){
 const novel=normalizeDictionaryNovelV2(source);
 const byPosition=new Map(),choiceByKey=new Map();
 if(!Array.isArray(decisions)||decisions.length>MAX_TARGETS)
   throw Error('INVALID_DICTIONARY_V2_DECISIONS');
 const key=(ch,pi,si)=>ch+':'+pi+':'+si;
 for(const d of decisions){
  if(!d||!Number.isInteger(d.chapter_number)||
    !Number.isInteger(d.paragraph_index)||
    !Number.isInteger(d.segment_index)||!ID.test(d.entry_id||'')||
    d.confirmed!==true)throw Error('INVALID_DICTIONARY_V2_DECISION');
  const k=key(d.chapter_number,d.paragraph_index,d.segment_index);
  if(choiceByKey.has(k))throw Error('DUPLICATE_DICTIONARY_V2_DECISION');
  choiceByKey.set(k,d.entry_id);
 }
 const review_queue=[],resolved=[],usedChoices=new Set(),byCard=new Map();
 for(const item of novel.targets){
  const k=key(item.chapter_number,item.paragraph_index,item.segment_index);
  const matching=matchDictionaryWord(item.surface,index);
  const decision=choiceByKey.get(k);
  let selected=null,reason=matching.reason;
  if(decision){
   usedChoices.add(k);
   selected=matching.candidates.find(x=>x.entry_id===decision);
   if(!selected)throw Error('DICTIONARY_V2_DECISION_NOT_CANDIDATE');
   if(!selected.teaching_ready||!selected.form_reviewed)
    throw Error('DICTIONARY_V2_DECISION_NOT_APPROVED');
  }else if(matching.status==='matched'){
   selected=matching.candidates.find(x=>x.entry_id===matching.entry_id);
  }else if(matching.reason==='AMBIGUOUS_HEADWORD_OR_INFLECTION'){
   // Full ECDICT contains many inflections as *separate* headwords.
   // We may auto-select the real approved lemma only when EXACTLY ONE
   // independently reviewed teaching sense has the author's explicit
   // Chinese-in-context gloss. Do not infer synonyms or trust raw ECDICT
   // translations. If two approved senses match, keep manual review.
   const normalizedGloss=item.gloss.normalize('NFKC').replace(/\\s+/gu,'').trim();
   const approved=matching.candidates.filter(candidate=>{
     if(!candidate.teaching_ready||!candidate.form_reviewed)return false;
     const record=lessons instanceof Map?lessons.get(candidate.entry_id):
       lessons?.[candidate.entry_id];
     const audited=auditDictionaryLesson(record);
     if(!audited.valid||audited.lesson.headword!==candidate.headword)
       return false;
     return audited.senses.some(sense=>
       sense.meaningZh.normalize('NFKC').replace(/\\s+/gu,'').trim()===normalizedGloss);
   });
   if(approved.length===1){selected=approved[0];reason='UNIQUE_REVIEWED_CONTEXT_SENSE';}
  }
  const base={...item,candidates:matching.candidates};
  if(!selected){
   review_queue.push({...base,reason});
   continue;
  }
  const record=lessons instanceof Map?lessons.get(selected.entry_id):
    lessons?.[selected.entry_id];
  const audited=auditDictionaryLesson(record);
  if(!audited.valid||audited.lesson.headword!==selected.headword){
   review_queue.push({...base,reason:'LESSON_NOT_APPROVED_OR_INCOMPLETE'});
   continue;
  }
  if(byCard.has(selected.entry_id)&&
     JSON.stringify(byCard.get(selected.entry_id))!==
     JSON.stringify(audited.lesson))
    throw Error('DICTIONARY_V2_LESSON_CONFLICT');
  byCard.set(selected.entry_id,audited.lesson);
  resolved.push({...base,entry_id:selected.entry_id,
    headword:selected.headword,
    reason:decision?'EDITOR_SELECTED':reason==='UNIQUE_REVIEWED_CONTEXT_SENSE'?
      'UNIQUE_REVIEWED_CONTEXT_SENSE':'UNIQUE_VERIFIED'});
  byPosition.set(k,selected.entry_id);
 }
 if(usedChoices.size!==choiceByKey.size)
  throw Error('DICTIONARY_V2_DECISION_TARGET_NOT_FOUND');
 const results={
  status:'DICTIONARY_V2_READ_ONLY_CONVERSION',
  book_id:novel.book.id,category:novel.book.category,
  source_target_occurrences:novel.targets.length,
  approved_occurrences:resolved.length,
  unique_main_cards:byCard.size,review_queue,resolved,
  ready_to_convert:review_queue.length===0&&byCard.size>0,
  publication_ready:false,userDataChanged:false
 };
 if(!results.ready_to_convert)return results;
 const chapters=novel.chapters.map(ch=>({...ch,
  paragraphs:ch.paragraphs.map((p,pi)=>({
   segments:p.segments.map((seg,si)=>{
    if(!seg.wordId)return {text:seg.text};
    const cardId=byPosition.get(key(ch.number,pi,si));
    if(!cardId)throw Error('DICTIONARY_V2_TARGET_NOT_RESOLVED');
    return {wordId:cardId,surface:seg.surface,gloss:seg.gloss};
   })
  }))
 }));
 const packageV1={version:1,book:novel.book,
  words:[...byCard.values()].sort((a,b)=>a.id.localeCompare(b.id,'en')),
  chapters,sourceLabel:novel.sourceLabel};
 const checked=validatePackage(packageV1);
 if(checked.mentionCount!==novel.targets.length)
  throw Error('DICTIONARY_V2_TARGET_COUNT_DRIFT');
 return {...results,converted_package:packageV1,
  converted_verified:true};
}
