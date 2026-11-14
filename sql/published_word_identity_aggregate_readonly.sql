-- V1.2: strictly published book/chapter legacy word identity aggregate.
-- One SELECT only; no headword, book/word IDs, gloss, text or users in output.
WITH
published_occurrences AS (
 SELECT b.id AS book_id, b.category_id, cw.word_id,
        lower(trim(w.headword)) AS lemma,
        lower(trim(coalesce(w.part_of_speech,''))) AS pos,
        trim(coalesce(w.meaning_zh,'')) AS gloss,
        coalesce(w.phonetic_uk,'') AS uk,
        coalesce(w.phonetic_us,'') AS us,
        coalesce(w.example_en,'') AS en,
        coalesce(w.example_zh,'') AS zh
 FROM chapter_words cw
 JOIN chapters ch ON ch.id=cw.chapter_id
 JOIN books b ON b.id=ch.book_id
 JOIN words w ON w.id=cw.word_id
 WHERE b.status='published' AND ch.published_at IS NOT NULL
),
unique_cards AS (
 SELECT word_id,lemma,pos,gloss,
        max(length(trim(uk))=0 OR length(trim(us))=0) AS missing_ipa,
        max(length(trim(en))=0 OR length(trim(zh))=0) AS missing_example,
        max(length(trim(pos))=0) AS missing_pos,
        max(length(trim(gloss))=0) AS missing_gloss
 FROM published_occurrences
 GROUP BY word_id,lemma,pos,gloss
),
headword_groups AS (
 SELECT lemma, count(DISTINCT word_id) AS old_ids
 FROM unique_cards WHERE lemma<>''
 GROUP BY lemma
),
headword_cross_books AS (
 SELECT lemma,count(DISTINCT book_id) AS books
 FROM published_occurrences WHERE lemma<>''
 GROUP BY lemma
),
strict_sense_groups AS (
 SELECT lemma,pos,gloss,count(DISTINCT word_id) AS old_ids
 FROM unique_cards
 WHERE lemma<>'' AND pos<>'' AND gloss<>''
 GROUP BY lemma,pos,gloss
),
old_id_cross_books AS (
 SELECT word_id,count(DISTINCT book_id) AS books
 FROM published_occurrences GROUP BY word_id
)
SELECT
 (SELECT count(*) FROM published_occurrences) AS published_anchor_rows,
 (SELECT count(*) FROM unique_cards) AS distinct_old_cards,
 (SELECT count(*) FROM headword_groups) AS distinct_headwords,
 (SELECT count(*) FROM headword_groups WHERE old_ids>1) AS headwords_with_multiple_old_ids,
 (SELECT coalesce(sum(old_ids-1),0) FROM headword_groups WHERE old_ids>1) AS excess_old_ids_by_headword,
 (SELECT count(*) FROM headword_cross_books WHERE books>1) AS headwords_repeated_between_books,
 (SELECT count(*) FROM strict_sense_groups) AS textual_sense_candidates,
 (SELECT count(*) FROM strict_sense_groups WHERE old_ids>1) AS textual_sense_groups_with_multiple_old_ids,
 (SELECT coalesce(sum(old_ids-1),0) FROM strict_sense_groups WHERE old_ids>1) AS excess_old_ids_by_textual_sense,
 (SELECT count(*) FROM old_id_cross_books WHERE books>1) AS old_ids_shared_between_books,
 (SELECT count(*) FROM unique_cards WHERE missing_ipa=1) AS cards_missing_either_ipa,
 (SELECT count(*) FROM unique_cards WHERE missing_example=1) AS cards_missing_either_example,
 (SELECT count(*) FROM unique_cards WHERE missing_pos=1) AS cards_missing_pos,
 (SELECT count(*) FROM unique_cards WHERE missing_gloss=1) AS cards_missing_gloss,
 (SELECT count(*) FROM unique_cards WHERE lemma='') AS cards_missing_headword,
 (SELECT count(DISTINCT book_id) FROM published_occurrences) AS published_books_with_anchors;
