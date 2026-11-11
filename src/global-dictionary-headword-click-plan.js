// V1.2 reader integration candidate: clickable ONE CARD per headword for any
// story occurrence. Approved lesson content only. This function is READ ONLY;
// no chapter mutation, editor signoff, publication or user progress writes.
import {matchDictionaryWord,normalizedLemma} from './global-dictionary-matcher.js';
import {auditDictionaryLesson} from './global-dictionary-novel-v2.js';
const SENSE=/^gds_[a-f0-9]{24}$/u;
const approved=x=>x?.approved===true||x?.approved===1;
const active=x=>x?.active===true||x?.active===1;
const zh=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const pos=x=>String(x??'').normalize('NFKC').toLowerCase().replace(/[.。\s]/gu,'');
const get=(data,k)=>data instanceof Map?data.get(k):data?.[k];
const location=t=>`${t.chapter_number}:${t.paragraph_index}:${t.segment_index}:${t.start_offset}`;
function approvedCard(id,headword,lesson,reviewedSenses){
 const a=auditDictionaryLesson(lesson);
 if(!a.valid||a.lesson.headword!==headword)return null;
 const rows=reviewedSenses.filter(x=>x?.entry_id===id);
 const matched=new Map();
 for(const s of a.senses){
  const key=pos(s.pos)+'\0'+zh(s.meaningZh);
  if(!key||!pos(s.pos)||!zh(s.meaningZh))return null;
  const candidates=rows.filter(r=>SENSE.test(r.sense_id||'')&&approved(r)&&
   active(r)&&r.reviewed_by&&r.reviewed_at&&
   pos(r.pos)===pos(s.pos)&&zh(r.meaning_zh)===zh(s.meaningZh));
  if(candidates.length>1)return null; // ambiguous authorized identity: fail closed
  if(candidates.length!==1)continue; // never expose an unapproved sense
  if(matched.has(key))return null;
  matched.set(key,{sense_id:candidates[0].sense_id,
   pos:s.pos,meaningZh:s.meaningZh,exampleEn:s.exampleEn,
   exampleZh:s.exampleZh});
 }
 if(!matched.size)return null;
 return {entry_id:id,headword,phoneticUk:a.lesson.phoneticUk,
  phoneticUs:a.lesson.phoneticUs,senses:[...matched.values()],
  // Approved parent lesson collocations, never copied from raw source glosses.
  collocations:a.lesson.collocations,
  user_study_key:'entry_id',context_sense_id:null};
}
export function planHeadwordReaderClicks(extracted,index,{lessons=new Map(),senses=[]}={}){
 if(extracted?.status!=='READ_ONLY_UNMARKED_ENGLISH_TOKENS'||
   !Array.isArray(extracted.tokens)||!Array.isArray(senses)||
   !index?.byWord||!index?.byForm||extracted.tokens.length>12000||
   typeof extracted.book_id!=='string'||!extracted.book_id)
   throw Error('INVALID_HEADWORD_READER_DISCOVERY_INPUT');
 const anchors=[],review_queue=[],cards=new Map(),positions=new Set(),cache=new Map();
 for(const t of extracted.tokens){
  if(!t||!Number.isInteger(t.chapter_number)||t.chapter_number<1||
   !Number.isInteger(t.paragraph_index)||t.paragraph_index<0||
   !Number.isInteger(t.segment_index)||t.segment_index<0||
   !Number.isInteger(t.start_offset)||t.start_offset<0||
   !Number.isInteger(t.end_offset)||t.end_offset<=t.start_offset||
   typeof t.surface!=='string'||!normalizedLemma(t.surface)||
   t.normalized_surface!==normalizedLemma(t.surface))
    throw Error('INVALID_HEADWORD_READER_TOKEN_POSITION');
  const key=location(t);
  if(positions.has(key))throw Error('DUPLICATE_HEADWORD_READER_TOKEN_POSITION');
  positions.add(key);
  const word=t.normalized_surface;
  if(!cache.has(word)){
   const m=matchDictionaryWord(word,index);
   let card=null,reason=m.reason;
   if(m.status==='matched'){
    card=approvedCard(m.entry_id,m.headword,get(lessons,m.entry_id),senses);
    if(!card)reason='APPROVED_MAIN_CARD_AND_SENSES_REQUIRED';
   }
   cache.set(word,{match:m,card,reason});
  }
  const {match,card,reason}=cache.get(word);
  const base={chapter_number:t.chapter_number,paragraph_index:t.paragraph_index,
   segment_index:t.segment_index,start_offset:t.start_offset,
   end_offset:t.end_offset,surface:t.surface,position_key:key};
  if(!card){
   review_queue.push({...base,reason,
    matching_entry_ids:match.candidates?.map(c=>c.entry_id)??[]});
   continue;
  }
  if(cards.has(card.entry_id)&&
     JSON.stringify(cards.get(card.entry_id))!==JSON.stringify(card))
    throw Error('INCONSISTENT_APPROVED_MAIN_CARD');
  cards.set(card.entry_id,card);
  anchors.push({...base,entry_id:card.entry_id,headword:card.headword,
   // A clickable reference does not claim the author selected a sense.
   context_sense_id:null,requires_context_editor_confirmation:true,
   approved_sense_options:card.senses.map(s=>s.sense_id),
   automatically_published:false});
 }
 return {status:'READ_ONLY_HEADWORD_CLICK_ANCHOR_PROPOSALS',
  book_id:extracted.book_id,source_category:extracted.category,
  scanned_tokens:extracted.tokens.length,proposed_click_anchors:anchors.length,
  withheld_tokens:review_queue.length,distinct_approved_cards:cards.size,
  cards:[...cards.values()],anchors,review_queue,
  chapter_or_book_modified:false,publisher_signed_off:false,
  automatic_publication_allowed:false,
  user_study_rows_written:0,d1_writes:0,
  warning:'Only server-verified lesson and approved active sense rows may be shown. Reader anchors require authorized editor confirmation, a separate safe render binding and actual staged deployment.'};
}