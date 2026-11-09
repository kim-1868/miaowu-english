// A3 read-only binding proposal. Every occurrence stays tied to its original
// chapter/paragraph/segment coordinates and legacy wordId.
// No persistence, publication, permission changes, or rewrite of chapters.
import {normalizedLemma,matchDictionaryWord} from './global-dictionary-matcher.js';

const maxTargets=10000;
const validLegacyId=x=>typeof x==='string'&&/^[a-z][a-z0-9_-]{2,79}$/i.test(x);
const validChoice=x=>typeof x==='string'&&/^[a-z][a-z0-9_-]{2,99}$/i.test(x);
const statuses=['matched','dictionary_only','needs_review','missing'];
const short=x=>String(x||'').slice(0,280);

export function planNovelDictionaryBindings(packageData,index,{decisions=[]}={}){
 const novel=packageData?.package??packageData;
 if(!novel||!Array.isArray(novel.chapters)||!novel.chapters.length)
  throw Error('INVALID_NOVEL_PACKAGE');
 if(!Array.isArray(decisions)||decisions.length>maxTargets)
  throw Error('INVALID_MATCH_DECISIONS');
 const chosen=new Map();
 // Choices are used only for a read-only preview. A completed manual
 // decision cannot bypass a dictionary teaching signoff or a reviewed form.
 for(const choice of decisions){
   if(!choice||typeof choice!=='object'||
     !Number.isSafeInteger(choice.chapter_number)||
     !Number.isSafeInteger(choice.paragraph_index)||
     !Number.isSafeInteger(choice.segment_index)||
     !validChoice(choice.entry_id)||choice.confirmed!==true)
      throw Error('INVALID_MATCH_DECISION');
   const key=[choice.chapter_number,choice.paragraph_index,choice.segment_index].join(':');
   if(chosen.has(key))throw Error('DUPLICATE_MATCH_DECISION');
   chosen.set(key,choice.entry_id);
 }
 const accepted=[],queue=[],seenDecisions=new Set(),oldMapping=new Map();
 let total=0;
 for(const chapter of novel.chapters){
  if(!chapter||!Number.isInteger(chapter.number)||!Array.isArray(chapter.paragraphs))
    throw Error('INVALID_NOVEL_CHAPTER');
  for(const [pi,paragraph] of chapter.paragraphs.entries()){
   if(!paragraph||!Array.isArray(paragraph.segments))throw Error('INVALID_NOVEL_PARAGRAPH');
   const context=paragraph.segments.map(seg=>
     typeof seg.text==='string'?seg.text:typeof seg.surface==='string'?seg.surface:'').join('');
   for(const [si,seg] of paragraph.segments.entries()){
    if(!seg||typeof seg!=='object')throw Error('INVALID_NOVEL_SEGMENT');
    if(typeof seg.wordId!=='string')continue;
    if(!validLegacyId(seg.wordId)||!normalizedLemma(seg.surface))
      throw Error('INVALID_STUDY_TARGET');
    total++;
    if(total>maxTargets)throw Error('DICTIONARY_BINDING_LIMIT');
    const pos={chapter_number:chapter.number,paragraph_index:pi,segment_index:si};
    const choiceKey=[chapter.number,pi,si].join(':');
    const result=matchDictionaryWord(seg.surface,index);
    const pick=chosen.get(choiceKey);
    let entryId=null,headword=null,reason=result.reason;
    if(pick!==undefined){
      seenDecisions.add(choiceKey);
      const option=result.candidates.find(x=>x.entry_id===pick);
      if(!option)throw Error('DECISION_NOT_IN_CANDIDATES');
      // An operator may confirm which reviewed lemma is meant, but cannot
      // mark source forms or teaching content as reviewed.
      if(!option.teaching_ready||!option.form_reviewed)
        throw Error('DECISION_CANNOT_OVERRIDE_SOURCE_REVIEW');
      entryId=option.entry_id;
      headword=option.headword;
      reason='EDITOR_CONFIRMED_REVIEWED_CANDIDATE';
    }else if(result.status==='matched'){
      entryId=result.entry_id;
      headword=result.headword;
    }
    const base={...pos,surface:seg.surface,
      normalized_surface:normalizedLemma(seg.surface),
      legacy_word_id:seg.wordId,context:short(context),
      status:result.status,reason,candidates:result.candidates};
    if(entryId){
      const candidate={...base,entry_id:entryId,headword,
       resolution:pick!==undefined?'reviewed_selection':'unique_verified_match'};
      accepted.push(candidate);
      if(!oldMapping.has(seg.wordId))oldMapping.set(seg.wordId,new Set());
      oldMapping.get(seg.wordId).add(entryId);
    }else{
      queue.push({...base,resolution:'requires_editorial_review'});
    }
   }
  }
 }
 if(seenDecisions.size!==chosen.size)throw Error('DECISION_TARGET_NOT_FOUND');
 // Legacy ID collisions must not silently merge two different dictionary
 // identities even when every individual word form is unambiguous.
 const conflictingLegacyIds=[...oldMapping.entries()]
   .filter(([,ids])=>ids.size>1)
   .map(([legacy_word_id,ids])=>({legacy_word_id,entry_ids:[...ids].sort()}))
   .sort((a,b)=>a.legacy_word_id.localeCompare(b.legacy_word_id,'en'));
 const conflicts=new Set(conflictingLegacyIds.map(x=>x.legacy_word_id));
 const proposals=accepted.filter(x=>!conflicts.has(x.legacy_word_id));
 for(const x of accepted.filter(x=>conflicts.has(x.legacy_word_id)))
   queue.push({...x,status:'needs_review',reason:'LEGACY_ID_MULTIPLE_CANONICAL_LEMMAS',
      resolution:'requires_editorial_review'});
 queue.sort((a,b)=>a.chapter_number-b.chapter_number||
   a.paragraph_index-b.paragraph_index||a.segment_index-b.segment_index);
 const grouped=Object.fromEntries(statuses.map(status=>[
   status,queue.filter(x=>x.status===status).length
 ]));
 return {
  status:'READ_ONLY_BINDING_PROPOSAL_NOT_IMPORTED',
  book_id:novel.book?.id??null,category:novel.book?.category??null,
  total_target_occurrences:total,confirmed_occurrences:proposals.length,
  review_required_occurrences:queue.length,
  source_statuses_requiring_review:grouped,
  has_blockers:queue.length>0,
  resolved:proposals,
  review_queue:queue,conflicting_legacy_ids:conflictingLegacyIds,
  legacy_binding_candidates:[...new Map(
    proposals.map(x=>[x.legacy_word_id,x.entry_id])
  )].map(([legacy_word_id,entry_id])=>({legacy_word_id,entry_id,
    status:'UNCOMMITTED_CANDIDATE'})),
  // No rewrite to legacy IDs or paid reading content is performed.
  safe_to_autopublish:false,users_migrated:false,novel_mutated:false
 };
}
