// Offline read-only, cross-grade candidate planner for teaching-sense identity.
// Does not contain customer study rows, does not create a verified sense ID,
// does not approve migrations, and never changes or imports a novel.
const WORD=/^[a-z]+(?:['-][a-z]+)*$/u;
const normalized=s=>String(s??'').normalize('NFKC').trim().replaceAll('’',"'").toLowerCase();
const zh=s=>String(s??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const pos=s=>normalized(s).replace(/[.。]/gu,'');
const key=x=>pos(x.partOfSpeech??x.part_of_speech)+'|'+zh(x.meaningZh??x.meaning_zh);
const uniq=s=>[...new Set(s)].sort((a,b)=>a.localeCompare(b,'en'));
export function buildCrossGradeSenseReview(novels){
 if(!Array.isArray(novels)||!novels.length)throw Error('NO_MANUSCRIPTS_FOR_SENSE_REVIEW');
 const seenBooks=new Set(),seenWordIds=new Map(),groups=new Map();
 let usedWordcards=0,unusedWordcards=0;
 for(const raw of novels){
  const novel=raw?.package??raw,meta=novel?.book;
  if(!meta||typeof meta.id!=='string'||!meta.id||
   !['cet4','cet6','postgrad','ielts'].includes(meta.category)||
   !Array.isArray(novel.chapters)||!Array.isArray(novel.words))
    throw Error('INVALID_CROSS_GRADE_MANUSCRIPT');
  if(seenBooks.has(meta.id))throw Error('DUPLICATE_CROSS_GRADE_BOOK');
  seenBooks.add(meta.id);
  const cards=new Map();
  for(const w of novel.words){
   const headword=normalized(w?.headword);
   if(typeof w?.id!=='string'||!w.id||!WORD.test(headword)||
      !zh(w.meaningZh??w.meaning_zh)||cards.has(w.id))
    throw Error('INVALID_CROSS_GRADE_CARD');
   cards.set(w.id,{...w,headword});
  }
  const used=new Set();
  for(const ch of novel.chapters){
   for(const p of ch.paragraphs??[]){
    for(const seg of p.segments??[]){
     if(typeof seg?.wordId==='string')used.add(seg.wordId);
    }
   }
  }
  const missing=[...used].filter(id=>!cards.has(id));
  if(missing.length)throw Error('MISSING_CROSS_GRADE_CARD_REFERENCE');
  usedWordcards+=used.size;unusedWordcards+=cards.size-used.size;
  for(const id of used){
   const w=cards.get(id),sense=key(w);
   if(seenWordIds.has(id)){
    const prior=seenWordIds.get(id);
    if(prior.headword!==w.headword||prior.sense!==sense)
     throw Error('CROSS_BOOK_WORD_ID_CONTENT_COLLISION');
   }else seenWordIds.set(id,{headword:w.headword,sense});
   if(!groups.has(w.headword))groups.set(w.headword,[]);
   groups.get(w.headword).push({book_id:meta.id,category:meta.category,
    legacy_word_id:id,headword:w.headword,
    pos:pos(w.partOfSpeech??w.part_of_speech),
    meaning_zh:zh(w.meaningZh??w.meaning_zh),source_sense_key:sense});
  }
 }
 const shared=[...groups.entries()].filter(([,v])=>new Set(v.map(x=>x.book_id)).size>1)
  .map(([headword,items])=>{
   const senseKeys=uniq(items.map(x=>x.source_sense_key));
   return {headword,legacy_card_count:items.length,
    category_count:new Set(items.map(x=>x.category)).size,
    categories:uniq(items.map(x=>x.category)),
    book_count:new Set(items.map(x=>x.book_id)).size,
    candidate_sense_keys:senseKeys,
    status:senseKeys.length===1?'EXACT_TEXT_SENSE_CANDIDATE_NOT_APPROVED':
      'DIFFERENT_OR_TRANSLATION_VARIANT_SENSE_REVIEW',
    examples:items.map(({book_id,category,legacy_word_id,pos,meaning_zh})=>
      ({book_id,category,legacy_word_id,pos,meaning_zh})),
    may_auto_merge:false,requires_manual_review:true};
  }).sort((a,b)=>a.headword.localeCompare(b.headword,'en'));
 return {
  status:'OFFLINE_CROSS_GRADE_SENSE_WORKLIST_NOT_APPROVED',
  manuscripts:seenBooks.size,headwords_seen:groups.size,
  referenced_card_count:usedWordcards,unused_card_count:unusedWordcards,
  across_books_shared_headwords:shared.length,
  exact_text_sense_candidate_count:shared.filter(x=>x.candidate_sense_keys.length===1).length,
  different_or_translation_variant_count:shared.filter(x=>x.candidate_sense_keys.length!==1).length,
  candidates:shared,can_apply_study_migration:false,
  user_rows_accessed:false,novels_modified:false,
  purchases_modified:false,d1_accessed:false,
  warning:'Even identical sense text is only a candidate; manual reviewed stable sense ID and old-ID mapping required before study state can be shared.'
 };
}
