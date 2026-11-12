import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {REAL_PUBLISHED_SELECT,MAX_ROWS,collectPublishedFirstSenseReviewPacket as collect}
 from '../scripts/v12-first-published-sense-review-packet.mjs';
const keys=['book_id','chapter_id','anchor','legacy_word_id','old_headword',
 'old_uk','old_us','old_pos','old_meaning','old_en','old_zh','old_collocations',
 'entry_id','source_name','source_key','license_name','license_reviewed',
 'source_enabled','source_sha256','existing_sense_id','context_word_id','context_gloss'];
const row=(x={})=>({book_id:'real-book-1',chapter_id:'r1',
 anchor:'p0:s0',legacy_word_id:'legacy-1',old_headword:'choice',
 old_uk:'/tʃɔɪs/',old_us:'/tʃɔɪs/',old_pos:'n.',old_meaning:'选择',
 old_en:'She made a careful choice.',old_zh:'她做出了谨慎的选择。',
 old_collocations:'[]',entry_id:'gdict_'+'a'.repeat(24),
 source_name:'unreviewed-lexicon',source_key:'unreviewed-lexicon',
 license_name:'license not yet confirmed',license_reviewed:0,source_enabled:0,
 source_sha256:'f'.repeat(64),existing_sense_id:null,
 context_word_id:'legacy-1',context_gloss:'选择',...x});
const packet=rows=>[{success:true,results:rows}];

test('two actual published different old IDs become ONE strictly held editorial candidate, not an approved sense',()=>{
 const p=collect(packet([row(),row({book_id:'real-book-2',
  chapter_id:'r2',legacy_word_id:'legacy-2',context_word_id:'legacy-2'})]));
 assert.equal(p.complete_groups,1);
 assert.equal(p.selected_groups,1);
 assert.equal(p.crossbook_selected_groups,1);
 assert.equal(p.review_candidates[0].old_word_ids.length,2);
 assert.equal(p.default_hold_decisions[0].action,'hold');
 assert.equal(p.review_candidates[0].review_status,'HOLD_UNTIL_VERIFIED_EDITOR_AND_LICENSE');
 assert.equal(p.actual_approved_senses_created,0);
 assert.equal(p.actual_links_created,0);
 assert.equal(p.database_writes,0);
 assert.equal(p.source_rights_verified_by_this_script,false);
 assert.equal(p.review_candidates[0].license_reviewed,false);
 assert.ok(/^[a-f0-9]{64}$/.test(p.review_candidates[0].candidate_hash_sha256));
});

test('QA source/books, missing entry, bad contextual wordId and incomplete cards fail closed',()=>{
 const p=collect(packet([
  row({book_id:'mw-v12-pilot-ex-20261112'}),
  row({source_name:'wordletter-internal-qa-choice-v12-20261112'}),
  row({entry_id:null}),
  row({context_word_id:'different'}),
  row({old_en:''}),
  row({book_id:'real-book-2',legacy_word_id:'legacy-2',
   context_word_id:'legacy-2'})
 ]));
 assert.equal(p.selected_groups,1);
 assert.equal(p.blocked.qa_source_or_book,2);
 assert.equal(p.blocked.missing_dictionary_entry,1);
 assert.equal(p.blocked.invalid_context,1);
 assert.equal(p.blocked.incomplete_old_card,1);
 assert.equal(p.crossbook_selected_groups,0);
});

test('reject unexpected columns, database error, duplicate anchors and over-limit result',()=>{
 assert.throws(()=>collect(packet([row({user_id:'private'})])),/UNEXPECTED_COLUMNS/);
 assert.throws(()=>collect([{success:false,results:[]}]),/SELECT_FAILED/);
 assert.throws(()=>collect(packet([row(),row()])),/DUPLICATE_ANCHOR/);
 assert.throws(()=>collect(packet(Array.from({length:MAX_ROWS+1},(_,i)=>row({
  chapter_id:'r'+i,context_word_id:'legacy-1'
 })))),/LIMIT_EXCEEDED/);
});

