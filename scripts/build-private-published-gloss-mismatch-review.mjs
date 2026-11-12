// Process only the current published-only 772 contextual-gloss exceptions
// inside a protected runner. Output is PRIVATE and MUST be encrypted before
// uploading; standard output never includes words, book IDs, or chapter text.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const fields=['book_id','chapter_id','context_anchor','legacy_word_id',
 'headword','pos','old_gloss','context_gloss','surface','phonetic_uk',
 'phonetic_us','example_en','example_zh'];
const h=s=>createHash('sha256').update(s).digest('hex');
const id=s=>typeof s==='string'&&s.length>0&&s.length<=200;
const trim=s=>typeof s==='string'?s.trim():'';
const normal=s=>trim(s).normalize('NFKC').replace(/\s+/gu,'');
export function buildPrivatePublishedGlossMismatchQueue(input,{expected=772}={}){
 let payload;
 try{payload=typeof input==='string'?JSON.parse(input):input}
 catch{throw Error('PRIVATE_GLOSS_MISMATCH_INVALID_JSON')}
 const packets=Array.isArray(payload)?payload:[payload];
 assert.ok(packets.length&&packets.every(p=>p?.success!==false),
  'PRIVATE_GLOSS_MISMATCH_QUERY_FAILED');
 const rows=packets.flatMap(p=>p?.results??p?.result?.results??[]);
 assert.ok(Number.isInteger(expected)&&expected>0&&expected<=8444);
 assert.equal(rows.length,expected,'PRIVATE_GLOSS_MISMATCH_REAL_COUNT_DRIFT');
 const seen=new Set(),items=[];
 const counts={gloss_mismatch_positions:rows.length,
  different_after_punctuation_removal:0,form_variant_candidates:0,
  missing_uk_or_us_ipa:0,missing_bilingual_example:0};
 for(const row of rows){
  assert.ok(row&&typeof row==='object'&&!Array.isArray(row)&&
   Object.keys(row).length===fields.length&&
   fields.every(k=>Object.hasOwn(row,k)),'PRIVATE_GLOSS_MISMATCH_EXTRA_FIELDS');
  for(const key of ['book_id','chapter_id','context_anchor','legacy_word_id','headword'])
   assert.ok(id(row[key]),'PRIVATE_GLOSS_MISMATCH_INVALID_SOURCE_ID');
  assert.match(row.context_anchor,/^p(?:0|[1-9]\d*):s(?:0|[1-9]\d*)$/u,
   'PRIVATE_GLOSS_MISMATCH_INVALID_ANCHOR');
  for(const key of ['pos','old_gloss','context_gloss','surface',
   'phonetic_uk','phonetic_us','example_en','example_zh'])
   assert.ok(row[key]===null||typeof row[key]==='string',
    'PRIVATE_GLOSS_MISMATCH_INVALID_LEXICAL_TYPE');
  assert.ok(trim(row.context_gloss)&&trim(row.old_gloss)&&trim(row.surface),
   'PRIVATE_GLOSS_MISMATCH_EMPTY_CONTEXT');
  assert.notEqual(trim(row.context_gloss).replaceAll(' ',''),
   trim(row.old_gloss).replaceAll(' ',''),
   'PRIVATE_GLOSS_MISMATCH_NOT_REAL_DIFFERENCE');
  const key=JSON.stringify([row.book_id,row.chapter_id,row.context_anchor]);
  assert.ok(!seen.has(key),'PRIVATE_GLOSS_MISMATCH_DUPLICATED_LOCATION');
  seen.add(key);
  const old=normal(row.old_gloss),actual=normal(row.context_gloss);
  const stripPunctuation=s=>s.replace(/[，。！？、；：,.!?;:（）()\[\]{}]/gu,'');
  const onlyPunctuation=stripPunctuation(old)===stripPunctuation(actual);
  const looksInflection=trim(row.surface).toLowerCase()!==trim(row.headword).toLowerCase();
  const missingIpa=!trim(row.phonetic_uk)||!trim(row.phonetic_us);
  const missingExample=!trim(row.example_en)||!trim(row.example_zh);
  counts.different_after_punctuation_removal+=Number(!onlyPunctuation);
  counts.form_variant_candidates+=Number(looksInflection);
  counts.missing_uk_or_us_ipa+=Number(missingIpa);
  counts.missing_bilingual_example+=Number(missingExample);
  items.push({
   review_fingerprint_sha256:h(JSON.stringify(fields.map(k=>row[k]))),
   book_id:row.book_id,chapter_id:row.chapter_id,
   context_anchor:row.context_anchor,legacy_word_id:row.legacy_word_id,
   headword:row.headword,pos:row.pos,
   old_card_meaning_zh:row.old_gloss,
   published_context_gloss_zh:row.context_gloss,
   published_surface:row.surface,
   phonetic_uk:row.phonetic_uk,phonetic_us:row.phonetic_us,
   example_en:row.example_en,example_zh:row.example_zh,
   risk_flags:[
    ...(onlyPunctuation?['PUNCTUATION_VARIANT_TO_VERIFY']:['CONTEXT_GLOSS_SEMANTIC_REVIEW']),
    ...(looksInflection?['SURFACE_FORM_DIFFERS_FROM_HEADWORD']:[]),
    ...(missingIpa?['PHONETIC_SOURCE_REVIEW']:[]),
    ...(missingExample?['BILINGUAL_EXAMPLE_REVIEW']:[])
   ],
   editor_action:'HOLD',context_sense_approved:false,
   verified_commercial_rights:false,approved_sense_id:null,
   eligible_for_binding:false,eligible_for_srs_write:false
  });
 }
 return {status:'PRIVATE_PUBLISHED_772_CONTEXT_GLOSS_REVIEW_HOLD',
  published_only:true,expected_real_aggregate_anchored:772,
  private_row_count:items.length,counts,review_rows:items,
  editorial_approvals:0,sense_links_created:0,production_db_writes:0,
  note:'A different gloss is a review target, not proof of a wrong translation. Only authenticated editorial/rights review can approve a sense.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,3,'PRIVATE_GLOSS_MISMATCH_SOURCE_FILE_REQUIRED');
  // Output is deliberately not accepted from stdout; private runner must
  // supply the resulting path via a protected environment variable.
  const target=process.env.PRIVATE_GLOSS_REVIEW_OUTPUT;
  assert.ok(target&&target.startsWith('/'),'PRIVATE_GLOSS_OUTPUT_ABSOLUTE_PATH_REQUIRED');
  const report=buildPrivatePublishedGlossMismatchQueue(readFileSync(process.argv[2],'utf8'));
  writeFileSync(target,JSON.stringify(report),{flag:'wx',mode:0o600});
  console.log('PRIVATE_PUBLISHED_GLOSS_EXCEPTION_AGGREGATE='+JSON.stringify(report.counts));
  console.log('PRIVATE_PUBLISHED_GLOSS_772_HOLD_ONLY_NO_APPROVAL_NO_D1_WRITES');
 }catch(e){console.error('PRIVATE_PUBLISHED_GLOSS_REVIEW_BLOCKED',e.message);process.exitCode=1}
}
