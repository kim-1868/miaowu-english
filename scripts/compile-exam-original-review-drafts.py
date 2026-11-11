#!/usr/bin/env python3
"""Attach editorially authored examples to the PRIVATE low-conflict missing-sense review queue.

Never marks a lesson approved; does not send content anywhere, cannot be
used as an OPS signoff or a user study state migration.
"""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

TIERS = ('基础','四级新增','六级新增','考研新增')


def validate_private_example(row,source):
    word=row['headword'].lower()
    errors=[]
    if source.get('review_lane')!='SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW':errors.append('NOT_LOW_CONFLICT_SOURCE')
    if source.get('publisher_approved') is not False or source.get('approved_sense_id') is not None:errors.append('SOURCE_PREAPPROVED')
    if source.get('headword')!=word or source.get('entry_id') is None:errors.append('SOURCE_WORD_ID_MISMATCH')
    if source.get('target_tier')!=row.get('target_tier'):errors.append('LEVEL_MISMATCH')
    meaning=row.get('meaning_zh_draft','').strip()
    sentence=row.get('example_en_draft','').strip()
    translation=row.get('example_zh_draft','').strip()
    if not re.search(r'(?<![a-z])'+re.escape(word)+r'(?![a-z])',sentence.lower()):errors.append('HEADWORD_NOT_LITERAL_IN_EXAMPLE')
    if len(sentence)<24 or len(sentence)>220 or len(translation)<8 or len(translation)>150:
        errors.append('EXAMPLE_LENGTH_OUT_OF_RANGE')
    if not sentence.endswith(('.', '?', '!')):errors.append('EXAMPLE_PUNCTUATION_MISSING')
    if not re.search(r'[\u4e00-\u9fff]',translation):errors.append('NO_CHINESE_TRANSLATION')
    if not re.search(r'[\u4e00-\u9fff]',meaning):errors.append('NO_CHINESE_MEANING')
    suggestions=source.get('pos_meaning_suggestions_unverified') or []
    if len(suggestions)!=1 or row.get('pos_draft')!=suggestions[0]['pos_unverified']:
        errors.append('POS_REQUIRES_SPECIAL_REVIEW')
    return errors


def compile_private_drafts(triage_dir,curated_tsv,out_dir,expected_rows=None):
    t=Path(triage_dir);o=Path(out_dir)
    if o.exists():raise ValueError('REFUSE_OVERWRITE_PRIVATE_DRAFT_DIR')
    all_sources={}
    for file in t.glob('*MISSING_SENSES_REVIEW_ONLY.jsonl'):
        for line in file.read_text(encoding='utf-8').splitlines():
            if not line:continue
            data=json.loads(line)
            if data['headword'] in all_sources:raise ValueError('SOURCE_DUPLICATE_HEADWORD')
            all_sources[data['headword']]=data
    if not all_sources:raise ValueError('SOURCE_REVIEW_ROWS_NOT_FOUND')
    drafts=[];seen=set();errors=[];source_changes=0
    with Path(curated_tsv).open(encoding='utf-8',newline='') as f:
        for n,rec in enumerate(csv.reader(f,delimiter='|'),1):
            if not rec:continue
            if len(rec)!=6:raise ValueError(f'CURATED_TSV_COLUMNS_WRONG_{n}')
            tier,word,pos,meaning,en,zh=(v.strip() for v in rec)
            if word in seen:raise ValueError('DUPLICATE_CURATED_WORD_'+word)
            seen.add(word)
            src=all_sources.get(word)
            if not src:raise ValueError(f'CURATED_WORD_NOT_IN_SOURCE_{n}_{word}')
            row={'target_tier':tier,'headword':word,'pos_draft':pos,
                 'meaning_zh_draft':meaning,'example_en_draft':en,
                 'example_zh_draft':zh}
            errs=validate_private_example(row,src)
            if errs:errors.append({'line':n,'headword':word,'errors':errs})
            fragments=src['pos_meaning_suggestions_unverified'][0]['meaning_candidates_unverified']
            differs=not any(meaning in frag or frag in meaning for frag in fragments)
            if differs:source_changes+=1
            row.update({'schema':'wordletter-new-original-example-private-draft-v1',
                'entry_id':src['entry_id'],'source_review_lane':src['review_lane'],
                'source_pos_hints_unverified':src['pos_meaning_suggestions_unverified'],
                'source_ipa_us_candidates_unverified':src['ipa_us_candidates_unverified'],
                'meaning_differs_from_lexical_source':differs,
                'needs_special_meaning_review':differs,
                'source_commit_ecdict':(src.get('source_refs') or {}).get('ecdict',{}).get('commit'),
                'source_commit_ipa_us':(src.get('source_refs') or {}).get('us_ipa',{}).get('commit'),
                'example_text_sha256':hashlib.sha256((word+'\0'+en+'\0'+zh).encode()).hexdigest(),
                'original_draft_not_copied_from_source':True,
                'human_content_review_required':True,
                'rights_final_reviewed':False,'publisher_approved':False,
                'approved_sense_id':None,'learning_status_modified':False,
                'ops_import_allowed':False})
            drafts.append(row)
    if expected_rows is not None and len(drafts)!=expected_rows:raise ValueError('CURATED_COUNT_DRIFT')
    if errors:raise ValueError('CURATED_EXAMPLE_QA_FAIL:'+json.dumps(errors[:10],ensure_ascii=False))
    o.mkdir(parents=True,mode=0o700)
    (o/'100_NEW_ORIGINAL_EXAMPLES_DRAFT_NOT_APPROVED.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in drafts),encoding='utf-8')
    with (o/'100_NEW_ORIGINAL_EXAMPLES_FOR_EDITOR.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['target_tier','headword','pos_draft','meaning_zh_draft','example_en_draft','example_zh_draft','meaning_differs_from_lexical_source','editor_decision','editor_notes'])
        writer.writeheader()
        for x in drafts:writer.writerow({k:x.get(k,'') for k in writer.fieldnames})
    summary={'status':'ORIGINAL_NEW_WORD_EXAMPLES_DRAFT_NOT_APPROVED',
             'rows':len(drafts),'distinct_headwords':len(seen),
             'by_tier':{t:sum(x['target_tier']==t for x in drafts) for t in TIERS},
             'lexical_source_meaning_changed_for_context':source_changes,
             'human_edit_required':True,'final_publishable':False,
             'teaching_senses_approved':0,'database_writes':0,'customer_data_accessed':False}
    (o/'summary-original-examples.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return summary


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--triage-dir',required=True);p.add_argument('--curated-tsv',required=True);p.add_argument('--out',required=True)
    args=p.parse_args()
    print(json.dumps(compile_private_drafts(args.triage_dir,args.curated_tsv,args.out,expected_rows=100),ensure_ascii=False,indent=2))

if __name__=='__main__':main()