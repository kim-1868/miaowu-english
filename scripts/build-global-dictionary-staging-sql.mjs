// Offline additive SQL emitter for D1 global dictionary staging tables.
// Writes ONLY candidate .sql artifacts to local disk; never invokes wrangler,
// D1, Cloudflare, GitHub or the live site. Source/editorial approval is separate.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {compileDictionaryDraftIndex} from './build-global-dictionary-index.mjs';

const TABLES=['global_dictionary_entries','global_dictionary_forms'];
const sql=s=>"'"+String(s??'').replaceAll("'","''")+"'";
const nullable=s=>s===null||s===undefined||s===''?'NULL':sql(s);
const KEY=/^[a-z][a-z0-9_-]{2,79}$/i;
const MAX_ROW_TEXT=3000;
function clean(value){const s=String(value??'');return s.slice(0,MAX_ROW_TEXT)}
function batches(rows,size){const result=[];for(let i=0;i<rows.length;i+=size)result.push(rows.slice(i,i+size));return result}
export function buildGlobalDictionaryImportSQL(index,options={}){
  const entries=index?.entries,forms=index?.forms;
  if(!Array.isArray(entries)||!Array.isArray(forms)||!entries.length)throw Error('EMPTY_DICTIONARY');
  const sourceKey=options.sourceKey||'owner_ecdict_exam_snapshot';
  const license=options.license||'MIT_UPSTREAM_VERIFICATION_PENDING';
  const size=options.batchSize??250;
  if(!KEY.test(sourceKey)||size<1||size>500||!Number.isInteger(size))
    throw Error('INVALID_DICTIONARY_IMPORT_OPTIONS');
  const sourceSha=options.sourceSha256;
  if(!/^[a-f0-9]{64}$/.test(sourceSha||''))throw Error('SOURCE_SHA256_REQUIRED');
  const known=new Map(),names=new Set(),pairs=new Set();
  for(const e of entries){
    if(!KEY.test(e.entry_id)||typeof e.headword!=='string'||
      e.headword.length>80||!e.headword||!Array.isArray(e.exam_levels)||
      e.teaching_ready!==false)throw Error('UNAPPROVED_OR_INVALID_SOURCE_ENTRY');
    if(known.has(e.entry_id)||names.has(e.headword.toLowerCase()))throw Error('DUPLICATE_DICTIONARY_ENTRY');
    known.set(e.entry_id,e);names.add(e.headword.toLowerCase());
  }
  for(const f of forms){
    if(typeof f.form!=='string'||!names.has(String(f.headword||'').toLowerCase())||
      f.reviewed!==false||f.verified!==false)throw Error('INVALID_OR_PREAPPROVED_INFLECTION');
    const id=entries.find(e=>e.headword===f.headword)?.entry_id;
    if(!id)throw Error('INFLECTION_ENTRY_NOT_FOUND');
    const sig=f.form.toLowerCase()+'\0'+id;
    if(pairs.has(sig))throw Error('DUPLICATE_INFLECTION');
    pairs.add(sig);
  }
  const chunks=[];
  for(const [n,part] of batches(entries,size).entries()){
    const body=['-- Staging D1 candidate ONLY. No user or book data modified.','BEGIN TRANSACTION;'];
    for(const e of part){
      body.push('INSERT INTO global_dictionary_entries(entry_id,headword,exam_levels_json,'+
        'source_name,source_ipa_unverified,source_pos_unverified,source_translation_unverified,'+
        'teaching_ready,reviewed_at) VALUES('+
        [sql(e.entry_id),sql(e.headword),sql(JSON.stringify(e.exam_levels)),
         sql(sourceKey),nullable(clean(e.source_ipa_unverified)),
         nullable(clean(e.source_pos_unverified)),
         nullable(clean(e.source_translation_unverified)),'0','NULL'].join(',')+');');
    }
    body.push('COMMIT;');
    chunks.push({name:'01-entries-'+String(n+1).padStart(4,'0')+'.sql',sql:body.join('\n')+'\n'});
  }
  const byHead=new Map(entries.map(e=>[e.headword,e.entry_id]));
  for(const [n,part] of batches(forms,size).entries()){
    const body=['-- Source inflections are unreviewed. No automatic learning match.','BEGIN TRANSACTION;'];
    for(const f of part)
      body.push('INSERT INTO global_dictionary_forms(form,entry_id,source_name,reviewed) VALUES('+
        [sql(f.form),sql(byHead.get(f.headword)),sql(sourceKey),'0'].join(',')+');');
    body.push('COMMIT;');
    chunks.push({name:'02-forms-'+String(n+1).padStart(4,'0')+'.sql',sql:body.join('\n')+'\n'});
  }
  // Imported datasets are disabled until independent licensing, completeness
  // and editorial checks. A preflight can read these as draft dictionary_only.
  const sourceSQL=[
   '-- Disabled by default. Explicit independent signoff required to enable.',
   'BEGIN TRANSACTION;',
   'INSERT INTO global_dictionary_sources(source_key,license_name,license_reviewed,'+
    'source_sha256,imported_entries,imported_forms,imported_at,enabled) VALUES('+
    [sql(sourceKey),sql(license),'0',sql(sourceSha),String(entries.length),String(forms.length),
     'CURRENT_TIMESTAMP','0'].join(',')+');',
   'COMMIT;',''
  ].join('\n');
  chunks.push({name:'03-source-disabled.sql',sql:sourceSQL});
  return {status:'STAGING_IMPORT_SQL_GENERATED_NOT_EXECUTED',sourceKey,
    entries:entries.length,forms:forms.length,chunks,
    stagingOnly:true,enabled:false,licenseReviewed:false,teachingApproved:false,
    safety:'Run the additive schema migration on an isolated staging DB first. Source batches require fresh empty tables; never run these SQL files on production.'};
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const source=process.argv[2],at=process.argv.indexOf('--out'),output=at>=0?process.argv[at+1]:null;
 if(!source||!output||source.startsWith('-')||output.startsWith('-')){
  console.error('Usage: node scripts/build-global-dictionary-staging-sql.mjs <owner-ECDICT-CSV> --out <private-dir>');
  process.exitCode=2;
 }else try{
  const raw=readFileSync(resolve(source));
  const sha=createHash('sha256').update(raw).digest('hex');
  const index=compileDictionaryDraftIndex(raw.toString('utf8'));
  const result=buildGlobalDictionaryImportSQL(index,{sourceSha256:sha});
  const dir=resolve(output);mkdirSync(dir,{recursive:true});
  for(const part of result.chunks)writeFileSync(join(dir,part.name),part.sql);
  writeFileSync(join(dir,'INDEX_AUDIT.json'),JSON.stringify({
    status:result.status,entries:result.entries,forms:result.forms,
    sourceSha256:sha,stagingOnly:true,enabled:false,licenseReviewed:false,
    teachingApproved:false,sqlFileCount:result.chunks.length},null,2)+'\n');
  console.log(JSON.stringify({status:result.status,entries:result.entries,
    forms:result.forms,sqlFileCount:result.chunks.length,enabled:false},null,2));
 }catch(e){console.error('DICTIONARY_STAGING_SQL_REJECTED:',String(e?.message||e));process.exitCode=1}
}
