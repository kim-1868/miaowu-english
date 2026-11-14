#!/usr/bin/env python3
"""Offline only. Strictly attach private, authored exam examples with no Publisher approval.

Compiles a follow-up batch on top of a previous private draft set, preserving
old candidate keys. Does NOT edit OPS or Cloudflare, public data, old IDs, or lessons.
"""
import argparse
import csv
import hashlib
import importlib.util
import json
from collections import Counter
from pathlib import Path

EXAM=('四级新增','六级新增','考研新增')
# Known words with misleading, atypical, domain-specific, name/trademark senses.
# A flag is not a definition; humans must validate before educational release.

def load_private_risk_labels(path):
    if path is None:return {}
    result=json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(result,dict) or any(not isinstance(k,str) or not k or not isinstance(v,str) or not v for k,v in result.items()):
        raise ValueError('INVALID_PRIVATE_RISK_LABELS_MAP')
    return result

def load_jsonl(path):
    p=Path(path)
    if not p.is_file():raise ValueError('PRIVATE_JSONL_MISSING')
    return [json.loads(line) for line in p.read_text(encoding='utf-8').splitlines() if line.strip()]

def compile_exam_batch(triage_dir,curated_tsv,prior_jsonl,out_dir,expected_rows=165,risk_flags=None):
    t=Path(triage_dir);out=Path(out_dir)
    if out.exists():raise ValueError('REFUSE_OVERWRITE_PRIVATE_INCREMENTAL_REVIEW_DIR')
    src={}
    for file in t.glob('*MISSING_SENSES_REVIEW_ONLY.jsonl'):
        for row in load_jsonl(file):
            head=row['headword']
            if head in src:raise ValueError('DUPLICATE_TRIAGE_HEADWORD')
            if row.get('publisher_approved') is not False or row.get('approved_sense_id') is not None:
                raise ValueError('TRIAGE_PREAPPROVED_FORBIDDEN')
            src[head]=row
    before=load_jsonl(prior_jsonl)
    old={}
    for p in before:
        head=p.get('headword')
        if not head or head in old or p.get('publisher_approved') is not False or p.get('approved_sense_id') is not None:
            raise ValueError('PRIOR_DRAFT_IDENTITY_INVALID')
        if head not in src or p.get('entry_id')!=src[head]['entry_id']:
            raise ValueError('PRIOR_DRAFT_SOURCE_CHANGED')
        old[head]=p
    spec=importlib.util.spec_from_file_location('previous_compiler',Path(__file__).resolve().parent/'compile-exam-original-review-drafts.py')
    if spec is None or spec.loader is None:raise ValueError('ORIGINAL_COMPILER_MISSING')
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    # Inspect names/identity before creating output.
    words=[]
    with Path(curated_tsv).open(encoding='utf-8',newline='') as fh:
        for i,fields in enumerate(csv.reader(fh,delimiter='|'),1):
            if not fields:continue
            if len(fields)!=6:raise ValueError(f'CURATED_FIELD_COUNT_{i}')
            tier,word,*_=fields
            if tier not in EXAM or word not in src or src[word].get('target_tier')!=tier:
                raise ValueError(f'CURATED_EXAM_TIER_OR_SOURCE_MISMATCH_{i}')
            if word in old:raise ValueError('EXAMPLE_COLLIDES_WITH_PRIOR_BATCH_'+word)
            words.append(word)
    if len(set(words))!=len(words) or len(words)!=expected_rows:
        raise ValueError('UNEXPECTED_FOLLOWUP_COUNT_OR_DUPLICATE')
    eligible={x['headword'] for x in src.values() if x['target_tier'] in EXAM
             and x['review_lane']=='SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW'}
    covered=(set(old)|set(words))&eligible
    if covered!=eligible:raise ValueError('EXAM_SINGLE_POS_TIER_NOT_FULLY_DRAFTED:'+
                                          ','.join(sorted(eligible-covered)[:12]))
    # Preserve original compiler's strict no-publisher and literal-word checks.
    result=mod.compile_private_drafts(t,curated_tsv,out,expected_rows=expected_rows)
    generated=out/'100_NEW_ORIGINAL_EXAMPLES_DRAFT_NOT_APPROVED.jsonl'
    drafts=load_jsonl(generated)
    if len(drafts)!=expected_rows or any(x['headword'] not in words for x in drafts):
        raise ValueError('DRAFT_WORD_IDENTITY_CHANGED')
    source=generated.read_text(encoding='utf-8')
    generated.rename(out/f'{expected_rows}_ADDITIONAL_EXAM_ORIGINAL_EXAMPLES_DRAFT_NOT_APPROVED.jsonl')
    (out/'100_NEW_ORIGINAL_EXAMPLES_FOR_EDITOR.csv').rename(
         out/f'{expected_rows}_ADDITIONAL_EXAM_ORIGINAL_EXAMPLES_FOR_EDITOR.csv')
    semantic_flags=[]
    for x in drafts:
        word=x['headword'];warning=(risk_flags or {}).get(word)
        if warning or x['meaning_differs_from_lexical_source']:
            semantic_flags.append({'word':word,'tier':x['target_tier'],
                 'source_unverified_meanings':x['source_pos_hints_unverified'][0]['meaning_candidates_unverified'],
                 'proposed_meaning_zh':x['meaning_zh_draft'],
                 'reason_code':warning or 'LEXICAL_SOURCE_TRANSLATION_DIFFERS',
                 'original_meaning_differs':x['meaning_differs_from_lexical_source'],
                 'requires_human_lexical_rights_review':True,'publisher_approved':False})
    (out/'semantic_risks_for_human_editor.jsonl').write_text(
        ''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in semantic_flags),encoding='utf-8')
    report={'status':'EXAM_ADDITIONAL_DRAFTS_NOT_APPROVED',
          'new_drafts':len(drafts), 'prior_drafts':len(before),
          'all_missing_sense_exam_low_conflict_words':len(eligible),
          'exam_low_conflict_all_drafted':len(covered)==len(eligible),
          'previous_plus_incremental_exam_drafts':len(covered),
          'remaining_low_conflict_basic_words_without_drafts':len({x['headword'] for x in src.values() if x['target_tier']=='基础' and x['review_lane']=='SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW'}-set(old)),
          'by_tier':dict(Counter(x['target_tier'] for x in drafts)),
          'meaning_differs_from_raw_source':sum(x['meaning_differs_from_lexical_source'] for x in drafts),
          'manual_lexical_risk_rows':len(semantic_flags),
          'old_card_ids_written':0,'publisher_approved_senses':0,
          'remote_d1_writes':0,'user_state_writes':0,'production_publish_allowed':False}
    (out/'summary-additional-exam-drafts.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return report

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--triage-dir',required=True)
    ap.add_argument('--curated-tsv',required=True)
    ap.add_argument('--prior-jsonl',required=True)
    ap.add_argument('--out',required=True)
    ap.add_argument('--expected-rows',type=int,default=165)
    ap.add_argument('--private-risk-labels-json',default=None)
    args=ap.parse_args()
    print(json.dumps(compile_exam_batch(args.triage_dir,args.curated_tsv,args.prior_jsonl,
                                        args.out,args.expected_rows,load_private_risk_labels(args.private_risk_labels_json)),ensure_ascii=False,indent=2))
if __name__=='__main__':main()