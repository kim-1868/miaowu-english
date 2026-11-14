// Pure read-only review worklist from a privately held old D1 card snapshot.
// Produces candidate sense groups; never approves an identity or merges study.
const en=x=>String(x??'').normalize('NFKC').trim().replaceAll('’',"'").toLowerCase();
const zh=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const POS=x=>en(x).replace(/[.。]/gu,'');
const EN=/^[a-z]+(?:['-][a-z]+)*$/u;
const cardId=/^[a-z][a-z0-9_-]{2,99}$/i;
const cmp=(a,b)=>a.localeCompare(b,'en');
export function prepareHistoricalSenseReview(snapshot){
 if(!snapshot||snapshot.audit!=='wordletter-p5-content-review-offline'||
    !Array.isArray(snapshot.cards)||!snapshot.cards.length||
    !Array.isArray(snapshot.books))
  throw Error('INVALID_PRIVATE_HISTORICAL_SNAPSHOT');
 const ids=new Set(),bySense=new Map(),byHeadword=new Map();
 const books=new Set(snapshot.books.map(b=>b.book_id));
 let missingIPA=0,missingExample=0,unknownBookContext=0,contextRows=0;
 for(const word of snapshot.cards){
  const id=word?.word_id,headword=en(word?.headword),pos=POS(word?.part_of_speech),
   meaning=zh(word?.meaning_zh);
  if(typeof id!=='string'||!cardId.test(id)||ids.has(id)||
    !EN.test(headword)||!pos||!meaning)
   throw Error('INVALID_OR_DUPLICATE_HISTORICAL_CARD');
  ids.add(id);
  const key=headword+'\u0000'+pos+'\u0000'+meaning;
  if(!bySense.has(key))bySense.set(key,{headword,pos,meaning_zh:meaning,
    legacy_word_ids:[],book_ids:new Set(),ipa_uk:new Set(),ipa_us:new Set(),
    with_examples:0,context_rows:0});
  const item=bySense.get(key);
  item.legacy_word_ids.push(id);
  if(word.phonetic_uk)item.ipa_uk.add(word.phonetic_uk.trim());
  if(word.phonetic_us)item.ipa_us.add(word.phonetic_us.trim());
  if(!word.phonetic_uk||!word.phonetic_us)missingIPA++;
  if(word.example_en&&word.example_zh)item.with_examples++;
  else missingExample++;
  const contexts=Array.isArray(word.contexts)?word.contexts:[];
  item.context_rows+=contexts.length;contextRows+=contexts.length;
  for(const ctx of contexts){
   if(books.has(ctx?.book_id))item.book_ids.add(ctx.book_id);
   else unknownBookContext++;
  }
  if(!byHeadword.has(headword))byHeadword.set(headword,new Set());
  byHeadword.get(headword).add(key);
 }
 const groups=[...bySense.entries()].map(([key,x])=>({
  review_candidate_key:key.replaceAll('\u0000','|'),
  headword:x.headword,pos:x.pos,meaning_zh:x.meaning_zh,
  legacy_word_ids:x.legacy_word_ids.sort(cmp),
  book_ids:[...x.book_ids].sort(cmp),
  referenced_legacy_card_count:x.legacy_word_ids.length,
  context_rows:x.context_rows,
  other_text_senses_on_headword:byHeadword.get(x.headword).size-1,
  uk_ipa_variant_count:x.ipa_uk.size,us_ipa_variant_count:x.ipa_us.size,
  cards_missing_examples:x.legacy_word_ids.length-x.with_examples,
  priority:(x.legacy_word_ids.length-1)*10+x.book_ids.size*2+
    (x.ipa_uk.size>1||x.ipa_us.size>1?5:0)+
    (byHeadword.get(x.headword).size>1?3:0),
  approved_sense_id:null,may_auto_merge:false,
  status:'NEEDS_EDITORIAL_LICENSE_AND_SENSE_SIGNOFF'
 })).sort((a,b)=>b.priority-a.priority||cmp(a.headword,b.headword));
 return {
  status:'HISTORICAL_SENSE_REVIEW_QUEUE_PRIVATE_NOT_APPROVED',
  summary:{
   old_word_id_count:ids.size,books_in_snapshot:snapshot.books.length,
   headwords:byHeadword.size,sense_text_candidate_groups:groups.length,
   duplicate_text_groups:groups.filter(g=>g.referenced_legacy_card_count>1).length,
   repeated_old_word_ids:groups.reduce((n,g)=>n+g.referenced_legacy_card_count-1,0),
   headwords_with_multiple_senses:[...byHeadword.values()].filter(x=>x.size>1).length,
   ipa_variant_groups:groups.filter(g=>g.uk_ipa_variant_count>1||g.us_ipa_variant_count>1).length,
   missing_ipa_cards:missingIPA,missing_example_cards:missingExample,
   contexts_in_source:contextRows,unknown_book_contexts:unknownBookContext
  },
  candidates:groups,
  user_rows_accessed:false,paid_story_context_in_output:false,
  licensed_and_approved_sense_count:0,study_merge_performed:false
 };
}
