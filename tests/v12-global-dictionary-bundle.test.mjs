import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {verifyGlobalDictionaryBindingBundle}
  from '../src/global-dictionary-bundle.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const make=()=>{
 const original_package={
   version:1,book:{id:'story-cet6-new',title:'Six Stories',category:'cet6'},
   words:[
    {id:'legacy-record',headword:'record',meaningZh:'记录',collocations:[]},
    {id:'legacy-record-alt',headword:'record',meaningZh:'录制',collocations:[]}
   ],chapters:[{id:'chapter-one',number:1,title:'Start',preview:false,paragraphs:[{
     segments:[
      {text:'她 '}
      ,{wordId:'legacy-record',surface:'record',gloss:'记录'}
      ,{text:' 也 '}
      ,{wordId:'legacy-record-alt',surface:'record',gloss:'录制'}
     ]
   }]}]
 };
 const dictionary_bindings=[
  {chapter_number:1,paragraph_index:0,segment_index:1,
    legacy_word_id:'legacy-record',entry_id:'gdict_record',
    normalized_surface:'record',resolution:'unique_verified_match'},
  {chapter_number:1,paragraph_index:0,segment_index:3,
    legacy_word_id:'legacy-record-alt',entry_id:'gdict_record',
    normalized_surface:'record',resolution:'unique_verified_match'}
 ];
 const manifest={version:1,book_id:'story-cet6-new',category_id:'cet6',
   target_count:2,bindings:dictionary_bindings};
 return {format:'miaowu-global-dictionary-binding-bundle-v1',
  status:'STAGING_VERIFIED_NOT_IMPORTED',publication_ready:false,
  request_id:'candidate-bundle-001',
  book_id:'story-cet6-new',category_id:'cet6',
  package_sha256:hash(original_package),binding_sha256:hash(manifest),
  original_package,dictionary_bindings};
};
test('A4 portable bundle verifier validates stable content and same-main-word cross-legacy links',async()=>{
 const bundle=make(),copy=structuredClone(bundle);
 const result=await verifyGlobalDictionaryBindingBundle(bundle);
 assert.equal(result.status,'OFFLINE_BUNDLE_INTEGRITY_VERIFIED');
 assert.equal(result.publication_allowed,false);
 assert.equal(result.data_modified,false);
 assert.equal(result.target_count,2);
 assert.deepEqual(result.canonical_ids,['gdict_record']);
 assert.deepEqual(bundle,copy);
});
test('A4 offline verifier rejects mutated novel, missing/extra binding positions and swapped IDs',async()=>{
 const mut=make();
 mut.original_package.book.title='Changed title';
 await assert.rejects(()=>verifyGlobalDictionaryBindingBundle(mut),
    /BUNDLE_PACKAGE_HASH_MISMATCH/);
 const missing=make();missing.dictionary_bindings.pop();
 await assert.rejects(()=>verifyGlobalDictionaryBindingBundle(missing),
    /BUNDLE_MISSING_OR_EXTRA_TARGETS/);
 const altered=make();altered.dictionary_bindings[0].legacy_word_id='legacy-record-alt';
 await assert.rejects(()=>verifyGlobalDictionaryBindingBundle(altered),
    /BUNDLE_BINDING_NOT_IN_NOVEL/);
 const wrong=make();wrong.dictionary_bindings[0].entry_id='gdict_see';
 await assert.rejects(()=>verifyGlobalDictionaryBindingBundle(wrong),
    /BUNDLE_BINDING_HASH_MISMATCH/);
});
test('A4 verifier rejects forged matching hashes that reuse one historical wordId for multiple cards',async()=>{
 const b=make();
 b.original_package.chapters[0].paragraphs[0].segments[3].wordId='legacy-record';
 b.original_package.words.pop();
 b.dictionary_bindings[1].legacy_word_id='legacy-record';
 b.dictionary_bindings[1].entry_id='gdict_see';
 b.package_sha256=hash(b.original_package);
 b.binding_sha256=hash({version:1,book_id:b.book_id,category_id:b.category_id,
   target_count:2,bindings:b.dictionary_bindings});
 await assert.rejects(()=>verifyGlobalDictionaryBindingBundle(b),
    /BUNDLE_LEGACY_ID_CANONICAL_CONFLICT/);
});
test('A4 tampering status and category is refused even if content hash still matches',async()=>{
 const b=make();b.status='ALREADY_PUBLISHED';
 await assert.rejects(()=>verifyGlobalDictionaryBindingBundle(b),
    /INVALID_DICTIONARY_BUNDLE/);
 const c=make();c.category_id='cet4';
 await assert.rejects(()=>verifyGlobalDictionaryBindingBundle(c),
    /BUNDLE_BOOK_ID_MISMATCH/);
});
