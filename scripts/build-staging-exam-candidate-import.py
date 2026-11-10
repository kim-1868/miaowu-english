#!/usr/bin/env python3
"""Offline-only ECDICT examination-tagged unreviewed D1 import compiler.

Input must be independently audited JSONL artifact. NEVER contacts D1 or
approves definitions, senses, inflections, licenses, or user study records.
"""
import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path

WORD = re.compile(r"^[a-z]+(?:['-][a-z]+)*$")
ENTRY_ID = re.compile(r"^gdict_[0-9a-f]{24}$")
LEVELS = frozenset(("gaokao", "cet4", "cet6", "postgrad", "ielts", "toefl"))
SOURCE = "upstream_ecdict_unverified"
UPSTREAM_SHA = "d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc"


def iter_jsonl(path):
    with Path(path).open(encoding="utf-8") as fp:
        for line in fp:
            if line.strip():
                obj = json.loads(line)
                if not isinstance(obj, dict):
                    raise ValueError("INDEX_RECORD_NOT_OBJECT")
                yield obj


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def stable_id(headword):
    return "gdict_" + hashlib.sha256(headword.encode("utf-8")).hexdigest()[:24]


def chunks(rows, size):
    for offset in range(0, len(rows), size):
        yield rows[offset:offset + size]


