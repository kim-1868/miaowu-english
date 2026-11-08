// Offline, read-only handoff check: Agent V2 -> the current WordLetter website editor.
// Imports the exact runtime package validator. Never uploads, edits novels or contacts D1.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePackage} from '../src/editorial-content.js';
import {auditPackages} from './audit-v11-import-packages.mjs';

const CATEGORIES = new Set(['cet4','cet6','postgrad','ielts']);
const EDITORIAL_WARNINGS = new Set(['MISSING_COLLOCATION','SURFACE_VARIANT_REVIEW','PARALLEL_SENSE_IDS']);
const CORE_FIELDS = ['headword','partOfSpeech','meaningZh'];
const DETAIL_FIELDS = ['phoneticUk','phoneticUs','exampleEn','exampleZh','collocations'];
const normalize = value => String(value??'').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ');
const detail = value => JSON.stringify(value??null);
const issue = (severity,code,source,detailText) => ({severity,code,source,detail:detailText});

export function preflightAgentV2Packages(inputs) {
  if (!Array.isArray(inputs)||inputs.length===0) throw new Error('NO_PACKAGES');
  const issues=[];
  const accepted=[];
  const summaries=[];
  const books=new Map();
  for (const item of inputs) {
    const path=String(item?.path||'<unnamed>');
    const doc=item?.doc;
    let valid=null;
    try { valid=validatePackage(doc); }
    catch (error) { issues.push(issue('P0','EDITORIAL_PACKAGE_INVALID',path,String(error.message))); }
    if (!valid) continue;
    accepted.push({path,doc});
    const {book,chapters,words,mentionCount}=valid;
    summaries.push({path,bookId:book.id,title:book.title,category:book.category,chapters:chapters.length,
      cards:words.length,mentions:mentionCount,previewChapters:chapters.filter(ch=>ch.preview).length});
    if (!CATEGORIES.has(book.category))
      issues.push(issue('P0','UNKNOWN_CATEGORY',path,'category '+book.category+' not one of four sale categories'));
    if (chapters.some(ch=>ch.preview))
      issues.push(issue('P0','UNAPPROVED_FREE_PREVIEW',path,'Default product policy is zero free preview chapters'));
    if (books.has(book.id))
      issues.push(issue('P0','DUPLICATE_BOOK_ID',path,'book.id already used in '+books.get(book.id)));
    else books.set(book.id,path);
  }
  // Audit only packages passing the exact website validator. Invalid files are never normalized
  // or silently repaired, and cannot hide a good package's separate audit result.
  if (accepted.length) {
    try {
      const report=auditPackages(accepted);
      for(const finding of report.issues){
        issues.push(issue(EDITORIAL_WARNINGS.has(finding.type)?'P1':'P0',
          finding.type,finding.package,String(finding.location)+': '+String(finding.detail)));
      }
    } catch(error) {
      issues.push(issue('P0','CROSS_BOOK_AUDIT_FAILED','batch',String(error.message)));
    }
  }
  // The website imports shared word IDs using INSERT OR IGNORE. If two definitions have the
  // same identity but different teaching details, silently ignoring the second is dangerous.
  const sharedIds=new Map();
  for(const {path,doc} of accepted){
    for(const w of doc.words){
      const old=sharedIds.get(w.id);
      if(old){
        if(CORE_FIELDS.every(k=>normalize(old.word[k])===normalize(w[k])) &&
           DETAIL_FIELDS.some(k=>detail(old.word[k])!==detail(w[k]))) {
          issues.push(issue('P1','SHARED_ID_METADATA_REVIEW',path,
            'wordId '+w.id+' has different IPA/example/collocation fields from '+old.path));
        }
      } else sharedIds.set(w.id,{path,word:w});
    }
  }
  const p0=issues.filter(x=>x.severity==='P0').length;
  const p1=issues.filter(x=>x.severity==='P1').length;
  return {
    version:'v11-agent-v2-preflight/1',
    importStructurePass:p0===0,
    editorialReviewRequired:true,
    publicationApproved:false,
    counts:{inputs:inputs.length,validWebsitePackages:accepted.length,p0,p1},
    summaries,issues,
    limitations:[
      'No live D1 check: existing book IDs, shared cards and authorizations remain unverified.',
      'Matching spelling/POS/translation does not prove identical teaching sense.',
      'IPA accuracy, story quality, vocabulary sources and copyright require human review.',
      'This command never changes existing card IDs or reader progress and never publishes.'
    ]
  };
}

export function readAndPreflight(paths){
  const inputs=paths.map(path=>({path,doc:JSON.parse(readFileSync(resolve(path),'utf8'))}));
  return preflightAgentV2Packages(inputs);
}

if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  const args=process.argv.slice(2);
  const paths=args.filter(x=>!x.startsWith('--'));
  const unknown=args.filter(x=>x.startsWith('--')&&!['--strict','--help'].includes(x));
  if(args.includes('--help')) {
    console.log('Usage: node scripts/v11-agent-v2-preflight.mjs [--strict] 出版台导入包.json [more.json ...]');
  } else if(unknown.length||!paths.length) {
    console.error('Provide one or more Agent V2 JSON file paths. Allowed flag: --strict');
    process.exitCode=2;
  } else {
    try {
      const report=readAndPreflight(paths);
      console.log(JSON.stringify(report,null,2));
      if(!report.importStructurePass || args.includes('--strict')&&report.counts.p1>0) process.exitCode=1;
    }catch(error){
      console.error(JSON.stringify({importStructurePass:false,error:String(error.message)}));
      process.exitCode=2;
    }
  }
}
