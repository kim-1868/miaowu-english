import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {handleSmartVocab} from '../src/smart-vocab-api.js';
import {handleLearningState} from '../src/reading-library.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const user={id:'smart-test-user',username:'learner'};
const row=(db,sql,...args)=>db.prepare(sql).run(...args);
function fixture({enabled=true,catalogReady=true}={}){
  const sql=new DatabaseSync(':memory:');
  sql.exec(read('db/001_schema.sql'));
  sql.exec(read('db/012_smart_vocab_catalog.sql'));
  row(sql,'INSERT INTO users(id,username,password_hash,password_salt) VALUES(?,?,?,?)',
    user.id,user.username,'hash','salt');
  for(const cat of ['cet4','cet6','postgrad','ielts'])
    row(sql,'INSERT INTO categories(id,slug,title) VALUES(?,?,?)',cat,cat,cat);
  row(sql,'INSERT INTO entitlements(user_id,category_id) VALUES(?,?)',user.id,'cet4');
  row(sql,"INSERT INTO books(id,category_id,title,status) VALUES('novel','cet4','A Book','published')");
  row(sql,"INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) "+
    "VALUES('ch-1','novel',1,'Chapter','{}',CURRENT_TIMESTAMP)");
  const words=[
    ['n-promise','promise','n.','承诺；诺言'],
    ['s-promise','promise','n.','承诺；诺言'],
    ['s-clarify','clarify','v.','澄清'],
    ['s-retain','retain','v.','保留'],
    ['s-premium','premium','adj.','高级的']
  ];
  for(const [id,head,pos,meaning] of words){
    row(sql,'INSERT INTO words(id,headword,part_of_speech,meaning_zh,phonetic_uk,example_en,example_zh) '+
      'VALUES(?,?,?,?,?,?,?)',id,head,pos,meaning,'/'+head+'/', 'Please remember the word '+head+' today.','请今天记住这个词。');
  }
  row(sql,"INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) "+
    "VALUES('ch-1','n-promise','novel context','p0:s0')");
  row(sql,"INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at,last_seen_at) "+
    "VALUES(?,?,'learning',0,datetime('now','+3 days'),CURRENT_TIMESTAMP)",user.id,'n-promise');
  row(sql,'INSERT INTO smart_vocab_levels(category_id,expected_headwords,catalog_verified_at,enabled) VALUES(?,3,CURRENT_TIMESTAMP,?)',
    'cet4',catalogReady?1:0);
  row(sql,'INSERT INTO smart_vocab_levels(category_id,expected_headwords,catalog_verified_at,enabled) VALUES(?,1,CURRENT_TIMESTAMP,1)','cet6');
  for(const [id,category,rank] of [['s-promise','cet4',1],['s-clarify','cet4',2],
    ['s-retain','cet4',3],['s-premium','cet6',1]]){
    row(sql,'INSERT INTO smart_vocab_catalog(category_id,word_id,frequency_rank,frequency_source,reviewed) VALUES(?,?,?,\'COCA\',1)',
      category,id,rank);
  }
  const adapter={
    prepare(query){return{bind(...args){
      const statement=sql.prepare(query);
      return{async first(){return statement.get(...args)||null},
        async all(){return{results:statement.all(...args)}},
        async run(){return statement.run(...args)}}}}},
    async batch(commands){
      sql.exec('BEGIN IMMEDIATE');
      try{const results=[];for(const command of commands)results.push(await command.run());
        sql.exec('COMMIT');return results}
      catch(error){sql.exec('ROLLBACK');throw error}
    }
  };
  const env={DB:adapter,APP_ENV:'staging',SMART_VOCAB_QA_ALLOW_PARTIAL:'true',
    SMART_VOCAB_ENABLED:enabled?'true':'false',SMART_VOCAB_SCHEMA_READY:'true'};
  async function call(path,method='GET',body=null,auth=user){
    const req=new Request('https://example.test'+path,{method,
      ...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
    const result=await handleSmartVocab(req,env,new URL(req.url).pathname,auth);
    return {status:result.status,data:await result.json()};
  }
  async function learning(path,method='GET',body=null){
    const req=new Request('https://example.test'+path,{method,
      ...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
    const result=await handleLearningState(req,env,new URL(req.url).pathname,user);
    return {status:result.status,data:await result.json()};
  }
  return {sql,env,call,learning};
}

test('feature is opt-in only; anonymous users do not learn anything',async()=>{
  const f=fixture({enabled:false});
  try{
    assert.equal((await f.call('/api/me/smart-vocab?category=cet4')).status,404);
    f.env.SMART_VOCAB_ENABLED='true';
    assert.equal((await f.call('/api/me/smart-vocab?category=cet4','GET',null,null)).status,401);
  }finally{f.sql.close()}
});

test('strict category permission and unreviewed level fail closed',async()=>{
  const f=fixture({catalogReady:false});
  try{
    assert.equal((await f.call('/api/me/smart-vocab?category=cet6')).status,403);
    assert.equal((await f.call('/api/me/smart-vocab?category=cet4')).status,503);
    f.sql.prepare("UPDATE smart_vocab_levels SET enabled=1 WHERE category_id='cet4'").run();
    f.sql.prepare("UPDATE smart_vocab_levels SET expected_headwords=4 WHERE category_id='cet4'").run();
    assert.equal((await f.call('/api/me/smart-vocab?category=cet4')).status,503);
  }finally{f.sql.close()}
});

test('do not expose revoked entitlement even if a catalog is ready',async()=>{
  const f=fixture();
  try{
    f.sql.prepare("UPDATE entitlements SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND category_id='cet4'")
      .run(user.id);
    assert.equal((await f.call('/api/me/smart-vocab?category=cet4')).status,403);
  }finally{f.sql.close()}
});

test('learned novel sense is not treated as new even when never bookmarked',async()=>{
  const f=fixture();
  try{
    const res=await f.call('/api/me/smart-vocab?category=cet4');
    assert.equal(res.status,200);
    assert.deepEqual(res.data.words.map(w=>w.word_id),['s-clarify','s-retain']);
    assert.equal(res.data.words.some(w=>Object.hasOwn(w,'context_sentence')),false);
    assert.match(res.data.frequencyNote,/COCA\/BNC/);
  }finally{f.sql.close()}
});

test('bookmarking is independent from memorization and mirrors accessible novel aliases',async()=>{
  const f=fixture();
  try{
    const statusBefore=f.sql.prepare("SELECT status,due_at FROM user_words WHERE user_id=? AND word_id='n-promise'")
      .get(user.id);
    let response=await f.call('/api/me/smart-vocab/bookmark','POST',{
      category:'cet4',wordId:'s-promise',bookmarked:true});
    assert.equal(response.status,200);
    const state=f.sql.prepare("SELECT word_id,status,bookmarked,due_at FROM user_words WHERE user_id=? "+
      "AND word_id IN ('n-promise','s-promise') ORDER BY word_id").all(user.id);
    assert.equal(state.length,2);
    assert.equal(state.every(w=>w.bookmarked===1),true);
    assert.equal(state[0].status,statusBefore.status);
    assert.equal(state[0].due_at,statusBefore.due_at);
    response=await f.call('/api/me/smart-vocab/bookmark','POST',{
      category:'cet4',wordId:'s-promise',bookmarked:false});
    assert.equal(response.status,200);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM user_words WHERE user_id=? "+
      "AND word_id IN ('n-promise','s-promise') AND bookmarked=1").get(user.id).n,0);
  }finally{f.sql.close()}
});

test('remembered answer is idempotent and never permanently masters a new word',async()=>{
  const f=fixture();
  try{
    const requestId=randomUUID(),answer={category:'cet4',wordId:'s-clarify',
      remembered:true,requestId};
    assert.equal((await f.call('/api/me/smart-vocab/answer','POST',answer)).status,200);
    const again=await f.call('/api/me/smart-vocab/answer','POST',answer);
    assert.equal(again.data.alreadyApplied,true);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM review_events WHERE id=?").get(requestId).n,1);
    const state=f.sql.prepare("SELECT status,bookmarked,due_at FROM user_words WHERE user_id=? AND word_id='s-clarify'")
      .get(user.id);
    assert.equal(state.status,'learning');
    assert.equal(state.bookmarked,0);
    assert.ok(state.due_at);
    assert.deepEqual((await f.call('/api/me/smart-vocab?category=cet4')).data.words.map(w=>w.word_id),['s-retain']);
  }finally{f.sql.close()}
});

test('invalid word, unpurchased level and reused id are rejected without mutation',async()=>{
  const f=fixture();
  try{
    const requestId=randomUUID();
    assert.equal((await f.call('/api/me/smart-vocab/answer','POST',{
      category:'cet4',wordId:'s-premium',remembered:true,requestId})).status,404);
    assert.equal((await f.call('/api/me/smart-vocab/answer','POST',{
      category:'cet6',wordId:'s-premium',remembered:true,requestId})).status,403);
    assert.equal((await f.call('/api/me/smart-vocab/answer','POST',{
      category:'cet4',wordId:'s-clarify',remembered:true,requestId})).status,200);
    assert.equal((await f.call('/api/me/smart-vocab/answer','POST',{
      category:'cet4',wordId:'s-retain',remembered:true,requestId})).status,409);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM review_events WHERE id=?").get(requestId).n,1);
  }finally{f.sql.close()}
});

test('forgotten due words are recommended even when unbookmarked; unrelated words unaffected',async()=>{
  const f=fixture();
  try{
    assert.equal((await f.call('/api/me/smart-vocab/answer','POST',{
      category:'cet4',wordId:'s-clarify',remembered:false,requestId:randomUUID()})).status,200);
    f.sql.prepare("UPDATE user_words SET due_at=datetime('now','-1 day') "+
      "WHERE user_id=? AND word_id='s-clarify'").run(user.id);
    const result=await f.call('/api/me/smart-vocab?category=cet4');
    assert.equal(result.data.words[0].word_id,'s-clarify');
    assert.equal(result.data.words[0].review,true);
    assert.equal(result.data.words[0].bookmarked,false);
    assert.ok(result.data.words.some(w=>w.word_id==='s-retain'));
  }finally{f.sql.close()}
});

test('manual mastered status is not cancelled by another remembered answer',async()=>{
  const f=fixture();
  try{
    f.sql.prepare("INSERT INTO user_words(user_id,word_id,status,bookmarked) "+
      "VALUES(?,?,'mastered',0)").run(user.id,'s-retain');
    const response=await f.call('/api/me/smart-vocab/answer','POST',{
      category:'cet4',wordId:'s-retain',remembered:true,requestId:randomUUID()});
    assert.equal(response.status,200);
    const state=f.sql.prepare("SELECT status,due_at FROM user_words WHERE user_id=? AND word_id='s-retain'")
      .get(user.id);
    assert.equal(state.status,'mastered');
    assert.equal(state.due_at,null);
  }finally{f.sql.close()}
});

test('missing table and disabled feature do not touch existing customer routes',async()=>{
  const f=fixture();
  try{
    f.env.SMART_VOCAB_ENABLED='false';
    f.sql.exec('DROP TABLE smart_vocab_catalog');
    assert.equal((await f.call('/api/me/smart-vocab?category=cet4')).status,404);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM user_words WHERE user_id=?")
      .get(user.id).n,1);
  }finally{f.sql.close()}
});

test('smart bookmarks appear in the existing collection/flashcard pool without enrollment in a novel',async()=>{
  const f=fixture();
  try{
    let res=await f.call('/api/me/smart-vocab/bookmark','POST',{
      category:'cet4',wordId:'s-clarify',bookmarked:true});
    assert.equal(res.status,200);
    const collection=await f.learning('/api/me/wordbook?scope=all&page=1');
    assert.equal(collection.status,200);
    assert.ok(collection.data.words.some(w=>w.word_id==='s-clarify'));
    const flash=await f.learning('/api/me/flashcards?scope=all&size=10&page=1');
    assert.equal(flash.status,200);
    assert.ok(flash.data.words.some(w=>w.word_id==='s-clarify'));
    // Removing a bookmark never deletes the learning row.
    await f.call('/api/me/smart-vocab/answer','POST',{
      category:'cet4',wordId:'s-clarify',remembered:false,requestId:randomUUID()});
    await f.call('/api/me/smart-vocab/bookmark','POST',{
      category:'cet4',wordId:'s-clarify',bookmarked:false});
    const saved=f.sql.prepare("SELECT status,bookmarked,due_at FROM user_words "+
      "WHERE user_id=? AND word_id='s-clarify'").get(user.id);
    assert.equal(saved.bookmarked,0);
    assert.equal(saved.status,'learning');
    assert.ok(saved.due_at);
  }finally{f.sql.close()}
});

test('existing novel mastery action synchronizes with reviewed smart alias',async()=>{
  const f=fixture();
  try{
    const changed=await f.learning('/api/me/words/n-promise','PUT',{
      bookmarked:true,status:'mastered'});
    assert.equal(changed.status,200);
    const ids=f.sql.prepare("SELECT word_id,status,bookmarked FROM user_words WHERE user_id=? "+
      "AND word_id IN ('n-promise','s-promise') ORDER BY word_id").all(user.id);
    assert.equal(ids.length,2);
    assert.equal(ids.every(x=>x.status==='mastered'&&x.bookmarked===1),true);
  }finally{f.sql.close()}
});

test('feature disabled keeps legacy words view independent from smart catalog',async()=>{
  const f=fixture();
  try{
    f.env.SMART_VOCAB_ENABLED='false';
    const original=await f.learning('/api/me/wordbook?scope=all&page=1');
    assert.equal(original.status,200);
    assert.equal(original.data.words.length,0);
    assert.equal((await f.call('/api/me/smart-vocab?category=cet4')).status,404);
  }finally{f.sql.close()}
});

test('partial exam snapshot is never considered a verified production catalog',async()=>{
  const f=fixture();
  try{
    f.env.APP_ENV='production';
    const status=await f.call('/api/me/smart-vocab/status');
    assert.equal(status.status,200);
    assert.equal(status.data.enabled,false);
    assert.equal(status.data.categories[0].available,false);
    assert.equal((await f.call('/api/me/smart-vocab?category=cet4')).status,503);
    // An incorrectly retained QA flag is ignored outside staging.
    f.env.SMART_VOCAB_QA_ALLOW_PARTIAL='true';
    assert.equal((await f.call('/api/me/smart-vocab?category=cet4')).status,503);
  }finally{f.sql.close()}
});

test('a reused requestId with the opposite answer is rejected, never silently accepted',async()=>{
  const f=fixture();
  try{
    const requestId=randomUUID();
    const a={category:'cet4',wordId:'s-clarify',remembered:true,requestId};
    assert.equal((await f.call('/api/me/smart-vocab/answer','POST',a)).status,200);
    const bad=await f.call('/api/me/smart-vocab/answer','POST',{...a,remembered:false});
    assert.equal(bad.status,409);
    assert.equal(bad.data.error,'REQUEST_ID_REUSED');
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM review_events WHERE id=?')
      .get(requestId).n,1);
  }finally{f.sql.close()}
});

test('a stale smart-card answer never unmarks a word explicitly mastered on another device',async()=>{
  const f=fixture();
  try{
    f.sql.prepare("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) "+
      "VALUES(?,?,'mastered',1,NULL)").run(user.id,'s-retain');
    const result=await f.call('/api/me/smart-vocab/answer','POST',{
      category:'cet4',wordId:'s-retain',remembered:false,requestId:randomUUID()});
    assert.equal(result.status,200);
    const state=f.sql.prepare("SELECT status,bookmarked,due_at FROM user_words "+
      "WHERE user_id=? AND word_id='s-retain'").get(user.id);
    assert.deepEqual(state,{status:'mastered',bookmarked:1,due_at:null});
  }finally{f.sql.close()}
});
