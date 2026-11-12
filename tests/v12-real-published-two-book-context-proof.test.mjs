import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {chooseFirstRealPublishedCrossbookPair as choose,
 verifyActualPublishedTwoBookContext as verify}
 from '../scripts/v12-real-published-two-book-context-proof.mjs';
const full={headword:'choice',pos:'n.',meaning_zh:'选择',
 book_ids:['real-a','real-b'],legacy_word_ids:['old-a','old-b'],
 occurrences:30,card_evidence:[
 {book_id:'real-a',old_word_id:'old-a',occurrences:17,
  phonetic_uk:'/tʃɔɪs/',phonetic_us:'/tʃɔɪs/',
  example_en:'She made a careful choice.',example_zh:'她做了一个谨慎的选择。'},
 {book_id:'real-b',old_word_id:'old-b',occurrences:13,
  phonetic_uk:'/tʃɔɪs/',phonetic_us:'/tʃɔɪs/',
  example_en:'She made a careful choice.',example_zh:'她做了一个谨慎的选择。'}],
 editor_decision:'HOLD',approved_sense_id:null,auto_merge_allowed:false,
 production_writes_allowed:false};
function queue(){
 return {status:'PRIVATE_PUBLISHED_EDITORIAL_CANDIDATES_UNAPPROVED',
  all_records_private:true,created_approvals:0,production_writes:0,
  counts:{published_books:32,published_anchor_occurrences:8444,
   distinct_old_word_ids:3433,distinct_headwords:1585,
   textual_sense_candidates:1981,duplicate_textual_sense_groups:532,
   duplicate_excess_old_ids:1452},
  duplicate_review_queue:[full,...Array.from({length:531},(_,i)=>({
   ...structuredClone(full),headword:'testlemma'+i,
   book_ids:['only-'+i],legacy_word_ids:['a-'+i,'b-'+i],
   card_evidence:[{...full.card_evidence[0],book_id:'only-'+i,old_word_id:'a-'+i},
    {...full.card_evidence[1],book_id:'only-'+i,old_word_id:'b-'+i}]
  }))],other_candidate_groups:[]};
}
function db(){
 const d=new DatabaseSync(':memory:');
 d.exec("CREATE TABLE books(id TEXT,category_id TEXT,title TEXT,status TEXT);"+
 "CREATE TABLE chapters(id TEXT,book_id TEXT,chapter_no INTEGER,title TEXT,"+
 "content_json TEXT,published_at TEXT);"+
 "CREATE TABLE words(id TEXT,headword TEXT,phonetic_uk TEXT,phonetic_us TEXT,"+
 "part_of_speech TEXT,meaning_zh TEXT,example_en TEXT,example_zh TEXT,collocations_json TEXT);"+
 "CREATE TABLE chapter_words(chapter_id TEXT,word_id TEXT,context_anchor TEXT);");
 for(const [i,id,old] of [[1,'real-a','old-a'],[2,'real-b','old-b']]){
  d.prepare("INSERT INTO books VALUES(?, 'cet4',?, 'published')").run(id,'book'+i);
  d.prepare('INSERT INTO chapters VALUES(?,?,1,?, ?,CURRENT_TIMESTAMP)')
   .run('ch'+i,id,'chapter'+i,JSON.stringify({paragraphs:[{
    segments:[{text:'Context '},{wordId:old,surface:'choice',gloss:'选择'}]
   }]}));
  d.prepare('INSERT INTO words VALUES(?,?,?,?,?,?,?,?,?)')
   .run(old,'choice','/tʃɔɪs/','/tʃɔɪs/','n.','选择',
    'She made a careful choice.','她做了一个谨慎的选择。','[]');
  d.prepare('INSERT INTO chapter_words VALUES(?,?,?)').run('ch'+i,old,'p0:s1');
 }
 return d;
}
test('real published 32-book metadata selects two distinct books/old cards and exact encrypted-only proposal',()=>{
 const x=choose(queue());
 assert.equal(x.status,'PRIVATE_REAL_PRODUCTION_READONLY_SELECT_PREPARED');
 assert.equal(x.scope_books,2);
 assert.equal(x.selected.paired_cards.length,2);
 assert.notEqual(x.selected.paired_cards[0].book_id,x.selected.paired_cards[1].book_id);
 assert.notEqual(x.selected.paired_cards[0].old_word_id,x.selected.paired_cards[1].old_word_id);
 assert.match(x.sql,/b\.status='published'/);
 assert.match(x.sql,/json_valid\(ch\.content_json\)=1/);
 assert.doesNotMatch(x.sql,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE INTO)\b/i);
 assert.ok(!x.sql.includes('SELECT *'));
 const d=db();
 try{
  const rows=d.prepare(x.sql).all();
  assert.equal(rows.length,2);
  const v=verify(x,[{success:true,results:rows}]);
  assert.equal(v.verified_actual_published_contexts.length,2);
  assert.equal(v.status,'REAL_PUBLISHED_CONTEXT_EVIDENCE_ONLY_NOT_APPROVED');
  assert.equal(v.commercial_license_verified,false);
  assert.equal(v.production_writes,0);
  assert.equal(v.staging_writes,0);
  for(const r of v.verified_actual_published_contexts)
   assert.match(r.old_card_sha256,/^[0-9a-f]{64}$/u);
 }finally{d.close()}
});
test('production snippet must exactly match old word id, meaning and source card, else HOLD',()=>{
 const x=choose(queue()),d=db();
 try{
  let rows=d.prepare(x.sql).all();
  rows[0].segment_gloss='错误';
  assert.throws(()=>verify(x,[{success:true,results:rows}]));
  rows=d.prepare(x.sql).all();
  rows[0].old_us='forged';
  assert.throws(()=>verify(x,[{success:true,results:rows}]),/OLD_CARD_DRIFT/);
  rows=d.prepare(x.sql).all();
  rows[0].paragraph_json='{"segments":[]}';
  assert.throws(()=>verify(x,[{success:true,results:rows}]),/PARAGRAPH_NOT_VALID/);
  d.prepare("UPDATE chapters SET content_json='{}' WHERE id='ch1'").run();
  assert.equal(d.prepare(x.sql).all().length,1);
  assert.throws(()=>verify(x,[{success:true,results:d.prepare(x.sql).all()}]),/TWO_CONTEXTS_REQUIRED/);
 }finally{d.close()}
});
test('unreviewed, drifting, ambiguously multi-sense, missing IPA or QA labels never become real source pilot',()=>{
 const bad=queue();bad.counts.published_books=31;
 assert.throws(()=>choose(bad),/SOURCE_SNAPSHOT_DRIFT/);
 const poly=queue();poly.other_candidate_groups.push({
  headword:'choice',pos:'v.',meaning_zh:'选择做某事'});
 assert.throws(()=>choose(poly),/NO_SAFE_CROSSBOOK_PAIR/);
 const missing=queue();missing.duplicate_review_queue[0].card_evidence[0].phonetic_uk='';
 assert.throws(()=>choose(missing),/NO_SAFE_CROSSBOOK_PAIR/);
 const qa=queue();qa.duplicate_review_queue[0].card_evidence[0].book_id='qa-fake';
 assert.throws(()=>choose(qa),/NO_SAFE_CROSSBOOK_PAIR/);
 const forged=queue();forged.created_approvals=1;
 assert.throws(()=>choose(forged));
});
test('protected real production SQL is never deployed or publicly exported',()=>{
 const wf=readFileSync('.github/workflows/v12-real-published-two-book-context-proof.yml','utf8');
 assert.match(wf,/production-d1-readonly-approval/);
 assert.match(wf,/CLOUDFLARE_PROD_D1_READ_TOKEN/);
 assert.match(wf,/PRODUCTION_D1_METADATA_PASSPHRASE/);
 assert.match(wf,/13911979176/);
 assert.match(wf,/actions\/upload-artifact@v4/);
 assert.match(wf,/gpg --batch/);
 assert.doesNotMatch(wf,/wrangler deploy|CLOUDFLARE_PROD_D1_WRITE_TOKEN|CLOUDFLARE_STAGING_D1_WRITE_TOKEN|d1 migrations apply/i);
});
