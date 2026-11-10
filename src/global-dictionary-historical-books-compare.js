// PRIVATE snapshot audit. Only one representative context per historical
// old word ID; never claim the P5 aggregate chapter_words links were all read.
const norm=x=>String(x??'').normalize('NFKC').trim();
const word=x=>norm(x).replaceAll('’',"'").toLowerCase();
const pos=x=>norm(x).toLowerCase().replace(/[.。]/gu,'');
const zh=x=>norm(x).replace(/\s+/gu,'');
const key=x=>[word(x.headword),pos(x.part_of_speech),zh(x.meaning_zh)].join('\0');
const hash=/^[a-f0-9]{64}$/u;
export function inspectHistoricalPublishedCardCandidates(snapshot,senses){
 if(!snapshot||snapshot.audit!=='wordletter-p5-content-review-offline'||
   !Array.isArray(snapshot.books)||!snapshot.books.length||
   !Array.isArray(snapshot.cards)||!snapshot.cards.length||
   !Array.isArray(senses)||!senses.length)
  throw Error('INVALID_PRIVATE_P5_HISTORICAL_AUDIT_INPUT');
 const books=new Map(),candidates=new Map(),oldMapping=new Map();
 for(const b of snapshot.books){
  if(!b?.book_id||books.has(b.book_id)||!b.title||!b.category)
   throw Error('HISTORICAL_BOOK_IDENTITY_INVALID');
  books.set(b.book_id,b);
 }
 for(const sense of senses){
  if(!hash.test(sense?.candidate_hash_sha256||'')||
    !Array.isArray(sense.old_word_ids)||!sense.old_word_ids.length||
    sense.lesson_approved===true||sense.approved_sense_id!=null||
    candidates.has(key(sense)))
   throw Error('INVALID_HISTORICAL_SENSE_IDENTITY_OR_APPROVAL');
  candidates.set(key(sense),sense);
  for(const id of sense.old_word_ids){
   if(typeof id!=='string'||!id||oldMapping.has(id))
    throw Error('DUPLICATE_HISTORICAL_OLD_WORD_ID');
   oldMapping.set(id,sense);
  }
 }
 const byBook=new Map([...books].map(([id,b])=>[id,{
  book_id:id,title:b.title,category:b.category,
  representative_context_rows:0,old_word_ids:new Set(),
  strict_sense_keys:new Set(),headwords:new Set(),
  chapter_numbers_in_samples:new Set()
 }]));
 const booksBySense=new Map();let representatives=0;
 for(const row of snapshot.cards){
  const s=oldMapping.get(row?.word_id);
  if(!s||key(s)!==key(row))
   throw Error('HISTORICAL_OLD_CARD_TO_SENSE_NOT_EXACT');
  if(!Array.isArray(row.contexts)||!row.contexts.length)
   throw Error('HISTORICAL_REPRESENTATIVE_CONTEXT_MISSING');
  const token=s.candidate_hash_sha256;
  for(const ctx of row.contexts){
   if(!books.has(ctx?.book_id))throw Error('UNKNOWN_HISTORICAL_BOOK_CONTEXT');
   const report=byBook.get(ctx.book_id);
   report.representative_context_rows++;
   report.old_word_ids.add(row.word_id);
   report.strict_sense_keys.add(token);
   report.headwords.add(word(row.headword));
   report.chapter_numbers_in_samples.add(ctx.chapter_no);
   if(!booksBySense.has(token))booksBySense.set(token,new Set());
   booksBySense.get(token).add(ctx.book_id);
   representatives++;
  }
 }
 if(snapshot.cards.length!==oldMapping.size)
  throw Error('HISTORICAL_OLD_IDS_NOT_FULLY_COVERED_BY_CANDIDATES');
 const reporting=[...byBook.values()].map(x=>({
  book_id:x.book_id,title:x.title,category:x.category,
  representative_context_rows:x.representative_context_rows,
  historical_old_word_ids:x.old_word_ids.size,
  strict_sense_candidates:x.strict_sense_keys.size,
  headwords:x.headwords.size,
  representative_chapters:x.chapter_numbers_in_samples.size,
  same_sense_seen_in_other_archive_books:[...x.strict_sense_keys].filter(k=>
   (booksBySense.get(k)?.size||0)>1).length,
  current_production_verified:false,approved_sense_ids:0
 })).sort((a,b)=>a.category.localeCompare(b.category,'en')||
  a.book_id.localeCompare(b.book_id,'en'));
 const aggregate=Number(snapshot.counts?.published_chapter_word_links);
 return {status:'PRIVATE_HISTORICAL_SENSE_TEXT_MATCH_READ_ONLY',
  summary:{archive_books:books.size,old_word_ids_matched:oldMapping.size,
   historical_text_sense_candidates:senses.length,
   representative_context_rows:representatives,
   aggregate_chapter_word_links_from_archive:Number.isFinite(aggregate)?aggregate:null,
   all_chapter_word_links_extracted:Number.isFinite(aggregate)&&aggregate===representatives,
   senses_shared_across_archive_books:[...booksBySense.values()].filter(x=>x.size>1).length,
   approved_sense_ids:0,production_d1_modified:false,
   user_learning_states_modified:false,archive_is_not_current_production:true},
  books:reporting};
}
