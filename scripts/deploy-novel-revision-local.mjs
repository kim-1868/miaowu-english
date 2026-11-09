#!/usr/bin/env node
// Owner-run only: protected local release path when private GitHub Actions cannot start.
// Never copy credentials into scripts, files, CI logs or the public repository.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {resolve} from 'node:path';

const HEAD_BRANCH='release/novel-revision-on-current-prod-20261109';
const BASE_SHA='7b214633076907e2df6d34adcd95aaeed32aee21';
const ROOT=resolve(import.meta.dirname,'..');
process.chdir(ROOT);
const cmd=(name,args,opts={})=>{
  const output=execFileSync(name,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8_000_000,...opts});
  return typeof output==='string'?output.trim():'';
};
function run(name,args,opts={}){
  try{return cmd(name,args,opts)}
  catch(e){
    const message=String(e.stderr||e.message||'').replace(/(Bearer\s+|token\s*[:=]\s*)\S+/gi,'$1[REDACTED]');
    throw Error(name+' '+args.slice(0,3).join(' ')+' failed:\n'+message.slice(0,1800));
  }
}
const sha=x=>createHash('sha256').update(x).digest('hex');
async function main(){
  assert.equal(run('git',['branch','--show-current']),HEAD_BRANCH,'Wrong release branch');
  assert.equal(run('git',['status','--porcelain']),'','Uncommitted or untracked changes');
  const currentSha=run('git',['rev-parse','HEAD']);
  const parent=run('git',['merge-base',BASE_SHA,'HEAD']);
  assert.equal(parent,BASE_SHA,'Production source baseline mismatch');
  const changed=run('git',['diff','--name-only',BASE_SHA,'HEAD']).split('\n').filter(Boolean);
  const allow=new Set(['public/ops-console.js','src/ops-draft-revision.js','src/ops-live-edit.js',
    'tests/s123-ops-full-draft-revision.test.mjs','tests/s156-ops-live-book-editor.test.mjs',
    '.github/workflows/novel-revision-on-current-prod-20261109.yml',
    'scripts/deploy-novel-revision-local.mjs']);
  assert.deepEqual(changed.filter(x=>!allow.has(x)),[],'Unapproved production file change');
  const src=fs.readFileSync('public/ops-console.js','utf8');
  assert.match(src,/WITHDRAWN_REWRITE_CONFIRMATION_REQUIRED/);
  assert.match(src,/reviseExistingDraft/);
  const cfgName='deploy/production.wrangler.jsonc';
  run('node',['scripts/check-production-config.mjs',cfgName],{stdio:'inherit'});
  const cfg=JSON.parse(fs.readFileSync(cfgName,'utf8'));
  assert.equal(cfg.name,'miaowu-english-production');
  assert.equal(cfg.vars.APP_ENV,'production');
  assert.equal(cfg.d1_databases[0].database_name,'miaowu-english-prod');
  assert.equal(cfg.d1_databases[0].database_id,'649c71b3-340c-49bf-b806-3d39256851d3');
  assert.equal(cfg.workers_dev,false);assert.equal(cfg.preview_urls,false);
  console.log('STEP 1/6: full regression + production asset build');
  run('npm',['run','check'],{stdio:'inherit'});
  run('npm',['test'],{stdio:'inherit'});
  run('node',['scripts/build-production-assets.mjs','--approved-announcements'],{stdio:'inherit'});
  const compiled=JSON.parse(fs.readFileSync('deploy/production.wrangler.jsonc','utf8'));
  compiled.vars.OPS_ANNOUNCEMENTS_ENABLED='true';
  compiled.vars.V11_NOTICE_RELEASE_APPROVED='true';
  const temp='deploy/.novel-owner-approved-local.jsonc';
  fs.writeFileSync(temp,JSON.stringify(compiled,null,2)+'\n',{mode:0o600});
  try{
    console.log('STEP 2/6: Wrangler local dry-run');
    run('npx',['wrangler','deploy','--dry-run','--config',temp,
      '--outdir','.wrangler/novel-owner-local-dryrun'],{stdio:'inherit'});
    console.log('STEP 3/6: verify source identity against currently served production');
    const host='https://miaowu-english-pages.pages.dev';
    for(const file of ['app.js','ops-console.js','ops-updates.js','site-updates.js',
      'v11-responsive.css','v11-bookshelf.css']){
      const baseline=execFileSync('git',['show',BASE_SHA+':public/'+file]);
      const res=await fetch(host+'/'+file+'?novel_owner_baseline='+currentSha,{cache:'no-store'});
      assert.equal(res.status,200,'Cannot inspect live '+file);
      const remote=Buffer.from(await res.arrayBuffer());
      assert.equal(sha(remote),sha(baseline),'Live source drift: '+file);
      console.log('  match',file);
    }
    const unauth=await fetch(host+'/api/ops/me',{cache:'no-store'});
    assert.equal(unauth.status,401,'Publisher auth gateway changed');
    const edge=await fetch(host+'/__miaowu_prod_edge_probe',{cache:'no-store'});
    assert.equal(edge.status,200);
    const health=await edge.json();
    assert.equal(health.ok,true);assert.equal(health.productionBindingPresent,true);
    assert.equal(health.dataAccess,false);
    console.log('STEP 4/6: inspect D1 schema (SELECT only, never mutate)');
    const sql="SELECT "+
      "(SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ops_live_book_versions') AS snapshots,"+
      "(SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ops_book_content_versions') AS content_versions,"+
      "(SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ops_audit_events') AS audit_events";
    let schema;
    try{schema=JSON.parse(run('npx',['wrangler','d1','execute','miaowu-english-prod','--remote',
      '--config',temp,'--json','--command',sql]))}
    catch(e){throw Error('Production D1 read-only query failed. Confirm your Cloudflare login has D1 read access, and do NOT deploy:\n'+e.message)}
    const first=(Array.isArray(schema)?schema[0]?.results:schema.results)?.[0];
    assert.ok(first,'D1 returned no schema results');
    for(const key of ['snapshots','content_versions','audit_events'])
      assert.equal(Number(first[key]),1,'Required D1 table missing: '+key);
    console.log('STEP 5/6: inspect current Worker deployment');
    run('npx',['wrangler','deployments','status','--name','miaowu-english-production','--config',temp],
      {stdio:'inherit'});
    if(!process.argv.includes('--deploy')){
      console.log('\nPREFLIGHT_OK_NO_PRODUCTION_CHANGE');
      console.log('To deploy after reviewing Worker status:');
      console.log('  node scripts/deploy-novel-revision-local.mjs --deploy');
      return;
    }
    assert.equal(process.env.MW_NOVEL_PROD_APPROVED,'DEPLOY_GUARDED_NOVEL_EDITOR',
      'Explicit owner confirmation missing. Set MW_NOVEL_PROD_APPROVED to DEPLOY_GUARDED_NOVEL_EDITOR.');
    console.log('STEP 6/6: deploy WITHOUT schema mutation, then smoke-check');
    run('npx',['wrangler','deploy','--keep-vars','--config',temp],{stdio:'inherit'});
    try{
      const live=await fetch(host+'/ops-console.js?novel_owner_post='+currentSha,{cache:'no-store'});
      assert.equal(live.status,200);assert.match(await live.text(),/reviseExistingDraft/);
      const safe=await fetch(host+'/api/ops/me',{cache:'no-store'});
      assert.equal(safe.status,401,'Publisher auth gateway must remain private');
      console.log('PRODUCTION_GUARDED_NOVEL_EDITOR_DEPLOYED__NO_D1_DATA_WRITES');
    }catch(e){
      console.error('DEPLOY_SMOKE_FAILED__ATTEMPTING_WORKER_ROLLBACK');
      try{run('npx',['wrangler','rollback','--name','miaowu-english-production',
        '--config',temp,'--message','Guarded novel editor smoke failed'],{stdio:'inherit'})}
      catch(error){console.error('MANUAL_WORKER_ROLLBACK_REQUIRED',error.message)}
      throw e;
    }
  }finally{
    try{fs.unlinkSync(temp)}catch{}
  }
}
main().catch(e=>{console.error('FAIL_CLOSED:',e.message);process.exitCode=1});
