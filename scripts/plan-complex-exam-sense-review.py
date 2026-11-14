#!/usr/bin/env python3
"""Fail-closed PRIVATE offline scheduling of complex exam word-source hints.

Input is 4 owner-only JSONL files from verified private 6550 triage package.
Produces worklists, NOT lexical senses, lessons, approved pronunciation or user migration.
No network, database or cloud secrets used. Never commit actual outputs to public GitHub.
"""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
from pathlib import Path
import re

TIERS={'基础':'BASIC','四级新增':'CET4_NEW','六级新增':'CET6_NEW','考研新增':'POSTGRAD_NEW'}
NAMES={tier:f'{slug}_MISSING_SENSES_REVIEW_ONLY.jsonl' for tier,slug in TIERS.items()}
ENTRY=re.compile(r'^gdict_[0-9a-f]{24}$')
WORD=re.compile(r"^[a-z]+(?:['-][a-z]+)*$")
ABBR=re.compile(r'^[a-z]+(?:\.[a-z]+)*\.$')
LANES={'SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW','POLYSEMY_OR_PRONUNCIATION_REVIEW','SOURCE_GAP_OR_SPECIAL_REVIEW'}
RISKS={
 'MULTIPLE_CHINESE_TRANSLATIONS_REVIEW','MULTIPLE_POS_REVIEW','MULTIPLE_US_PRONUNCIATIONS',
 'MANY_MEANINGS_REVIEW','ELLIPSIS_CONTEXT_REVIEW','US_IPA_MISSING','NO_PARSEABLE_POS_MEANING',
 'ABBREVIATION_REQUIRES_ENTRY_ID_REVIEW','CHINESE_TRANSLATION_MISSING','NO_ECDICT_CHINESE_SOURCE'
}

