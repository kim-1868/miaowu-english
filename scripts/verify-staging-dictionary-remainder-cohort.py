#!/usr/bin/env python3
"""Fail-closed offline validation of a specific full-dictionary D1 cohort.

Does not connect to a database. A successful result never constitutes
approval to execute. The explicit protected GitHub environment remains mandatory.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

SHA = "d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc"
ENTRY_BASE, FORM_BASE = 11422, 16442
COHORT_ROWS = [50000] * 7 + [38761, 40456]
TOTAL_ENTRIES, TOTAL_FORMS = 400183, 56898
SOURCE = "upstream_ecdict_unverified"
INSERT_ENTRY = re.compile(
    r"INSERT INTO global_dictionary_entries\(entry_id,headword,exam_levels_json,source_name,teaching_ready,reviewed_at\) VALUES\(.+\);$")
INSERT_FORM = re.compile(
    r"INSERT INTO global_dictionary_forms\(form,entry_id,source_name,reviewed\) VALUES\(.+\);$")
UPDATE_SOURCE = re.compile(
    r"UPDATE global_dictionary_sources SET imported_entries=400183, imported_forms=56898 WHERE source_key='upstream_ecdict_unverified' AND source_sha256='d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc' AND enabled=0 AND license_reviewed=0 AND imported_entries=11422 AND imported_forms=16442;$")


def validate(root, cohort_number):
    root = Path(root)
    if not 1 <= cohort_number <= 9:
        raise ValueError("COHORT_NUMBER_MUST_BE_1_TO_9")
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    expected = {
        "status":"OFFLINE_ONLY_FULL_REMAINDER_UNREVIEWED_NOT_DEPLOYED",
        "source_key":SOURCE, "source_sha256":SHA,
        "source_entries":TOTAL_ENTRIES,"source_forms":TOTAL_FORMS,
        "already_imported_exam_entries":ENTRY_BASE,
        "already_imported_exam_forms":FORM_BASE,
        "candidate_remaining_entries":388761,
        "candidate_remaining_forms":40456,
        "teaching_senses_approved":0,
        "license_reviewed":False,"source_enabled":False,
        "remote_database_access":False,"production_access":False,
    }
    for key,value in expected.items():
        if manifest.get(key)!=value:
            raise ValueError("INVALID_REMAINDER_MANIFEST_"+key)
    cohorts = manifest.get("cohorts")
    if not isinstance(cohorts, list) or len(cohorts)!=9:
        raise ValueError("INVALID_NUMBER_OF_COHORTS")
    for i,cohort in enumerate(cohorts):
        name = f"cohort-{i+1:02d}-{'entries' if i<8 else 'forms'}"
        if (cohort.get("name")!=name or
            cohort.get("kind")!=("entries" if i<8 else "forms") or
            cohort.get("rows")!=COHORT_ROWS[i] or
            cohort.get("requires_owner_approval") is not True or
            cohort.get("requires_separate_utc_day_write_budget_review") is not True):
            raise ValueError("INVALID_REMAINDER_COHORT_LAYOUT")
    one = cohorts[cohort_number-1]
    before_entries=ENTRY_BASE+sum(COHORT_ROWS[:min(cohort_number-1,8)])
    after_entries=before_entries+(one["rows"] if one["kind"]=="entries" else 0)
    before_forms=FORM_BASE+(COHORT_ROWS[8] if cohort_number>9 else 0)
    after_forms=before_forms+(one["rows"] if one["kind"]=="forms" else 0)
    names=[]
    total=0
    files=one.get("files")
    if not isinstance(files,list) or not files or len(files)>102:
        raise ValueError("INVALID_REMAINDER_FILE_COUNT")
    for item in files:
        name=item.get("name")
        if not isinstance(name,str) or not re.fullmatch(r"\d{4}\.sql|9999-source-counts-disabled\.sql",name):
            raise ValueError("UNSAFE_REMAINDER_FILE_NAME")
        if name in names:
            raise ValueError("DUPLICATE_REMAINDER_FILE_NAME")
        names.append(name)
        file_path=root/one["name"]/name
        content=file_path.read_bytes()
        if hashlib.sha256(content).hexdigest()!=item.get("sha256"):
            raise ValueError("REMAINDER_FILE_HASH_MISMATCH")
        if not content or len(content)>200000:
            raise ValueError("REMAINDER_SQL_FILE_SIZE_EXCEEDS_LIMIT")
        if name=="9999-source-counts-disabled.sql":
            if cohort_number!=9 or not UPDATE_SOURCE.fullmatch(content.decode("utf-8").strip()) or item.get("rows")!=0:
                raise ValueError("UNEXPECTED_SOURCE_COUNTER_UPDATE")
            continue
        lines=content.decode("utf-8").splitlines()
        if not lines or not lines[0].startswith("-- Unreviewed dictionary candidates only"):
            raise ValueError("REMAINDER_MISSING_SOURCE_CANDIDATE_LABEL")
        inserts=lines[1:]
        if any(not (INSERT_ENTRY if one["kind"]=="entries" else INSERT_FORM).fullmatch(line) for line in inserts):
            raise ValueError("FORBIDDEN_SQL_STATEMENT_IN_COHORT")
        if len(inserts)!=item.get("rows") or len(inserts)>500:
            raise ValueError("REMAINDER_SQL_ROW_COUNT_DRIFT")
        total+=len(inserts)
    if total!=one["rows"] or names!=sorted(names):
        raise ValueError("COHORT_INSERT_COUNT_OR_ORDER_INVALID")
    if (cohort_number==9) != ("9999-source-counts-disabled.sql" in names):
        raise ValueError("SOURCE_COUNTER_UPDATE_MISSING_OR_PREMATURE")
    return {
        "cohort":cohort_number,"kind":one["kind"],"expected_rows":one["rows"],
        "before_entries":before_entries, "after_entries":after_entries,
        "before_forms":before_forms,"after_forms":after_forms,
        "files":names,"source_before_entries":ENTRY_BASE,
        "source_before_forms":FORM_BASE,
        "source_after_entries":TOTAL_ENTRIES if cohort_number==9 else ENTRY_BASE,
        "source_after_forms":TOTAL_FORMS if cohort_number==9 else FORM_BASE,
        "publishing_enabled":False,"owner_approval_required":True,
    }


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",required=True)
    p.add_argument("--cohort",type=int,required=True)
    p.add_argument("--out",required=True)
    args=p.parse_args()
    result=validate(args.root,args.cohort)
    out=Path(args.out)
    if out.exists():
        raise ValueError("COHORT_VALIDATION_OUTPUT_EXISTS")
    out.write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"status":"UNREVIEWED_COHORT_FILES_VERIFIED_LOCAL_ONLY",
        "cohort":result["cohort"],"rows":result["expected_rows"],
        "source_enabled":False,"d1_access":False}))


if __name__=="__main__":
    main()
