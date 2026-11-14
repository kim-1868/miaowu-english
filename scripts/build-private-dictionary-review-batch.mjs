// Only run against privately held owner files on a local machine.
// Writes reviewer input, NEVER writes to GitHub or Cloudflare.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseCsv} from './audit-cet4-source.mjs';
import {ownerExamTierIndex,selectPrivateEditorialBatch}
 from '../src/global-dictionary-review-batches.js';
const digest=x=>createHash('sha256').update(x).digest('hex');
const esc=x=>'"'+String(x??'').replaceAll('"','""')+'"';
export function buildPrivateReviewBatch({sourceJsonl,examCsv,excludedJsonl='',batchSize=120}){
 const lines=sourceJsonl.trim().split(/\r?\n/u).filter(Boolean).map(JSON.parse);
 const matrix=parseCsv(examCsv),headers=matrix.shift()||[];
 const ix=(name)=>{const i=headers.indexOf(name);if(i<0)throw Error('MISSING_PRIVATE_SOURCE_CSV_COLUMN_'+name);return i};
 const [word,tier,tags,rank]=['单词','首现层级','涉及考试','全局排名'].map(ix);
 const examIndex=ownerExamTierIndex(matrix.map(line=>({
  单词:line[word],首现层级:line[tier],涉及考试:line[tags],全局排名:line[rank]})));
 const exclude=excludedJsonl.trim()?excludedJsonl.trim().split(/\r?\n/u).filter(Boolean).map(x=>
  JSON.parse(x).candidate_hash_sha256):[];
 const result=selectPrivateEditorialBatch(lines,{examIndex,excludeHashes:exclude,batchSize});
 const fields=['review_sequence','review_cohort','headword','part_of_speech','meaning_zh',
  'curriculum_first_tier','old_word_id_count','books_count','candidate_priority_score',
  'phonetic_uk_variants','phonetic_us_variants','editorial_flags','candidate_hash_sha256','review_status','editor_note'];
 const csv=[fields.map(esc).join(',')];
 for(const row of result.candidates)csv.push(fields.map(field=>
  esc(Array.isArray(row[field])?row[field].join(' | '):row[field])).join(','));
 return {...result,source_sha256:digest(sourceJsonl),
  jsonl:result.candidates.map(x=>JSON.stringify(x)).join('\n')+'\n',
  csv:'\uFEFF'+csv.join('\r\n')+'\r\n'};
}
const main=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
 const args=process.argv.slice(2),value=k=>{
  const i=args.indexOf(k);return i<0?null:args[i+1];
 },source=value('--source'),exam=value('--exam'),out=value('--out');
 const skip=value('--exclude-previous'),count=Number(value('--size')||120);
 if(!source||!exam||!out){
  console.error('Usage: node scripts/build-private-dictionary-review-batch.mjs --source /private/senses.jsonl --exam /private/exam.csv --out /private/batch-dir [--exclude-previous /private/previous.jsonl] [--size 120]');
  process.exitCode=2;
 }else try{
  if(existsSync(resolve(out)))throw Error('PRIVATE_BATCH_OUTPUT_DIRECTORY_ALREADY_EXISTS');
  const batch=buildPrivateReviewBatch({
   sourceJsonl:readFileSync(resolve(source),'utf8'),
   examCsv:readFileSync(resolve(exam),'utf8'),
   excludedJsonl:skip?readFileSync(resolve(skip),'utf8'):'',
   batchSize:count
  });
  mkdirSync(resolve(out),{recursive:true,mode:0o700});
  writeFileSync(join(resolve(out),'review-candidates.jsonl'),batch.jsonl,{flag:'wx',mode:0o600});
  writeFileSync(join(resolve(out),'review-sheet.csv'),batch.csv,{flag:'wx',mode:0o600});
  writeFileSync(join(resolve(out),'review-summary.json'),
   JSON.stringify({...batch.summary,source_sha256:batch.source_sha256},null,2)+'\n',
   {flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:batch.status,summary:batch.summary,
   customer_rows_copied:0,d1_writes:0}));
 }catch(e){console.error('PRIVATE_BATCH_REVIEW_REJECTED',e?.message||e);process.exitCode=1}
}
