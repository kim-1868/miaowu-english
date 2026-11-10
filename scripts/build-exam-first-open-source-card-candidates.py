#!/usr/bin/env python3
"""Join OWNER exam targets with ECDICT + MIT English-US IPA, producing private DRAFTS ONLY.

No network, D1, GitHub uploads, production writes, teaching approvals or sense merges.
Do NOT ingest en_UK.txt from ipa-dict: the en_UK source is GPL-3.0-derived.
This is a content-review acceleration tool, not a rights or accuracy certificate.
"""
import argparse
import csv
import hashlib
import json
import re
import shutil
import unicodedata
from pathlib import Path

ECDICT_REPOSITORY = "https://github.com/skywind3000/ECDICT"
ECDICT_COMMIT = "39cfb9672c0906b63569e0453c2e6abfb9ab182a"
IPA_REPOSITORY = "https://github.com/open-dict-data/ipa-dict"
IPA_COMMIT = "972cd67dd5f96bc5660e28070cde26e3928abcd7"
SOURCE_INGESTION = "OFFLINE_REVIEW_CANDIDATES_NOT_PUBLISHABLE"
WORD = re.compile(r"^[a-z]+(?:['-][a-z]+)*$")
ABBR = re.compile(r"^[a-z]+(?:\.[a-z]+)*\.$")
ENTRY = re.compile(r"^gdict_[0-9a-f]{24}$")
IPA = re.compile(r"/[^/\r\n]+/")
LEVELS = {"基础", "四级新增", "六级新增", "考研新增"}


