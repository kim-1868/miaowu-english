// Offline-only private reviewer queue: historical wordcards vs one-card D1.
// Opens a LOCAL SQLite BACKUP read-only; never submits or writes to Cloudflare.
import {DatabaseSync} from 'node:sqlite';
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareLegacyDictionaryWorklist}
 from '../src/global-dictionary-legacy-worklist.js';

export function auditLegacyDictionaryReviewQueue(db){
 const words=db.prepare('SELECT id,headword,meaning_zh FROM words ORDER BY id').all();
 const entries=db.prepare(
  'SELECT e.entry_id,e.headword,e.teaching_ready,e.reviewed_at,'+
  's.enabled,s.license_reviewed,d.senses_json,d.reviewed_by,d.reviewed_at AS lesson_reviewed_at '+
  'FROM global_dictionary_entries e LEFT JOIN global_dictionary_sources s '+
  'ON s.source_key=e.source_name LEFT JOIN global_dictionary_lessons d '+
  'ON d.entry_id=e.entry_id'
 ).all().map(x=>({
  entry_id:x.entry_id,headword:x.headword,senses_json:x.senses_json,
  teaching_ready:Number(x.teaching_ready)===1&&Boolean(x.reviewed_at),
  source_approved:Number(x.enabled)===1&&Number(x.license_reviewed)===1,
  lesson_approved:Boolean(x.reviewed_by&&x.lesson_reviewed_at)
 }));
 const links=db.prepare('SELECT legacy_word_id,entry_id FROM global_dictionary_legacy_links').all();
 return prepareLegacyDictionaryWorklist({words,entries,approvedLinks:links});
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const filepath=process.argv[2],outIndex=process.argv.indexOf('--out');
 const out=outIndex>=0?process.argv[outIndex+1]:null;
 if(!filepath||!out||filepath.startsWith('-')||out.startsWith('-')){
  console.error('Usage: node --experimental-sqlite scripts/build-global-dictionary-legacy-worklist.mjs <local-backup.sqlite> --out <private-directory>');
  process.exitCode=2;
 }else{
  let db;
  try{
   db=new DatabaseSync(resolve(filepath),{readOnly:true});
   db.exec('PRAGMA query_only=ON');
   const report=auditLegacyDictionaryReviewQueue(db);
   const dir=resolve(out);mkdirSync(dir,{recursive:true,mode:0o700});
   writeFileSync(join(dir,'legacy-canonical-review.jsonl'),
     report.records.map(x=>JSON.stringify(x)).join('\n')+'\n',{flag:'wx',mode:0o600});
   writeFileSync(join(dir,'worklist-audit.json'),JSON.stringify({
     status:report.status,total_legacy_cards:report.total_legacy_cards,
     counts:report.counts,new_reviewed_links_created:0,
     user_data_modified:false},null,2)+'\n',{flag:'wx',mode:0o600});
   console.log(JSON.stringify({status:report.status,counts:report.counts,
     total:report.total_legacy_cards,no_database_writes:true}));
  }catch(e){
   console.error('LEGACY_LINK_WORKLIST_BLOCKED:'+String(e?.message||e));
   process.exitCode=1;
  }finally{db?.close()}
 }
}
