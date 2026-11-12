// V1.2 read-only fallback for PUBLISHED legacy novels where draft-only
// global_dictionary_book_sense_bindings cannot be added retroactively.
// Only authenticated, entitled, independently approved sense/legacy links,
// cryptographically pinned to the CURRENT old card, may be shown.
// No SRS feedback writes, no status changes and no guessed sense identities.
const ID=/^[A-Za-z0-9_-]{1,80}$/u;
const ANCHOR=/^p(?:0|[1-9]\d*):s(?:0|[1-9]\d*)$/u;
const SENSE=/^gds_[a-f0-9]{24}$/u;
const ENTRY=/^gdict_[a-f0-9]{24}$/u;
const DIGEST=/^[a-f0-9]{64}$/u;
const MAX=2000;
const SQL=`SELECT b.id AS book_id,cw.context_anchor AS anchor,cw.word_id AS legacy_word_id,
 w.headword AS old_headword,w.phonetic_uk AS old_uk,w.phonetic_us AS old_us,
 w.part_of_speech AS old_pos,w.meaning_zh AS old_meaning,
 w.example_en AS old_en,w.example_zh AS old_zh,
 w.collocations_json AS old_collocations,
 link.old_card_sha256,link.reviewed_by AS link_reviewed_by,
 link.reviewed_at AS link_reviewed_at,
 s.sense_id,s.entry_id,s.pos,s.meaning_zh,s.example_en,s.example_zh,
 l.senses_json,l.phonetic_uk AS phonetic_uk,l.phonetic_us AS phonetic_us,\n l.phonetic_uk AS lesson_uk,l.phonetic_us AS lesson_us,
 e.headword AS dictionary_headword
 FROM chapter_words cw
 JOIN chapters ch ON ch.id=cw.chapter_id AND ch.published_at IS NOT NULL
  AND ch.published_at<=CURRENT_TIMESTAMP
 JOIN books b ON b.id=ch.book_id AND b.status='published'
 JOIN categories category ON category.id=b.category_id AND category.is_visible=1
 JOIN words w ON w.id=cw.word_id
 JOIN global_dictionary_legacy_sense_links link ON link.legacy_word_id=w.id
  AND length(trim(link.reviewed_by))>0 AND length(trim(link.reviewed_at))>0
 JOIN global_dictionary_senses s ON s.sense_id=link.sense_id
  AND s.approved=1 AND s.active=1
  AND length(trim(s.reviewed_by))>0 AND length(trim(s.reviewed_at))>0
 JOIN global_dictionary_entries e ON e.entry_id=s.entry_id
  AND e.teaching_ready=1 AND e.reviewed_at IS NOT NULL
 JOIN global_dictionary_sources src ON src.source_key=e.source_name
  AND src.enabled=1 AND src.license_reviewed=1
 JOIN global_dictionary_lessons l ON l.entry_id=e.entry_id
  AND length(trim(l.reviewed_by))>0 AND length(trim(l.reviewed_at))>0
  AND length(trim(l.phonetic_uk))>0 AND length(trim(l.phonetic_us))>0
 WHERE cw.chapter_id=? AND (ch.is_preview=1 OR EXISTS(
  SELECT 1 FROM entitlements owned WHERE owned.user_id=?
   AND owned.category_id=b.category_id AND owned.revoked_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM activation_codes revoked
    WHERE revoked.id=owned.source_code_id AND revoked.status='revoked')))
 ORDER BY cw.context_anchor LIMIT ${MAX+1}`;
