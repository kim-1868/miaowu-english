// Read-only, REAL published TEST D1 editorial intake. Never approves a sense.
// Plaintext is confined to a protected runner and must be encrypted for export.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createSenseReviewDecisionTemplate} from '../src/global-dictionary-editorial-signoff-gate.js';

const sha=x=>createHash('sha256').update(x).digest('hex');
const norm=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const head=x=>String(x??'').normalize('NFKC').trim().toLowerCase().replaceAll('’',"'");
const pos=x=>head(x).replace(/[.。]/gu,'');
const clean=x=>String(x??'').trim();
const ENTRY=/^gdict_[a-f0-9]{24}$/u;
const ANCHOR=/^p(?:0|[1-9]\d*):s(?:0|[1-9]\d*)$/u;
const QA=/^(?:mw-v12-pilot-|qa-|draft-|internal-)/iu;
const SOURCE_QA=/^(?:wordletter-internal-qa|qa-|test-|internal-)/iu;
export const MAX_ROWS=500;
export const BATCH_SIZE=20;

// This query is *only* an intake, never a binding. Real published TEST books
// only. Every requested lexical value stays in a protected encrypted artifact.
export const REAL_PUBLISHED_SELECT=String.raw`SELECT
 b.id book_id,ch.id chapter_id,cw.context_anchor anchor,cw.word_id legacy_word_id,
 w.headword old_headword,w.phonetic_uk old_uk,w.phonetic_us old_us,
 w.part_of_speech old_pos,w.meaning_zh old_meaning,
 w.example_en old_en,w.example_zh old_zh,w.collocations_json old_collocations,
 e.entry_id,e.source_name,src.source_key,src.license_name,
 src.license_reviewed,src.enabled source_enabled,src.source_sha256,
 link.sense_id existing_sense_id,
 CASE WHEN json_valid(ch.content_json)=1 THEN json_extract(ch.content_json,
 '$.paragraphs['||CAST(substr(cw.context_anchor,2,instr(cw.context_anchor,':')-2) AS INTEGER)||
 '].segments['||CAST(substr(cw.context_anchor,instr(cw.context_anchor,':s')+2) AS INTEGER)||'].wordId')
 ELSE NULL END context_word_id,
 CASE WHEN json_valid(ch.content_json)=1 THEN json_extract(ch.content_json,
 '$.paragraphs['||CAST(substr(cw.context_anchor,2,instr(cw.context_anchor,':')-2) AS INTEGER)||
 '].segments['||CAST(substr(cw.context_anchor,instr(cw.context_anchor,':s')+2) AS INTEGER)||'].gloss')
 ELSE NULL END context_gloss
FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id
JOIN books b ON b.id=ch.book_id AND b.status='published'
JOIN words w ON w.id=cw.word_id
LEFT JOIN global_dictionary_entries e ON e.headword=w.headword COLLATE NOCASE
LEFT JOIN global_dictionary_sources src ON src.source_key=e.source_name
LEFT JOIN global_dictionary_legacy_sense_links link ON link.legacy_word_id=w.id
WHERE ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP
 AND b.id NOT LIKE 'mw-v12-pilot-%' AND b.id NOT LIKE 'qa-%'
 AND b.id NOT LIKE 'draft-%' AND b.id NOT LIKE 'internal-%'
 AND (e.source_name IS NULL OR e.source_name NOT LIKE 'wordletter-internal-qa%')
 AND link.sense_id IS NULL
ORDER BY lower(trim(w.headword)),b.id,ch.id,cw.context_anchor
LIMIT 501;`;

const KEYS=['book_id','chapter_id','anchor','legacy_word_id','old_headword',
 'old_uk','old_us','old_pos','old_meaning','old_en','old_zh','old_collocations',
 'entry_id','source_name','source_key','license_name','license_reviewed',
 'source_enabled','source_sha256','existing_sense_id','context_word_id','context_gloss'];
