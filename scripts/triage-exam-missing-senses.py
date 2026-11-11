#!/usr/bin/env python3
"""Private offline triage for missing historical teaching senses, source-checked.

Inputs: previously SHA-manifested PRIVATE 7391-word ZIP. Output: strictly
unreviewed POS/meaning suggestions, *never* final teaching cards or sense IDs.
No network, no user data or D1 writes, no publisher approvals.
"""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import csv
import io
import json
import re
from pathlib import Path
import zipfile

POS = re.compile(r'^\s*(n|vt|vi|v|a|adj|adv|prep|pron|conj|interj|int|art|num|aux|abbr|pl)\.\s*(\S.+|\S)$',re.I)
NORMAL = {'a':'adj','int':'interj'}
TIERS = ('基础','四级新增','六级新增','考研新增')
ENTRY = re.compile('^gdict_[0-9a-f]{24}$')
FORBIDDEN = ('approved_sense_id',)


def read_lines(data):
    for l in data.decode('utf-8').splitlines():
        if l.strip():
            yield json.loads(l)


def validate_manifest(archive):
    members=archive.namelist()
    if len(members)!=len(set(members)) or len(members)>150:
        raise ValueError('DUPLICATE_OR_UNEXPECTED_ZIP_MEMBERS')
    for n in members:
        if '..' in Path(n).parts or n.startswith('/') or '\\' in n:
            raise ValueError('UNSAFE_ZIP_PATH')
    manifests=[x for x in members if x.endswith('/FILE_MANIFEST_SHA256.json')]
    if len(manifests)!=1:
        raise ValueError('MISSING_OR_DUPLICATE_SHA_MANIFEST')
    root=manifests[0].split('/')[0]+'/'
    manifest=json.loads(archive.read(manifests[0]))
    if not isinstance(manifest,dict) or len(manifest)!=len(members)-1:
        raise ValueError('SHA_MANIFEST_MEMBERS_COUNT_MISMATCH')
    for n in members:
        if n==manifests[0]:continue
        key=n.removeprefix(root)
        m=manifest.get(key)
        data=archive.read(n)
        if not m or m.get('bytes')!=len(data) or m.get('sha256')!=sha256(data).hexdigest():
            raise ValueError('SOURCE_SHA256_MISMATCH:'+key)
    return root


def suggest_meanings(raw):
    """Conservative POS-aware *review hints*, without lexical sense identity."""
    if not isinstance(raw,str) or not raw.strip():return [],['CHINESE_TRANSLATION_MISSING']
    segments=raw.replace('\\n','\n').replace('\\r','\r').replace('\r','\n').splitlines()
    tagged=[]
    for line in segments:
        for part in re.split(r'[；;]',line):
            m=POS.match(part)
            if not m:continue
            pos=NORMAL.get(m.group(1).lower(),m.group(1).lower())+'.'
            text=m.group(2).strip()
            # Don't treat legal, chemical, technical or annotation labels as the core meaning.
            text=re.split(r'\s*\[(?:计|医|化|法|经|电|机|建)[^]]*\]',text,maxsplit=1)[0]
            parts=[p.strip() for p in re.split(r'[,，、]',text) if p.strip()]
            clean=[]
            for meaning in parts:
                if ('[' in meaning or ']' in meaning or len(meaning)>26 or
                    meaning.startswith(('.',':','(',')')) or not re.search(r'[\u4e00-\u9fff]',meaning)):
                    continue
                if meaning not in clean:clean.append(meaning)
            if clean:tagged.append((pos,clean))
    grouped={}
    for pos,items in tagged:
        dst=grouped.setdefault(pos,[])
        for item in items:
            if item not in dst:dst.append(item)
    hints=[{'pos_unverified':pos,'meaning_candidates_unverified':meanings[:5],
            'source_meaning_count':len(meanings),'example_en_draft':None,
            'example_zh_draft':None,'approved_sense_id':None,
            'publisher_approved':False}
            for pos,meanings in grouped.items()]
    flags=[]
    if not hints:flags.append('NO_PARSEABLE_POS_MEANING')
    if len(hints)>1:flags.append('MULTIPLE_POS_REVIEW')
    if any(h['source_meaning_count']>5 for h in hints):flags.append('MANY_MEANINGS_REVIEW')
    if any('...' in str(h['meaning_candidates_unverified']) for h in hints):flags.append('ELLIPSIS_CONTEXT_REVIEW')
    return hints,flags


