import test from 'node:test';
import assert from 'node:assert/strict';
import {assertIndependentStudyIdentityBeforeImport,planOpsBookImport}
 from '../src/ops-import.js';
import {validatePackage} from '../src/editorial-content.js';
const v1=()=>({version:1,
 book:{id:'safe-draft',category:'cet6',title:'普通旧版小说'},
 words:[{id:'book-unique-record-noun',headword:'record',meaningZh:'记录',partOfSpeech:'n.',
  phoneticUk:'/test/',phoneticUs:'/test/',exampleEn:'Keep a record.',exampleZh:'保留一份记录。',
  collocations:[]}],
 chapters:[{id:'safe-ch',number:1,title:'第一章',preview:true,
  paragraphs:[{segments:[{text:'她发现了一份'},{wordId:'book-unique-record-noun',
   surface:'record',gloss:'记录'}]}]}]});
test('ordinary old V1 novels remain importable with independent legacy word IDs',()=>{
 const checked=validatePackage(v1());
 assert.equal(assertIndependentStudyIdentityBeforeImport(checked),true);
 assert.equal(planOpsBookImport(checked).summary.bookId,'safe-draft');
});
test('dictionary entry display ID never masquerades as a learned sense ID',()=>{
 const x=v1();
 x.words[0].id='gdict_'+'a'.repeat(24);
 x.chapters[0].paragraphs[0].segments[1].wordId=x.words[0].id;
 const validated=validatePackage(x);
 assert.throws(()=>planOpsBookImport(validated),/DICTIONARY_SENSE_BINDING_REQUIRED/);
});
test('V2 temporary card IDs cannot be imported through a legacy writer',()=>{
 const x=v1();x.words[0].id='v2_tmp_1';
 x.chapters[0].paragraphs[0].segments[1].wordId=x.words[0].id;
 assert.throws(()=>planOpsBookImport(validatePackage(x)),/DICTIONARY_SENSE_BINDING_REQUIRED/);
});
test('renamed dictionary V2 compatible draft is still recognized by its source label',()=>{
 const x=v1();x.sourceLabel='dictionary-v2';
 assert.throws(()=>planOpsBookImport(validatePackage(x)),/DICTIONARY_SENSE_BINDING_REQUIRED/);
});

test('a forged stable sense ID is blocked from the ordinary V1 importer',()=>{
 const novel=v1();
 novel.words[0].id='gds_'+'b'.repeat(24);
 novel.chapters[0].paragraphs[0].segments[1].wordId=novel.words[0].id;
 assert.throws(()=>planOpsBookImport(validatePackage(novel)),
  /DICTIONARY_SENSE_BINDING_REQUIRED/);
});
