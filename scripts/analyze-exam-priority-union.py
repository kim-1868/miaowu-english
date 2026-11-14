#!/usr/bin/env python3
"""Audited ECDICT tag overlap: CET4 -> CET6 NEW -> Postgrad NEW.

Source is an unverified candidate headword index, NOT licensed/approved
teaching content or an authoritative owner-supplied exam list. Offline only.
"""
import argparse
import hashlib
import json
from pathlib import Path

ORDER=("cet4","cet6","postgrad")
SOURCE_SHA="d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc"
VALID_LEVELS=frozenset(("gaokao","cet4","cet6","postgrad","ielts","toefl"))
EXPECTED_SOURCE_COUNT=400183


def analyze(entries_path, audit_path, *, strict=True):
    audit=json.loads(Path(audit_path).read_text(encoding="utf-8"))
    if strict and (audit.get("source_sha256")!=SOURCE_SHA or
                   audit.get("index_statistics",{}).get("retained_headwords")!=EXPECTED_SOURCE_COUNT):
        raise ValueError("UNVERIFIED_UPSTREAM_SOURCE_OR_COUNT")
    counts={name:0 for name in ORDER}
    combinations={format(i,"03b"):0 for i in range(8)}
    total=0
    seen=set()
    with Path(entries_path).open(encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            row=json.loads(line)
            lemma=row.get("headword")
            if (not isinstance(lemma,str) or not lemma or lemma!=lemma.strip().lower() or
                row.get("entry_id")!="gdict_"+hashlib.sha256(lemma.encode()).hexdigest()[:24] or
                row.get("source")!="ECDICT_FULL_UPSTREAM_UNVERIFIED" or
                row.get("reviewed") is not False or row.get("teaching_ready") is not False):
                raise ValueError("HEADWORD_SOURCE_IDENTITY_OR_REVIEW_INVALID")
            tags=row.get("exam_levels")
            if (not isinstance(tags,list) or len(tags)!=len(set(tags)) or
                any(not isinstance(t,str) or t not in VALID_LEVELS for t in tags)):
                raise ValueError("INVALID_EXAM_TAG_SET")
            if lemma in seen:
                raise ValueError("DUPLICATE_HEADWORD")
            seen.add(lemma)
            total+=1
            for tag in ORDER:
                if tag in tags:
                    counts[tag]+=1
            # bit order: 4, 6, postgraduate
            key="".join("1" if t in tags else "0" for t in ORDER)
            combinations[key]+=1
    if total != audit.get("index_statistics",{}).get("retained_headwords"):
        raise ValueError("SOURCE_ROW_COUNT_DRIFT")
    c=combinations
    def filtered(k,ids):
        return sum(n for bits,n in c.items() if all(bits[i]==v for i,v in ids.items()))
    new_cet4=counts["cet4"]
    new_cet6=filtered("",{0:"0",1:"1"})
    new_postgrad=filtered("",{0:"0",1:"0",2:"1"})
    union=new_cet4+new_cet6+new_postgrad
    assert union==sum(value for bits,value in c.items() if bits!="000")
    result={
        "status":"UNVERIFIED_EXAM_TAG_COVERAGE_NOT_TEACHING_APPROVAL",
        "source_sha256":audit.get("source_sha256"),
        "source_total_headwords":total,
        "priority_levels":list(ORDER),
        "source_tag_counts":counts,
        "exam_priority_unique_union":union,
        "incremental_headword_plan":{
            "cet4_first":new_cet4,
            "cet6_new_not_cet4":new_cet6,
            "postgrad_new_not_cet4_or_cet6":new_postgrad},
        "overlap_patterns":{
            "".join(tag[0].upper() for i,tag in enumerate(ORDER) if bits[i]=="1") or "NONE":value
            for bits,value in c.items()
        },
        "subset_checks":{
            "cet4_words_not_in_cet6":sum(v for k,v in c.items() if k[0]=="1" and k[1]=="0"),
            "cet6_words_not_in_cet4":sum(v for k,v in c.items() if k[1]=="1" and k[0]=="0"),
            "postgrad_words_not_in_cet6":sum(v for k,v in c.items() if k[2]=="1" and k[1]=="0")
        },
        "teaching_senses_approved":0,
        "commercial_rights_reviewed":False,
        "owner_lists_cross_verified":False,
        "actual_novel_coverage_verified":False,
        "remote_d1_access":False
    }
    # Standardize labels: bit patterns are unambiguous and avoid C/P confusion.
    result["overlap_patterns"]={k:v for k,v in sorted(c.items())}
    return result


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--entries",required=True)
    ap.add_argument("--audit",required=True)
    ap.add_argument("--out",required=True)
    args=ap.parse_args()
    result=analyze(args.entries,args.audit)
    out=Path(args.out)
    if out.exists():
        raise ValueError("NO_OVERWRITE")
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({
        "status":result["status"],"unique_union":result["exam_priority_unique_union"],
        "incremental":result["incremental_headword_plan"],
        "owner_lists_cross_verified":False,"remote_d1_access":False
    },ensure_ascii=False))


if __name__=="__main__":
    main()
