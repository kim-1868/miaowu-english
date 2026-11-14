// Read-only alignment: new CET4 teaching senses vs EXISTING story word cards.
// Never assumes that matching spelling means matching learning progress.
// Must run against an owner-authorized, separately exported staging SQLite D1
// snapshot. No customer learning/user/order data is ever queried or modified.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {studyKey} from '../src/study-identity.js';

const normalize=value=>String(value??'').normalize('NFKC').trim().toLowerCase();
export function inspectCET4Aliases(db,cards){
  if(!db||!Array.isArray(cards))throw Error('INVALID_AUDIT_INPUT');
  const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
  if(!names.has('words')||!names.has('chapter_words'))throw Error('MISSING_WORDS_OR_CHAPTER_WORDS');
  const bySpelling=db.prepare(
    'SELECT DISTINCT w.id AS word_id,w.headword,w.part_of_speech,w.meaning_zh '+
    'FROM words w JOIN chapter_words cw ON cw.word_id=w.id '+
    'WHERE LOWER(TRIM(w.headword))=? ORDER BY w.id LIMIT 100');
  const identicalId=db.prepare('SELECT id,headword,part_of_speech,meaning_zh FROM words WHERE id=?');
  const report={candidates:cards.length,exactSharedSense:0,
    needsMeaningReview:0,needsPOSReview:0,noExistingNovelCard:0,idConflicts:0,
    duplicateCandidateIds:0,details:[]};
  const uniqueIds=new Set();
  for(const c of cards){
    if(c.category_slug!=='cet4')throw Error('CROSS_LEVEL_AUDIT_BLOCKED');
    if(uniqueIds.has(c.word_id))report.duplicateCandidateIds++;
    uniqueIds.add(c.word_id);
    const collisions=identicalId.get(c.word_id);
    const rows=bySpelling.all(normalize(c.headword));
    const exact=rows.filter(x=>studyKey(x)===studyKey(c));
    const samePOS=rows.filter(x=>
      normalize(x.part_of_speech).replaceAll('.','')===
      normalize(c.part_of_speech).replaceAll('.',''));
    const result=collisions?'ID_COLLISION_REQUIRES_REVIEW':
      exact.length?'EXACT_PRIMARY_SENSE_REUSE':
      samePOS.length?'SAME_POS_DIFFERENT_MEANING_REVIEW':
      rows.length?'SAME_WORD_DIFFERENT_POS_REVIEW':'NO_EXISTING_NOVEL_CARD';
    if(collisions)report.idConflicts++;
    if(result==='EXACT_PRIMARY_SENSE_REUSE')report.exactSharedSense++;
    if(result==='SAME_POS_DIFFERENT_MEANING_REVIEW')report.needsMeaningReview++;
    if(result==='SAME_WORD_DIFFERENT_POS_REVIEW')report.needsPOSReview++;
    if(result==='NO_EXISTING_NOVEL_CARD')report.noExistingNovelCard++;
    report.details.push({
      word_id:c.word_id,headword:c.headword,
      part_of_speech:c.part_of_speech,meaning_zh:c.meaning_zh,
      verdict:result,exact_alias_ids:exact.map(x=>x.word_id),
      comparison_count:rows.length,
      // Other meanings are ONLY for human review, never auto-merged.
      other_story_senses:rows.filter(x=>!exact.some(y=>y.word_id===x.word_id))
        .slice(0,8).map(x=>({word_id:x.word_id,
          part_of_speech:x.part_of_speech,meaning_zh:x.meaning_zh}))
    });
  }
  report.readyToAutoMerge=false;
  report.warning='Exact Chinese text is a conservative check only; even exact matches need an authorized release review. No legacy IDs, user_words or novel rows were modified.';
  return report;
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  const snapshot=process.argv[2];
  const sources=process.argv.slice(3);
  if(!snapshot||snapshot.startsWith('-')||!existsSync(snapshot)||!sources.length){
    console.error('Usage: node --experimental-sqlite scripts/audit-cet4-sense-aliases.mjs <staging-snapshot.db> <cet4-cards.jsonl> [more-cards.jsonl]');
    process.exitCode=2;
  }else{
    let db;
    try{
      db=new DatabaseSync(resolve(snapshot),{readOnly:true});
      db.exec('PRAGMA query_only=ON');
      const cards=sources.flatMap(path=>readFileSync(resolve(path),'utf8')
        .split(/\r?\n/).filter(s=>s.trim()).map(JSON.parse));
      const result=inspectCET4Aliases(db,cards);
      console.log(JSON.stringify(result,null,2));
      if(result.idConflicts||result.duplicateCandidateIds)process.exitCode=1;
    }catch(e){console.error('CET4_SENSE_AUDIT_BLOCKED:',String(e?.message||e));process.exitCode=1}
    finally{try{db?.close()}catch{}}
  }
}
