// A4.1 portable offline/Worker verifier for exported dictionary binding bundles.
// No database, network, novel import, chapter rewriting or customer writes.
import {validatePackage} from './editorial-content.js';
import {normalizedLemma} from './global-dictionary-matcher.js';

const ID=/^[a-z][a-z0-9_-]{2,99}$/i;
const HEX=/^[a-f0-9]{64}$/;
const encoder=new TextEncoder();
const sha256=async v=>{
  const bytes=encoder.encode(JSON.stringify(v));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
};
const key=(chapter,paragraph,segment)=>[chapter,paragraph,segment].join(':');

export async function verifyGlobalDictionaryBindingBundle(bundle){
  if(!bundle||typeof bundle!=='object'||Array.isArray(bundle)||
    bundle.format!=='miaowu-global-dictionary-binding-bundle-v1'||
    bundle.status!=='STAGING_VERIFIED_NOT_IMPORTED'||
    bundle.publication_ready!==false||
    !HEX.test(bundle.package_sha256||'')||
    !HEX.test(bundle.binding_sha256||'')||
    !Array.isArray(bundle.dictionary_bindings))
    throw Error('INVALID_DICTIONARY_BUNDLE');
  const source=bundle.original_package;
  const validated=validatePackage(source);
  if(validated.book.id!==bundle.book_id||
     validated.book.category!==bundle.category_id)
    throw Error('BUNDLE_BOOK_ID_MISMATCH');
  if(await sha256(source)!==bundle.package_sha256)
    throw Error('BUNDLE_PACKAGE_HASH_MISMATCH');
  const targets=new Map();
  for(const chapter of validated.chapters){
    for(const [pi,paragraph] of chapter.paragraphs.entries()){
      for(const [si,seg] of paragraph.segments.entries()){
        if(!seg.wordId)continue;
        const k=key(chapter.number,pi,si);
        if(targets.has(k))throw Error('DUPLICATE_NOVEL_ANCHOR');
        targets.set(k,{
          word_id:seg.wordId,
          normalized_surface:normalizedLemma(seg.surface)
        });
      }
    }
  }
  if(!targets.size||targets.size!==bundle.dictionary_bindings.length)
    throw Error('BUNDLE_MISSING_OR_EXTRA_TARGETS');
  const checked=[],bindingsPerId=new Map(),seen=new Set();
  for(const raw of bundle.dictionary_bindings){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||
       !Number.isInteger(raw.chapter_number)||
       !Number.isInteger(raw.paragraph_index)||
       !Number.isInteger(raw.segment_index)||
       !ID.test(raw.entry_id||'')||
       !ID.test(raw.legacy_word_id||'')||
       !['unique_verified_match','reviewed_selection'].includes(raw.resolution))
      throw Error('INVALID_DICTIONARY_BUNDLE_BINDING');
    const k=key(raw.chapter_number,raw.paragraph_index,raw.segment_index);
    if(seen.has(k))throw Error('BUNDLE_DUPLICATE_BINDING_COORDINATE');
    seen.add(k);
    const original=targets.get(k);
    if(!original||
       raw.legacy_word_id!==original.word_id||
       raw.normalized_surface!==original.normalized_surface)
      throw Error('BUNDLE_BINDING_NOT_IN_NOVEL');
    if(bindingsPerId.has(raw.legacy_word_id)&&
       bindingsPerId.get(raw.legacy_word_id)!==raw.entry_id)
      throw Error('BUNDLE_LEGACY_ID_CANONICAL_CONFLICT');
    bindingsPerId.set(raw.legacy_word_id,raw.entry_id);
    checked.push({
      chapter_number:raw.chapter_number,
      paragraph_index:raw.paragraph_index,
      segment_index:raw.segment_index,
      legacy_word_id:raw.legacy_word_id,
      entry_id:raw.entry_id,
      normalized_surface:raw.normalized_surface,
      resolution:raw.resolution
    });
  }
  checked.sort((a,b)=>a.chapter_number-b.chapter_number||
    a.paragraph_index-b.paragraph_index||a.segment_index-b.segment_index);
  const manifest={version:1,book_id:validated.book.id,
    category_id:validated.book.category,target_count:checked.length,
    bindings:checked};
  if(await sha256(manifest)!==bundle.binding_sha256)
    throw Error('BUNDLE_BINDING_HASH_MISMATCH');
  return {status:'OFFLINE_BUNDLE_INTEGRITY_VERIFIED',
    book_id:validated.book.id,category:validated.book.category,
    target_count:checked.length,canonical_ids:[...new Set(checked.map(x=>x.entry_id))],
    package_sha256:bundle.package_sha256,binding_sha256:bundle.binding_sha256,
    // This verifies integrity, not current license/editorial approvals or
    // runtime books/entitlements. A real importer MUST recheck D1 state.
    publication_allowed:false,
    data_modified:false};
}
