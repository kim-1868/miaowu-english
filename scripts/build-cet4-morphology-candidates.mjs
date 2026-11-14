// Read-only candidate matcher for the owner's ECDICT-based merged exam list.
// It does NOT modify a novel, a live word ID, a customer state or any D1.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCsv} from './audit-cet4-source.mjs';

const INFLECTIONS=new Set(['s','p','d','i','3','r','t']);
const FORM=/^[a-z][a-z'-]{1,40}$/;
const fold=x=>String(x||'').normalize('NFKC').trim().toLocaleLowerCase('en-US');

export function buildCET4MorphologyCandidates(text){
 const matrix=parseCsv(text);
 const header=matrix.shift()||[];
 const idx=Object.fromEntries(['单词','涉及考试','词形变化']
   .map(key=>[key,header.indexOf(key)]));
 for(const [key,index] of Object.entries(idx))
   if(index===-1)throw Error('MISSING_COLUMN_'+key);
 const canonical=new Map(),roots=new Map(),cet4=new Set();
 for(const row of matrix){
   if(row.length!==header.length)throw Error('CSV_COLUMN_COUNT_MISMATCH');
   const lemma=fold(row[idx['单词']]);
   if(!lemma)continue;
   if(canonical.has(lemma))throw Error('DUPLICATE_HEADWORD_'+lemma);
   const target=String(row[idx['涉及考试']]||'')
     .split(/[,，]/u).map(x=>x.trim()).includes('四级');
   canonical.set(lemma,{target,exchange:String(row[idx['词形变化']]||'').trim()});
   if(target)cet4.add(lemma);
 }
 const proposals=new Map(),counts={
   sourceHeadwords:canonical.size,cet4Headwords:cet4.size,
   cet4WithExchange:0,excludedInvalidOrUnsupported:0,
   totalUniquePotentialCET4Forms:0,nonConflictingCET4CandidateForms:0,
   needsReviewCET4CandidateForms:0
 };
 for(const [lemma,row] of canonical){
   if(row.target&&row.exchange)counts.cet4WithExchange++;
   for(const token of row.exchange.split('/')){
     const colon=token.indexOf(':');
     if(colon<1){if(token.trim())counts.excludedInvalidOrUnsupported++;continue}
     const code=token.slice(0,colon).trim(),form=fold(token.slice(colon+1));
     if(!INFLECTIONS.has(code)||!FORM.test(form)||form===lemma){
       counts.excludedInvalidOrUnsupported++;continue;
     }
     if(!proposals.has(form))proposals.set(form,new Set());
     proposals.get(form).add(lemma);
   }
 }
 const candidates=[],needsReview=[];
 for(const [form,lemmas] of proposals){
   const all=[...lemmas].sort();
   const cet=all.filter(x=>cet4.has(x));
   if(!cet.length)continue;
   counts.totalUniquePotentialCET4Forms++;
   const canonicalCollision=canonical.has(form);
   const ambiguous=lemmas.size>1||canonicalCollision;
   if(ambiguous){
     needsReview.push({form,cet4Targets:cet,
       allSourceTargets:all,
       reason:canonicalCollision?'ALSO_A_DICTIONARY_HEADWORD':'MULTIPLE_POSSIBLE_LEMMAS'});
   }else{
     // These are lookup *candidates* only: sentence-level verification
     // is mandatory before permanently linking a word in a novel.
     candidates.push({form,headword:cet[0],status:'NEEDS_CONTEXT_VALIDATION'});
   }
 }
 candidates.sort((a,b)=>a.form.localeCompare(b.form,'en'));
 needsReview.sort((a,b)=>a.form.localeCompare(b.form,'en'));
 counts.nonConflictingCET4CandidateForms=candidates.length;
 counts.needsReviewCET4CandidateForms=needsReview.length;
 return {status:'OFFLINE_ONLY_DO_NOT_AUTOLINK',
   counts,source:'owner ECDICT-based merged exam CSV',
   safety:'Exact verified headword lookup first; any ambiguity or a valid independent headword requires contextual editorial review. No changes to word IDs or customer histories.',
   candidates,needsReview};
}
const called=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(called){
 const file=process.argv[2],at=process.argv.indexOf('--out'),dir=at>=0?process.argv[at+1]:null;
 if(!file||file.startsWith('-')||(at>=0&&!dir)){
   console.error('Usage: node scripts/build-cet4-morphology-candidates.mjs <owner-exam.csv> [--out directory]');
   process.exitCode=2;
 }else try{
   const r=buildCET4MorphologyCandidates(readFileSync(resolve(file),'utf8'));
   console.log(JSON.stringify({status:r.status,...r.counts,notes:r.safety},null,2));
   if(dir){
     mkdirSync(resolve(dir),{recursive:true});
     writeFileSync(join(resolve(dir),'cet4-form-candidates.jsonl'),
       r.candidates.map(x=>JSON.stringify(x)).join('\n')+'\n');
     writeFileSync(join(resolve(dir),'cet4-form-ambiguous-review.jsonl'),
       r.needsReview.map(x=>JSON.stringify(x)).join('\n')+'\n');
   }
 }catch(e){
   console.error('CET4_INFLECTION_AUDIT_FAILED:',String(e.message||e));
   process.exitCode=1;
 }
}
