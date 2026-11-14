// Adapt the upstream ECDICT ecdict.csv (English column headers) for the same
// global dictionary A2 staging compiler. Nothing in these rows is teaching
// approved. No audio, third-party examples or customer data are imported.
import {createHash} from 'node:crypto';
import {parseCsv} from './audit-cet4-source.mjs';
import {normalizedLemma} from '../src/global-dictionary-matcher.js';
const SOURCE='ECDICT_UPSTREAM_CSV_UNVERIFIED';
const TAGS=new Map([
 ['cet4','cet4'],['cet6','cet6'],['ky','postgrad'],['gk','gaokao'],
 ['ielts','ielts'],['toefl','toefl']
]);
const colNames=['word','phonetic','translation','pos','tag','exchange'];
const FORM_CODES=new Set(['s','p','d','i','3','r','t']);
const idFor=word=>'gdict_'+createHash('sha256').update(word).digest('hex').slice(0,24);
const compare=(a,b)=>a.localeCompare(b,'en');
export function compileUpstreamEcdictDraftIndex(text){
 const lines=parseCsv(text),header=lines.shift()||[];
 const idx=Object.fromEntries(colNames.map(k=>[k,header.indexOf(k)]));
 for(const [key,n] of Object.entries(idx))if(n<0)
   throw Error('UPSTREAM_SOURCE_COLUMN_MISSING_'+key);
 const entries=[],forms=[],excluded=[],seen=new Set(),pairs=new Set();
 let invalidForms=0,duplicateForms=0;
 const levels={};
 for(const cells of lines){
   if(cells.length!==header.length)throw Error('UPSTREAM_SOURCE_ROW_SIZE_MISMATCH');
   const original=String(cells[idx.word]||'').trim();
   const key=normalizedLemma(original);
   if(!key){
     excluded.push({source_headword:original,reason:'UPSTREAM_HEADWORD_FORMAT_REVIEW'});
     continue;
   }
   if(seen.has(key))throw Error('UPSTREAM_DUPLICATE_HEADWORD_'+key);
   seen.add(key);
   const tags=[...new Set(String(cells[idx.tag]||'')
     .toLowerCase().split(/[\s,;/]+/u).map(v=>TAGS.get(v)).filter(Boolean))].sort();
   for(const tag of tags)levels[tag]=(levels[tag]||0)+1;
   entries.push({entry_id:idFor(key),headword:key,exam_levels:tags,
     source:SOURCE,
     source_ipa_unverified:String(cells[idx.phonetic]||'').trim(),
     source_pos_unverified:String(cells[idx.pos]||'').trim(),
     source_translation_unverified:String(cells[idx.translation]||'').trim(),
     teaching_ready:false,reviewed:false});
   for(const part of String(cells[idx.exchange]||'').split('/')){
     if(!part)continue;
     const colon=part.indexOf(':');
     if(colon<1){invalidForms++;continue}
     const flag=part.slice(0,colon);
     const form=normalizedLemma(part.slice(colon+1));
     if(!FORM_CODES.has(flag)||!form||form.length<2||form===key){
       invalidForms++;continue;
     }
     const identity=form+'\0'+key;
     if(pairs.has(identity)){duplicateForms++;continue}
     pairs.add(identity);
     forms.push({form,headword:key,source:'ECDICT_EXCHANGE',
       reviewed:false,verified:false});
   }
 }
 entries.sort((a,b)=>compare(a.headword,b.headword));
 forms.sort((a,b)=>compare(a.form,b.form)||compare(a.headword,b.headword));
 return {
  status:'UNVERIFIED_UPSTREAM_DICTIONARY_INDEX_NOT_FOR_PUBLICATION',
  stats:{
    sourceRows:lines.length,retainedHeadwords:entries.length,
    excludedHeadwords:excluded.length,candidateForms:forms.length,
    invalidForms,duplicateForms,levels,teachingReady:0
  },
  entries,forms,excluded,
  source_statement:'ECDICT upstream English-header CSV, NOT an independently reviewed teaching dictionary',
  license_note:'ECDICT repo advertises MIT, but verify upstream licensing for content. No external recordings or copyrighted examples included.'
 };
}
