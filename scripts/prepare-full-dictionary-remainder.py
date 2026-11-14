#!/usr/bin/env python3
"""Offline-only preparation of the unreviewed non-exam ECDICT candidate remainder.

No Cloudflare tokens, no network access, and NO D1 writes. The first 11,422
exam-tagged headwords and 16,442 forms have already been applied to staging.
This file prepares a separately verifiable plan for the remaining records.
Source licensing and every teaching sense remain UNAPPROVED.
"""
import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path

from importlib.util import module_from_spec, spec_from_file_location

HERE = Path(__file__).resolve().parent
spec = spec_from_file_location("exam_import", HERE / "build-staging-exam-candidate-import.py")
core = module_from_spec(spec)
spec.loader.exec_module(core)

SOURCE = "upstream_ecdict_unverified"
EXPECTED = (400183, 56898, 11422, 16442, 388761, 40456)
UNVERIFIED_ENTRY_SOURCE = "ECDICT_FULL_UPSTREAM_UNVERIFIED"
UNVERIFIED_FORM_SOURCE = "ECDICT_EXCHANGE_UNVERIFIED"
MAX_DAY_ROWS = 50000


def build_remainder(entries_file, forms_file, audit_file, output, *,
                    cohort_cap=MAX_DAY_ROWS, sql_file_rows=500, fixture=False):
    if not 1 <= cohort_cap <= MAX_DAY_ROWS or not 1 <= sql_file_rows <= 1000:
        raise ValueError("INVALID_IMPORT_COHORT_CAP")
    audit = json.loads(Path(audit_file).read_text(encoding="utf-8"))
    sha = audit.get("source_sha256")
    stats = audit.get("index_statistics") or {}
    if not fixture and (sha != core.UPSTREAM_SHA or
                        stats.get("retained_headwords") != 400183 or
                        stats.get("candidate_forms") != 56898):
        raise ValueError("UPSTREAM_SOURCE_NOT_AUDITED")
    entries_seen, exam_words, remainder = set(), set(), []
    for row in core.iter_jsonl(entries_file):
        word = row.get("headword")
        if not isinstance(word, str) or not core.WORD.fullmatch(word) or len(word) > 80:
            raise ValueError("INVALID_SOURCE_HEADWORD")
        if word in entries_seen:
            raise ValueError("DUPLICATE_SOURCE_HEADWORD")
        entries_seen.add(word)
        if (row.get("entry_id") != core.stable_id(word) or
            row.get("source") != UNVERIFIED_ENTRY_SOURCE or
            row.get("reviewed") is not False or
            row.get("teaching_ready") is not False):
            raise ValueError("UNTRUSTED_SOURCE_ENTRY")
        levels = row.get("exam_levels")
        if not isinstance(levels, list) or len(levels) != len(set(levels)) or any(
                not isinstance(l, str) or l not in core.LEVELS for l in levels):
            raise ValueError("INVALID_SOURCE_EXAM_LEVELS")
        if levels:
            exam_words.add(word)
        else:
            remainder.append((word, row["entry_id"]))
    total_entries = len(entries_seen)
    if total_entries != stats.get("retained_headwords"):
        raise ValueError("SOURCE_ENTRY_COUNT_MISMATCH")

    scanned_forms, exam_forms, forms, seen_pairs = 0, 0, [], set()
    for row in core.iter_jsonl(forms_file):
        scanned_forms += 1
        word, form = row.get("headword"), row.get("form")
        if (not isinstance(word, str) or word not in entries_seen or
            not isinstance(form, str) or not core.WORD.fullmatch(form) or
            row.get("source") != UNVERIFIED_FORM_SOURCE or
            row.get("reviewed") is not False or row.get("verified") is not False):
            raise ValueError("UNTRUSTED_SOURCE_FORM")
        pair = (form, word)
        if pair in seen_pairs:
            raise ValueError("DUPLICATE_SOURCE_FORM")
        seen_pairs.add(pair)
        if word in exam_words:
            exam_forms += 1
        else:
            forms.append((form, core.stable_id(word)))
    if scanned_forms != stats.get("candidate_forms"):
        raise ValueError("SOURCE_FORM_COUNT_MISMATCH")
    actual = (total_entries, scanned_forms, len(exam_words), exam_forms, len(remainder), len(forms))
    if not fixture and actual != EXPECTED:
        raise ValueError("UPSTREAM_PARTITION_DRIFT")
    if not remainder:
        raise ValueError("NO_REMAINDER")

    root = Path(output)
    if root.exists() and any(root.iterdir()):
        raise ValueError("OUTPUT_DIRECTORY_NOT_EMPTY")
    root.mkdir(parents=True, exist_ok=True)
    remainder.sort()
    forms.sort()

    # Each cohort represents at most 50,000 INSERT rows, so the owner may
    # schedule independent approved D1 migrations on separate UTC days.
    # This is NOT an automatic scheduler or permission to execute any cohort.
    cohorts = []
    day = 0
    for kind, source in (("entries", remainder), ("forms", forms)):
        for part_offset in range(0, len(source), cohort_cap):
            part = source[part_offset:part_offset + cohort_cap]
            day += 1
            day_name = f"cohort-{day:02d}-{kind}"
            folder = root / day_name
            folder.mkdir()
            files = []
            for n, start in enumerate(range(0, len(part), sql_file_rows), 1):
                rows = part[start:start + sql_file_rows]
                statements = []
                for left, right in rows:
                    if kind == "entries":
                        values = [core.quote(right), core.quote(left), "'[]'",
                                  core.quote(SOURCE), "0", "NULL"]
                        statements.append(
                            "INSERT INTO global_dictionary_entries(entry_id,headword,exam_levels_json,source_name,teaching_ready,reviewed_at) VALUES(" +
                            ",".join(values) + ");")
                    else:
                        values = [core.quote(left), core.quote(right), core.quote(SOURCE), "0"]
                        statements.append(
                            "INSERT INTO global_dictionary_forms(form,entry_id,source_name,reviewed) VALUES(" +
                            ",".join(values) + ");")
                name = f"{n:04d}.sql"
                sql = "-- Unreviewed dictionary candidates only; no teaching/source approval.\n" + "\n".join(statements) + "\n"
                (folder / name).write_text(sql, encoding="utf-8")
                files.append({"name": name, "rows": len(rows),
                              "sha256": hashlib.sha256(sql.encode("utf-8")).hexdigest()})
            cohorts.append({"name": day_name, "kind": kind, "rows": len(part),
                            "files": files, "requires_owner_approval": True,
                            "requires_separate_utc_day_write_budget_review": True})

    # One metadata statement in the FINAL cohort. It is NOT an approval,
    # merely an accurate count after every insert has succeeded.
    final = root / cohorts[-1]["name"]
    update = (
        "UPDATE global_dictionary_sources SET imported_entries=" + str(total_entries) +
        ", imported_forms=" + str(scanned_forms) +
        " WHERE source_key=" + core.quote(SOURCE) +
        " AND source_sha256=" + core.quote(sha) +
        " AND enabled=0 AND license_reviewed=0 AND imported_entries=" +
        str(len(exam_words)) + " AND imported_forms=" + str(exam_forms) + ";\n")
    last_path = final / "9999-source-counts-disabled.sql"
    last_path.write_text(update, encoding="utf-8")
    cohorts[-1]["files"].append(
        {"name": last_path.name, "rows": 0, "metadata_updates": 1,
         "sha256": hashlib.sha256(update.encode("utf-8")).hexdigest()})

    manifest = {
        "status": "OFFLINE_ONLY_FULL_REMAINDER_UNREVIEWED_NOT_DEPLOYED",
        "source_key": SOURCE, "source_sha256": sha,
        "source_entries": total_entries, "source_forms": scanned_forms,
        "already_imported_exam_entries": len(exam_words),
        "already_imported_exam_forms": exam_forms,
        "candidate_remaining_entries": len(remainder),
        "candidate_remaining_forms": len(forms),
        "cohorts": cohorts, "teaching_senses_approved": 0,
        "license_reviewed": False, "source_enabled": False,
        "remote_database_access": False, "production_access": False
    }
    (root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def replay(root, entries_file, forms_file, schema_file):
    root = Path(root)
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    con = sqlite3.connect(":memory:")
    con.executescript(Path(schema_file).read_text(encoding="utf-8"))
    con.execute("PRAGMA foreign_keys=ON")
    base_entries, base_forms = [], []
    for row in core.iter_jsonl(entries_file):
        if row.get("exam_levels"):
            base_entries.append((row["entry_id"], row["headword"],
                                 json.dumps(sorted(row["exam_levels"]), separators=(",", ":")),
                                 SOURCE))
    for row in core.iter_jsonl(forms_file):
        if core.WORD.fullmatch(row.get("form", "")):
            pass
        # Entry membership is determined by audited upstream source, not guessed
    exam_ids = {r[0] for r in base_entries}
    con.executemany("INSERT INTO global_dictionary_entries(entry_id,headword,exam_levels_json,source_name) VALUES(?,?,?,?)", base_entries)
    for row in core.iter_jsonl(forms_file):
        identifier = core.stable_id(row["headword"])
        if identifier in exam_ids:
            base_forms.append((row["form"], identifier, SOURCE))
    con.executemany("INSERT INTO global_dictionary_forms(form,entry_id,source_name) VALUES(?,?,?)",base_forms)
    con.execute(
        "INSERT INTO global_dictionary_sources(source_key,license_name,license_reviewed,source_sha256,imported_entries,imported_forms,imported_at,enabled) VALUES(?,?,?,?,?,?,datetime('now'),0)",
        (SOURCE,"MIT_UPSTREAM_VERIFICATION_PENDING",0,
         manifest["source_sha256"],len(base_entries),len(base_forms)))
    con.commit()
    if (len(base_entries) != manifest["already_imported_exam_entries"] or
        len(base_forms) != manifest["already_imported_exam_forms"]):
        raise ValueError("REHEARSAL_EXAM_BASELINE_MISMATCH")
    expected_entries = len(base_entries)
    expected_forms = len(base_forms)
    for day in manifest["cohorts"]:
        folder = root / day["name"]
        for item in day["files"]:
            body = (folder / item["name"]).read_bytes()
            if hashlib.sha256(body).hexdigest() != item["sha256"]:
                raise ValueError("REMAINDER_SQL_DIGEST_MISMATCH")
            con.executescript(body.decode("utf-8"))
        if day["kind"] == "entries":
            expected_entries += day["rows"]
        else:
            expected_forms += day["rows"]
        counts=(con.execute("SELECT COUNT(*) FROM global_dictionary_entries").fetchone()[0],
                con.execute("SELECT COUNT(*) FROM global_dictionary_forms").fetchone()[0])
        if counts != (expected_entries, expected_forms):
            raise ValueError("REMAINDER_COHORT_COUNT_DRIFT")
        if list(con.execute("PRAGMA foreign_key_check")):
            raise ValueError("REMAINDER_FOREIGN_KEY_FAILURE")
    src = con.execute(
        "SELECT imported_entries,imported_forms,enabled,license_reviewed FROM global_dictionary_sources WHERE source_key=?",
        (SOURCE,)).fetchone()
    if (src != (manifest["source_entries"],manifest["source_forms"],0,0) or
        expected_entries != manifest["source_entries"] or
        expected_forms != manifest["source_forms"] or
        con.execute("SELECT COUNT(*) FROM global_dictionary_entries WHERE teaching_ready!=0 OR reviewed_at IS NOT NULL").fetchone()[0] or
        con.execute("SELECT COUNT(*) FROM global_dictionary_forms WHERE reviewed!=0").fetchone()[0] or
        con.execute("PRAGMA integrity_check").fetchone()[0] != "ok"):
        raise ValueError("REMAINDER_FULL_REPLAY_INTEGRITY_FAILED")
    con.close()
    return {"full_candidate_headwords":expected_entries,
            "full_candidate_forms":expected_forms,
            "cohorts":len(manifest["cohorts"]),
            "approved_teaching_senses":0,"remote_writes":0}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--entries",required=True)
    p.add_argument("--forms",required=True)
    p.add_argument("--audit",required=True)
    p.add_argument("--out",required=True)
    p.add_argument("--cohort-cap",type=int,default=MAX_DAY_ROWS)
    p.add_argument("--sql-file-rows",type=int,default=500)
    args=p.parse_args()
    manifest=build_remainder(args.entries,args.forms,args.audit,args.out,
                             cohort_cap=args.cohort_cap,sql_file_rows=args.sql_file_rows)
    stats=replay(args.out,args.entries,args.forms,HERE.parent/"db/013_global_dictionary.sql")
    print(json.dumps({"status":manifest["status"],**stats},ensure_ascii=False))


if __name__=="__main__":
    main()
