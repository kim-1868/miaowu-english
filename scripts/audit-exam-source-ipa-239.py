#!/usr/bin/env python3
"""Fail-closed private offline recovery diagnostics for S0 source gaps and P1 IPA variants.
Only produces editorial *suggestions*, never approved content or stable sense IDs.
"""
import hashlib,json,re,zipfile,csv,collections,sys
from pathlib import Path
TIERS=('基础','四级新增','六级新增','考研新增')
ENTRY=re.compile(r'^gdict_[a-f0-9]{24}$')

def require(ok,code):
    if not ok: raise ValueError(code)

POS=re.compile(r'^\s*(n|vt|vi|v|a|adj|adv|prep|pron|conj|interj|int|art|num|aux|abbr|pl)\.\s+(\S.*?)\s*$',re.I)


def parse_pos_recovery(tr):
    """Restore *only* explicitly typed parenthetical source notes, never invent POS."""
    result=[]
    for line in tr.replace('\\n','\n').splitlines():
        for seg in re.split('[；;]',line):
            m=POS.match(seg)
            if not m:continue
            raw=m.group(2).strip()
            if not raw.startswith('('):continue
            if not re.search(r'[\u4e00-\u9fff]',raw):continue
            # Never interpret grammar as proof of meaning; retain annotation as-is.
            pos=m.group(1).lower()
            if pos=='a':pos='adj'
            if pos=='int':pos='interj'
            result.append({'pos_unverified':pos+'.','raw_meaning_with_source_parenthetical_unverified':raw,'manual_review_required':True})
    return result


def validate(rows,cohort):
    seen=set()
    for r in rows:
        w=r.get('headword');eid=r.get('entry_id')
        require(isinstance(w,str) and w and w not in seen,'REPEATED_WORD')
        seen.add(w)
        require(r.get('target_tier') in TIERS and r.get('cohort')==cohort,'COHORT_OR_TIER_CHANGED')
        require(r.get('publisher_approved') is False and r.get('approved_sense_id') is None and r.get('production_publish_allowed') is False,'FORGED_APPROVAL')
        require(r.get('old_word_ids')==[],'UNEXPECTED_OLD_CARD_ID')
        if eid is None:
            require('ABBREVIATION_REQUIRES_ENTRY_ID_REVIEW' in r.get('risk_flags_unverified',[]),'MISSING_ENTRY_ID_WITHOUT_ABBREVIATION')
        else:
            require(ENTRY.fullmatch(eid) and eid=='gdict_'+hashlib.sha256(w.encode()).hexdigest()[:24],'ENTRY_HASH_MISMATCH')
    return seen


