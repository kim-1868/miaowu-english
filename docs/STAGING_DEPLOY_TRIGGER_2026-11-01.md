# S9 staging deploy trigger · 2026-11-01

This is a documentation-only commit to trigger the connected Cloudflare GitHub build
**after** the staging Worker's build branch has been changed to
`release/staging-rc-20261101-dryrun-fixed`.

## Validated candidate

- Code was tested successfully at commit `0138e8d5bcd028c9e45f66f7bab3303cf191c5e6`.
- Worker: `miaowu-english-staging`; `APP_ENV=staging`.
- Database binding: `DB -> miaowu-english-test`, UUID
  `88a817cb-23bb-4ae4-bcb8-92286c4165d4`.
- The staging database has already had S9 007 and 008 applied and verified.
  **Never rerun either script.**
- The publication, withdrawal, and operator-console toggles default to disabled.
- The existing reviewer password gate must remain active; no new production
  secrets or operator credentials should be configured as a side effect.
- This commit changes only this Markdown document; it does not run migrations
  or change any Worker logic, configuration, UI or business data.

## Deployment acceptance

Cloudflare deployments must show a NEW Ready row sourced from the release
branch (not `dev/s1-auth-and-entitlements`) after this commit. Only then
perform private staging smoke tests. GitHub commit success alone does not
confirm an actual Cloudflare deployment.

Do not merge this candidate to `main` or publicly sell content.
