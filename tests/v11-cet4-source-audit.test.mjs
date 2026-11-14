import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,auditCET4Source} from '../scripts/audit-cet4-source.mjs';

const cols=['涉及考试','首现层级','单词','音标','词性','中文释义','COCA词频frq','BNC词频'];
const one=(labels,tier,word,ipa,pos,meaning,coca,bnc)=>
  [labels,tier,word,ipa,pos,meaning,coca,bnc].map(x=>{
    const s=String(x);return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s
  }).join(',');

test('CSV scanner handles BOM, Chinese exam labels, quotes and embedded newlines',()=>{
  const data='\uFEFF'+cols.join(',')+'\r\n'+
    one('高考,四级','高考','benefit','benifit','n:100','n. 利益；[经] 经济效益',812,656)+'\r\n'+
    one('四级,六级','四级','issue','iʃu:','n:99/v:1','n. 问题, 议题；vt. 发布',248,200)+'\r\n'+
    one('六级','六级','exclusive','','','n. 独占；"测试"',1,1)+'\r\n';
  const matrix=parseCsv(data);
  assert.equal(matrix.length,4);
  assert.equal(matrix[1].length,8);
  const result=auditCET4Source(data);
  assert.equal(result.summary.rowsAll,3);
  assert.equal(result.summary.cet4Rows,2);
  assert.equal(result.summary.cet4UniqueHeadwords,2);
  assert.equal(result.summary.firstTierCET4,1);
  assert.equal(result.summary.firstTierHighSchool,1);
  assert.equal(result.summary.flags.DICTIONARY_TAGS,1);
  assert.equal(result.summary.flags.MULTIPLE_POS_IN_SOURCE,1);
  assert.equal(result.queue[0].headword,'issue');
  assert.equal(result.queue[1].headword,'benefit');
  assert.equal(result.queue.every(r=>r.reviewed===false&&r.publishable===false),true);
});

test('do not hallucinate missing frequency, IPA, POS or meaning from raw fields',()=>{
  const csv=cols.join(',')+'\n'+
    one('四级','四级','missing','','','n. [计] 占位','',16)+'\n';
  const {summary,queue}=auditCET4Source(csv);
  assert.equal(summary.flags.IPA_MISSING,1);
  assert.equal(summary.flags.POS_MISSING,1);
  assert.equal(summary.flags.COCA_RANK_MISSING,1);
  assert.equal(summary.flags.DICTIONARY_TAGS,1);
  assert.equal(queue[0].frequency_source,'BNC');
  assert.equal(queue[0].frequency_rank,16);
  assert.equal(queue[0].raw_ipa_unverified,'');
  assert.equal(queue[0].reviewed,false);
});

test('reject duplicate headwords and impossible field structure rather than losing coverage',()=>{
  const line=one('四级','四级','state','steit','n:100','n. 状态',1,1);
  assert.throws(()=>auditCET4Source(cols.join(',')+'\n'+line+'\n'+line+'\n'),/CET4_DUPLICATE/);
  assert.throws(()=>auditCET4Source(cols.join(',')+'\nfoo,bar\n'),/CSV_COLUMN_COUNT_MISMATCH/);
});

test('new CET-4-only selection never accepts another tier or special tokens as ordinary words',()=>{
  const csv=cols.join(',')+'\n'+
    one('高考','高考','the','ðə','a:100','art. 这',1,1)+'\n'+
    one('四级','四级','P.M.','','','下午','',2)+'\n';
  const r=auditCET4Source(csv);
  assert.equal(r.summary.cet4Rows,1);
  assert.equal(r.summary.flags.SPECIAL_OR_SUSPECT_HEADWORD,1);
  assert.equal(r.queue[0].headword,'P.M.');
  assert.equal(r.queue[0].publishable,false);
});

test('questionable CET4 spellings and outdated dictionary labels stay in a manual-review queue',()=>{
  const data=cols.join(',')+'\n'+
    one('四级','四级','reservior','','','n. 贮水池','','')+'\n'+
    one('四级','四级','negro','/x/','','n. 旧称','',1)+'\n';
  const result=auditCET4Source(data);
  assert.equal(result.summary.flags.MANUAL_SOURCE_EXCEPTION,2);
  assert.equal(result.queue.every(x=>x.reviewed===false&&x.publishable===false),true);
  assert.ok(result.queue.some(x=>x.source_exception_reason==='POSSIBLE_TYPO_RESERVOIR'));
  assert.ok(result.queue.some(x=>x.source_exception_reason==='OUTDATED_HURTFUL_DICTIONARY_LABEL_REVIEW'));
});
