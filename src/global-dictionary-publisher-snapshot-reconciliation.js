// Read-only comparison of an authenticated Publisher export with old-card identities.
// IMPORTANT: cross-version identity is only an editorial CANDIDATE, never a DB patch.
// Paid text remains in the editor's private workspace, not GitHub/CI logs.
const ID=/^[a-zA-Z0-9_-]{1,100}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const ANCHOR=/^p(?:0|[1-9][0-9]*):s(?:0|[1-9][0-9]*)$/u;
const ENTRY=/^gdict_[a-f0-9]{24}$/u;
const SENSE=/^gds_[a-f0-9]{24}$/u;
const clean=x=>String(x??'').normalize('NFKC').toLowerCase().trim();
function safeExport(exportData){
 if(!exportData||exportData.source!=='publisher_readonly_snapshot'||
    !SHA.test(exportData.snapshot_sha256||'')||
    !Array.isArray(exportData.books)||!exportData.books.length||exportData.books.length>500)
  throw Error('PUBLISHER_READONLY_EXPORT_REQUIRED');
 const bookIds=new Set(),anchors=new Set();
 for(const book of exportData.books){
  if(!ID.test(book?.id||'')||bookIds.has(book.id)||
   !ID.test(book.revision||'')||!Array.isArray(book.chapters))
   throw Error('PUBLISHER_SNAPSHOT_INVALID_BOOK_VERSION');
  bookIds.add(book.id);
  for(const ch of book.chapters){
   if(!ID.test(ch.id||'')||!ID.test(ch.revision||'')||
    !Number.isInteger(ch.number)||ch.number<1||
    !Array.isArray(ch.anchors))throw Error('PUBLISHER_SNAPSHOT_INVALID_CHAPTER_VERSION');
   for(const a of ch.anchors){
    if(!ANCHOR.test(a?.context_anchor||'')||!ID.test(a.legacy_word_id||''))
     throw Error('PUBLISHER_SNAPSHOT_INVALID_CONTEXT_ANCHOR');
    const k=[book.id,ch.id,a.context_anchor].join('|');
    if(anchors.has(k))throw Error('PUBLISHER_SNAPSHOT_DUPLICATE_CONTEXT_ANCHOR');
    anchors.add(k);
   }
  }
 }
}
export function reviewPublisherSnapshotLegacySenseMapping({
 historicalLegacyCards=[],publisherSnapshot
}={}){
 if(!Array.isArray(historicalLegacyCards)||!historicalLegacyCards.length||
  historicalLegacyCards.length>50000)
  throw Error('PUBLISHER_SNAPSHOT_HISTORICAL_SOURCE_REQUIRED');
 safeExport(publisherSnapshot);
 const history=new Map();
 for(const row of historicalLegacyCards){
  if(!ID.test(row?.old_word_id||'')||!ENTRY.test(row.entry_id||'')||
   !SHA.test(row.candidate_hash_sha256||'')||
   !Array.isArray(row.historical_book_ids)||
   row.editorial_sense_approved!==false||
   row.stable_approved_sense_id!==null)
   throw Error('PUBLISHER_SNAPSHOT_HISTORICAL_CARD_UNREVIEWED_REQUIRED');
  const prior=history.get(row.old_word_id);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(row))
   throw Error('PUBLISHER_SNAPSHOT_CONFLICTING_OLD_CARD_IDS');
  history.set(row.old_word_id,row);
 }
 const rows=[],books=[];
 for(const b of publisherSnapshot.books){
  let matched=0,unmatched=0,anchors=0;
  for(const c of b.chapters){
   for(const a of c.anchors){
    anchors++;
    const old=history.get(a.legacy_word_id);
    const flags=[];
    if(!old)flags.push('UNKNOWN_OLD_CARD');
    else if(!old.historical_book_ids.includes(b.id))
     flags.push('OLD_CARD_NOT_IN_HISTORICAL_BOOK');
    else if(!old.candidate_strict_text_match)
     flags.push('HISTORICAL_SENSE_IDENTITY_UNVERIFIED');
    if(flags.length)unmatched++;else matched++;
    rows.push({book_id:b.id,book_revision:b.revision,
     chapter_id:c.id,chapter_number:c.number,
     chapter_revision:c.revision,context_anchor:a.context_anchor,
     old_word_id:a.legacy_word_id,
     proposed_entry_id:old?.entry_id??null,
     historical_candidate_hash_sha256:old?.candidate_hash_sha256??null,
     proposed_sense_id:null,
     editor_confirmed_sense:false,
     source_version_reconciled:false,
     flags,
     ready_for_binding_write:false,study_write_allowed:false});
   }
  }
  books.push({book_id:b.id,revision:b.revision,total_anchors:anchors,
   historical_identity_candidates:matched,unmatched_anchors:unmatched,
   editor_approved_bindings:0});
 }
 return {status:'PUBLISHER_LIVE_VERSION_CONTEXT_REVIEW_PENDING',
  snapshot_source:publisherSnapshot.source,
  source_sha256:publisherSnapshot.snapshot_sha256,
  summary:{books:books.length,anchors:rows.length,
   historical_candidates:books.reduce((n,x)=>n+x.historical_identity_candidates,0),
   unresolved:books.reduce((n,x)=>n+x.unmatched_anchors,0),
   approved_senses:0,d1_writes:0},
  books,rows,can_write_bindings:false,
  warning:'Publisher revision fields and historical IDs cannot independently prove current context sense. Require authenticated source verification, human sense review, live D1 approval and separate migration.'};
}
