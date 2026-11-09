// Offline, read-only audit on an authorized staging SQLite snapshot.
// Reads only catalog/words/categories; never selects user or order data.
// Never enables catalog levels, runs migrations, or connects to Cloudflare.
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

const target=process.argv[2];
const strict=process.argv.includes('--require-ready');
const production=process.argv.includes('--production');
const MIN_EXAM_HEADWORDS={cet4:3849,cet6:5407,postgrad:4801,ielts:5040};
if(!target||target.startsWith('-')||!existsSync(target)){
  console.error('Usage: node --experimental-sqlite scripts/check-smart-vocab-catalog.mjs <staging-snapshot.db> [--require-ready] [--production]');
  process.exit(2);
}
let conn;
try{
  conn=new DatabaseSync(resolve(target),{readOnly:true});
  conn.exec('PRAGMA query_only=ON');
  const names=new Set(conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
  for(const required of ['categories','words','smart_vocab_levels','smart_vocab_catalog'])
    if(!names.has(required))throw Error('MISSING_REQUIRED_TABLE_'+required);
  const levels=conn.prepare(
    "SELECT c.slug,l.category_id,l.expected_headwords,l.enabled,l.catalog_verified_at "+
    "FROM smart_vocab_levels l JOIN categories c ON c.id=l.category_id "+
    "ORDER BY c.slug").all();
  const out=[];
  for(const l of levels){
    const r=conn.prepare(
      "SELECT COUNT(*) AS rows_total,"+
      "COUNT(DISTINCT LOWER(TRIM(w.headword))) AS total_headwords,"+
      "COUNT(DISTINCT CASE WHEN cv.reviewed=1 AND cv.frequency_verified=1 "+
      "AND TRIM(w.headword)!='' AND TRIM(COALESCE(w.meaning_zh,''))!='' "+
      "AND (TRIM(COALESCE(w.phonetic_uk,''))!='' OR TRIM(COALESCE(w.phonetic_us,''))!='') "+
      "AND TRIM(COALESCE(w.example_en,''))!='' AND TRIM(COALESCE(w.example_zh,''))!='' "+
      "THEN LOWER(TRIM(w.headword)) END) AS ready_headwords,"+
      "SUM(CASE WHEN cv.reviewed=0 THEN 1 ELSE 0 END) AS not_reviewed,"+
      "SUM(CASE WHEN cv.frequency_verified=0 THEN 1 ELSE 0 END) AS freq_not_verified,"+
      "SUM(CASE WHEN TRIM(COALESCE(w.meaning_zh,''))='' THEN 1 ELSE 0 END) AS no_meaning,"+
      "SUM(CASE WHEN TRIM(COALESCE(w.phonetic_uk,''))='' "+
      "AND TRIM(COALESCE(w.phonetic_us,''))='' THEN 1 ELSE 0 END) AS no_phonetic,"+
      "SUM(CASE WHEN TRIM(COALESCE(w.example_en,''))='' "+
      "OR TRIM(COALESCE(w.example_zh,''))='' THEN 1 ELSE 0 END) AS incomplete_example "+
      "FROM smart_vocab_catalog cv JOIN words w ON w.id=cv.word_id "+
      "WHERE cv.category_id=?").get(l.category_id);
    const ready=!!l.enabled&&!!l.catalog_verified_at&&
      Number(r.ready_headwords)>=Number(l.expected_headwords)&&
      (!production||Number(l.expected_headwords)>=Number(MIN_EXAM_HEADWORDS[l.slug]||Infinity));
    out.push({
      level:l.slug,enabled:!!l.enabled,expectedHeadwords:l.expected_headwords,
      audited:!!l.catalog_verified_at,readyHeadwords:r.ready_headwords,
      totalHeadwords:r.total_headwords,rowsTotal:r.rows_total,
      missingMeaning:r.no_meaning||0,missingPronunciation:r.no_phonetic||0,
      missingExample:r.incomplete_example||0,
      notReviewed:r.not_reviewed||0,unverifiedFrequency:r.freq_not_verified||0,
      ready
    });
  }
  console.log(JSON.stringify({status:'OFFLINE_READ_ONLY',productionCoverageRequired:production,levels:out},null,2));
  if(strict&&(!out.length||out.some(l=>!l.ready)))process.exitCode=1;
}catch(e){
  console.error('CATALOG_AUDIT_BLOCKED:',e?.message||String(e));
  process.exitCode=1;
}finally{try{conn?.close()}catch{}}
