#!/usr/bin/env bash
# P0A protected staging D1 schema 021 only, called by manual approved workflow.
# Commands fail-closed; no plaintext D1 data or runner secrets go to logs.
set -euo pipefail
mode="$1"
p="$RUNNER_TEMP/p0-021-private"
out="$RUNNER_TEMP/p0-021-full-before.gpg"
target="miaowu-english-test"
cfg="wrangler.jsonc"
mkdir -p "$p"
chmod 700 "$p"
umask 077
query(){
 local sql="$1" dest="$2"
 if ! npx wrangler d1 execute "$target" --remote --json --config "$cfg" \
   --command "$sql" >"$dest" 2>"$p/private-d1-error"; then
   echo 'P0_021_REMOTE_QUERY_FAILED_NO_CONTENT_LOGGED'
   exit 1
 fi
}
case "$mode" in
 preflight)
  test -n "$CLOUDFLARE_API_TOKEN"
  test -n "$CLOUDFLARE_ACCOUNT_ID"
  node --input-type=module <<'NODE'
  import assert from 'node:assert/strict';
  import {readFileSync} from 'node:fs';
  const c=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
  assert.equal(c.name,'miaowu-english-staging');
  assert.equal(c.vars.APP_ENV,'staging');
  assert.equal(c.d1_databases.length,1);
  assert.equal(c.d1_databases[0].database_name,'miaowu-english-test');
  assert.equal(c.d1_databases[0].database_id,'88a817cb-23bb-4ae4-bcb8-92286c4165d4');
  assert.notEqual(c.vars.OPS_DICTIONARY_PUBLISHER_BRIDGE_ENABLED,'true');
  const sql=readFileSync('db/021_ops_dictionary_publisher_receipt_bridge.sql','utf8');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS ops_dictionary_publisher_keys/u);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS ops_dictionary_publisher_receipts/u);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|ATTACH|REPLACE)\b\s+(?:INTO|TABLE|FROM|DATABASE)?\b/iu);
  console.log('P0_021_EXACT_TEST_D1_ONLY_NO_DEFAULT_FEATURE_ACTIVATION');
  NODE
  node scripts/v12-ops-test-021-verify.mjs sql before >"$p/before.sql"
  query "$(cat "$p/before.sql")" "$p/before.json"
  query 'PRAGMA foreign_key_check;' "$p/before-fk.json"
  query 'PRAGMA quick_check;' "$p/before-quick.json"
  node scripts/v12-ops-test-021-verify.mjs before \
   "$p/before.json" "$p/before-fk.json" "$p/before-quick.json"
  if ! npx wrangler d1 time-travel info "$target" --config "$cfg" \
     >"$p/timetravel.log" 2>&1; then
    echo 'P0_021_TIME_TRAVEL_UNAVAILABLE'; exit 1
  fi
  grep -qi bookmark "$p/timetravel.log" ||
    { echo 'P0_021_RECOVERY_BOOKMARK_MISSING'; exit 1; }
  echo 'P0_021_TEST_REAL_READONLY_BASELINE_AND_RECOVERY_READY'
 ;;
 backup)
  test -s "$p/before.json"
  test -n "$CLOUDFLARE_API_TOKEN"
  test -n "$CLOUDFLARE_ACCOUNT_ID"
  test -n "$STAGING_D1_BACKUP_PASSPHRASE"
  test "$(printf '%s' "$STAGING_D1_BACKUP_PASSPHRASE" | wc -c)" -ge 32
  d="$p/backup"
  mkdir -m 700 "$d"
  printf '%s' "$STAGING_D1_BACKUP_PASSPHRASE" > "$d/pass"
  unset STAGING_D1_BACKUP_PASSPHRASE
  if ! npx wrangler d1 export "$target" --remote --skip-confirmation \
      --config "$cfg" --output "$d/backup.sql" >"$d/export.log" 2>&1; then
    echo 'P0_021_FULL_EXPORT_FAILED_NO_WRITES'; exit 1
  fi
  test -s "$d/backup.sql"
  gpg --batch --yes --pinentry-mode loopback --passphrase-file "$d/pass" \
    --symmetric --cipher-algo AES256 --output "$out" "$d/backup.sql" \
    >"$d/encrypt.log" 2>&1
  gpg --batch --yes --pinentry-mode loopback --passphrase-file "$d/pass" \
    --decrypt "$out" > "$d/restored.sql" 2>"$d/decrypt.log"
  cmp -s "$d/backup.sql" "$d/restored.sql"
  if ! sqlite3 "$d/restore.sqlite" < "$d/restored.sql" \
        >"$d/restore.log" 2>"$d/restore-err"; then
    echo 'P0_021_OFFLINE_RESTORE_FAILED'; exit 1
  fi
  test "$(sqlite3 "$d/restore.sqlite" 'PRAGMA integrity_check;')" = 'ok'
  test -z "$(sqlite3 "$d/restore.sqlite" 'PRAGMA foreign_key_check;')"
  rm -rf "$d"
  echo 'P0_021_FULL_TEST_AES256_BACKUP_AND_RESTORE_VERIFIED_NO_DB_WRITES'
 ;;
 apply)
  test -s "$p/before.json"
  test -s "$out"
  if ! npx wrangler d1 execute "$target" --remote --config "$cfg" \
     --file db/021_ops_dictionary_publisher_receipt_bridge.sql \
     >"$p/apply.log" 2>&1; then
    echo 'P0_021_APPLY_FAILED_RESTORE_FROM_ENCRYPTED_BACKUP'; exit 1
  fi
  echo 'P0_021_EXACT_ADD_ONLY_SQL_APPLIED_TO_TEST_D1'
 ;;
 after)
  node scripts/v12-ops-test-021-verify.mjs sql after >"$p/after.sql"
  query "$(cat "$p/after.sql")" "$p/after.json"
  query 'PRAGMA foreign_key_check;' "$p/after-fk.json"
  query 'PRAGMA quick_check;' "$p/after-quick.json"
  node scripts/v12-ops-test-021-verify.mjs after \
   "$p/before.json" "$p/after.json" "$p/after-fk.json" "$p/after-quick.json"
  echo 'P0_021_TEST_SCHEMA_ONLY_HISTORICAL_COUNTS_UNCHANGED'
 ;;
 cleanup)
  rm -rf "$p"
  rm -f "$out"
 ;;
 *)
  echo 'P0_021_INVALID_WORKFLOW_MODE';exit 1
 ;;
esac