def inspect(s0,p1):
    a=validate(s0,'S0_SOURCE_GAP_AND_SPECIAL');b=validate(p1,'P1_IPA_VARIANT_ONLY_MACHINE_FLAGS')
    require(not (a&b),'DUPLICATE_CROSS_COHORT')
    require(len(a)==122 and len(b)==117,'REAL_SOURCE_SCOPE_CHANGED')
    report=collections.Counter();rows=[]
    for r in s0:
        flags=r['risk_flags_unverified']; recovery=parse_pos_recovery(r.get('original_raw_translation_unverified') or '')
        no_pos='NO_PARSEABLE_POS_MEANING' in flags
        no_ipa='US_IPA_MISSING' in flags
        no_zh='CHINESE_TRANSLATION_MISSING' in flags
        if 'ABBREVIATION_REQUIRES_ENTRY_ID_REVIEW' in flags:lane='ABBREVIATION_ID_AND_SENSE_EDITORIAL'
        elif no_pos and recovery:lane='EXPLICIT_PARENTHESES_POS_PARSER_FALSE_NEGATIVE'
        elif no_pos:lane='SOURCE_POS_INCOMPLETE_OR_CONTEXT_MISSING'
        elif no_ipa:lane='US_IPA_SOURCE_GAP'
        else:lane='OTHER_SOURCE_REVIEW'
        report[lane]+=1
        row={'headword':r['headword'],'entry_id':r['entry_id'],'tier':r['target_tier'],'cohort':'S0',
             'priority_lane':lane,'prior_flags':flags,'original_translation_unverified':r.get('original_raw_translation_unverified',''),
             'recovered_explicit_pos_hint_unverified':recovery,
             'us_ipa_candidates_unverified':r['us_ipa_options_unverified'],'source_chinese_missing':no_zh,
             'us_ipa_missing':no_ipa,'candidate_only':True,'reviewer_confirmed':False,'publisher_approved':False,'approved_sense_id':None}
        rows.append(row)
    for r in p1:
        ipa=r.get('us_ipa_options_unverified')
        require(isinstance(ipa,list) and len(ipa)>1 and len(ipa)==len(set(ipa)),'IPA_VARIANTS_CORRUPTED')
        for v in ipa:require(re.fullmatch(r'/[^/\r\n]+/',v),'INVALID_IPA_RECORD')
        # Some candidate transcriptions differ ONLY by stress glyphs, which can be meaningful
        # (museum, automobile): this is NOT evidence that readings are equivalent.
        variants_wo_stress={v.replace('ˈ','').replace('ˌ','') for v in ipa}
        lane='IPA_SAME_BASE_SEGMENTS_STRESS_DIFFERENCES' if len(variants_wo_stress)==1 else 'IPA_DIFFERENT_BASE_SEGMENTS_MANUAL'
        report[lane]+=1
        rows.append({'headword':r['headword'],'entry_id':r['entry_id'],'tier':r['target_tier'],'cohort':'P1',
                     'priority_lane':lane,'us_ipa_candidates_unverified':ipa,
                     'meaning_candidates_unverified':r.get('pos_options_unverified'),
                     'note':'Same base segments may still have DIFFERENT STRESS PLACEMENT OR EMPHASIS (museum, automobile). NEVER auto-merge or select pronunciations.',
                     'candidate_only':True,'reviewer_confirmed':False,'publisher_approved':False,'approved_sense_id':None})
    require(len(rows)==239 and all(x['approved_sense_id'] is None and x['publisher_approved'] is False for x in rows),'OUTPUT_ROWS_WRONG')
    return rows,report


def main():
    source=Path(sys.argv[1]);out=Path(sys.argv[2]);require(not out.exists(),'REFUSE_TO_OVERWRITE_EXISTING_OUTPUT')
    with zipfile.ZipFile(source) as z:
        members=z.namelist();require(len(members)==len(set(members)),'DUPLICATE_ZIP_MEMBER')
        manifest=json.loads(z.read('exam-complex-private-review/FILE_MANIFEST_SHA256.json'))
        for n in members:
            if n.endswith('/FILE_MANIFEST_SHA256.json'):continue
            v=z.read(n);meta=manifest[n.removeprefix('exam-complex-private-review/')]
            require(meta['sha256']==hashlib.sha256(v).hexdigest() and meta['bytes']==len(v),'SOURCE_PACKAGE_SHA_MISMATCH')
        base='exam-complex-private-review/review/'
        s0=[json.loads(x) for x in z.read(base+'S0_SOURCE_GAP_AND_SPECIAL.jsonl').decode().splitlines()]
        p1=[json.loads(x) for x in z.read(base+'P1_IPA_VARIANT_ONLY_MACHINE_FLAGS.jsonl').decode().splitlines()]
    items,counts=inspect(s0,p1)
    out.mkdir(mode=0o700)
    (out/'239_SOURCE_AND_IPA_REVIEW_NOT_APPROVED.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in items))
    with (out/'239_EDITORIAL_TRIAGE.csv').open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=['headword','tier','cohort','priority_lane','entry_id']);w.writeheader()
        w.writerows({k:x[k] for k in w.fieldnames} for x in items)
    summary={'source_zip_sha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'total_rows':len(items), 's0_source_review':122,'p1_ipa_review':117,
             'lanes':dict(counts),'publisher_approved_senses_created':0,'final_ipa_selected':0,'legacy_word_ids_modified':0,'d1_writes':0,
             'claim':'Offline identity-verified diagnostic; NOT a teaching sense or validated phonetic.'}
    (out/'QA_SUMMARY.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=False,indent=2))
if __name__=='__main__':main()