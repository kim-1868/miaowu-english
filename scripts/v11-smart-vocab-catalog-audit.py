#!/usr/bin/env python3
"""Offline fail-closed QA for independent exam-word teaching cards. No D1/network writes."""
import argparse
import csv
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

GRADES = {"四级":"cet4","六级":"cet6","考研":"postgrad","雅思":"ielts"}
EXPECTED = {"cet4":3849,"cet6":5407,"postgrad":4801,"ielts":5040}
REQUIRED = {"全局排名","涉及考试","单词","音标","词性","中文释义","COCA词频frq","BNC词频"}
TECHNICAL = ("[计]","[医]","[经]","[化]","[法]","[军]","[电]")

def source_audit(path):
    index={}
    counts={key:Counter() for key in EXPECTED}
    issues=[]
    with open(path,encoding="utf-8-sig",newline="") as fh:
        reader=csv.DictReader(fh)
        if not REQUIRED.issubset(reader.fieldnames or []):
            raise ValueError("INVALID_SOURCE_HEADERS")
        for line,row in enumerate(reader,2):
            word=(row["单词"] or "").strip().casefold()
            if not word or word in index:
                issues.append(f"row {line}: empty/duplicate word")
                continue
            index[word]=row
            memberships={x.strip() for x in (row["涉及考试"] or "").split(",")}
            for label,grade in GRADES.items():
                if label not in memberships:continue
                c=counts[grade]
                c["headwords"]+=1
                c["missing_ipa"]+=not (row["音标"] or "").strip()
                c["missing_pos"]+=not (row["词性"] or "").strip()
                c["missing_coca"]+=not (row["COCA词频frq"] or "").strip()
                c["missing_bnc"]+=not (row["BNC词频"] or "").strip()
                c["unranked"]+=not (row["COCA词频frq"] or row["BNC词频"])
                c["needs_definition_cleanup"]+=any(x in (row["中文释义"] or "") for x in TECHNICAL)
                c["independent_examples_not_in_source"]+=1
    for grade,total in EXPECTED.items():
        if counts[grade]["headwords"]!=total:
            issues.append(f"{grade}: expected {total} source words")
    return index,counts,issues

def card_audit(path,index,counts):
    if not path:
        return {"status":"blocked","reason":"NO_REVIEWED_TEACHING_CARDS","ready_grades":[]}
    errors=[]
    covered=defaultdict(set)
    ids=set()
    with open(path,encoding="utf-8") as fh:
        for line,raw in enumerate(fh,1):
            if not raw.strip():continue
            try: card=json.loads(raw)
            except json.JSONDecodeError:
                errors.append(f"line {line}: INVALID_JSON");continue
            if not isinstance(card,dict):
                errors.append(f"line {line}: NOT_OBJECT");continue
            grade=str(card.get("category_slug",""))
            headword=str(card.get("headword","")).strip().casefold()
            word_id=str(card.get("word_id","")).strip()
            row=index.get(headword)
            if grade not in EXPECTED or not word_id or row is None:
                errors.append(f"line {line}: UNKNOWN_CARD_OR_GRADE");continue
            labels={x.strip() for x in (row["涉及考试"] or "").split(",")}
            if not any(label in labels for label,g in GRADES.items() if g==grade):
                errors.append(f"line {line}: WORD_NOT_IN_PAID_GRADE");continue
            if (grade,word_id) in ids:
                errors.append(f"line {line}: DUPLICATE_CARD_ID");continue
            ids.add((grade,word_id))
            required=["meaning_zh","part_of_speech","example_en","example_zh","reviewed_by","reviewed_at"]
            if any(not str(card.get(key,"")).strip() for key in required):
                errors.append(f"line {line}: INCOMPLETE_OR_UNREVIEWED");continue
            if not (str(card.get("phonetic_uk","")).strip() or str(card.get("phonetic_us","")).strip()):
                errors.append(f"line {line}: NO_IPA");continue
            origin=card.get("frequency_source")
            rank=card.get("frequency_rank")
            if origin=="UNRANKED":
                if rank is not None or row["COCA词频frq"] or row["BNC词频"]:
                    errors.append(f"line {line}: FALSE_UNRANKED");continue
            elif origin in ("COCA","BNC"):
                expected=row["COCA词频frq"] if origin=="COCA" else row["BNC词频"]
                if not expected or not expected.isdecimal() or rank!=int(expected):
                    errors.append(f"line {line}: FALSE_FREQUENCY");continue
            else:
                errors.append(f"line {line}: UNKNOWN_FREQUENCY_SOURCE");continue
            covered[grade].add(headword)
    coverage={g:len(covered[g]) for g in EXPECTED}
    ready=[g for g,total in EXPECTED.items() if coverage[g]==total and not errors]
    return {"status":"blocked","covered_headwords":coverage,
            "missing_reviewed_headwords":{g:counts[g]["headwords"]-coverage[g] for g in EXPECTED},
            "ready_grades_conditional_on_official_syllabus_review":ready,
            "error_count":len(errors),"errors":errors[:50],
            "reason":"OFFICIAL_SYLLABUS_COVERAGE_NOT_PROVED"}

def run(source,reviewed=None):
    index,counts,issues=source_audit(source)
    verify=card_audit(reviewed,index,counts)
    return {"status":"blocked", # This ECDICT source is NOT an official full-syllabus certification.
            "source_sha256":hashlib.sha256(Path(source).read_bytes()).hexdigest(),
            "source_headwords":len(index),
            "grades":{g:dict(c) for g,c in counts.items()},
            "source_issues":issues[:50],"cards":verify,
            "notice":"COCA/BNC corpus ranking is NOT CET exam-question frequency. Do not publish until independently reviewed official syllabus coverage and full teaching cards exist."}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--source",required=True)
    p.add_argument("--reviewed-cards")
    p.add_argument("--report")
    a=p.parse_args()
    result=run(a.source,a.reviewed_cards)
    output=json.dumps(result,ensure_ascii=False,indent=2,sort_keys=True)+"\n"
    if a.report:Path(a.report).write_text(output,encoding="utf-8")
    else:print(output,end="")
    return 2 # Must never be mistaken for a deployment-ready catalog.

if __name__=="__main__":
    sys.exit(main())