def build(source_zip,output_dir,fixture=False):
    out=Path(output_dir)
    if out.exists():raise ValueError('REFUSE_OVERWRITE_PRIVATE_OUTPUT')
    with zipfile.ZipFile(source_zip) as z:
        root=validate_manifest(z)
        source_sum=json.loads(z.read(root+'source_summary.json'))
        if not fixture and source_sum.get('target_headwords')!=7391:
            raise ValueError('SOURCE_TARGET_SET_DRIFT')
        files=sorted(n for n in z.namelist() if n.startswith(root+'batch/REVIEW_') and n.endswith('_NOT_APPROVED.jsonl'))
        if not files:raise ValueError('MISSING_PRIVATE_REVIEW_BATCHES')
        rows=[x for filename in files for x in read_lines(z.read(filename))]
        seen=set();ids=set();counts=Counter();by_tier=defaultdict(list);flag_count=Counter();historical=0
        for row in rows:
            w=row.get('headword');entry=row.get('entry_id')
            if (not isinstance(w,str) or w in seen or row.get('target_tier') not in TIERS or
                row.get('publisher_approved') is not False or row.get('teaching_ready') is not False or
                row.get('publication_ready') is not False or row.get('approved_sense_id') is not None):
                raise ValueError('UNSAFE_OR_DUPLICATE_SOURCE_ROW')
            seen.add(w)
            if entry is not None and (not ENTRY.fullmatch(entry) or entry!='gdict_'+sha256(w.encode()).hexdigest()[:24]):
                raise ValueError('SOURCE_ENTRY_ID_MISMATCH')
            hist=row.get('historical_sense_candidates')
            if not isinstance(hist,list):raise ValueError('MISSING_HISTORICAL_SENSE_ARRAY')
            for h in hist:
                if h.get('approved_sense_id') is not None or h.get('publisher_approved') is not False:
                    raise ValueError('HISTORICAL_SENSE_ALREADY_APPROVED_UNEXPECTED')
                historical+=1
                for old in h.get('old_word_ids',[]):
                    if not isinstance(old,str) or not old or old in ids:
                        raise ValueError('LEGACY_OLD_ID_COLLISION')
                    ids.add(old)
            if hist:continue
            es=row.get('source_ecdict_unverified') or {}
            ipa=row.get('source_ipa_us_unverified') or []
            if not isinstance(ipa,list):raise ValueError('INVALID_IPA_CANDIDATES')
            meanings,flags=suggest_meanings(es.get('raw_chinese_meanings_unverified',''))
            if entry is None:flags.append('ABBREVIATION_REQUIRES_ENTRY_ID_REVIEW')
            if not ipa:flags.append('US_IPA_MISSING')
            if len(ipa)>1:flags.append('MULTIPLE_US_PRONUNCIATIONS')
            if not es.get('raw_chinese_meanings_unverified'):flags.append('NO_ECDICT_CHINESE_SOURCE')
            if any(len(p['meaning_candidates_unverified'])>1 for p in meanings):
                flags.append('MULTIPLE_CHINESE_TRANSLATIONS_REVIEW')
            if flags and any(f in flags for f in ('ABBREVIATION_REQUIRES_ENTRY_ID_REVIEW','US_IPA_MISSING','NO_ECDICT_CHINESE_SOURCE','NO_PARSEABLE_POS_MEANING')):
                lane='SOURCE_GAP_OR_SPECIAL_REVIEW'
            elif len(ipa)>1 or len(meanings)>1 or any(f in flags for f in ('MANY_MEANINGS_REVIEW','ELLIPSIS_CONTEXT_REVIEW','MULTIPLE_CHINESE_TRANSLATIONS_REVIEW')):
                lane='POLYSEMY_OR_PRONUNCIATION_REVIEW'
            else:lane='SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW'
            item={
                'schema':'wordletter-missing-sense-review-hints-v1',
                'headword':w,'entry_id':entry,'target_tier':row['target_tier'],
                'owner_rank':row.get('original_priority_order'),
                'review_lane':lane,'pos_meaning_suggestions_unverified':meanings,
                'ipa_us_candidates_unverified':ipa,'raw_english_definition_unverified':es.get('raw_english_definition_unverified',''),
                'source_translation_unverified':es.get('raw_chinese_meanings_unverified',''),
                'source_refs':source_sum.get('source_references'),
                'risk_flags':sorted(set(flags)),
                'original_example_en_draft':None,'original_example_zh_draft':None,
                'source_history_present':False,'approved_sense_id':None,
                'teaching_ready':False,'publisher_approved':False,'publication_ready':False,
                'source_origin':'PRIVATE_SHA_MANIFEST_VERIFIED_EXAM_REVIEW_ZIP',
                'rights_review_required':True,'manual_sense_review_required':True,
            }
            by_tier[row['target_tier']].append(item)
            counts[lane]+=1
            flag_count.update(item['risk_flags'])
        if not fixture and (len(rows),len(by_tier['基础'])+len(by_tier['四级新增'])+len(by_tier['六级新增'])+len(by_tier['考研新增']),historical,len(ids))!=(7391,6550,1067,2104):
            raise ValueError('PRIVATE_TARGET_OR_HISTORY_COUNTS_DRIFT')
        out.mkdir(parents=True,mode=0o700)
        for tier,items in by_tier.items():
            # Review easy words first within each cohort, not source-record order.
            order={'SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW':0,'POLYSEMY_OR_PRONUNCIATION_REVIEW':1,'SOURCE_GAP_OR_SPECIAL_REVIEW':2}
            items.sort(key=lambda x:(order[x['review_lane']],x['owner_rank'] or 10**10,x['headword']))
            fn={'基础':'BASIC','四级新增':'CET4_NEW','六级新增':'CET6_NEW','考研新增':'POSTGRAD_NEW'}[tier]
            (out/f'{fn}_MISSING_SENSES_REVIEW_ONLY.jsonl').write_text(''.join(json.dumps(i,ensure_ascii=False)+'\n' for i in items),encoding='utf-8')
        stats={'status':'MISSING_SENSES_TRIAGED_NEVER_APPROVED',
               'source_zip_sha256':sha256(Path(source_zip).read_bytes()).hexdigest(),
               'all_source_headwords':len(rows),'historical_candidate_senses':historical,
               'legacy_old_ids_in_phase_unchanged':len(ids),'missing_historical_headwords':sum(len(v) for v in by_tier.values()),
               'lanes':dict(counts),'risk_flags':dict(flag_count),
               'tiers':{k:{'count':len(by_tier.get(k,[])),'lanes':dict(Counter(x['review_lane'] for x in by_tier[k]))} for k in TIERS},
               'publisher_approved_senses':0,'user_study_changes':0,'remote_d1_writes':0,
               'rights_confirmed':False,'source_is_live_production':False,'publisher_signature_present':False}
        (out/'triage-summary.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        (out/'README_非可售词卡_仅用于审稿.md').write_text(
            '# 妙屋英语 · 无历史义项词头审稿初稿\n\n本包仅从已核验 SHA 的私人来源词典中提取 POS/中文释义**候选片段**，不含已批准词义和可售词卡。\n'
            '“易审”仅表示源结构冲突少，绝不代表准确性或许可通过。需人工确认义项/语境/IPA/原创双语例句、出版社授权审核；不存在自动关联旧复习状态。\n'
            '不能将第三方定义、例句直接用于收费教学内容；请保留来源说明与旧 ID。\n',encoding='utf-8')
        return stats


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-zip',required=True)
    p.add_argument('--out',required=True)
    args=p.parse_args()
    print(json.dumps(build(args.source_zip,args.out),ensure_ascii=False,indent=2))

if __name__=='__main__':main()