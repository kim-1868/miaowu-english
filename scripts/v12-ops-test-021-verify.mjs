// P0A-1 protected D1 TEST schema migration 021: exact read-only before/after verifier.
// No SQL writes, no credentials, no payload disclosure; only aggregate counters.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const CORE_COLUMNS=Object.freeze([
 'users','books','chapters','words','chapter_words','user_words',
 'review_events','reading_progress','entitlements','activation_codes',
 'ops_operators','ops_audit_events','global_dictionary_entries',
 'global_dictionary_senses','global_dictionary_legacy_sense_links',
 'user_dictionary_sense_study'
]);
export const SCHEMA_COLUMNS=Object.freeze([
 'existing_ops_tables','publisher_021_tables','publisher_021_indexes',
 'publisher_021_triggers','publisher_key_rows','publisher_receipt_rows'
]);
const cols=[...CORE_COLUMNS,...SCHEMA_COLUMNS];
const publisherTables=['ops_dictionary_publisher_keys','ops_dictionary_publisher_receipts'];
const publisherIndexes=['ix_ops_dictionary_publisher_keys_owner',
 'ix_ops_dictionary_publisher_receipts_review'];
const publisherTriggers=['ops_publisher_key_no_delete',
 'ops_publisher_key_identity_immutable',
 'ops_publisher_receipt_no_update',
 'ops_publisher_receipt_no_delete'];
const qt=x=>"'"+x.replaceAll("'","''")+"'";
const inList=items=>items.map(qt).join(',');
const pieces=[
 ...CORE_COLUMNS.map(x=>'(SELECT count(*) FROM '+x+') AS '+x),
 "(SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('ops_operators','ops_audit_events')) AS existing_ops_tables",
 "(SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ("+inList(publisherTables)+")) AS publisher_021_tables",
 "(SELECT count(*) FROM sqlite_master WHERE type='index' AND name IN ("+inList(publisherIndexes)+")) AS publisher_021_indexes",
 "(SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name IN ("+inList(publisherTriggers)+")) AS publisher_021_triggers"
];
export function snapshotSQL(phase){
 assert.ok(phase==='before'||phase==='after','P0_021_INVALID_PHASE');
 const rows=phase==='before'
  ?['0 AS publisher_key_rows','0 AS publisher_receipt_rows']
  :['(SELECT count(*) FROM ops_dictionary_publisher_keys) AS publisher_key_rows',
    '(SELECT count(*) FROM ops_dictionary_publisher_receipts) AS publisher_receipt_rows'];
 return 'SELECT '+[...pieces,...rows].join(',\n')+';';
}
function flatten(payload){
 const outer=Array.isArray(payload)?payload:[payload];
 return outer.flatMap(x=>x?.results??[]);
}
export function parseSnapshot(payload){
 const rows=flatten(payload);
 assert.equal(rows.length,1,'P0_021_ONE_ROW_REQUIRED');
 const row=rows[0];
 assert.deepEqual(Object.keys(row).sort(),[...cols].sort(),
  'P0_021_UNEXPECTED_COLUMNS');
 assert.ok(cols.every(k=>Number.isSafeInteger(row[k])&&row[k]>=0),
  'P0_021_NONINTEGER_COUNT');
 return row;
}
export function checkIntegrity(fkPayload,quickPayload){
 const fk=flatten(fkPayload),quick=flatten(quickPayload);
 assert.equal(fk.length,0,'P0_021_FK_VIOLATIONS');
 assert.equal(quick.length,1,'P0_021_INVALID_QUICK_CHECK');
 assert.deepEqual(Object.values(quick[0]),['ok'],'P0_021_INTEGRITY_FAIL');
 return true;
}
export function verifyBefore(snapshot,fk,quick){
 const row=parseSnapshot(snapshot);
 checkIntegrity(fk,quick);
 assert.equal(row.existing_ops_tables,2,'P0_021_OPS_007_SCHEMA_MISSING');
 for(const key of SCHEMA_COLUMNS.slice(1))
  assert.equal(row[key],0,'P0_021_ALREADY_PRESENT_OR_PARTIALLY_APPLIED_'+key);
 return {phase:'BEFORE',status:'TEST_021_CAN_APPLY_WITH_SEPARATE_AUTHORIZATION',
  baseline:row,readOnly:true,remoteWrites:0};
}
export function verifyAfter(before,after,fk,quick){
 const a=parseSnapshot(after);
 checkIntegrity(fk,quick);
 assert.ok(before&&typeof before==='object'&&!Array.isArray(before),
  'P0_021_BASELINE_REQUIRED');
 assert.equal(before.existing_ops_tables,2,'P0_021_BASELINE_INVALID');
 for(const k of CORE_COLUMNS)assert.equal(a[k],before[k],
  'P0_021_UNEXPECTED_HISTORICAL_DELTA_'+k);
 for(const [name,required] of Object.entries({
  existing_ops_tables:2,publisher_021_tables:2,publisher_021_indexes:2,
  publisher_021_triggers:4,publisher_key_rows:0,publisher_receipt_rows:0
 }))assert.equal(a[name],required,'P0_021_SCHEMA_OR_DATA_DELTA_'+name);
 return {phase:'AFTER',status:'TEST_021_ADD_ONLY_SCHEMA_VERIFIED',
  metadata_tables_added:2,indexes_added:2,triggers_added:4,
  historical_counts_preserved:CORE_COLUMNS.length,
  productionAccess:false,customerRowsChanged:0,
  noPublisherIdentityOrReceiptsCreated:true};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const [mode,...files]=process.argv.slice(2);
  if(mode==='sql'&&files.length===1){
   process.stdout.write(snapshotSQL(files[0])+'\n');
  }else if(mode==='before'&&files.length===3){
   const data=files.map(f=>JSON.parse(readFileSync(f,'utf8')));
   const res=verifyBefore(...data);
   console.log('P0_021_SAFE_BEFORE='+JSON.stringify({
    old_tables:res.baseline.existing_ops_tables,
    publisher_021_tables:res.baseline.publisher_021_tables,
    existing_business_count_keys:CORE_COLUMNS.length,
    remote_writes:0}));
  }else if(mode==='after'&&files.length===4){
   const [old,latest,fk,quick]=files.map(f=>
    JSON.parse(readFileSync(f,'utf8')));
   const res=verifyAfter(parseSnapshot(old),latest,fk,quick);
   console.log('P0_021_SAFE_AFTER='+JSON.stringify(res));
  }else throw Error('P0_021_VERIFY_USAGE');
 }catch(e){
  const message=String(e?.message??'');
  console.error('P0_021_VERIFY_BLOCKED',
   /^P0_021_[A-Z0-9_]+$/u.test(message)?message:'UNTRUSTED_PRIVATE_INPUT');
  process.exitCode=1;
 }
}