def compile_exam_candidates(entries_path, forms_path, audit_path, output, *, batch_size=800, fixture=False):
    if not 1 <= batch_size <= 2000:
        raise ValueError("INVALID_BATCH_SIZE")
    report = json.loads(Path(audit_path).read_text(encoding="utf-8"))
    sha = report.get("source_sha256", "")
    expected = report.get("index_statistics", {})
    if not fixture and (sha != UPSTREAM_SHA or
                        expected.get("retained_headwords") != 400183 or
                        expected.get("candidate_forms") != 56898):
        raise ValueError("UNEXPECTED_UPSTREAM_PROVENANCE_OR_COUNTS")
    selected, observed_all = {}, set()
    scanned = 0
    for row in iter_jsonl(entries_path):
        headword = row.get("headword")
        if not isinstance(headword, str) or not WORD.fullmatch(headword) or len(headword) > 80:
            raise ValueError("UNSAFE_HEADWORD_FORMAT")
        entry_id = row.get("entry_id")
        if not isinstance(entry_id, str) or not ENTRY_ID.fullmatch(entry_id) or entry_id != stable_id(headword):
            raise ValueError("ENTRY_ID_INTEGRITY_ERROR")
        if headword in observed_all:
            raise ValueError("DUPLICATE_HEADWORD")
        observed_all.add(headword)
        scanned += 1
        levels = row.get("exam_levels")
        if (not isinstance(levels, list) or
            any(not isinstance(t, str) or t not in LEVELS for t in levels) or
            len(levels) != len(set(levels)) or
            row.get("source") != "ECDICT_FULL_UPSTREAM_UNVERIFIED" or
            row.get("teaching_ready") is not False or row.get("reviewed") is not False):
            raise ValueError("UNVERIFIED_SOURCE_GUARD_FAILED")
        if levels:
            selected[headword] = (entry_id, sorted(levels))
    if scanned != expected.get("retained_headwords"):
        raise ValueError("SOURCE_ENTRY_COUNT_MISMATCH")
    if not fixture and not 3000 <= len(selected) <= 30000:
        raise ValueError("UNEXPECTED_EXAM_HEADWORD_SIZE")

    pairs = set()
    forms = []
    all_forms = 0
    for row in iter_jsonl(forms_path):
        all_forms += 1
        form, headword = row.get("form"), row.get("headword")
        if (not isinstance(form, str) or not WORD.fullmatch(form) or
            not isinstance(headword, str) or not WORD.fullmatch(headword) or
            row.get("source") != "ECDICT_EXCHANGE_UNVERIFIED" or
            row.get("reviewed") is not False or row.get("verified") is not False):
            raise ValueError("UNREVIEWED_FORMS_GUARD_FAILED")
        pair = (form, headword)
        if pair in pairs:
            raise ValueError("DUPLICATE_FORM_PAIR")
        pairs.add(pair)
        if headword in selected:
            forms.append((form, selected[headword][0]))
    if all_forms != expected.get("candidate_forms"):
        raise ValueError("SOURCE_FORMS_COUNT_MISMATCH")
    if not fixture and len(selected) + len(forms) > 75000:
        raise ValueError("FREE_TIER_ROW_BUDGET_REVIEW_REQUIRED")

    root = Path(output)
    if root.exists() and any(root.iterdir()):
        raise ValueError("OUTPUT_MUST_BE_EMPTY")
    root.mkdir(parents=True, exist_ok=True)
    manifest = {
        "status": "CANDIDATE_ONLY_NOT_TEACHING_APPROVED",
        "source_key": SOURCE, "upstream_source_sha256": sha,
        "source_rows": scanned, "source_forms": all_forms,
        "selected_entries": len(selected), "selected_forms": len(forms),
        "teaching_ready": 0, "reviewed_forms": 0,
        "license_reviewed": 0, "source_enabled": 0,
        "production_access": False, "files": []
    }

    def save(filename, statements, rowcount):
        sql = "-- D1 import file: intentionally no explicit BEGIN/COMMIT.\n" + "\n".join(statements) + "\n"
        dst = root / filename
        dst.write_text(sql, encoding="utf-8")
        manifest["files"].append({
            "name": filename, "rows": rowcount,
            "sha256": hashlib.sha256(sql.encode("utf-8")).hexdigest()
        })

    # The source is disabled even if the candidate rows are present.
    save("000-source-disabled.sql", [
        "INSERT INTO global_dictionary_sources(source_key,license_name,license_reviewed,source_sha256,imported_entries,imported_forms,imported_at,enabled) VALUES(" +
        ",".join((quote(SOURCE), quote("MIT_UPSTREAM_VERIFICATION_PENDING"), "0",
                  quote(sha), str(len(selected)), str(len(forms)), "CURRENT_TIMESTAMP", "0")) + ");"
    ], 1)
    entries = sorted(selected.items())
    for n, part in enumerate(chunks(entries, batch_size), 1):
        statements = []
        for headword, (entry_id, levels) in part:
            values = [quote(entry_id), quote(headword), quote(json.dumps(levels, separators=(",", ":"))),
                      quote(SOURCE), "0", "NULL"]
            statements.append(
                "INSERT INTO global_dictionary_entries(entry_id,headword,exam_levels_json,source_name,teaching_ready,reviewed_at) VALUES(" +
                ",".join(values) + ");")
        save(f"100-entries-{n:04}.sql", statements, len(part))
    forms.sort()
    for n, part in enumerate(chunks(forms, batch_size), 1):
        statements = [
            "INSERT INTO global_dictionary_forms(form,entry_id,source_name,reviewed) VALUES(" +
            ",".join((quote(form), quote(entry_id), quote(SOURCE), "0")) + ");"
            for form, entry_id in part
        ]
        save(f"200-forms-{n:04}.sql", statements, len(part))
    if not fixture and len(selected) < 3000:
        raise ValueError("UNSAFE_EMPTY_IMPORT")
    (root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def verify_local(sql_dir, schema_file):
    directory = Path(sql_dir)
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    con = sqlite3.connect(":memory:")
    con.execute("PRAGMA foreign_keys=ON")
    con.executescript(Path(schema_file).read_text(encoding="utf-8"))
    for file in manifest["files"]:
        body = (directory / file["name"]).read_bytes()
        if hashlib.sha256(body).hexdigest() != file["sha256"]:
            raise ValueError("SQL_FILE_DIGEST_MISMATCH")
        con.executescript(body.decode("utf-8"))
    counts = dict(
        entries=con.execute("SELECT COUNT(*) FROM global_dictionary_entries").fetchone()[0],
        forms=con.execute("SELECT COUNT(*) FROM global_dictionary_forms").fetchone()[0],
        sources=con.execute("SELECT COUNT(*) FROM global_dictionary_sources").fetchone()[0]
    )
    if (counts != dict(entries=manifest["selected_entries"],
                       forms=manifest["selected_forms"], sources=1)
        or list(con.execute("PRAGMA foreign_key_check"))
        or con.execute("PRAGMA integrity_check").fetchone()[0] != "ok"
        or con.execute("SELECT COUNT(*) FROM global_dictionary_entries WHERE teaching_ready!=0 OR reviewed_at IS NOT NULL").fetchone()[0]
        or con.execute("SELECT COUNT(*) FROM global_dictionary_forms WHERE reviewed!=0").fetchone()[0]
        or con.execute("SELECT COUNT(*) FROM global_dictionary_sources WHERE enabled!=0 OR license_reviewed!=0").fetchone()[0]):
        raise ValueError("EXAM_IMPORT_OFFLINE_REHEARSAL_FAILED")
    return counts


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--entries", required=True)
    p.add_argument("--forms", required=True)
    p.add_argument("--audit", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--batch-size", type=int, default=800)
    args = p.parse_args()
    manifest = compile_exam_candidates(args.entries, args.forms, args.audit,
                                       args.out, batch_size=args.batch_size)
    verified = verify_local(args.out, Path(__file__).resolve().parents[1] /
                            "db/013_global_dictionary.sql")
    print(json.dumps({"status": manifest["status"], "entries": verified["entries"],
                      "forms": verified["forms"], "sql_files": len(manifest["files"]),
                      "remote_d1_writes": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
