// INTERNAL STAGING FIXTURE ONLY. Uses two owner-committed novel release
// packages already in this repository; not a current-Publisher snapshot and
// NEVER approved for production use. Generate additive TEST D1 candidate SQL.
// No DB or network access. SQL is reviewed before protected deployment.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const sha=s=>createHash('sha256').update(s).digest('hex');
const quoted=s=>"'"+String(s).replaceAll("'","''")+"'";
const text=s=>String(s??'').trim();
const SRC=[
 ['content/release-packages/20261104-ex-husband-business-client-FIXED-LEXICON-IDS.json',
  's82-ex-husband-business-client','mw-v12-pilot-ex-20261112',
  'mw-v12-pilot-choice-ex','【内部验收】离婚后，前夫公司成了我的客户'],
 ['content/release-packages/20261104-substitute-bride-tears-contract-FIXED-LEXICON-IDS.json',
  's82-substitute-bride-tears-contract','mw-v12-pilot-bride-20261112',
  'mw-v12-pilot-choice-bride','【内部验收】替嫁当天，我撕了婚约']
];
const SOURCE='wordletter-internal-qa-choice-v12-20261112';
const reviewer='INTERNAL_STAGING_QA_NOT_AUTHENTICATED_PUBLISHER';
const senseId='gds_'+sha('wordletter-owned-fixture:choice:n:选择:20261112').slice(0,24);
function analyze(){
 const chosen=[],raws=[];
 for(const [path,expectedBook,pilotBook,cloneWord,title] of SRC){
  const raw=readFileSync(path,'utf8');
  const pkg=JSON.parse(raw);
  assert.equal(pkg?.book?.id,expectedBook,'SOURCE_BOOK_CHANGED');
  assert.equal(pkg?.book?.category,'cet4');
  assert.ok(pkg.version===1&&Array.isArray(pkg.words)&&Array.isArray(pkg.chapters));
  const word=pkg.words.find(x=>x.headword==='choice'&&x.partOfSpeech==='n.'&&
    x.meaningZh==='选择');
  assert.ok(word&&text(word.phoneticUk)&&text(word.phoneticUs)&&
    text(word.exampleEn)&&text(word.exampleZh),'ORIGINAL_CARD_MISSING');
  const ch=pkg.chapters.find(x=>x.number===1);
  assert.ok(ch&&Array.isArray(ch.paragraphs),'CHAPTER_ONE_MISSING');
  const sourcePara=ch.paragraphs.find(p=>Array.isArray(p.segments)&&
    p.segments.some(s=>s.wordId===word.id&&s.gloss==='选择'&&s.surface==='choice'));
  assert.ok(sourcePara,'CHAPTER_CHOICE_CONTEXT_MISSING');
  const segments=sourcePara.segments.map(seg=>seg.wordId===word.id?
    {wordId:cloneWord,surface:'choice',gloss:'选择'}:
    {text:typeof seg.text==='string'?seg.text:String(seg.surface??'')});
  const targetIndices=segments.flatMap((s,i)=>s.wordId===cloneWord?[i]:[]);
  assert.equal(targetIndices.length,1,'NONUNIQUE_CHOICE_IN_CHAPTER');
  const card={legacy_word_id:cloneWord,old_headword:'choice',
   old_uk:word.phoneticUk,old_us:word.phoneticUs,
   old_pos:'n.',old_meaning:'选择',old_en:word.exampleEn,
   old_zh:word.exampleZh,old_collocations:JSON.stringify(word.collocations??[])};
  const cardHash=sha(JSON.stringify([
   card.legacy_word_id,card.old_headword,card.old_uk,card.old_us,
   card.old_pos,card.old_meaning,card.old_en,card.old_zh,card.old_collocations
  ]));
  const body=segments.map(x=>x.text??x.surface).join('');
  assert.ok(body.length>20);
  const original={wordId:word.id,headword:word.headword,
   meaning:word.meaningZh,exampleEn:word.exampleEn,exampleZh:word.exampleZh,
   phoneticUk:word.phoneticUk,phoneticUs:word.phoneticUs};
  chosen.push({bookId:pilotBook,title,chapterId:pilotBook+'-ch01',
   chapterTitle:'【内部验收】'+ch.title,wordId:cloneWord,
   word,card,cardHash,paragraph:{segments},contextSentence:body,
   anchor:'p0:s'+targetIndices[0]});
  raws.push({sourcePath:path,bookId:expectedBook,sourceHash:sha(raw),original});
 }
 assert.deepEqual(raws[0].original,raws[1].original,
  'ORIGINAL_WORDCARD_DIFFERS_BETWEEN_TWO_BOOKS');
 return {chosen,raws};
}
export function compileStagingCrossbookPilot(){
 const {chosen,raws}=analyze();
 const word=chosen[0].word,statements=[];
 const Q=quoted;
 statements.push('-- TEST D1 only. NOT a commercial signed-off sense or live 32-book Publisher snapshot.');
 statements.push('-- This pilot replaces ONE unapproved staging ECDICT candidate choice provenance with a reversible QA-only source.');
 statements.push('CREATE TABLE IF NOT EXISTS v12_internal_pilot_entry_restore ('+
  'entry_id TEXT PRIMARY KEY, original_source_name TEXT NOT NULL,'+
  'original_teaching_ready INTEGER NOT NULL, original_reviewed_at TEXT,'+
  'created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);');
 statements.push('INSERT INTO v12_internal_pilot_entry_restore'+
  ' (entry_id,original_source_name,original_teaching_ready,original_reviewed_at)'+
  " SELECT entry_id,source_name,teaching_ready,reviewed_at FROM global_dictionary_entries"+
  " WHERE headword='choice' COLLATE NOCASE AND teaching_ready=0;");
 statements.push('INSERT INTO global_dictionary_sources'+
  ' (source_key,license_name,license_reviewed,source_sha256,imported_entries,'+
  'imported_forms,imported_at,enabled) VALUES ('+
  [Q(SOURCE),Q('TEST-only owner committed release package + model original note; NOT commercial signoff'),
   1,Q(sha(JSON.stringify(raws))),1,0,'CURRENT_TIMESTAMP',1].join(',')+');');
 statements.push("UPDATE global_dictionary_entries SET source_name="+Q(SOURCE)+
  ",teaching_ready=1,reviewed_at=CURRENT_TIMESTAMP"+
  " WHERE headword='choice' COLLATE NOCASE AND teaching_ready=0;");
 const entrySub="(SELECT entry_id FROM global_dictionary_entries WHERE headword='choice' COLLATE NOCASE)";
 const sense={pos:'n.',meaningZh:'选择',exampleEn:word.exampleEn,exampleZh:word.exampleZh};
 const lessonFields=['entry_id','headword','senses_json','phonetic_uk','phonetic_us',
  'part_of_speech','meaning_zh','example_en','example_zh','collocations_json',
  'reviewed_by','reviewed_at'];
 const lessonValues=[entrySub,Q('choice'),Q(JSON.stringify([sense])),Q(word.phoneticUk),
  Q(word.phoneticUs),Q('n.'),Q('选择'),Q(word.exampleEn),Q(word.exampleZh),
  Q(JSON.stringify(word.collocations??[])),Q(reviewer),'CURRENT_TIMESTAMP'];
 statements.push('INSERT INTO global_dictionary_lessons ('+lessonFields.join(',')+
  ') VALUES ('+lessonValues.join(',')+');');
 statements.push('INSERT INTO global_dictionary_senses'+
  ' (sense_id,entry_id,pos,meaning_zh,example_en,example_zh,reviewed_by,'+
  'reviewed_at,approved,active) VALUES ('+
  [Q(senseId),entrySub,Q('n.'),Q('选择'),Q(word.exampleEn),Q(word.exampleZh),
   Q(reviewer),'CURRENT_TIMESTAMP',1,1].join(',')+');');
 for(const item of chosen){
  const w=item.word;
  statements.push('INSERT INTO books(id,category_id,title,description,cover_key,status,sort_order) VALUES ('+
   [Q(item.bookId),"(SELECT id FROM categories WHERE slug='cet4')",Q(item.title),
    Q('词义级跨书学习的内部测试样本，来源为公开仓库历史小说包；非正式书架版本。'),
    'NULL',Q('published'),-100].join(',')+');');
  statements.push('INSERT INTO chapters (id,book_id,chapter_no,title,content_json,is_preview,published_at) VALUES ('+
   [Q(item.chapterId),Q(item.bookId),1,Q(item.chapterTitle),
    Q(JSON.stringify({paragraphs:[item.paragraph]})),1,'CURRENT_TIMESTAMP'].join(',')+');');
  statements.push('INSERT INTO words(id,headword,phonetic_uk,phonetic_us,part_of_speech,meaning_zh,example_en,example_zh,collocations_json) VALUES ('+
   [Q(item.wordId),Q('choice'),Q(w.phoneticUk),Q(w.phoneticUs),Q('n.'),Q('选择'),
    Q(w.exampleEn),Q(w.exampleZh),Q(item.card.old_collocations)].join(',')+');');
  statements.push('INSERT INTO chapter_words (chapter_id,word_id,context_sentence,context_anchor) VALUES ('+
   [Q(item.chapterId),Q(item.wordId),Q(item.contextSentence),Q(item.anchor)].join(',')+');');
  statements.push('INSERT INTO global_dictionary_legacy_sense_links'+
   ' (legacy_word_id,sense_id,old_card_sha256,reviewed_by,reviewed_at,review_note) VALUES ('+
   [Q(item.wordId),Q(senseId),Q(item.cardHash),Q(reviewer),'CURRENT_TIMESTAMP',
    Q('Internal stage fixture; must never be exported as commercial sense approval')].join(',')+');');
 }
 return {status:'STAGING_SAMPLE_SQL_PREPARED_NOT_EXECUTED',statements,
  sql:statements.join('\n')+'\n',pilotBooks:chosen.map(x=>x.bookId),
  pilotAnchors:chosen.map(x=>({chapterId:x.chapterId,anchor:x.anchor,
   legacyWordId:x.wordId,oldCardSha256:x.cardHash})),senseId,
  expectedPublishedPilotAnchors:2,
  reviewedForCommercialPublication:false,actualLivePublisherBookCount:0,
  sourceArchives:raws.map(x=>({bookId:x.bookId,sourceSha256:x.sourceHash})),
  productionWritesAllowed:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,4,'USAGE_NODE_SCRIPT_OUT_SQL');
  const result=compileStagingCrossbookPilot();
  writeFileSync(process.argv[3],result.sql,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:result.status,pilotBooks:result.pilotBooks.length,
   pilotAnchors:result.pilotAnchors.length,distinctOldIds:2,
   sharedSenseIds:1,commercialApproval:false,remoteWrites:0}));
 }catch(e){console.error('STAGING_PILOT_COMPILER_BLOCKED',e.message);process.exitCode=1}
}
