#!/usr/bin/env python3
"""Offline streaming public-source subset compiler for exam candidate content.

Inputs MUST be public ECDICT CSV plus audited, license-unverified exam tags.
Outputs contain ONLY public ECDICT fields and public IPA and LICENSE notices.
Never read any owner's private target list or historical books.
"""
import argparse
import csv
import hashlib
import json
import shutil
from pathlib import Path

EXPECTED_EXAM_HEADWORDS=11422
ECDICT_SHA="39cfb9672c0906b63569e0453c2e6abfb9ab182a"
IPA_SHA="972cd67dd5f96bc5660e28070cde26e3928abcd7"
INDEX_SHA="d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc"
FIELDS=("word","phonetic","definition","translation","pos")

def digest(path):
    h=hashlib.sha256()
    with Path(path).open("rb") as fp:
        for chunk in iter(lambda: fp.read(1024*1024),b""):
            h.update(chunk)
    return h.hexdigest()

def compile_sources(index_path,audit_path,source_csv,source_license,
                    ipa_us,ipa_license,script_path,out,
                    *,expected=EXPECTED_EXAM_HEADWORDS,fixture=False):
    report=json.loads(Path(audit_path).read_text(encoding="utf-8"))
    if(report.get("source_sha256")!=INDEX_SHA or
       (not fixture and (report.get("index_statistics",{}).get("retained_headwords")!=400183 or
       report.get("index_statistics",{}).get("candidate_forms")!=56898))):
        raise ValueError("INDEX_PROVENANCE_NOT_VERIFIED")
    candidates=set()
    source_rows=0
    with Path(index_path).open(encoding="utf-8") as fp:
        for line in fp:
            if not line.strip():
                continue
            row=json.loads(line);source_rows+=1
            if(row.get("source")!="ECDICT_FULL_UPSTREAM_UNVERIFIED" or
               row.get("teaching_ready") is not False or
               row.get("reviewed") is not False or
               not isinstance(row.get("exam_levels"),list)):
                raise ValueError("UNTRUSTED_HEADWORD_SOURCE")
            if row["exam_levels"]:
                w=row["headword"]
                if w in candidates:
                    raise ValueError("DUPLICATE_EXAM_HEADWORD")
                candidates.add(w)
    if source_rows!=report.get('index_statistics',{}).get('retained_headwords') or len(candidates)!=expected:
        raise ValueError("EXAM_SOURCE_COUNT_DRIFT")
    for license_path in (source_license,ipa_license):
        notice=Path(license_path).read_text(encoding="utf-8")
        if "MIT License" not in notice or "Permission is hereby granted" not in notice:
            raise ValueError("REQUIRED_SOURCE_NOTICE_MISSING")
    folder=Path(out)
    if folder.exists() and any(folder.iterdir()):
        raise ValueError("NONEMPTY_OUTPUT_DIRECTORY")
    folder.mkdir(parents=True,exist_ok=True)
    destination=folder/"ecdict-public-exam-candidates.csv"
    seen=set()
    with Path(source_csv).open(encoding="utf-8-sig",newline="") as src, destination.open("w",encoding="utf-8",newline="") as dst:
        reader=csv.DictReader(src)
        if not set(FIELDS).issubset(set(reader.fieldnames or [])):
            raise ValueError("ECDICT_COLUMNS_MISSING")
        writer=csv.DictWriter(dst,fieldnames=FIELDS)
        writer.writeheader()
        for row in reader:
            word=(row.get("word") or "").strip().lower()
            if word not in candidates:
                continue
            if word in seen:
                raise ValueError("DUPLICATE_ECDICT_SOURCE_ENTRY")
            seen.add(word)
            writer.writerow({key:(row.get(key) or "") for key in FIELDS})
    shutil.copyfile(ipa_us,folder/"en_US.txt")
    shutil.copyfile(source_license,folder/"ECDICT-LICENSE.txt")
    shutil.copyfile(ipa_license,folder/"IPA-DICT-LICENSE.txt")
    shutil.copyfile(script_path,folder/"build-exam-first-open-source-card-candidates.py")
    manifest={
        "status":"PUBLIC_SOURCE_CANDIDATES_ONLY_NOT_REVIEWED",
        "upstream_index_sha256":INDEX_SHA,
        "ecdict_commit":ECDICT_SHA,
        "ipa_us_commit":IPA_SHA,
        "public_exam_tagged_headwords":len(candidates),
        "public_exam_translation_rows":len(seen),
        "upstream_unmatched_headwords":len(candidates)-len(seen),
        "no_owner_private_target_lists":True,
        "no_customer_or_purchased_book_data":True,
        "commercial_license_final_reviewed":False,
        "teaching_senses_approved":0,
        "remote_d1_writes":0,
        "files":{}
    }
    if len(seen)<int(expected*0.85):
        raise ValueError("LOW_PUBLIC_SOURCE_COVERAGE")
    for file in folder.iterdir():
        if file.is_file():
            manifest["files"][file.name]={"sha256":digest(file),"bytes":file.stat().st_size}
    (folder/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return manifest

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for a in ("index","audit","ecdict","ecdict-license","ipa-us","ipa-license","script","out"):
        p.add_argument("--"+a,required=True)
    v=vars(p.parse_args())
    info=compile_sources(v["index"],v["audit"],v["ecdict"],v["ecdict_license"],
                         v["ipa_us"],v["ipa_license"],v["script"],v["out"])
    print(json.dumps({k:info[k] for k in ("status","public_exam_tagged_headwords","public_exam_translation_rows",
          "upstream_unmatched_headwords","teaching_senses_approved","remote_d1_writes")},ensure_ascii=False))

if __name__=="__main__":
    main()
