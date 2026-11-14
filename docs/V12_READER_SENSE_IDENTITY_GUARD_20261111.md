# V1.2 reader one-card / sense-level SRS integration guard (2026-11-11)

Current one-card reader planning uses `entry_id` to deduplicate the **displayed card**, but user study and SRS must be keyed by independently approved `sense_id`.

## This change

- `src/global-dictionary-headword-click-plan.js`: display card still holds multiple sense rows, however `user_study_key='sense_id'` and `study_sense_ids` enumerate independently approved senses; each proposed occurrence retains `context_sense_id:null`, `study_sense_confirmed:false` and requires a human editor to select its actual meaning in context.
- Reader plans explicitly declare `headword_level_mastery_supported:false` and never write user progress, mutate historical chapters or publish novel bindings.
- Existing SRS headword read/write flags must remain disabled; the dormant 019 headword table MUST NOT be used as the authoritative mastery source.
- Separate 020 SQL and pure SRS planning are already committed in PR #228. They have **not** been deployed to any D1. Real historical novel auto-match and per-sense API activation still need approved learning content and staging E2E.
- 61,422 dictionary candidates remain **unreviewed**; none are automatically publishable due to this change.

## Follow-up

After user triggers independently approved 019 migration, continue the separate 020 schema review and implement a staging-only `sense_id` feedback route with signed chapter anchor, paid/free access checks, idempotent revision updates and a human-reviewed sense binding. Then test shared same sense across two novels versus two different senses of a polysemous word.
