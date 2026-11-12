import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyStagingPublishedSchema as schema,verifyStagingPublishedCounters as counts}
 from '../scripts/verify-staging-published-sense-readiness.mjs';
const tables=['books','chapters','words','chapter_words','global_dictionary_entries',
 'global_dictionary_senses','global_dictionary_lessons','global_dictionary_sources',
 'global_dictionary_legacy_sense_links','global_dictionary_book_bindings',
 'global_dictionary_book_sense_bindings','user_dictionary_sense_study',
 'user_dictionary_sense_review_events'];
const packet=rows=>[{success:true,results:rows}];
const sourceCounts={published_books:32,published_chapters:276,approved_active_senses:0,
 licensed_teaching_entries:0,approved_legacy_sense_links:0,
 linked_published_anchors:0,sense_study_rows:0};
test('full staging schema and no approved links is accurately reported NOT ready',()=>{
 assert.equal(schema(packet(tables.map(name=>({name})))).status,'SCHEMA_READY');
 const report=counts(packet([sourceCounts]));
 assert.equal(report.status,'STAGING_APPROVED_LINK_DATA_NOT_READY');
 assert.equal(report.counts.approved_legacy_sense_links,0);
 assert.equal(report.production_access,false);
 assert.equal(report.d1_writes,0);
});
test('approved links availability is reported without exporting any user rows',()=>{
 const x=counts(packet([{...sourceCounts,approved_active_senses:2,
  licensed_teaching_entries:1,approved_legacy_sense_links:3,
  linked_published_anchors:8}]));
 assert.equal(x.status,'STAGING_APPROVED_PUBLISHED_LEGACY_LINKS_AVAILABLE');
 assert.equal(x.counts.linked_published_anchors,8);
 assert.equal(x.private_rows_exported,0);
});
test('unlicensed or unbound published card candidates are NOT real bound anchors',()=>{
 for(const field of ['approved_active_senses','licensed_teaching_entries',
   'approved_legacy_sense_links','linked_published_anchors']){
  const row={...sourceCounts,approved_active_senses:5,
    licensed_teaching_entries:5,approved_legacy_sense_links:5,
    linked_published_anchors:7,[field]:0};
  const x=counts(packet([row]));
  assert.equal(x.status,'STAGING_APPROVED_LINK_DATA_NOT_READY',field);
  assert.equal(x.d1_writes,0);
 }
});
test('missing 020 schema, failed query and sensitive extra columns are blocked',()=>{
 const x=schema(packet(tables.filter(t=>t!=='global_dictionary_senses').map(name=>({name}))));
 assert.equal(x.status,'SCHEMA_MISSING');
 assert.deepEqual(x.missing_tables,['global_dictionary_senses']);
 assert.throws(()=>counts(packet([{...sourceCounts,user_id:'private'}])),/UNEXPECTED_FIELDS/);
 assert.throws(()=>counts(packet([{...sourceCounts,approved_active_senses:-1}])),/INVALID_/);
 assert.throws(()=>schema([{success:false,results:[]}]),/SELECT_FAILED/);
});
test('real workflow uses isolated staging read token, no write or production route',()=>{
 const w=readFileSync('.github/workflows/v12-staging-published-sense-readiness.yml','utf8');
 assert.ok(w.includes('CLOUDFLARE_STAGING_D1_READ_TOKEN'));
 assert.ok(w.includes("cfg.vars.APP_ENV,'staging'"));
 assert.ok(w.includes('88a817cb-23bb-4ae4-bcb8-92286c4165d4'));
 assert.ok(w.includes('STAGING_READONLY_AGGREGATE_DONE'));
 assert.ok(!w.includes('CLOUDFLARE_PROD_D1_READ_TOKEN'));
 assert.doesNotMatch(w,/wrangler deploy|d1 migrations apply|INSERT INTO|UPDATE user_/i);
});
