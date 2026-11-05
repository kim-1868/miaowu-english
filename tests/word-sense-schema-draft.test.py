"""Isolated SQLite smoke test for the additive sense-ID draft. NEVER touches Cloudflare."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
for path in ("db/001_schema.sql", "db/004_editorial_content.sql"):
    db.executescript((ROOT / path).read_text(encoding="utf-8"))

db.execute("INSERT INTO users(id,username,password_hash,password_salt) VALUES ('u1','fixture','h','s')")
db.execute("INSERT INTO categories(id,slug,title) VALUES ('cet4','cet4','大学英语四级')")
for book_id in ("book_a", "book_b", "book_c"):
    db.execute("INSERT INTO books(id,category_id,title,status) VALUES (?,'cet4',?,'published')",
               (book_id, book_id))
    db.execute("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES (?,?,1,'Chapter','{}',CURRENT_TIMESTAMP)",
               ("ch_"+book_id, book_id))
for word_id, pos, meaning in (("old_a","n.","记录"),("old_b","n.","记录"),("old_c","v.","录制")):
    db.execute("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES (?,'record',?,?)",
               (word_id,pos,meaning))
for book_id, word_id in (("book_a","old_a"),("book_b","old_b"),("book_c","old_c")):
    db.execute("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES (?,?,?,?)",
               ("ch_"+book_id,word_id,"Original untouched context", "p0:s0"))
db.execute("INSERT INTO user_words(user_id,word_id,status,bookmarked) VALUES ('u1','old_a','mastered',1)")
db.execute("INSERT INTO review_events(id,user_id,word_id,game_type,result) VALUES ('ev1','u1','old_a','fill','correct')")
db.commit()

legacy_tables = ("users","categories","books","chapters","words","chapter_words","user_words","review_events")
def snapshot():
    return {table:db.execute("SELECT * FROM "+table).fetchall() for table in legacy_tables}
before=snapshot()
migration= (ROOT / "db/plans/009_canonical_word_senses_DRAFT.sql").read_text(encoding="utf-8")
db.executescript(migration)
db.executescript(migration)
assert before == snapshot(), "Draft schema mutated legacy data"
assert not db.execute("PRAGMA foreign_key_check").fetchall()

db.execute("INSERT INTO canonical_word_senses(id,lemma_normalized,part_of_speech,sense_code,meaning_zh,verification_status) VALUES ('sense-record-n-document','record','n.','document','记录','approved')")
db.execute("INSERT INTO canonical_word_senses(id,lemma_normalized,part_of_speech,sense_code,meaning_zh,verification_status) VALUES ('sense-record-v-capture','record','v.','capture','录制','approved')")
mapping=(("old_a","sense-record-n-document"),("old_b","sense-record-n-document"),("old_c","sense-record-v-capture"))
for word_id,sense_id in mapping:
    db.execute("INSERT INTO legacy_word_sense_map(word_id,sense_id,review_status) VALUES (?,?,'approved')",
               (word_id,sense_id))
pairs=dict(db.execute("SELECT word_id,sense_id FROM legacy_word_sense_map").fetchall())
assert pairs["old_a"]==pairs["old_b"] and pairs["old_a"]!=pairs["old_c"]
db.execute("INSERT INTO user_sense_state(user_id,sense_id,status,bookmarked) VALUES ('u1','sense-record-n-document','mastered',1)")
db.execute("INSERT INTO review_event_senses(event_id,sense_id) VALUES ('ev1','sense-record-n-document')")
assert before == snapshot(), "Adding canonical state mutated legacy source tables"
assert not db.execute("PRAGMA foreign_key_check").fetchall()

# Confirm a published context anchor may be mapped separately without modifying old chapter_words.
db.execute("INSERT INTO chapter_word_sense_overrides(chapter_id,word_id,context_anchor,sense_id,review_status) VALUES ('ch_book_a','old_a','p0:s0','sense-record-n-document','approved')")
assert before == snapshot()
print("PASS: isolated additive schema idempotent; legacy data unchanged; identical senses shared; different senses split; referential integrity valid.")