function parseD1(value){
 const raw=typeof value==='string'?JSON.parse(value):value;
 const packets=Array.isArray(raw)?raw:[raw];
 assert.ok(packets.length>0&&packets.every(p=>p?.success!==false),
  'EDITORIAL_INTAKE_D1_SELECT_FAILED');
 const rows=packets.flatMap(p=>p?.results??[]);
 assert.ok(rows.length<=MAX_ROWS,'EDITORIAL_INTAKE_RESULT_LIMIT_EXCEEDED_NO_PARTIAL_REVIEW');
 for(const r of rows)assert.deepEqual(Object.keys(r).sort(),[...KEYS].sort(),
  'EDITORIAL_INTAKE_UNEXPECTED_COLUMNS');
 return rows;
}
export function collectPublishedFirstSenseReviewPacket(input){
 const rows=parseD1(input),groups=new Map();
 const blocked={invalid_context:0,incomplete_old_card:0,missing_dictionary_entry:0,
  existing_link:0,qa_source_or_book:0};
 for(const r of rows){
  assert.ok(typeof r.book_id==='string'&&typeof r.chapter_id==='string'&&
   typeof r.legacy_word_id==='string'&&typeof r.old_headword==='string',
   'EDITORIAL_INTAKE_INVALID_IDENTITY');
  if(QA.test(r.book_id)||SOURCE_QA.test(r.source_name)||r.existing_sense_id){
   blocked[r.existing_sense_id?'existing_link':'qa_source_or_book']++;continue;
  }
  const values=[r.legacy_word_id,r.old_headword,r.old_uk,r.old_us,
   r.old_pos,r.old_meaning,r.old_en,r.old_zh,r.old_collocations];
  if(!ANCHOR.test(r.anchor||'')||r.context_word_id!==r.legacy_word_id||
    !norm(r.context_gloss)||norm(r.context_gloss)!==norm(r.old_meaning)){
   blocked.invalid_context++;continue;
  }
  if(!clean(r.old_headword)||!clean(r.old_pos)||!clean(r.old_meaning)||
    !clean(r.old_uk)||!clean(r.old_us)||!clean(r.old_en)||!clean(r.old_zh)||
    !clean(r.old_collocations)){
   blocked.incomplete_old_card++;continue;
  }
  if(!ENTRY.test(r.entry_id||'')){
   blocked.missing_dictionary_entry++;continue;
  }
  const k=JSON.stringify([r.entry_id,head(r.old_headword),pos(r.old_pos),
   norm(r.old_meaning)]);
  if(!groups.has(k))groups.set(k,{entry_id:r.entry_id,headword:r.old_headword,
   part_of_speech:r.old_pos,meaning_zh:r.old_meaning,source_name:r.source_name,
   source_key:r.source_key,source_sha256:r.source_sha256,
   source_license:r.license_name,license_reviewed:r.license_reviewed===1,
   source_enabled:r.source_enabled===1,old_cards:[]});
  const g=groups.get(k);
  if(g.source_name!==r.source_name||g.source_sha256!==r.source_sha256)
   throw Error('EDITORIAL_INTAKE_SOURCE_CHANGED_WITHIN_GROUP');
  const card={book_id:r.book_id,chapter_id:r.chapter_id,anchor:r.anchor,
   legacy_word_id:r.legacy_word_id,old_card_sha256:sha(JSON.stringify(values)),
   phonetic_uk:r.old_uk,phonetic_us:r.old_us,
   example_en:r.old_en,example_zh:r.old_zh,
   collocations_json:r.old_collocations,context_gloss:r.context_gloss};
  if(g.old_cards.some(c=>c.chapter_id===card.chapter_id&&c.anchor===card.anchor))
   throw Error('EDITORIAL_INTAKE_DUPLICATE_ANCHOR');
  g.old_cards.push(card);
 }
 const ordered=[...groups.values()].map(g=>{
  g.old_cards.sort((a,b)=>a.book_id.localeCompare(b.book_id)||
   a.chapter_id.localeCompare(b.chapter_id)||a.anchor.localeCompare(b.anchor));
  const ids=[...new Set(g.old_cards.map(x=>x.legacy_word_id))].sort();
  const books=[...new Set(g.old_cards.map(x=>x.book_id))].sort();
  const digest=sha(JSON.stringify([g.entry_id,head(g.headword),
   pos(g.part_of_speech),norm(g.meaning_zh),g.old_cards.map(c=>
    [c.book_id,c.chapter_id,c.anchor,c.legacy_word_id,c.old_card_sha256])]));
  return {...g,old_word_ids:ids,book_count:books.length,
   candidate_hash_sha256:digest,review_status:'HOLD_UNTIL_VERIFIED_EDITOR_AND_LICENSE',
   commercial_use_verified:false,authenticated_publisher_signoff:false};
 }).sort((a,b)=>b.book_count-a.book_count||
   b.old_word_ids.length-a.old_word_ids.length||
   a.candidate_hash_sha256.localeCompare(b.candidate_hash_sha256));
 const selected=ordered.slice(0,BATCH_SIZE);
 const decisions=selected.map(g=>createSenseReviewDecisionTemplate(g));
 return {schema:'wordletter-first-real-published-intake-v1',
  scope:'staging_non_qa_published_books_only',
  status:'CANDIDATES_AWAIT_AUTHENTICATED_REVIEW_NOT_DB_APPROVED',
  counted_legacy_anchors:rows.length,complete_groups:ordered.length,
  selected_groups:selected.length,remaining_groups:Math.max(0,ordered.length-selected.length),
  crossbook_selected_groups:selected.filter(g=>g.book_count>1).length,
  blocked,review_candidates:selected,default_hold_decisions:decisions,
  actual_approved_senses_created:0,actual_links_created:0,
  source_rights_verified_by_this_script:false,production_access:false,
  database_writes:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  if(process.argv[2]==='sql'&&process.argv.length===4){
   writeFileSync(process.argv[3],REAL_PUBLISHED_SELECT,{flag:'wx',mode:0o600});
  }else if(process.argv[2]==='packet'&&process.argv.length===5){
   const p=collectPublishedFirstSenseReviewPacket(readFileSync(process.argv[3],'utf8'));
   writeFileSync(process.argv[4],JSON.stringify(p),{flag:'wx',mode:0o600});
   console.log('FIRST_REAL_SENSE_PRIVATE_INTAKE_COUNTS='+JSON.stringify({
    status:p.status,rows:p.counted_legacy_anchors,groups:p.complete_groups,
    selected:p.selected_groups,crossbook:p.crossbook_selected_groups,
    blocked:p.blocked,d1_writes:0,production_access:false}));
  }else{throw Error('USAGE_sql_out_OR_packet_d1_json_out')}
 }catch(e){console.error('FIRST_REAL_SENSE_PRIVATE_INTAKE_BLOCKED',
  e.message?.startsWith('EDITORIAL_')?e.message:'SAFE_VALIDATION_ERROR');
  process.exitCode=1}
}