const norm=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const part=x=>norm(x).toLowerCase().replace(/[.。]/gu,'');
const lower=x=>String(x??'').normalize('NFKC').trim().toLowerCase().replaceAll('’',"'");
const trim=x=>String(x??'').trim();
const bytes = new TextEncoder();
export async function fingerprintLegacyWordCard(row){
 const values=[row.legacy_word_id,row.old_headword,row.old_uk,row.old_us,
  row.old_pos,row.old_meaning,row.old_en,row.old_zh,row.old_collocations];
 const digest=await crypto.subtle.digest('SHA-256',bytes.encode(JSON.stringify(values)));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function lessonIdentityMatches(row){
 if(!SENSE.test(row.sense_id||'')||!ENTRY.test(row.entry_id||'')||
  !trim(row.link_reviewed_by)||!trim(row.link_reviewed_at)||
  !trim(row.lesson_uk)||!trim(row.lesson_us)||
  lower(row.old_headword)!==lower(row.dictionary_headword)||
  part(row.old_pos)!==part(row.pos)||
  norm(row.old_meaning)!==norm(row.meaning_zh)||
  !trim(row.old_en)||!trim(row.old_zh)||
  !trim(row.example_en)||!trim(row.example_zh))return false;
 let senses;
 try{senses=typeof row.senses_json==='string'?JSON.parse(row.senses_json):row.senses_json}
 catch{return false}
 return Array.isArray(senses)&&senses.filter(s=>
  part(s?.pos)===part(row.pos)&&norm(s?.meaningZh)===norm(row.meaning_zh)&&
  trim(s?.exampleEn)===trim(row.example_en)&&
  trim(s?.exampleZh)===trim(row.example_zh)).length===1;
}
async function loadValidatedPublishedSenseRows(db,{chapterId,userId}={}){
 if(typeof db?.prepare!=='function'||!ID.test(chapterId||'')||
  typeof userId!=='string'||!userId||userId.length>128)
  throw Error('PUBLISHED_LEGACY_SENSE_INVALID_AUTHORIZED_REQUEST');
 const data=await db.prepare(SQL).bind(chapterId,userId).all();
 if(!Array.isArray(data?.results)||data.results.length>MAX)
  throw Error('PUBLISHED_LEGACY_SENSE_INVALID_RESULT_SIZE');
 const seen=new Set(),approvedRows=[],blockedCounts={
  mismatched_or_missing_lesson:0,legacy_card_digest_mismatch:0};
 for(const row of data.results){
  if(!ANCHOR.test(row.anchor||'')||seen.has(row.anchor))
   throw Error('PUBLISHED_LEGACY_SENSE_ANCHOR_CONFLICT');
  seen.add(row.anchor);
  if(!lessonIdentityMatches(row)){
   blockedCounts.mismatched_or_missing_lesson++;continue;
  }
  if(!DIGEST.test(row.old_card_sha256||'')||
    await fingerprintLegacyWordCard(row)!==row.old_card_sha256){
   blockedCounts.legacy_card_digest_mismatch++;continue;
  }
  approvedRows.push(row);
 }
 return {chapterId,approvedRows,blockedCounts};\n}\nexport async function listPublishedApprovedLegacySenseAnchors(db,{chapterId,userId}={}){\n const {approvedRows,blockedCounts}=await loadValidatedPublishedSenseRows(db,{chapterId,userId});\n const anchors=approvedRows.map(row=>({anchor:row.anchor,entry_id:row.entry_id,sense_id:row.sense_id}));\n return {chapterId,anchors,study_identity:'sense_id',
  source:'reviewed_published_legacy_links',approved_only:true,
  read_only:true,book_content_changed:false,
  user_study_rows_written:0,d1_writes:0,
  blockedCounts};
}

// Full request-time context lookup for existing published books. The same
// entitlement and old-card SHA guard applies to feedback as to reader anchors.
export async function lookupPublishedApprovedLegacySenseContext(db,{chapterId,userId,anchor,senseId}={}){
 if(!ANCHOR.test(anchor||'')||!SENSE.test(senseId||''))
  throw Error('PUBLISHED_LEGACY_SENSE_INVALID_CONTEXT');
 const {approvedRows}=await loadValidatedPublishedSenseRows(db,{chapterId,userId});
 const selected=approvedRows.filter(row=>row.anchor===anchor&&row.sense_id===senseId);
 if(selected.length>1)throw Error('PUBLISHED_LEGACY_SENSE_DUPLICATE_CONTEXT');
 const row=selected[0];
 return row?{
  book_id:row.book_id,sense_id:row.sense_id,entry_id:row.entry_id,
  headword:row.dictionary_headword,pos:row.pos,meaning_zh:row.meaning_zh,
  example_en:row.example_en,example_zh:row.example_zh,
  phonetic_uk:row.phonetic_uk,phonetic_us:row.phonetic_us,
  senses_json:row.senses_json
 }:null;
}

const json=(body,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store','x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer'}});
export async function handlePublishedLegacySensePreview(req,env,path,user){
 if(env?.APP_ENV!=='staging')return json({error:'NOT_FOUND'},404);
 if(env?.GLOBAL_DICTIONARY_PUBLISHED_LEGACY_PREVIEW_ENABLED!=='true')
  return json({error:'PUBLISHED_LEGACY_PREVIEW_DISABLED'},503);
 if(!user?.id)return json({error:'LOGIN_REQUIRED'},401);
 if(req.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
 const match=new RegExp('^/api/me/dictionary/chapters/([A-Za-z0-9_-]{1,80})/published-legacy-sense-preview$','u').exec(path||'');
 if(!match)return json({error:'NOT_FOUND'},404);
 try{
  return json(await listPublishedApprovedLegacySenseAnchors(env.DB,{
   chapterId:match[1],userId:user.id}));
 }catch{return json({error:'PUBLISHED_LEGACY_PREVIEW_UNAVAILABLE'},503)}
}
