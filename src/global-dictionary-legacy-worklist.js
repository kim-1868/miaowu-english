// B1.2 offline-only, nonmutating legacy wordcard-to-canonical review worklist.
// No review flags, user data, entitlement or replay status are written.
import {normalizedLemma} from './global-dictionary-matcher.js';

const normalizeZh=s=>typeof s==='string'?
 s.normalize('NFKC').replace(/\s+/gu,'').trim():'';
export function prepareLegacyDictionaryWorklist({words=[],entries=[],approvedLinks=[]}={}){
 if(!Array.isArray(words)||!Array.isArray(entries)||!Array.isArray(approvedLinks))
  throw Error('INVALID_CANONICAL_WORKLIST_INPUT');
 const byHeadword=new Map();
 for(const x of entries){
  const headword=normalizedLemma(x.headword);
  if(!x||!headword||typeof x.entry_id!=='string')
   throw Error('INVALID_DICTIONARY_WORKLIST_ENTRY');
  if(!byHeadword.has(headword))byHeadword.set(headword,[]);
  byHeadword.get(headword).push(x);
 }
 const linked=new Map();
 for(const x of approvedLinks){
  if(linked.has(x.legacy_word_id)&&linked.get(x.legacy_word_id)!==x.entry_id)
   throw Error('APPROVED_LEGACY_LINK_CONFLICT');
  linked.set(x.legacy_word_id,x.entry_id);
 }
 const records=[],seen=new Set();
 for(const w of words){
  if(!w||typeof w.id!=='string'||seen.has(w.id))
   throw Error('INVALID_OR_DUPLICATE_LEGACY_WORD_ID');
  seen.add(w.id);
  const headword=normalizedLemma(w.headword),meaning=normalizeZh(w.meaning_zh);
  const matches=byHeadword.get(headword)||[];
  let state,candidate=null,reason;
  if(!headword){state='manual';reason='UNSUPPORTED_HISTORICAL_SPELLING'}
  else if(matches.length===0){state='missing';reason='CANONICAL_LEMMA_NOT_FOUND'}
  else if(matches.length>1){state='manual';reason='CANONICAL_NORMALIZATION_COLLISION'}
  else{
   candidate=matches[0];
   const reviewed=Boolean(candidate.source_approved&&candidate.teaching_ready&&
     candidate.lesson_approved);
   let senses=[];
   try{senses=typeof candidate.senses_json==='string'?
     JSON.parse(candidate.senses_json):candidate.senses_json||[]}
   catch{senses=[]}
   const glossaryMatch=Array.isArray(senses)&&senses.some(s=>
     normalizeZh(s?.meaningZh)===meaning&&meaning.length>0);
   if(!reviewed){state='blocked';reason='SOURCE_OR_LESSON_NOT_APPROVED'}
   else if(!glossaryMatch){state='manual';reason='HISTORICAL_MEANING_NEEDS_REVIEW'}
   else{state='candidate';reason='EXACT_REVIEWED_SENSE_CANDIDATE'}
  }
  const already=linked.get(w.id);
  if(already){
   if(candidate?.entry_id!==already)
    throw Error('APPROVED_LEGACY_LINK_CONFLICT');
   if(state==='candidate'){
    state='already_approved';reason='HISTORICAL_LINK_ALREADY_REVIEWED';
   }else {
    state='manual';reason='PREVIOUS_LINK_NO_LONGER_QUALIFIED';
   }
  }
  records.push({
    legacy_word_id:w.id,legacy_headword:typeof w.headword==='string'?w.headword:'',
    legacy_meaning_zh:typeof w.meaning_zh==='string'?w.meaning_zh:'',
    proposed_entry_id:candidate?.entry_id||null,
    status:state,reason,
    verified_for_automatic_migration:false,
    requires_human_signoff:state!=='already_approved'
  });
 }
 const counts=Object.fromEntries(['candidate','blocked','manual','missing','already_approved']
   .map(status=>[status,records.filter(r=>r.status===status).length]));
 return {status:'PRIVATE_CANONICAL_LEGACY_WORKLIST_NOT_APPLIED',
  total_legacy_cards:records.length,counts,records,
  user_data_modified:false,review_events_modified:false,
  new_reviewed_links_created:0};
}
