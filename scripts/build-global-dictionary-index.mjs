// Offline-only converter for the owner's ECDICT-derived merged exam CSV.
// Produces a DRAFT lookup dataset, NEVER a commercially approved wordcard.
// The original CSV stays outside Git; no DB / network writes occur here.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseCsv} from './audit-cet4-source.mjs';
import {normalizedLemma} from '../src/global-dictionary-matcher.js';

const COLUMNS=['单词','涉及考试','音标','词性','中文释义','词形变化'];
const MAP=new Map([
 ['高考','gaokao'],['高中','gaokao'],['四级','cet4'],['六级','cet6'],
 ['考研','postgrad'],['雅思','ielts'],['托福','toefl']
]);
const APPROVED_FORM_CODES=new Set(['s','p','d','i','3','r','t']);
const normalize=v=>String(v??'').trim();
const idFor=word=>'gdict_'+createHash('sha256').update(word).digest('hex').slice(0,24);
export function compileDictionaryDraftIndex(input){
 const all=parseCsv(input);
 const header=all.shift()||[];
 const columns=Object.fromEntries(COLUMNS.map(key=>[key,header.indexOf(key)]));
 for(const [key,idx] of Object.entries(columns))
   if(idx<0)throw Error('MISSING_DICTIONARY_SOURCE_COLUMN_'+key);
 const entries=[],forms=[],excluded=[],seen=new Set(),formSeen=new Set();
 const stats={sourceRows:0,retainedHeadwords:0,excludedHeadwords:0,
   candidateForms:0,withExchange:0,duplicateFormRows:0,
   sourceTokenWarnings:0,teachingReady:0,levels:{}};
 for(const row of all){
   if(row.length!==header.length)throw Error('SOURCE_FIELD_COUNT_MISMATCH');
   stats.sourceRows++;
   const original=normalize(row[columns['单词']]);
   const lemma=normalizedLemma(original);
   if(!lemma){
     excluded.push({source_headword:original,reason:'NEEDS_HEADWORD_FORMAT_REVIEW'});
     continue;
   }
   if(seen.has(lemma))throw Error('SOURCE_DUPLICATE_NORMALIZED_HEADWORD_'+lemma);
   seen.add(lemma);
   const levels=[...new Set(normalize(row[columns['涉及考试']])
     .split(/[,，]/u).map(v=>MAP.get(v.trim())).filter(Boolean))].sort();
   for(const level of levels)stats.levels[level]=(stats.levels[level]??0)+1;
   const exchange=normalize(row[columns['词形变化']]);
   if(exchange)stats.withExchange++;
   entries.push({
     entry_id:idFor(lemma),headword:lemma,
     exam_levels:levels,source:'ECDICT_DERIVED_OWNER_CSV',
     // These fields remain UNVERIFIED provenance, never final lesson content.
     source_pos_unverified:normalize(row[columns['词性']]),
     source_ipa_unverified:normalize(row[columns['音标']]),
     source_translation_unverified:normalize(row[columns['中文释义']]),
     teaching_ready:false,reviewed:false
   });
   for(const section of exchange.split('/')){
     if(!section)continue;
     const colon=section.indexOf(':');
     if(colon<1){stats.sourceTokenWarnings++;continue}
     const code=section.slice(0,colon),form=normalizedLemma(section.slice(colon+1));
     if(!APPROVED_FORM_CODES.has(code)||!form||form.length<2||form===lemma){
       stats.sourceTokenWarnings++;continue;
     }
     const signature=form+'\u0000'+lemma;
     if(formSeen.has(signature)){stats.duplicateFormRows++;continue}
     formSeen.add(signature);
     forms.push({form,headword:lemma,source:'ECDICT_EXCHANGE',
       reviewed:false,verified:false});
   }
 }
 entries.sort((a,b)=>a.headword.localeCompare(b.headword,'en'));
 forms.sort((a,b)=>a.form.localeCompare(b.form,'en')||
   a.headword.localeCompare(b.headword,'en'));
 stats.retainedHeadwords=entries.length;
 stats.excludedHeadwords=excluded.length;
 stats.candidateForms=forms.length;
 return {status:'UNVERIFIED_DRAFT_DICTIONARY_INDEX_NOT_FOR_PUBLICATION',
   stats,entries,forms,excluded,
   license_note:'ECDICT repo states MIT, subject to upstream data provenance review. Do NOT automatically publish external examples, IPA recordings or translations.',
   source_statement:'User-provided derived CSV; this converter performs no online fetch.'};
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const source=process.argv[2],at=process.argv.indexOf('--out');
 const directory=at>=0?process.argv[at+1]:null;
 if(!source||!directory||source.startsWith('-')||directory.startsWith('-')){
   console.error('Usage: node scripts/build-global-dictionary-index.mjs <owner-ECDICT-derived.csv> --out <directory>');
   process.exitCode=2;
 }else try{
   const r=compileDictionaryDraftIndex(readFileSync(resolve(source),'utf8'));
   const d=resolve(directory);mkdirSync(d,{recursive:true});
   for(const [filename,items] of [
     ['dictionary-draft-entries.jsonl',r.entries],
     ['dictionary-unverified-forms.jsonl',r.forms],
     ['dictionary-headword-format-review.jsonl',r.excluded]
   ])writeFileSync(join(d,filename),items.map(x=>JSON.stringify(x)).join('\n')+'\n');
   writeFileSync(join(d,'dictionary-index-audit.json'),
     JSON.stringify({status:r.status,stats:r.stats,license_note:r.license_note},null,2)+'\n');
   console.log(JSON.stringify({status:r.status,stats:r.stats},null,2));
 }catch(e){console.error('DICTIONARY_INDEX_BLOCKED:',String(e?.message||e));process.exitCode=1}
}
