// Private-only adapter from published-only encrypted duplicate candidates
// to preexisting OFFLINE sense editorial signoff gate.
// Never publishes, signs-off, mutates old user vocabulary or guesses entry_id.
import {createHash} from 'node:crypto';
import {createSenseReviewDecisionTemplate,validatePrivateSenseReviewDecisions}
 from './global-dictionary-editorial-signoff-gate.js';
const entry=/^gdict_[0-9a-f]{24}$/u;
const hash=s=>createHash('sha256').update(s).digest('hex');
const normalize=s=>String(s??'').normalize('NFKC').trim().toLowerCase();
const trim=s=>String(s??'').trim();
export function preparePublishedDuplicateSenseSignoff({
 queue,matchedEntries=[],maxBatch=80
}={}){
 if(queue?.status!=='PRIVATE_PUBLISHED_EDITORIAL_CANDIDATES_UNAPPROVED'||
   queue?.all_records_private!==true||
   queue?.created_approvals!==0||queue?.production_writes!==0||
   queue?.counts?.published_books!==32||
   queue?.counts?.published_anchor_occurrences!==8444||
   queue?.counts?.duplicate_textual_sense_groups!==532||
   !Array.isArray(queue?.duplicate_review_queue)||
   queue.duplicate_review_queue.length!==532||
   !Array.isArray(matchedEntries)||!Number.isInteger(maxBatch)||
   maxBatch<1||maxBatch>200)
  throw Error('PUBLISHED_SENSE_SIGNOFF_INVALID_OR_STALE_PRIVATE_QUEUE');
 const entryMap=new Map();
 for(const x of matchedEntries){
  if(!entry.test(x?.entry_id??'')||!trim(x?.headword)||
    x?.publisher_approved!==true||x?.commercial_source_verified!==true||
    entryMap.has(normalize(x.headword)))
   throw Error('PUBLISHED_SENSE_MATCHED_DICTIONARY_ENTRY_UNVERIFIED');
  entryMap.set(normalize(x.headword),x.entry_id);
 }
 const candidates=[],hold=[],seenOld=new Set(),seenSense=new Set();
 for(const group of queue.duplicate_review_queue){
  if(!Array.isArray(group?.legacy_word_ids)||group.legacy_word_ids.length<2||
    !Array.isArray(group.book_ids)||!group.book_ids.length||
    !Number.isInteger(group.occurrences)||group.occurrences<1||
    group.editor_decision!=='HOLD'||group.approved_sense_id!==null||
    group.auto_merge_allowed!==false||
    group.production_writes_allowed!==false)
   throw Error('PUBLISHED_SENSE_UNVERIFIED_REVIEW_GROUP');
  const senseKey=JSON.stringify([normalize(group.headword),
    normalize(group.pos),trim(group.meaning_zh)]);
  if(seenSense.has(senseKey))
   throw Error('PUBLISHED_SENSE_DUPLICATED_TEXTUAL_GROUP');
  seenSense.add(senseKey);
  for(const old of group.legacy_word_ids){
   if(typeof old!=='string'||!old||seenOld.has(old))
    throw Error('PUBLISHED_SENSE_OVERLAPPING_LEGACY_IDS');
   seenOld.add(old);
  }
  const linked=entryMap.get(normalize(group.headword));
  if(!linked||!trim(group.pos)||!trim(group.meaning_zh)){
   hold.push({review_key_sha256:hash(senseKey),
    reason:linked?'POS_OR_MEANING_UNRESOLVED':'APPROVED_HEADWORD_DICTIONARY_LINK_MISSING',
    old_card_count:group.legacy_word_ids.length,
    editor_action:'HOLD'});
   continue;
  }
  const fingerprint=hash(JSON.stringify([linked,senseKey,
   [...group.legacy_word_ids].sort(),[...group.book_ids].sort()]));
  candidates.push({
   candidate_hash_sha256:fingerprint,entry_id:linked,headword:group.headword,
   part_of_speech:group.pos,meaning_zh:group.meaning_zh,
   old_word_ids:[...group.legacy_word_ids],source_book_ids:[...group.book_ids],
   source_occurrences:group.occurrences,
   lesson_approved:false,approved_sense_id:null,
   editorial_signoff_pending:true,auto_merge_allowed:false,
   commercial_license_approved:false
  });
 }
 const selected=candidates.slice(0,maxBatch);
 const decisions=selected.map(createSenseReviewDecisionTemplate);
 const validation=selected.length?
   validatePrivateSenseReviewDecisions(selected,[]):null;
 return {status:'PRIVATE_PUBLISHED_SENSE_EDITORIAL_TEMPLATES_HOLD_ONLY',
  queue_scope_books:32,queue_duplicate_groups:532,
  dictionary_approved_headword_links_supplied:entryMap.size,
  mapped_groups:candidates.length,unmapped_groups:hold.length,
  initial_decisions:decisions,review_candidates:selected,
  unlinked_hold_reasons:hold,
  selection_count:selected.length,
  unresolved_due_to_missing_decisions:validation?.proposals.filter(
   p=>p.status==='BLOCKED_FOR_EDITORIAL_REVIEW').length??0,
  publisher_approved_senses_created:0,legacy_study_states_merged:0,
  production_writes:0,
  caution:'Even verified dictionary headword links do not prove same context sense; full independent editorial and authenticated OPS signoff required.'};
}
