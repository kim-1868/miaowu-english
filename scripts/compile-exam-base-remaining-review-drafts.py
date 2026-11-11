#!/usr/bin/env python3
"""Complete all remaining PRIVATE basic-vocab single-POS drafts, fail closed.

Not a definition validator, publisher signoff, legacy migration, or OPS importer.
The draft's examples are authored, and every possible source sense still needs review.
"""
import argparse
import csv
import importlib.util
import json
import re
from pathlib import Path

# These *need* stricter lexical/editorial review, not automatic correction/approval.

def load_private_risk_labels(path):
    if path is None:return {}
    result=json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(result,dict) or any(not isinstance(k,str) or not k or not isinstance(v,str) or not v for k,v in result.items()):
        raise ValueError('INVALID_PRIVATE_RISK_LABELS_MAP')
    return result

def load(path):
 p=Path(path)
 if not p.is_file():raise ValueError('PRIOR_REVIEW_BATCH_NOT_FOUND')
 return [json.loads(s) for s in p.read_text(encoding='utf-8').splitlines() if s.strip()]

def compile_remaining_basic(triage_dir,curated,prior_jsonls,out_dir,expected_rows=300,risk_flags=None):
 out=Path(out_dir)
 if out.exists():raise ValueError('REFUSE_OVERWRITE_PRIVATE_REVIEW')
 targets={}
 for f in Path(triage_dir).glob('*MISSING_SENSES_REVIEW_ONLY.jsonl'):
  for x in load(f):
   if x['headword'] in targets:raise ValueError('DUPLICATE_SOURCE_HEADWORD')
   if x.get('publisher_approved') is not False or x.get('approved_sense_id') is not None:
    raise ValueError('SOURCE_PREAPPROVED_FORBIDDEN')
   targets[x['headword']]=x
 prior={}
 for p in prior_jsonls:
  for x in load(p):
   word=x['headword']
   if word in prior or word not in targets or x.get('entry_id')!=targets[word]['entry_id'] or x.get('publisher_approved') is not False or x.get('approved_sense_id') is not None:
    raise ValueError('PRIOR_DRAFT_DUPLICATE_OR_IDENTITY_MISMATCH')
   prior[word]=x
 selected=[]
 with Path(curated).open(encoding='utf-8',newline='') as f:
  for n,row in enumerate(csv.reader(f,delimiter='|'),1):
   if len(row)!=6 or row[0]!='基础' or row[1] not in targets or row[1] in prior:
    raise ValueError('INVALID_BASIC_WORD_OR_PREVIOUS_DUPLICATE_'+str(n))
   selected.append(row[1])
 if len(selected)!=expected_rows or len(set(selected))!=len(selected):
  raise ValueError('BASIC_DRAFT_ROW_COUNT_DUPLICATE_OR_DRIFT')
 needed={x['headword'] for x in targets.values() if x['target_tier']=='基础'
           and x['review_lane']=='SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW'}
 basic_covered=(set(prior)|set(selected))&needed
 if needed!=basic_covered:raise ValueError('UNFINISHED_BASIC_SINGLE_POS_DRAFTS')
 other_covered={x['headword'] for x in targets.values() if x['review_lane']=='SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW' and x['target_tier']!='基础'}
 if not other_covered.issubset(set(prior)):raise ValueError('EXAM_SINGLE_POS_COVERAGE_NOT_CARRIED_FORWARD')
 spec=importlib.util.spec_from_file_location('original_private_compiler',Path(__file__).resolve().parent/'compile-exam-original-review-drafts.py')
 mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
 mod.compile_private_drafts(triage_dir,curated,out,expected_rows=expected_rows)
 new_path=out/'100_NEW_ORIGINAL_EXAMPLES_DRAFT_NOT_APPROVED.jsonl'
 new=load(new_path)
 old_sents={x['example_en_draft'].casefold().strip() for x in prior.values()}
 new_sents=[x['example_en_draft'].casefold().strip() for x in new]
 if len(new_sents)!=len(set(new_sents)) or old_sents.intersection(new_sents):
  raise ValueError('DUPLICATE_ORIGINAL_EXAMPLE_SENTENCE_ACROSS_BATCHES')
 new_path.rename(out/f'{expected_rows}_REMAINING_BASIC_ORIGINAL_EXAMPLES_DRAFT_NOT_APPROVED.jsonl')
 (out/'100_NEW_ORIGINAL_EXAMPLES_FOR_EDITOR.csv').rename(out/f'{expected_rows}_REMAINING_BASIC_ORIGINAL_EXAMPLES_FOR_EDITOR.csv')
 notes=[]
 for x in new:
  why=(risk_flags or {}).get(x['headword'])
  if why or x['meaning_differs_from_lexical_source']:
   notes.append({'headword':x['headword'],'proposed_meaning_zh':x['meaning_zh_draft'],
    'original_source_chinese_candidates_unverified':x['source_pos_hints_unverified'][0]['meaning_candidates_unverified'],
    'risk_code':why or 'TEXTUAL_SOURCE_GLOSS_DIFFERENCE',
    'meaning_differs_from_raw_source':x['meaning_differs_from_lexical_source'],
    'publisher_approved':False,'human_editorial_review_required':True})
 (out/'basic_semantic_and_usage_risk_review.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in notes),encoding='utf-8')
 covered_all=set(prior)|set(selected)
 low={x['headword'] for x in targets.values() if x['review_lane']=='SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW'}
 assert low and low==(covered_all & low)
 report={'status':'ALL_565_LOW_CONFLICT_HEADWORDS_HAVE_ORIGINAL_EXAMPLE_DRAFTS_NOT_PUBLISHER_APPROVED',
   'original_historical_drafts':80,'prior_missing_sense_drafts':len(prior),
   'new_basic_drafts':len(new),'all_low_conflict_words':len(low),
   'all_low_conflict_drafts':len(covered_all & low),
   'remaining_low_conflict_words_without_examples':len(low-covered_all),
   'new_basic_source_meaning_text_variants':sum(x['meaning_differs_from_lexical_source'] for x in new),
   'new_basic_manual_lexical_risk_cases':len(notes),
   'publisher_approved_senses':0,'ops_signed_senses':0,
   'production_or_staging_d1_writes':0,'old_user_state_migrations':0,
   'commercial_release_ready':False}
 (out/'summary-basic-last-batch.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 return report

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--triage-dir',required=True);p.add_argument('--curated-tsv',required=True)
 p.add_argument('--prior-jsonl',action='append',required=True)
 p.add_argument('--out',required=True);p.add_argument('--expected-rows',type=int,default=300)
 p.add_argument('--private-risk-labels-json',default=None)
 a=p.parse_args()
 print(json.dumps(compile_remaining_basic(a.triage_dir,a.curated_tsv,a.prior_jsonl,a.out,a.expected_rows,load_private_risk_labels(a.private_risk_labels_json)),ensure_ascii=False,indent=2))
if __name__=='__main__':main()