test('fixed SQL selects exact published content and leaves unreviewed candidate as HOLD',()=>{
 assert.match(REAL_PUBLISHED_SELECT,/b\.status='published'/);
 assert.match(REAL_PUBLISHED_SELECT,/ch\.published_at IS NOT NULL/);
 assert.match(REAL_PUBLISHED_SELECT,/context_word_id/);
 assert.match(REAL_PUBLISHED_SELECT,/context_gloss/);
 assert.match(REAL_PUBLISHED_SELECT,/b\.id NOT LIKE 'mw-v12-pilot-%'/);
 assert.match(REAL_PUBLISHED_SELECT,/link\.sense_id IS NULL/);
 assert.doesNotMatch(REAL_PUBLISHED_SELECT,/\b(?:UPDATE|DELETE|INSERT|DROP|ALTER)\b/i);
 const db=new DatabaseSync(':memory:');
 try {
  db.exec("CREATE TABLE books(id TEXT,status TEXT);"+
   "CREATE TABLE chapters(id TEXT,book_id TEXT,published_at TEXT,content_json TEXT);"+
   "CREATE TABLE words(id TEXT,headword TEXT,phonetic_uk TEXT,phonetic_us TEXT,"+
    "part_of_speech TEXT,meaning_zh TEXT,example_en TEXT,example_zh TEXT,collocations_json TEXT);"+
   "CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT,context_anchor TEXT);"+
   "CREATE TABLE global_dictionary_entries(entry_id TEXT,headword TEXT,source_name TEXT);"+
   "CREATE TABLE global_dictionary_sources(source_key TEXT,license_name TEXT,"+
    "license_reviewed INTEGER,enabled INTEGER,source_sha256 TEXT);"+
   "CREATE TABLE global_dictionary_legacy_sense_links(legacy_word_id TEXT,sense_id TEXT);");
  db.prepare('INSERT INTO global_dictionary_entries VALUES(?,?,?)')
   .run('gdict_'+'a'.repeat(24),'choice','unreviewed-lexicon');
  db.prepare('INSERT INTO global_dictionary_sources VALUES(?,?,?,?,?)')
   .run('unreviewed-lexicon','unreviewed',0,0,'f'.repeat(64));
  for(let i=1;i<=2;i++){
   const id='real-book-'+i,chapter='r'+i,word='legacy-'+i;
   db.prepare("INSERT INTO books VALUES(?, 'published')").run(id);
   db.prepare("INSERT INTO chapters VALUES(?,?,CURRENT_TIMESTAMP,?)")
    .run(chapter,id,JSON.stringify({paragraphs:[{segments:[{wordId:word,
      surface:'choice',gloss:'选择'}]}]}));
   db.prepare("INSERT INTO words VALUES(?,?,?,?,?,?,?,?,?)")
    .run(word,'choice','/tʃɔɪs/','/tʃɔɪs/','n.','选择',
      'She made a careful choice.','她做出了谨慎的选择。','[]');
   db.prepare('INSERT INTO chapter_words VALUES(?,?,?)').run(chapter,word,'p0:s0');
  }
  const got=db.prepare(REAL_PUBLISHED_SELECT).all();
  assert.deepEqual(Object.keys(got[0]).sort(),[...keys].sort());
  assert.equal(collect(packet(got)).crossbook_selected_groups,1);
 }finally{db.close()}
});
test('protected workflow never sends plaintext lexical or customer data to artifact/logs',()=>{
 const wf=readFileSync('.github/workflows/v12-first-nonqa-published-sense-review.yml','utf8');
 assert.match(wf,/staging-d1-schema-approval/);
 assert.match(wf,/CLOUDFLARE_STAGING_D1_READ_TOKEN/);
 assert.match(wf,/STAGING_D1_BACKUP_PASSPHRASE/);
 assert.match(wf,/wordletter-first-real-published-review-encrypted/);
 assert.match(wf,/gpg --batch/);
 assert.match(wf,/actions\/upload-artifact@v4/);
 assert.doesNotMatch(wf,/CLOUDFLARE_STAGING_D1_WRITE_TOKEN|CLOUDFLARE_PROD|wrangler deploy|d1 migrations apply/i);
});