def run(private_dir,output_dir,*,fixture=False):
    src=Path(private_dir);out=Path(output_dir)
    if not src.is_dir() or out.exists():raise ValueError('INPUT_MISSING_OR_OUTPUT_EXISTS')
    rows=[];fingerprint=sha256()
    for tier,filename in NAMES.items():
        p=src/filename
        data=p.read_bytes()
        fingerprint.update(filename.encode()+b'\0'+sha256(data).digest())
        for number,line in enumerate(data.decode('utf-8').splitlines(),1):
            if not line.strip():continue
            try:r=json.loads(line)
            except Exception as exc:raise ValueError(f'BAD_SOURCE_JSONL:{filename}:{number}') from exc
            if r.get('target_tier')!=tier:raise ValueError('CROSS_TIER_ROW_IN_WRONG_FILE')
            rows.append(r)
    seen=set();order=set();all_lanes=Counter();summary_tier=defaultdict(Counter)
    scheduled=[]
    for r in rows:
        word=r.get('headword');entry=r.get('entry_id');tier=r.get('target_tier');lane=r.get('review_lane')
        flags=r.get('risk_flags');hints=r.get('pos_meaning_suggestions_unverified');ipa=r.get('ipa_us_candidates_unverified')
        if (r.get('schema')!='wordletter-missing-sense-review-hints-v1' or not isinstance(word,str) or
            (not WORD.fullmatch(word) and not ABBR.fullmatch(word)) or word in seen or
            not isinstance(flags,list) or len(flags)!=len(set(flags)) or not set(flags)<=RISKS or
            not isinstance(hints,list) or not isinstance(ipa,list) or
            tier not in TIERS or lane not in LANES or not isinstance(r.get('owner_rank'),int) or
            r['owner_rank']<=0 or r['owner_rank'] in order or
            r.get('source_history_present') is not False or
            r.get('publisher_approved') is not False or
            r.get('teaching_ready') is not False or
            r.get('publication_ready') is not False or
            r.get('approved_sense_id') is not None):
            raise ValueError('UNSAFE_OR_DUPLICATE_PRIVATE_SOURCE')
        if entry is None:
            if 'ABBREVIATION_REQUIRES_ENTRY_ID_REVIEW' not in flags:raise ValueError('NULL_ENTRY_WITHOUT_ABBREVIATION_FLAG')
        elif not ENTRY.fullmatch(entry) or entry!='gdict_'+sha256(word.encode()).hexdigest()[:24]:
            raise ValueError('ENTRY_IDENTITY_CHANGED')
        seen.add(word);order.add(r['owner_rank']);all_lanes[lane]+=1;summary_tier[tier][lane]+=1
        if lane=='SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW':continue
        if lane=='SOURCE_GAP_OR_SPECIAL_REVIEW':
            cohort='S0_SOURCE_GAP_AND_SPECIAL'
            reason='Missing source / IPA / verified entry identity, review before sense drafting'
        elif flags==['MULTIPLE_US_PRONUNCIATIONS']:
            cohort='P1_IPA_VARIANT_ONLY_MACHINE_FLAGS'
            reason='Prioritize pronunciation review; source may still omit real polysemy or POS variants'
        elif 'MULTIPLE_POS_REVIEW' in flags:
            cohort='P2_MULTIPLE_POS_REQUIRES_SENSE_SPLIT'
            reason='Split sense by grammatical function and actual story use, never share review state by headword'
        elif 'MULTIPLE_CHINESE_TRANSLATIONS_REVIEW' in flags or 'MANY_MEANINGS_REVIEW' in flags:
            cohort='P3_MULTIPLE_MEANINGS_REQUIRES_CONTEXT'
            reason='Select one reviewed contextual meaning per use, no automatic arbitrary first gloss'
        else:
            cohort='P4_OTHER_COMPLEX_SOURCE_REVIEW'
            reason='Human editor checks source evidence, IPA and intended contextual meaning'
        scheduled.append({
          'schema':'wordletter-complex-sense-review-priority-v1',
          'headword':word,'entry_id':entry,'target_tier':tier,'owner_rank':r['owner_rank'],
          'cohort':cohort,'source_triage_lane':lane,'risk_flags_unverified':flags,
          'pos_options_unverified':hints,'us_ipa_options_unverified':ipa,
          'original_raw_translation_unverified':r.get('source_translation_unverified',''),
          'original_raw_english_definition_unverified':r.get('raw_english_definition_unverified',''),
          'editorial_instruction':reason,
          'editor_selected_pos':None,'editor_selected_meaning_zh':None,
          'editor_selected_phonetic_us':None,'editor_reviewed_ipa_uk':None,
          'editorial_example_en':None,'editorial_example_zh':None,
          'publisher_approved':False,'approved_sense_id':None,
          'old_word_ids':[],'old_study_state_writes':0,'production_publish_allowed':False,
          'human_editorial_review_required':True,'source_rights_review_required':True
        })
    if not fixture:
        if len(rows)!=6550 or all_lanes!={'POLYSEMY_OR_PRONUNCIATION_REVIEW':5863,
             'SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW':565,'SOURCE_GAP_OR_SPECIAL_REVIEW':122}:
            raise ValueError('SOURCE_SCOPE_OR_LANE_DRIFT')
        if len(scheduled)!=5985:raise ValueError('COMPLEX_REVIEW_SCOPE_DRIFT')
    priority={'S0_SOURCE_GAP_AND_SPECIAL':0,'P1_IPA_VARIANT_ONLY_MACHINE_FLAGS':1,
              'P2_MULTIPLE_POS_REQUIRES_SENSE_SPLIT':2,'P3_MULTIPLE_MEANINGS_REQUIRES_CONTEXT':3,
              'P4_OTHER_COMPLEX_SOURCE_REVIEW':4}
    scheduled.sort(key=lambda x:(priority[x['cohort']],list(TIERS).index(x['target_tier']),x['owner_rank'],x['headword']))
    cohorts=Counter(x['cohort'] for x in scheduled)
    if not fixture and cohorts['P1_IPA_VARIANT_ONLY_MACHINE_FLAGS']!=117:
        raise ValueError('IPA_ONLY_COHORT_COUNT_DRIFT')
    out.mkdir(parents=True,mode=0o700)
    for cohort in priority:
        items=[r for r in scheduled if r['cohort']==cohort]
        (out/(cohort+'.jsonl')).write_text(''.join(json.dumps(i,ensure_ascii=False)+'\n' for i in items),encoding='utf-8')
    for tier,slug in TIERS.items():
        items=[r for r in scheduled if r['target_tier']==tier]
        (out/(slug+'_COMPLEX_PRIORITY_REVIEW.jsonl')).write_text(''.join(json.dumps(i,ensure_ascii=False)+'\n' for i in items),encoding='utf-8')
    report={
        'status':'COMPLEX_PRIVATE_REVIEW_SCHEDULED_NOT_APPROVED',
        'source_sha256_fingerprint':fingerprint.hexdigest(),
        'source_missing_historical_headwords':len(rows),'scheduled_complex_headwords':len(scheduled),
        'already_handled_low_conflict_drafts_excluded':all_lanes['SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW'],
        'cohorts':dict(cohorts),'source_lanes':dict(all_lanes),
        'per_tier':{tier:{'all_missing_headwords':sum(summary_tier[tier].values()),
                           'complex_scheduled':sum(x['target_tier']==tier for x in scheduled),
                           'cohorts':dict(Counter(x['cohort'] for x in scheduled if x['target_tier']==tier))} for tier in TIERS},
        'every_source_headword_preserved_once':len(seen)==len(rows),
        'all_complex_scheduled_once':len(scheduled)==len(set(x['headword'] for x in scheduled)),
        'machine_ipa_only_does_not_imply_one_sense':True,
        'publisher_approved_senses':0,'legacy_word_links_created':0,
        'remote_d1_writes':0,'customer_study_state_writes':0,'publication_allowed':False
    }
    (out/'QA_REPORT_NOT_APPROVED.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return report

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--private-triage-dir',required=True)
    parser.add_argument('--out',required=True)
    args=parser.parse_args()
    print(json.dumps(run(args.private_triage_dir,args.out),ensure_ascii=False,indent=2))

if __name__=='__main__':main()