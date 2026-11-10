#!/usr/bin/env python3
"""ECDICT full-upstream *read-only* audit and headword index compiler.

No user data and no Cloudflare or GitHub API access. Streaming input, SQLite
temporary workspace, JSONL outputs only. Does NOT approve any definition,
lesson, IPA, derivative spelling, commercial source or purchase entitlement.
"""
import argparse
import csv
import hashlib
import json
import re
import sqlite3
import unicodedata
from pathlib import Path

WORD = re.compile(r"^[a-z]+(?:['-][a-z]+)*$")
EXCHANGE_CODES = frozenset(("s", "p", "d", "i", "3", "r", "t"))
EXAMS = {"gk": "gaokao", "cet4": "cet4", "cet6": "cet6",
         "ky": "postgrad", "ielts": "ielts", "toefl": "toefl"}
BATCH = 3000


def lemma(value):
    if not isinstance(value, str):
        return None
    key = unicodedata.normalize("NFKC", value).strip().replace("’", "'").lower()
    return key if WORD.fullmatch(key) and len(key) <= 80 else None


def audit_file(source, out_dir):
    src = Path(source)
    dst = Path(out_dir)
    if not src.is_file() or not src.stat().st_size:
        raise ValueError("UPSTREAM_CSV_NOT_FOUND_OR_EMPTY")
    dst.mkdir(parents=True, exist_ok=True)
    source_sha = hashlib.sha256()
    with src.open("rb") as fp:
        for piece in iter(lambda: fp.read(4 * 1024 * 1024), b""):
            source_sha.update(piece)
    source_sha = source_sha.hexdigest()
    con = sqlite3.connect(str(dst / "index-workspace.sqlite"))
    con.execute("PRAGMA journal_mode=OFF")
    con.execute("PRAGMA synchronous=OFF")
    con.execute("PRAGMA temp_store=FILE")
    con.executescript("""
      CREATE TABLE headwords(
        headword TEXT PRIMARY KEY, exam_levels_json TEXT NOT NULL,
        duplicates INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE forms(form TEXT NOT NULL,headword TEXT NOT NULL,
        PRIMARY KEY(form,headword));
    """)
    stats = dict(source_rows=0,invalid_headword=0,duplicate_headword_rows=0,
                 raw_forms=0,invalid_forms=0,duplicate_forms=0,
                 nonempty_exam_tags=0)
    invalid_examples = []
    with src.open("r", encoding="utf-8-sig", newline="") as fp:
        reader = csv.DictReader(fp)
        if not reader.fieldnames or not {"word", "tag", "exchange"}.issubset(reader.fieldnames):
            raise ValueError("UPSTREAM_ECDICT_HEADERS_MISSING")
        con.execute("BEGIN")
        for row in reader:
            stats["source_rows"] += 1
            raw = row.get("word") or ""
            word = lemma(raw)
            if word is None:
                stats["invalid_headword"] += 1
                if len(invalid_examples) < 15:
                    invalid_examples.append(raw[:80])
                continue
            tags = sorted({EXAMS[tag] for tag in re.split(r"[\s,;/]+",
                           (row.get("tag") or "").lower()) if tag in EXAMS})
            if tags:
                stats["nonempty_exam_tags"] += 1
            try:
                con.execute("INSERT INTO headwords(headword,exam_levels_json) VALUES(?,?)",
                            (word, json.dumps(tags, ensure_ascii=True)))
            except sqlite3.IntegrityError:
                stats["duplicate_headword_rows"] += 1
                con.execute("UPDATE headwords SET duplicates=duplicates+1 WHERE headword=?", (word,))
            for item in (row.get("exchange") or "").split("/"):
                if not item:
                    continue
                k, sep, spelling = item.partition(":")
                form = lemma(spelling) if sep and k in EXCHANGE_CODES else None
                if not form or len(form) < 2 or form == word:
                    stats["invalid_forms"] += 1
                    continue
                stats["raw_forms"] += 1
                before = con.total_changes
                con.execute("INSERT OR IGNORE INTO forms(form,headword) VALUES(?,?)", (form, word))
                if con.total_changes == before:
                    stats["duplicate_forms"] += 1
            if stats["source_rows"] % BATCH == 0:
                con.commit()
                con.execute("BEGIN")
        con.commit()
    con.executescript("""
       CREATE INDEX ix_forms_headword ON forms(headword);
       CREATE INDEX ix_forms_surface ON forms(form);
    """)
    counts = {}
    counts["retained_headwords"] = con.execute(
        "SELECT COUNT(*) FROM headwords WHERE duplicates=0").fetchone()[0]
    counts["quarantined_duplicate_headwords"] = con.execute(
        "SELECT COUNT(*) FROM headwords WHERE duplicates>0").fetchone()[0]
    counts["candidate_forms"] = con.execute(
        "SELECT COUNT(*) FROM forms f JOIN headwords h ON h.headword=f.headword "
        "WHERE h.duplicates=0").fetchone()[0]
    counts["unique_form_spellings"] = con.execute(
        "SELECT COUNT(DISTINCT f.form) FROM forms f JOIN headwords h "
        "ON h.headword=f.headword WHERE h.duplicates=0").fetchone()[0]
    counts["form_multiple_lemmas"] = con.execute(
        "SELECT COUNT(*) FROM (SELECT f.form FROM forms f "
        "JOIN headwords h ON h.headword=f.headword "
        "WHERE h.duplicates=0 GROUP BY f.form HAVING COUNT(*)>1)").fetchone()[0]
    counts["form_exact_headword_collision"] = con.execute(
        "SELECT COUNT(DISTINCT f.form) FROM forms f JOIN headwords h "
        "ON h.headword=f.headword JOIN headwords h2 ON h2.headword=f.form "
        "WHERE h.duplicates=0 AND h2.duplicates=0 AND f.form<>f.headword").fetchone()[0]
    level_counts = {}
    for tags_json, in con.execute(
        "SELECT exam_levels_json FROM headwords WHERE duplicates=0"):
        for tag in json.loads(tags_json):
            level_counts[tag] = level_counts.get(tag, 0) + 1
    with (dst / "dictionary-unverified-entries.jsonl").open("w", encoding="utf-8") as f:
        for word, tags_json in con.execute(
            "SELECT headword,exam_levels_json FROM headwords "
            "WHERE duplicates=0 ORDER BY headword"):
            entry_id = "gdict_" + hashlib.sha256(word.encode("utf-8")).hexdigest()[:24]
            f.write(json.dumps(dict(entry_id=entry_id, headword=word,
                    exam_levels=json.loads(tags_json), source="ECDICT_FULL_UPSTREAM_UNVERIFIED",
                    teaching_ready=False, reviewed=False), ensure_ascii=False) + "\n")
    with (dst / "dictionary-unverified-forms.jsonl").open("w", encoding="utf-8") as f:
        for form, word in con.execute(
            "SELECT f.form,f.headword FROM forms f JOIN headwords h "
            "ON h.headword=f.headword WHERE h.duplicates=0 ORDER BY f.form,f.headword"):
            f.write(json.dumps(dict(form=form, headword=word,
                source="ECDICT_EXCHANGE_UNVERIFIED", reviewed=False,
                verified=False), ensure_ascii=False) + "\n")
    report = dict(
        status="FULL_UPSTREAM_LEXICON_DRAFT_NOT_APPROVED_NOT_DEPLOYED",
        source_sha256=source_sha, source_bytes=src.stat().st_size,
        source_repository="https://github.com/skywind3000/ECDICT",
        license_notice="MIT repository declaration; upstream third-party data provenance not yet signed off",
        source_statistics=stats, index_statistics=counts,
        exam_level_counts=level_counts,
        excluded_headword_examples=invalid_examples,
        imported_into_d1=False, training_cards_approved=0,
        purchase_entitlements_modified=False, user_study_data_modified=False)
    (dst / "audit-summary.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    con.close()
    # The temporary DB is NOT part of the GitHub artifact; only normalized
    # index candidates + aggregate audit are distributed for later review.
    (dst / "index-workspace.sqlite").unlink()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_csv")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    report = audit_file(args.source_csv, args.out)
    print(json.dumps(dict(status=report["status"],
        sha256=report["source_sha256"],
        stats=report["index_statistics"],
        levels=report["exam_level_counts"]), ensure_ascii=False))


if __name__ == "__main__":
    main()
