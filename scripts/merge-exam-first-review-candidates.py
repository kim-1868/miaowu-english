#!/usr/bin/env python3
"""Combine owner exam list, private legacy senses and optional pinned open-source drafts.

LOCAL / PRIVATE WORKSTATION ONLY. Never publishes, sets reviewed flags, sends content
upstream, rewrites old IDs, or resolves polysemy without human signoff.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path

TIERS = ('基础', '四级新增', '六级新增', '考研新增')
PRIORITY = ('跨书高复用·优先人工确认', '低冲突·快速初审', '多义音标等·专项审查')

def rows(path):
    with Path(path).open(encoding='utf-8') as stream:
        for n, line in enumerate(stream, 1):
            if line.strip():
                try:
                    x=json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(f'BAD_JSONL_LINE_{n}:{path}') from exc
                if not isinstance(x,dict):
                    raise ValueError(f'INVALID_ROW_{n}:{path}')
                yield x

def sha(path):
    dig=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1<<20),b''):
            dig.update(chunk)
    return dig.hexdigest()

def plan(target_path,historical_path,drafts_path,source_path=None,batch_size=150):
    if not (1<=batch_size<=200):
        raise ValueError('BATCH_SIZE_OUT_OF_RANGE')
    targets=list(rows(target_path))
    if len(targets)!=len({t.get('headword') for t in targets}):
        raise ValueError('TARGET_DUPLICATE')
    if any(t.get('priority_order')!=i or t.get('target_tier') not in TIERS or
           t.get('teaching_sense_approved') is not False or t.get('publication_ready') is not False
           for i,t in enumerate(targets,1)):
        raise ValueError('UNSAFE_OWNER_TARGET_STATUS_OR_ORDER')
    by_word={t['headword']:[] for t in targets}
    identity={t['headword']:t.get('entry_id') for t in targets}
    histories=list(rows(historical_path))
    hashes=set(); used_old=set()
    for h in histories:
        key=h.get('candidate_hash_sha256')
        if not isinstance(key,str) or len(key)!=64 or key in hashes:
            raise ValueError('INVALID_OR_DUPLICATE_HISTORICAL_SENSE_HASH')
        hashes.add(key)
        if h.get('publisher_approved') is not False or h.get('approved_sense_id') is not None:
            raise ValueError('HISTORICAL_SENSE_NOT_DRAFT')
        ids=h.get('old_word_ids')
        if not isinstance(ids,list) or not ids or any(not isinstance(v,str) for v in ids):
            raise ValueError('BAD_OLD_WORD_ID')
        for old_id in ids:
            if old_id in used_old:
                raise ValueError('OLD_WORD_ID_USED_BY_MULTIPLE_SENSES')
            used_old.add(old_id)
        head=h.get('headword')
        if head in by_word:
            if h.get('entry_id')!=identity[head] or h.get('first_phase_target') is not True:
                raise ValueError('HISTORICAL_ENTRY_IDENTITY_CONFLICT')
            by_word[head].append(h)
        elif h.get('first_phase_target'):
            raise ValueError('HISTORICAL_FIRST_PHASE_NOT_IN_OWNER')
    suggestions={}
    for d in rows(drafts_path):
        digest=d.get('candidate_hash_sha256')
        if (digest not in hashes or digest in suggestions or d.get('publisher_approved') is not False or
           d.get('approved_sense_id') is not None or d.get('reviewer_approved') is not False):
            raise ValueError('INVALID_OR_PREAPPROVED_EDITORIAL_DRAFT')
        if d.get('entry_id')!=identity.get(d.get('headword')):
            raise ValueError('EDITORIAL_DRAFT_ENTRY_CONFLICT')
        suggestions[digest]=d
    source={}
    if source_path:
        for s in rows(source_path):
            word=s.get('headword')
            if (word not in by_word or word in source or s.get('entry_id')!=identity[word] or
                s.get('teaching_ready') is not False or s.get('publisher_approved') is not False or
                s.get('sense_id') is not None or s.get('publication_ready') is not False):
                raise ValueError('UNSAFE_OPENSOURCE_CANDIDATE')
            source[word]=s
        if set(source)!=set(by_word):
            raise ValueError('OPENSOURCE_MISSING_OWNER_ROWS')
    results=[]; lane_counts=collections.Counter(); tier_counts=collections.Counter()
    for t in targets:
        word=t['headword']; hist=by_word[word]
        lane=min((PRIORITY.index(h['review_priority_lane']) for h in hist),default=3)
        state=PRIORITY[lane] if lane<3 else '无历史义项·待原创教学内容'
        sense_rows=[]
        for h in hist:
            d=suggestions.get(h['candidate_hash_sha256'])
            sense_rows.append({
                'candidate_hash_sha256':h['candidate_hash_sha256'],
                'old_word_ids':h['old_word_ids'],
                'books_count':h.get('books_count'),
                'part_of_speech_unverified':h.get('part_of_speech'),
                'meaning_zh_unverified':h.get('meaning_zh'),
                'phonetic_uk_historical_unverified':h.get('phonetic_uk_variants',[]),
                'phonetic_us_historical_unverified':h.get('phonetic_us_variants',[]),
                'example_candidates_historical_unverified':h.get('example_candidates',[])[:3],
                'qa_flags':h.get('qa_flags',[]),
                'editorial_example_en_draft':d.get('original_example_en_draft') if d else None,
                'editorial_example_zh_draft':d.get('original_example_zh_draft') if d else None,
                'editorial_meaning_zh_draft':d.get('proposed_meaning_zh') if d else None,
                'approved_sense_id':None,
                'publisher_approved':False
            })
        src=source.get(word)
        result={
            'schema':'wordletter-exam-first-private-review-v1',
            'headword':word,'entry_id':identity[word],
            'target_tier':t['target_tier'],'original_priority_order':t['priority_order'],
            'review_lane':state,'review_sense_count':len(sense_rows),
            'historical_sense_candidates':sense_rows,
            'source_ecdict_unverified':src.get('ecdict') if src else None,
            'source_ipa_us_unverified':src.get('phonetic_us_candidates_unverified') if src else None,
            'source_blockers':src.get('blockers',[]) if src else ['PINNED_ECDICT_AND_IPA_SOURCE_JOIN_PENDING'],
            'requires_new_original_example':not any(s['editorial_example_en_draft'] for s in sense_rows),
            'sense_identity_review_required':len(sense_rows)>1,
            'publisher_approved':False,'teaching_ready':False,'publication_ready':False,
            'approved_sense_id':None,
        }
        lane_counts[state]+=1; tier_counts[t['target_tier']]+=1
        results.append(result)
    results.sort(key=lambda r:(next((i for i,x in enumerate(PRIORITY) if r['review_lane']==x),3),
                        TIERS.index(r['target_tier']),r['original_priority_order']))
    summary={
        'status':'PRIVATE_UNAPPROVED_REVIEW_WORKLIST_ONLY',
        'target_headwords':len(targets),
        'historical_all_senses':len(histories),
        'historical_first_phase_senses':sum(len(v) for v in by_word.values()),
        'historical_first_phase_headwords':sum(bool(v) for v in by_word.values()),
        'headwords_without_historical_senses':sum(not v for v in by_word.values()),
        'legacy_old_word_ids_preserved':len(used_old),
        'original_editorial_example_suggestions':len(suggestions),
        'headwords_with_pinned_opensource_candidates':len(source),
        'review_lanes':dict(lane_counts),
        'tiers':dict(tier_counts),
        'batch_size':batch_size,'batches':(len(results)+batch_size-1)//batch_size,
        'rights_reviewed':False,'approved_senses':0,'production_writes':0,
        'source_hashes_sha256':{
            'owner_target':sha(target_path),'historical_senses':sha(historical_path),
            'editorial_drafts':sha(drafts_path),
            'opensource_candidates':sha(source_path) if source_path else None,
        }
    }
    return results,summary

def write_worklist(out,results,summary):
    output=Path(out)
    if output.exists():
        raise ValueError('PRIVATE_OUTPUT_EXISTS_NO_OVERWRITE')
    output.mkdir(parents=True,mode=0o700)
    (output/'batch').mkdir(mode=0o700)
    for i in range(0,len(results),summary['batch_size']):
        num=i//summary['batch_size']+1
        p=output/'batch'/f'REVIEW_{num:03d}_NOT_APPROVED.jsonl'
        with p.open('x',encoding='utf-8') as f:
            for row in results[i:i+summary['batch_size']]:
                f.write(json.dumps(row,ensure_ascii=False)+'\n')
    (output/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (output/'README.txt').write_text(
        'PRIVATE OFFLINE WORKLIST. Never upload contents to public GitHub.\n'
        'All IPA, POS, meanings and prior examples are unverified candidates; only original editorial examples are labelled draft.\n'
        'No word sense is approved and no learning/entitlement/database record is modified.\n'
        'Apply source candidates only after validating pinned ECDICT + IPA licenses; no UK IPA import.\n',encoding='utf-8')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('targets','historical','drafts','out'):
        p.add_argument('--'+arg,required=True)
    p.add_argument('--opensource-candidates');p.add_argument('--batch-size',type=int,default=150)
    args=p.parse_args()
    results,summary=plan(args.targets,args.historical,args.drafts,args.opensource_candidates,args.batch_size)
    write_worklist(args.out,results,summary)
    print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':
    main()