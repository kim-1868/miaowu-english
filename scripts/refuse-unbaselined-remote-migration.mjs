// Deliberately fail closed. The existing Cloudflare staging database was
// initialized before Wrangler's d1_migrations ledger existed, so running
// migrations apply --remote would potentially replay historical migrations.
// Establish a reviewed baseline, backup and reconciliation before changing this.
process.stderr.write([
  "REMOTE_D1_MIGRATION_BLOCKED",
  "The Cloudflare staging D1 database has no d1_migrations ledger (observed 2026-11-01).",
  "Do not run 'wrangler d1 migrations apply --remote' against the existing database.",
  "Before any remote write: confirm DB identity and prior schema, capture a Time Travel bookmark,",
  "reconcile db/001-006 with the live schema and test db/007-008 on an isolated copy.",
  "See docs/STAGING_D1_BASELINE_2026-11-01.md.",
  ""
].join("\n"));
process.exitCode=1;
