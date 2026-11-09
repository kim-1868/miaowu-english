import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('offline smart catalog audit passes only complete reviewed enabled level and does not modify snapshot',()=>{
  const folder=mkdtempSync(join(tmpdir(),'mw-smart-audit-')),p=join(folder,'snapshot.db');
  try{
    const db=new DatabaseSync(p);
    db.exec(read('db/001_schema.sql'));
    db.exec(read('db/012_smart_vocab_catalog.sql'));
    db.prepare("INSERT INTO categories(id,slug,title) VALUES('cet4','cet4','CET4')").run();
    db.prepare("INSERT INTO words(id,headword,phonetic_us,part_of_speech,meaning_zh,example_en,example_zh) "+
      "VALUES('candidate','confirm','/kənˈfɜːrm/','v.','确认','Please confirm it.','请确认。')").run();
    db.prepare("INSERT INTO smart_vocab_catalog(category_id,word_id,frequency_rank,frequency_source,reviewed) "+
      "VALUES('cet4','candidate',1,'COCA',1)").run();
    db.prepare("INSERT INTO smart_vocab_levels(category_id,expected_headwords,catalog_verified_at,enabled) "+
      "VALUES('cet4',1,CURRENT_TIMESTAMP,1)").run();
    db.close();
    const run=(opts=[])=>spawnSync(process.execPath,['--experimental-sqlite',
      new URL('../scripts/check-smart-vocab-catalog.mjs',import.meta.url).pathname,
      p,'--require-ready',...opts],{encoding:'utf8'});
    const accepted=run();
    assert.equal(accepted.status,0,accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).levels[0].ready,true);
    const notEnoughForProduction=run(['--production']);
    assert.equal(notEnoughForProduction.status,1);
    assert.equal(JSON.parse(notEnoughForProduction.stdout).levels[0].ready,false);
    const change=new DatabaseSync(p);
    change.prepare("UPDATE smart_vocab_catalog SET reviewed=0 WHERE word_id='candidate'").run();
    change.close();
    const rejected=run();
    assert.equal(rejected.status,1,rejected.stderr);
    assert.equal(JSON.parse(rejected.stdout).levels[0].ready,false);
  }finally{rmSync(folder,{recursive:true,force:true})}
});
