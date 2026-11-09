// Read-only audit of the owner's merged ECDICT exam lexicon.
// This is a source-quality scan, NOT a certification of the live wordbook.
// Usage: node scripts/audit-cet4-source.mjs "考试词表_合并版_原始.csv" --out /tmp/cet4-audit
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const TECH=/\[[^\]]{1,12}\]/u;
const SAFE=/^[A-Za-z][A-Za-z'-]*$/;

export function parseCsv(text){
  const input=String(text||'').replace(/^\uFEFF/,'');
  const rows=[],cells=[];let field='',quoted=false;
  const add=()=>{cells.push(field);field=''};
  const end=()=>{add();if(cells.some(s=>s!==''))rows.push(cells.splice(0));else cells.length=0};
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(ch==='"'){
      if(quoted&&input[i+1]==='"'){field+='"';i++}
      else quoted=!quoted;
    }else if(ch===','&&!quoted)add();
    else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&input[i+1]==='\n')i++;
      end();
    }else field+=ch;
  }
  if(quoted)throw Error('UNCLOSED_QUOTED_FIELD');
  if(field||cells.length)end();
  return rows;
}
export function auditCET4Source(text){
  const bytes=String(text||''),matrix=parseCsv(bytes);
  const header=matrix.shift()||[];
  const required=['涉及考试','首现层级','单词','音标','词性','中文释义','COCA词频frq','BNC词频'];
  const ix=Object.fromEntries(required.map(k=>[k,header.indexOf(k)]));
  for(const key of required)if(ix[key]<0)throw Error('MISSING_CSV_COLUMN_'+key);
  const stats={rowsAll:0,cet4Rows:0,cet4UniqueHeadwords:0,
    firstTierCET4:0,firstTierHighSchool:0,
    flaggedHeadwords:0,flags:{IPA_MISSING:0,POS_MISSING:0,
      DICTIONARY_TAGS:0,MULTIPLE_POS_IN_SOURCE:0,MULTIPLE_SENSES_IN_SOURCE:0,
      COCA_RANK_MISSING:0,BNC_RANK_MISSING:0,SPECIAL_OR_SUSPECT_HEADWORD:0}};
  const seen=new Set(),queue=[];
  const trimmed=(r,k)=>String(r[ix[k]]||'').trim();
  const rank=s=>/^[1-9]\d*$/.test(s)?Number(s):null;
  for(const cells of matrix){
    if(cells.length!==header.length)throw Error('CSV_COLUMN_COUNT_MISMATCH');
    stats.rowsAll++;
    const labels=trimmed(cells,'涉及考试').split(/[,，]/u).map(x=>x.trim());
    if(!labels.includes('四级'))continue;
    stats.cet4Rows++;
    const word=trimmed(cells,'单词'),key=word.toLocaleLowerCase('en');
    if(!word||seen.has(key))throw Error('CET4_DUPLICATE_OR_EMPTY_HEADWORD_'+word);
    seen.add(key);
    const pos=trimmed(cells,'词性'),ipa=trimmed(cells,'音标');
    const meaning=trimmed(cells,'中文释义'),first=trimmed(cells,'首现层级');
    const coca=rank(trimmed(cells,'COCA词频frq'));
    const bnc=rank(trimmed(cells,'BNC词频'));
    const flags=[];
    if(!ipa)flags.push('IPA_MISSING');
    if(!pos)flags.push('POS_MISSING');
    if(TECH.test(meaning))flags.push('DICTIONARY_TAGS');
    if(pos.includes('/'))flags.push('MULTIPLE_POS_IN_SOURCE');
    if(meaning.includes('；'))flags.push('MULTIPLE_SENSES_IN_SOURCE');
    if(coca===null)flags.push('COCA_RANK_MISSING');
    if(bnc===null)flags.push('BNC_RANK_MISSING');
    if(!SAFE.test(word))flags.push('SPECIAL_OR_SUSPECT_HEADWORD');
    if(first==='四级')stats.firstTierCET4++;
    else if(first==='高考')stats.firstTierHighSchool++;
    flags.forEach(f=>{stats.flags[f]++});
    if(flags.length)stats.flaggedHeadwords++;
    queue.push({
      headword:word,first_tier:first,source_labels:labels,
      frequency_source:coca!==null?'COCA':bnc!==null?'BNC':null,
      frequency_rank:coca??bnc,
      raw_ipa_unverified:ipa,raw_pos_unverified:pos,
      raw_meaning_unverified:meaning,source_flags:flags,
      reviewed:false,publishable:false
    });
  }
  stats.cet4UniqueHeadwords=seen.size;
  queue.sort((a,b)=>Number(a.first_tier!=='四级')-Number(b.first_tier!=='四级')||
    (a.frequency_rank??Infinity)-(b.frequency_rank??Infinity)||
    a.headword.localeCompare(b.headword,'en'));
  return {summary:{
    corpus:'Owner ECDICT exam-tag compilation, NOT official CET4 syllabus',
    sha256:createHash('sha256').update(bytes).digest('hex'),
    ...stats,
    confirmedCommerciallyApproved:0,
    warning:'Raw IPA/meanings are unverified and no independent bilingual examples exist in the CSV; never bulk auto-approve.'
  },queue};
}

const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const filename=process.argv[2],at=process.argv.indexOf('--out'),target=at>=0?process.argv[at+1]:null;
  if(!filename||filename.startsWith('-')||(at>=0&&!target)){
    console.error('Usage: node scripts/audit-cet4-source.mjs <source.csv> [--out output-directory]');
    process.exitCode=2;
  }else try{
    const result=auditCET4Source(readFileSync(resolve(filename),'utf8'));
    console.log(JSON.stringify(result.summary,null,2));
    if(target){
      const dir=resolve(target);mkdirSync(dir,{recursive:true});
      writeFileSync(join(dir,'cet4-source-audit.json'),JSON.stringify(result.summary,null,2)+'\n');
      writeFileSync(join(dir,'cet4-source-review-queue.jsonl'),
        result.queue.map(row=>JSON.stringify(row)).join('\n')+'\n');
    }
  }catch(err){console.error('CET4_AUDIT_FAILED:',err?.message||err);process.exitCode=1}
}
