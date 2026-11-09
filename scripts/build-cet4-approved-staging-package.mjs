// Offline compiler for personally signed-off CET4 cards ONLY.
// Produces a candidate SQL file for a BACKED-UP STAGING D1; it never opens D1.
// NEVER execute this against production without a separate owner release approval.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSmartWordCard} from '../src/smart-vocab-card-quality.js';

const EXPECTED_CET4_HEADWORDS=3849;
const sqlString=v=>"'"+String(v??'').replaceAll("'","''")+"'";
const content=u=>u==null?'NULL':sqlString(u);
function submitted(card){
  const signed=card.reviewed===true&&
    /^[\p{L}\p{N} ._-]{2,80}$/u.test(String(card.editorial_approved_by||''))&&
    /^\d{4}-\d{2}-\d{2}$/.test(String(card.editorial_approved_at||''))&&
    card.ipa_verified===true&&card.example_reviewed===true&&
    card.meaning_reviewed===true;
  return signed&&auditSmartWordCard(card).commerciallyApproved;
}
export function compileCET4SignedOffSQL(cards,options={}){
  if(!Array.isArray(cards)||!cards.length)throw Error('EMPTY_CET4_CARDS');
  const partial=options.previewOnly===true;
  const ids=new Set(),headwords=new Set();
  for(const card of cards){
    if(card.category_slug!=='cet4')throw Error('MIXED_EXAM_CARD_'+card.word_id);
    if(!submitted(card))throw Error('EDITORIAL_APPROVAL_REQUIRED_'+card.word_id);
    const id=String(card.word_id);
    const headword=String(card.headword).toLowerCase().trim();
    if(ids.has(id))throw Error('DUPLICATE_WORD_ID_'+id);
    ids.add(id);headwords.add(headword);
    const source=String(card.frequency_source).toUpperCase();
    if(source==='UNRANKED'){
      if(card.frequency_rank!=null||card.frequency_available===true||
         card.frequency_available===1)throw Error('FAKE_UNRANKED_FREQUENCY_'+id);
    }else if(!Number.isSafeInteger(card.frequency_rank)||card.frequency_rank<=0)
      throw Error('INVALID_FREQUENCY_RANK_'+id);
  }
  if(!partial&&headwords.size<EXPECTED_CET4_HEADWORDS)
    throw Error('CET4_NOT_COMPLETE_'+headwords.size+'_OF_'+EXPECTED_CET4_HEADWORDS);
  const statements=[
    '-- STAGING D1 CANDIDATE ONLY. Owner approval and verified backup required.',
    '-- All cards must have independent editorial / phonetics / example approval.',
    '-- No user_words, review_events, entitlements or novel chapter rows are modified.',
    'BEGIN TRANSACTION;',
    'INSERT INTO smart_vocab_levels(category_id,expected_headwords,catalog_verified_at,enabled) '+
      "VALUES((SELECT id FROM categories WHERE slug='cet4'),"+EXPECTED_CET4_HEADWORDS+
      ",NULL,0) ON CONFLICT(category_id) DO NOTHING;"
  ];
  for(const c of cards){
    const values=[
      sqlString(c.word_id),sqlString(c.headword),content(c.phonetic_uk||null),
      content(c.phonetic_us||null),sqlString(c.part_of_speech),
      sqlString(c.meaning_zh),sqlString(c.example_en),sqlString(c.example_zh),
      sqlString(JSON.stringify(c.collocations||[]))
    ];
    // Deliberately do not overwrite existing novel words. A collision
    // aborts this transaction and must be resolved by editorial review.
    statements.push(
      'INSERT INTO words(id,headword,phonetic_uk,phonetic_us,part_of_speech,'+
      'meaning_zh,example_en,example_zh,collocations_json) VALUES('+
      values.join(',')+');'
    );
    const verified=String(c.frequency_source).toUpperCase()==='UNRANKED'?0:1;
    const rank=verified?String(c.frequency_rank):'NULL';
    statements.push(
      'INSERT INTO smart_vocab_catalog(category_id,word_id,frequency_rank,'+
      'frequency_source,frequency_verified,reviewed) VALUES('+
      "(SELECT id FROM categories WHERE slug='cet4'),"+
      [sqlString(c.word_id),rank,sqlString(c.frequency_source),String(verified),'1'].join(',')+');'
    );
  }
  statements.push('COMMIT;');
  statements.push('-- Still NOT ENABLED. Separate owner acceptance required to set enabled=1 and catalog_verified_at.');
  return {sql:statements.join('\n')+'\n',cards:cards.length,
    distinctHeadwords:headwords.size,
    expectedHeadwords:EXPECTED_CET4_HEADWORDS,
    previewOnly:partial,enabled:false};
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  const input=process.argv[2];
  const at=process.argv.indexOf('--out');
  const output=at>=0?process.argv[at+1]:null;
  if(!input||input.startsWith('-')||!output||output.startsWith('-')){
    console.error('Usage: node scripts/build-cet4-approved-staging-package.mjs '+
      '<editorially-approved-cards.jsonl> --out <candidate.sql> [--preview-only]');
    process.exitCode=2;
  }else try{
    const cards=readFileSync(resolve(input),'utf8').split(/\r?\n/u)
      .filter(x=>x.trim()).map(JSON.parse);
    const result=compileCET4SignedOffSQL(cards,{
      previewOnly:process.argv.includes('--preview-only')
    });
    writeFileSync(resolve(output),result.sql);
    console.log(JSON.stringify({status:'STAGING_SQL_PREPARED_NOT_EXECUTED',
      cards:result.cards,distinctHeadwords:result.distinctHeadwords,
      expectedHeadwords:result.expectedHeadwords,previewOnly:result.previewOnly,
      enabled:false},null,2));
  }catch(e){console.error('CET4_STAGING_PACKAGE_BLOCKED:',e?.message||e);process.exitCode=1}
}
