// Read-only rehearsal against a BACKUP SQLite database, never live D1.
// Emits only aggregate counts. It intentionally does not export account IDs,
// user study items, purchase/entitlement records or historical event contents.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reconcileCanonicalStudyRows}
 from '../src/global-dictionary-study-rehearsal.js';

const required=['words','user_words','review_events',
 'global_dictionary_entries','global_dictionary_sources',
 'global_dictionary_lessons','global_dictionary_legacy_links'];

export function rehearseCanonicalStateFromBackup(db){
 if(!db||typeof db.prepare!=='function')throw Error('INVALID_BACKUP_DB');
 for(const table of required){
  const columns=db.prepare('PRAGMA table_info('+table+')').all();
  if(!columns.length)throw Error('BACKUP_SCHEMA_MISSING_'+table);
 }
 // This scope is solely an audit. It never grants access to paid chapters or
 // chooses a future public endpoint; any actual rollout rechecks entitlements.
 const source=db.prepare(
  'SELECT l.legacy_word_id,l.entry_id,l.reviewed_by,l.reviewed_at,'+
  ' e.teaching_ready,e.reviewed_at AS entry_reviewed_at,'+
  ' s.enabled AS source_enabled,s.license_reviewed,'+
  ' d.reviewed_by AS lesson_reviewer,d.reviewed_at AS lesson_reviewed_at '+
  'FROM global_dictionary_legacy_links l '+
  'LEFT JOIN global_dictionary_entries e ON e.entry_id=l.entry_id '+
  'LEFT JOIN global_dictionary_sources s ON s.source_key=e.source_name '+
  'LEFT JOIN global_dictionary_lessons d ON d.entry_id=l.entry_id'
 ).all();
 const links=source.map(row=>({
  legacy_word_id:row.legacy_word_id,entry_id:row.entry_id,
  reviewed:!!(row.reviewed_by&&row.reviewed_at),
  source_approved:Number(row.source_enabled)===1&&
    Number(row.license_reviewed)===1&&
    Number(row.teaching_ready)===1&&!!row.entry_reviewed_at,
  lesson_approved:!!(row.lesson_reviewer&&row.lesson_reviewed_at)
 }));
 const progress=db.prepare(
  'SELECT user_id,word_id,status,bookmarked,due_at,last_seen_at FROM user_words'
 ).all();
 const result=reconcileCanonicalStudyRows({links,progress});
 const eventCount=db.prepare('SELECT COUNT(*) AS n FROM review_events').get().n;
 const userRowCount=db.prepare('SELECT COUNT(*) AS n FROM user_words').get().n;
 const summary={
  status:result.status,
  source_rows:Number(userRowCount),
  historical_events:Number(eventCount),
  approved_map_count:result.counts.reviewed_links,
  unresolved_map_count:source.length-result.counts.reviewed_links,
  ...result.counts,
  issues:result.issues,
  blocked_for_automatic_migration:result.counts.mastery_conflicts>0||
   result.counts.unmapped>0||result.counts.pending_due_unknown>0||
   result.issues.length>0,
  license_context:'Read-only local backup rehearsal; exam access remains unchanged.',
  personal_identifiers_exported:false,
  no_database_writes:true,
  migration_applied:false
 };
 return summary;
}

const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const file=process.argv[2],index=process.argv.indexOf('--out');
 const output=index>=0?process.argv[index+1]:null;
 if(!file||!output||file.startsWith('-')||output.startsWith('-')){
  console.error('Usage: node --experimental-sqlite scripts/rehearse-global-dictionary-study-merge.mjs <local-D1-backup.sqlite> --out <private-audit.json>');
  process.exitCode=2;
 }else{
  let db;
  try{
   db=new DatabaseSync(resolve(file),{readOnly:true});
   db.exec('PRAGMA query_only=ON');
   const result=rehearseCanonicalStateFromBackup(db);
   writeFileSync(resolve(output),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
   console.log(JSON.stringify({status:result.status,
    blocked_for_automatic_migration:result.blocked_for_automatic_migration,
    source_rows:result.source_rows,canonical_groups:result.canonical_groups,
    personal_identifiers_exported:false}));
  }catch(e){
   console.error('CANONICAL_STUDY_REHEARSAL_BLOCKED:'+String(e?.message||e));
   process.exitCode=1;
  }finally{db?.close()}
 }
}
