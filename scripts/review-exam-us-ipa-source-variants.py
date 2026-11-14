#!/usr/bin/env python3
"""Offline non-publishing variant spelling / exact ECDICT phonetic review for US IPA gaps.
Only suggest pronunciation source rows; do not copy one spelling's IPA onto another.
"""
import argparse, csv, hashlib, json, re, unicodedata, zipfile
from collections import Counter
from pathlib import Path

PREFIX = 'gdict_'
SPELLING = {}  # Private curated spelling suggestions are passed from a local JSON file only.

REVIEW_STATUS = 'UNVERIFIED_VARIANT_CANDIDATES_REVIEW_ONLY'

def normalize(x):
 return unicodedata.normalize('NFKC',str(x)).lower().replace('’',"'").strip()

def source_words(z):
 words={}; dup=set()
 for line in z.read('en_US.txt').decode('utf-8').splitlines():
  if '\t' not in line:continue
  word,ipa=line.split('\t',1);word=normalize(word)
  if word in words:dup.add(word)
  words[word]=ipa
 if dup:raise ValueError('DUPLICATE_UPSTREAM_IPA_ROWS')
 return words

def possible_forms(w,mappings=None):
 # Strictly show candidates, never write automatically approved target pronunciation.
 offers=[]
 def add(candidate,why):
  if candidate!=w and candidate not in (x['candidate_word'] for x in offers):
   offers.append({'candidate_word':candidate,'reason_for_review':why})
 if w in (mappings or {}):add(mappings[w],'CURATED_VARIANT_OR_RELATED_TERM_NOT_EQUIVALENCE_PROOF')
 if '-' in w:add(w.replace('-',''),'ORTHOGRAPHIC_COMPOUND_JOIN_REVIEW')
 if w.endswith('wards'):add(w[:-1],'FINAL_S_VARIANT_REVIEW')
 if w.endswith('ise'):add(w[:-3]+'ize','ISE_IZE_ORTHOGRAPHY_REVIEW')
 if w.endswith('iser'):add(w[:-4]+'izer','ISER_IZER_ORTHOGRAPHY_REVIEW')
 if w.endswith('our'):add(w[:-3]+'or','OUR_OR_ORTHOGRAPHY_REVIEW')
 if w.endswith('re'):add(w[:-2]+'er','RE_ER_ORTHOGRAPHY_REVIEW')
 return offers

def run(review_jsonl, public_zip, output, mapping_json=None):
 mapping=json.loads(Path(mapping_json).read_text(encoding='utf8')) if mapping_json else {}
 if not isinstance(mapping,dict) or any(not isinstance(k,str) or not isinstance(v,str) or not k or not v for k,v in mapping.items()): raise ValueError('INVALID_PRIVATE_RELATED_SPELLING_MAPPING')
 review=[json.loads(s) for s in Path(review_jsonl).read_text(encoding='utf8').splitlines() if s.strip()]
 with zipfile.ZipFile(public_zip) as z:
  words=source_words(z)
 head=set();rows=[]
 for item in review:
  w=normalize(item['headword'])
  if w in head: raise ValueError('DUPLICATE_HEADWORD')
  head.add(w)
  if item['entry_id']!='gdict_'+hashlib.sha256(w.encode()).hexdigest()[:24] and item['entry_id'] is not None:
   raise ValueError('ENTRY_ID_MISMATCH')
  if item.get('publisher_approved') is not False or item.get('approved_sense_id') is not None:
   raise ValueError('FALSE_APPROVAL')
  if not item.get('us_ipa_missing'):continue
  alternatives=[{**c,'source_ipa_unverified':words[c['candidate_word']]} for c in possible_forms(w,mapping) if c['candidate_word'] in words]
  rows.append({'headword':w,'tier':item['tier'],'entry_id':item['entry_id'],
   'original_source_translation_unverified':item.get('original_translation_unverified',''),
   'suggested_related_source_rows_unverified':alternatives,
   'suggested_rows_count':len(alternatives),
   'requires_pronunciation_recording_or_independent_dictionary_review':True,
   'do_not_copy_related_word_pronunciation':True,
   'entry_identity_unchanged':True,'approved_sense_id':None,'publisher_approved':False,
   'teaching_ready':False,'production_publish_allowed':False,'status':REVIEW_STATUS})
 if len(review)!=239 or len(rows)!=92: raise ValueError('EXPECTED_VERIFIED_239_INPUT_AND_92_GAPS')
 out=Path(output)
 if out.exists():raise ValueError('REFUSE_OVERWRITE')
 out.mkdir(parents=True)
 (out/'92_MISSING_US_IPA_VARIANT_REVIEW_ONLY.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows),encoding='utf8')
 with (out/'92_MISSING_US_IPA_VARIANT_REVIEW_ONLY.csv').open('w',newline='',encoding='utf8') as f:
  fieldnames=['headword','tier','related_source_words','ipa_as_source_not_applied','review_required'];writer=csv.DictWriter(f,fieldnames);writer.writeheader()
  for x in rows:writer.writerow({'headword':x['headword'],'tier':x['tier'],
   'related_source_words':' | '.join(a['candidate_word'] for a in x['suggested_related_source_rows_unverified']),
   'ipa_as_source_not_applied':' | '.join(a['source_ipa_unverified'] for a in x['suggested_related_source_rows_unverified']),
   'review_required':True})
 summary={'total_source_239':len(review),'missing_us_ipa_source':len(rows),
  'missing_with_related_spelling_in_same_MIT_ipa_source':sum(bool(x['suggested_rows_count']) for x in rows),
  'missing_without_same_source_variant_match':sum(not x['suggested_rows_count'] for x in rows),
  'by_grade':dict(Counter(x['tier'] for x in rows)),
  'real_target_ipa_completed':0,'approved_sense_ids_created':0,'database_writes':0,'customer_study_writes':0,
  'note':'Even when a related spelling has a pronunciation, that IPA belongs to the related spelling, not automatically to the target.'}
 (out/'QA.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 return summary

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--public-zip',required=True);ap.add_argument('--out',required=True);ap.add_argument('--mapping',required=False);args=ap.parse_args()
 print(json.dumps(run(args.source,args.public_zip,args.out,args.mapping),ensure_ascii=False))