def normalized(text):
    return unicodedata.normalize("NFKC", str(text or "")).strip().lower().replace("’", "'")


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as src:
        for block in iter(lambda: src.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_targets(path):
    targets = {}
    with Path(path).open(encoding="utf-8") as f:
        for i, raw in enumerate(f, 1):
            if not raw.strip():
                continue
            row = json.loads(raw)
            word = normalized(row.get("headword"))
            if (not word or word in targets or
                (not WORD.fullmatch(word) and not ABBR.fullmatch(word)) or
                row.get("target_tier") not in LEVELS or
                row.get("priority_order") != len(targets) + 1 or
                row.get("teaching_sense_approved") is not False or
                row.get("publication_ready") is not False):
                raise ValueError(f"UNSAFE_OWNER_TARGET_LINE_{i}")
            if row.get("status") == "exact_unreviewed_candidate":
                identity = "gdict_" + hashlib.sha256(word.encode("utf-8")).hexdigest()[:24]
                if not WORD.fullmatch(word) or not ENTRY.fullmatch(str(row.get("entry_id") or "")) or row["entry_id"] != identity:
                    raise ValueError(f"UNSAFE_TARGET_IDENTITY_LINE_{i}")
            elif (row.get("status") != "abbreviation_pending_editorial" or
                  row.get("entry_id") is not None or not ABBR.fullmatch(word)):
                raise ValueError(f"UNSAFE_ABBREVIATION_LINE_{i}")
            targets[word] = row
    if not targets:
        raise ValueError("NO_TARGETS")
    return targets


def load_us_ipa(path, targets):
    result = {}
    with Path(path).open(encoding="utf-8") as src:
        for n, line in enumerate(src, 1):
            line = line.rstrip("\n\r")
            if not line:
                continue
            if "\t" not in line:
                raise ValueError(f"IPA_TSV_MALFORMED_LINE_{n}")
            text, readings = line.split("\t", 1)
            key = normalized(text)
            if key not in targets:
                continue
            variants = IPA.findall(readings)
            if not variants or ", ".join(variants) != readings.strip():
                raise ValueError(f"IPA_TSV_INVALID_READING_LINE_{n}")
            if key in result:
                raise ValueError(f"IPA_TSV_DUPLICATED_WORD_{key}")
            result[key] = variants
    return result


def load_ecdict_candidates(path, targets):
    result = {}
    with Path(path).open(encoding="utf-8-sig", newline="") as src:
        reader = csv.DictReader(src)
        required = {"word", "phonetic", "translation", "definition", "pos"}
        if not required.issubset(set(reader.fieldnames or [])):
            raise ValueError("ECDICT_REQUIRED_COLUMNS_MISSING")
        for row in reader:
            word = normalized(row["word"])
            if word not in targets:
                continue
            if word in result:
                raise ValueError(f"ECDICT_DUPLICATE_OWNER_WORD_{word}")
            for field in ("phonetic", "translation", "definition", "pos"):
                value = row.get(field) or ""
                if len(value) > 12000:
                    raise ValueError(f"ECDICT_FIELD_ABNORMAL_{word}_{field}")
            result[word] = {
                "raw_chinese_meanings_unverified": (row.get("translation") or "").strip(),
                "raw_pos_unverified": (row.get("pos") or "").strip(),
                "raw_english_definition_unverified": (row.get("definition") or "").strip(),
                "raw_phonetic_unspecified_accent": (row.get("phonetic") or "").strip()
            }
    return result


def assert_license_notice(file_path, provider):
    notice = Path(file_path).read_text(encoding="utf-8")
    if "MIT License" not in notice and "The MIT License" not in notice:
        raise ValueError(f"UPSTREAM_MIT_NOTICE_MISSING_{provider}")
    if "Permission is hereby granted" not in notice:
        raise ValueError(f"UPSTREAM_COPYRIGHT_NOTICE_INCOMPLETE_{provider}")
    return notice


def build_private_candidates(targets_file, ecdict_file, ipa_us_file,
                             ecdict_license, ipa_license, output_dir):
    assert_license_notice(ecdict_license, "ECDICT")
    assert_license_notice(ipa_license, "IPA_US")
    targets = load_targets(targets_file)
    us = load_us_ipa(ipa_us_file, targets)
    translations = load_ecdict_candidates(ecdict_file, targets)
    out = Path(output_dir)
    if out.exists():
        raise ValueError("PRIVATE_OUTPUT_EXISTS_NO_OVERWRITE")
    out.mkdir(parents=True, mode=0o700)
    stats = {
        "status": SOURCE_INGESTION,
        "target_headwords": len(targets),
        "source_ipa_us_word_matches": 0,
        "source_ipa_us_multiple_pronunciations": 0,
        "source_ipa_us_missing": 0,
        "ecdict_chinese_candidate_matches": 0,
        "ecdict_chinese_candidate_missing": 0,
        "ecdict_pos_candidates": 0,
        "abbreviation_special_review": 0,
        "teaching_senses_approved": 0,
        "production_writes": 0,
        "publishable_rows": 0,
        "owner_target_sha256": sha256(targets_file),
        "ecdict_csv_sha256": sha256(ecdict_file),
        "ipa_us_tsv_sha256": sha256(ipa_us_file),
        "source_references": {
            "ecdict": {"repository": ECDICT_REPOSITORY, "commit": ECDICT_COMMIT, "license": "MIT", "final_rights_reviewed": False},
            "us_ipa": {"repository": IPA_REPOSITORY, "commit": IPA_COMMIT, "path": "data/en_US.txt", "license": "MIT upstream data per credits", "final_rights_reviewed": False},
            "uk_ipa": {"imported": False, "reason": "en_UK data derives from GPL-3.0 source; commercial license review needed"},
        },
        "tiers": {level: {"target": 0, "ipa_us_matched": 0, "ecdict_translation_matched": 0} for level in LEVELS}
    }
    records = []
    for word, row in targets.items():
        ipa = us.get(word, [])
        ecdict = translations.get(word) or {}
        has_translation = bool(ecdict.get("raw_chinese_meanings_unverified"))
        blockers = [
            "SOURCE_LICENSE_FINAL_RIGHTS_REVIEW_REQUIRED",
            "SENSE_SEPARATION_AND_CHINESE_MEANING_REVIEW_REQUIRED",
            "NEW_ORIGINAL_BILINGUAL_EXAMPLE_REQUIRED",
            "UK_IPA_NOT_IMPORTED_REQUIRES_LICENSED_REVIEW",
            "AUTHENTICATED_PUBLISHER_SIGNOFF_REQUIRED",
        ]
        if not ipa:
            blockers.append("US_IPA_MISSING")
        if len(ipa) > 1:
            blockers.append("US_IPA_MULTIPLE_SENSE_DEPENDENT_READINGS")
        if not has_translation:
            blockers.append("CHINESE_DEFINITION_SOURCE_MISSING")
        if not row.get("entry_id"):
            blockers.append("ABBREVIATION_REQUIRES_STABLE_ID_EDITORIAL_REVIEW")
        suggestion = {
            "schema": "wordletter-opensource-content-candidate-v1",
            "status": SOURCE_INGESTION, "headword": word,
            "priority_order": row["priority_order"],
            "owner_target_tier": row["target_tier"],
            "entry_id": row.get("entry_id"),
            "ecdict": ecdict,
            "phonetic_us_candidates_unverified": ipa,
            "phonetic_uk": None,
            "translation_approved": None,
            "sense_id": None,
            "example_en": None,
            "example_zh": None,
            "reviewed": False, "publisher_approved": False,
            "teaching_ready": False, "publication_ready": False,
            "blockers": blockers,
            "source_refs": ["ECDICT@"+ECDICT_COMMIT, "ipa-dict/en_US@"+IPA_COMMIT],
        }
        records.append(suggestion)
        t = stats["tiers"][row["target_tier"]]
        t["target"] += 1
        if ipa:
            stats["source_ipa_us_word_matches"] += 1
            t["ipa_us_matched"] += 1
            if len(ipa) > 1:
                stats["source_ipa_us_multiple_pronunciations"] += 1
        else:
            stats["source_ipa_us_missing"] += 1
        if has_translation:
            stats["ecdict_chinese_candidate_matches"] += 1
            t["ecdict_translation_matched"] += 1
        else:
            stats["ecdict_chinese_candidate_missing"] += 1
        if ecdict.get("raw_pos_unverified"):
            stats["ecdict_pos_candidates"] += 1
        if row["entry_id"] is None:
            stats["abbreviation_special_review"] += 1
    private_jsonl = out / "exam-first-opensource-candidate-only.jsonl"
    private_jsonl.write_text("".join(json.dumps(item, ensure_ascii=False, sort_keys=True)+"\n" for item in records), encoding="utf-8")
    (out / "candidate-summary.json").write_text(json.dumps(stats, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    shutil.copyfile(ecdict_license, out / "ECDICT-LICENSE.txt")
    shutil.copyfile(ipa_license, out / "IPA-DICT-LICENSE.txt")
    (out / "README.txt").write_text(
        "PRIVATE CONTENT REVIEW ONLY. NO PUBLISHING OR DB WRITES.\n"
        "ECDICT: MIT; data accuracy/third-party rights still require editorial review.\n"
        "ipa-dict US: MIT per project credit; multiple pronunciations require sense review.\n"
        "ipa-dict UK: explicitly NOT imported (GPL-3.0-derived upstream).\n"
        "Open English WordNet is reference-only and requires CC-BY 4.0 attribution if used.\n"
        "No example audio/sentences were copied from third-party sources.\n",
        encoding="utf-8")
    return stats


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("targets", "ecdict", "ipa-us", "ecdict-license", "ipa-license", "out"):
        parser.add_argument("--"+key, required=True)
    args = vars(parser.parse_args())
    report = build_private_candidates(
        args["targets"], args["ecdict"], args["ipa_us"],
        args["ecdict_license"], args["ipa_license"], args["out"])
    print(json.dumps({key: report[key] for key in (
        "status", "target_headwords", "source_ipa_us_word_matches",
        "source_ipa_us_multiple_pronunciations", "ecdict_chinese_candidate_matches",
        "abbreviation_special_review", "publishable_rows", "production_writes"
    )}, ensure_ascii=False))


if __name__ == "__main__":
    main()
