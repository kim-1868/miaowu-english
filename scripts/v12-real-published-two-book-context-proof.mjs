// Phase 1 of REAL published A/B evidence, NEVER editorial or legal approval.
// Uses already-encrypted 32-book Publisher wordcard snapshot, then produces one
// narrowly scoped read-only PRODUCTION SELECT for two actual published chapters.
// Raw words, chapter excerpt and book identities stay inside encrypted artifact.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const sha=x=>createHash('sha256').update(x).digest('hex');
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const ID=/^[a-z0-9_-]{1,120}$/iu;
const N=x=>String(x??'').normalize('NFKC').trim();
const lemma=x=>N(x).toLowerCase().replaceAll('’',"'");
const gloss=x=>N(x).replace(/\s+/gu,'');
const qa=x=>/^(?:qa-|draft-|internal-|mw-v12-pilot-)/iu.test(x||'');
const BASE={published_books:32,published_anchor_occurrences:8444,
 distinct_old_word_ids:3433,distinct_headwords:1585,
 textual_sense_candidates:1981,duplicate_textual_sense_groups:532,
 duplicate_excess_old_ids:1452};

function validateQueue(queue){
 assert.equal(queue?.status,'PRIVATE_PUBLISHED_EDITORIAL_CANDIDATES_UNAPPROVED',
  'PUBLISHER_REVIEW_REAL_SOURCE_REQUIRED');
 assert.equal(queue?.all_records_private,true);
 assert.equal(queue?.created_approvals,0);
 assert.equal(queue?.production_writes,0);
 for(const [k,v] of Object.entries(BASE))
  assert.equal(queue?.counts?.[k],v,'PUBLISHER_REVIEW_SOURCE_SNAPSHOT_DRIFT_'+k);
 assert.ok(Array.isArray(queue?.duplicate_review_queue)&&
  queue.duplicate_review_queue.length===532,'PUBLISHER_REVIEW_GROUPS_NOT_532');
}
function pairForGroup(g){
 if(g?.editor_decision!=='HOLD'||g?.approved_sense_id!==null||
  g?.auto_merge_allowed!==false||g?.production_writes_allowed!==false||
  !N(g.headword)||!N(g.pos)||!N(g.meaning_zh)||
  !Array.isArray(g.card_evidence)||!Array.isArray(g.book_ids)||
  g.book_ids.length<2||!Array.isArray(g.legacy_word_ids)||
  g.legacy_word_ids.length<2)return null;
 const ev=g.card_evidence;
 if(ev.some(r=>!ID.test(r?.book_id||'')||!ID.test(r?.old_word_id||'')||
  !N(r.phonetic_uk)||!N(r.phonetic_us)||!N(r.example_en)||!N(r.example_zh)||
  qa(r.book_id)))return null;
 // Do not infer equivalence from different IPA or example versions.
 for(const key of ['phonetic_uk','phonetic_us','example_en','example_zh'])
  if(new Set(ev.map(r=>N(r[key]))).size!==1)return null;
 const ordered=[...ev].sort((a,b)=>b.occurrences-a.occurrences||
  a.book_id.localeCompare(b.book_id)||a.old_word_id.localeCompare(b.old_word_id));
 let pair=null;
 for(const a of ordered){for(const b of ordered){
  if(a.book_id!==b.book_id&&a.old_word_id!==b.old_word_id){pair=[a,b];break}
 }if(pair)break}
 return pair;
}
export function chooseFirstRealPublishedCrossbookPair(queue){
 validateQueue(queue);
 const sensesByLemma=new Map();
 for(const g of [...queue.duplicate_review_queue,...queue.other_candidate_groups??[]]){
  const key=lemma(g.headword),s=sensesByLemma.get(key)??new Set();
  s.add(JSON.stringify([lemma(g.pos),gloss(g.meaning_zh)]));
  sensesByLemma.set(key,s);
 }
 const eligible=[];
 for(const g of queue.duplicate_review_queue){
  const pair=pairForGroup(g);
  if(!pair||sensesByLemma.get(lemma(g.headword))?.size!==1)continue;
  const fingerprint=sha(JSON.stringify([lemma(g.headword),lemma(g.pos),
   gloss(g.meaning_zh),[...g.legacy_word_ids].sort(),
   [...g.book_ids].sort()]));
  eligible.push({headword:g.headword,pos:g.pos,meaning_zh:g.meaning_zh,
   fingerprint_sha256:fingerprint,source_book_count:g.book_ids.length,
   occurrences:g.occurrences,paired_cards:pair.map(c=>({
    book_id:c.book_id,old_word_id:c.old_word_id,phonetic_uk:c.phonetic_uk,
    phonetic_us:c.phonetic_us,example_en:c.example_en,
    example_zh:c.example_zh}))});
 }
 eligible.sort((a,b)=>b.occurrences-a.occurrences||
  b.source_book_count-a.source_book_count||
  a.fingerprint_sha256.localeCompare(b.fingerprint_sha256));
 assert.ok(eligible.length>0,'PUBLISHER_REVIEW_NO_SAFE_CROSSBOOK_PAIR');
 const chosen=eligible[0];
 // Integer rank and rigorously validated IDs ONLY; no free SQL templates.
 const values=chosen.paired_cards.map((c,i)=>{
  assert.ok(ID.test(c.book_id)&&ID.test(c.old_word_id));
  return '('+[i,q(c.book_id),q(c.old_word_id)].join(',')+')';
 }).join(',');
 const sql=String.raw`WITH requested(rank,book_id,old_word_id) AS (VALUES __VALUES__),
hits AS (
 SELECT r.rank,b.id AS book_id,b.category_id,b.title AS book_title,
  ch.id AS chapter_id,ch.chapter_no,ch.title AS chapter_title,
  cw.word_id AS legacy_word_id,cw.context_anchor AS anchor,
  w.headword AS old_headword,w.phonetic_uk AS old_uk,
  w.phonetic_us AS old_us,w.part_of_speech AS old_pos,
  w.meaning_zh AS old_meaning,w.example_en AS old_en,
  w.example_zh AS old_zh,w.collocations_json AS old_collocations,
  CASE WHEN json_valid(ch.content_json)=1 THEN
   json_extract(ch.content_json,'$.paragraphs['||
    CAST(substr(cw.context_anchor,2,instr(cw.context_anchor,':')-2) AS INTEGER)||']')
   ELSE NULL END AS paragraph_json,
  CASE WHEN json_valid(ch.content_json)=1 THEN
   json_extract(ch.content_json,'$.paragraphs['||
    CAST(substr(cw.context_anchor,2,instr(cw.context_anchor,':')-2) AS INTEGER)||
    '].segments['||
    CAST(substr(cw.context_anchor,instr(cw.context_anchor,':s')+2) AS INTEGER)||
    '].wordId') ELSE NULL END AS segment_word_id,
  CASE WHEN json_valid(ch.content_json)=1 THEN
   json_extract(ch.content_json,'$.paragraphs['||
    CAST(substr(cw.context_anchor,2,instr(cw.context_anchor,':')-2) AS INTEGER)||
    '].segments['||
    CAST(substr(cw.context_anchor,instr(cw.context_anchor,':s')+2) AS INTEGER)||
    '].gloss') ELSE NULL END AS segment_gloss,
  row_number() OVER(PARTITION BY r.rank
   ORDER BY ch.chapter_no,cw.context_anchor) AS rn
 FROM requested r JOIN books b ON b.id=r.book_id AND b.status='published'
 JOIN chapters ch ON ch.book_id=b.id
 JOIN chapter_words cw ON cw.chapter_id=ch.id AND cw.word_id=r.old_word_id
 JOIN words w ON w.id=cw.word_id
 WHERE ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP
  AND cw.context_anchor GLOB 'p[0-9]*:s[0-9]*'
  AND json_valid(ch.content_json)=1
  AND segment_word_id=w.id AND segment_gloss=w.meaning_zh
)
SELECT rank,book_id,category_id,book_title,chapter_id,chapter_no,
 chapter_title,legacy_word_id,anchor,old_headword,old_uk,old_us,
 old_pos,old_meaning,old_en,old_zh,old_collocations,
 paragraph_json,segment_word_id,segment_gloss
FROM hits WHERE rn=1 ORDER BY rank;`.replace('__VALUES__',values);
 assert.ok(sql.trim().startsWith('WITH requested'));
 assert.equal((sql.match(/;/g)||[]).length,1);
 return {status:'PRIVATE_REAL_PRODUCTION_READONLY_SELECT_PREPARED',
  source_artifact_id:13911979176,examined_candidate_groups:532,
  structurally_eligible_pairs:eligible.length,selected:chosen,
  sql,scope_books:2,remote_writes:0,production_deploy:false,
  editor_decision:'HOLD',source_rights_verified:false};
}
const ROW_KEYS=['rank','book_id','category_id','book_title','chapter_id',
 'chapter_no','chapter_title','legacy_word_id','anchor','old_headword',
 'old_uk','old_us','old_pos','old_meaning','old_en','old_zh',
 'old_collocations','paragraph_json','segment_word_id','segment_gloss'];
export function verifyActualPublishedTwoBookContext(selection,result){
 assert.equal(selection?.status,'PRIVATE_REAL_PRODUCTION_READONLY_SELECT_PREPARED');
 const raw=typeof result==='string'?JSON.parse(result):result;
 const packets=Array.isArray(raw)?raw:[raw];
 assert.ok(packets.length&&packets.every(x=>x?.success!==false),
  'REAL_PUBLISHER_SOURCE_CONTEXT_QUERY_FAILED');
 const rows=packets.flatMap(x=>x?.results??[]);
 assert.equal(rows.length,2,'REAL_PUBLISHER_TWO_CONTEXTS_REQUIRED');
 const contexts=[];
 for(let i=0;i<2;i++){
  const r=rows[i],c=selection.selected.paired_cards[i];
  assert.deepEqual(Object.keys(r).sort(),[...ROW_KEYS].sort(),
   'REAL_PUBLISHER_CONTEXT_SENSITIVE_COLUMN');
  assert.equal(r.rank,i);
  assert.equal(r.book_id,c.book_id);
  assert.equal(r.legacy_word_id,c.old_word_id);
  assert.ok(ID.test(r.chapter_id)&&Number.isSafeInteger(r.chapter_no)&&r.chapter_no>0);
  assert.ok(/^p(?:0|[1-9]\d*):s(?:0|[1-9]\d*)$/u.test(r.anchor||''),
   'REAL_PUBLISHER_INVALID_ANCHOR');
  assert.equal(r.segment_word_id,r.legacy_word_id);
  assert.equal(gloss(r.segment_gloss),gloss(r.old_meaning));
  assert.equal(lemma(r.old_headword),lemma(selection.selected.headword));
  assert.equal(lemma(r.old_pos).replace(/[.。]/gu,''),
   lemma(selection.selected.pos).replace(/[.。]/gu,''));
  assert.equal(gloss(r.old_meaning),gloss(selection.selected.meaning_zh));
  for(const [col,evidence] of [['old_uk','phonetic_uk'],['old_us','phonetic_us'],
    ['old_en','example_en'],['old_zh','example_zh']])
   assert.equal(r[col],c[evidence],'REAL_PUBLISHER_OLD_CARD_DRIFT_'+col);
  assert.ok(typeof r.old_collocations==='string','REAL_PUBLISHER_COLLOCATIONS_MISSING');
  const segIdx=Number(r.anchor.split(':s')[1]);
  const p=JSON.parse(r.paragraph_json??'null');
  assert.ok(p&&Array.isArray(p.segments)&&p.segments.length>segIdx,
   'REAL_PUBLISHER_PARAGRAPH_NOT_VALID');
  const seg=p.segments[segIdx];
  assert.equal(seg.wordId,r.legacy_word_id);
  assert.equal(gloss(seg.gloss),gloss(r.old_meaning));
  assert.ok(typeof seg.surface==='string'&&seg.surface.trim(),
   'REAL_PUBLISHER_SURFACE_MISSING');
  const oldCard=[r.legacy_word_id,r.old_headword,r.old_uk,r.old_us,
   r.old_pos,r.old_meaning,r.old_en,r.old_zh,r.old_collocations];
  contexts.push({...r,old_card_sha256:sha(JSON.stringify(oldCard))});
 }
 assert.notEqual(contexts[0].book_id,contexts[1].book_id);
 assert.notEqual(contexts[0].legacy_word_id,contexts[1].legacy_word_id);
 return {schema:'wordletter-real-production-2book-context-evidence-v1',
  status:'REAL_PUBLISHED_CONTEXT_EVIDENCE_ONLY_NOT_APPROVED',
  editorial_candidate:selection.selected,verified_actual_published_contexts:contexts,
  source_artifact_id:13911979176,approved_sense_id:null,
  commercial_license_verified:false,authenticated_ops_signoff:false,
  bound_staging_legacy_word_ids:0,production_writes:0,
  customer_study_writes:0,staging_writes:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  if(process.argv[2]==='select'&&process.argv.length===6){
   const q=chooseFirstRealPublishedCrossbookPair(
    JSON.parse(readFileSync(process.argv[3],'utf8')));
   writeFileSync(process.argv[4],q.sql,{flag:'wx',mode:0o600});
   writeFileSync(process.argv[5],JSON.stringify({...q,sql:undefined}),{flag:'wx',mode:0o600});
   console.log('REAL_PUBLISHED_2BOOK_PROTECTED_PAIR_SELECTED='+JSON.stringify({
    candidate_groups:532,eligible_pairs:q.structurally_eligible_pairs,
    paired_books:q.scope_books,commercial_approvals:0,db_writes:0}));
  }else if(process.argv[2]==='verify'&&process.argv.length===6){
   const s=JSON.parse(readFileSync(process.argv[3],'utf8'));
   const v=verifyActualPublishedTwoBookContext(s,readFileSync(process.argv[4],'utf8'));
   writeFileSync(process.argv[5],JSON.stringify(v),{flag:'wx',mode:0o600});
   console.log('REAL_PUBLISHED_2BOOK_CONTEXT_EVIDENCE='+JSON.stringify({
    distinct_books:2,verified_anchor_contexts:2,
    commercial_approvals:0,db_writes:0}));
  }else throw Error('REAL_PUBLISHED_PROOF_CLI_USAGE');
 }catch(e){
  console.error('REAL_PUBLISHED_PROOF_FAIL_CLOSED',
   typeof e?.message==='string'&&/^[A-Z][A-Z_0-9]+$/u.test(e.message)?
    e.message:'PRIVATE_SOURCE_NOT_VERIFIED');
  process.exitCode=1;
 }
}
