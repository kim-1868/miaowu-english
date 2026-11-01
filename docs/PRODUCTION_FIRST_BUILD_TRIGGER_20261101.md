# V1 production Worker — initial build trigger

Date: 2026-11-01

This commit triggers the first Cloudflare Git-connected build **only** for the
dedicated Worker `miaowu-english-production`, from the reviewed release branch.

Deployment settings configured by the owner in Cloudflare Workers Builds:

- Production branch: `release/v1-production-worker-initial-20261101`
- Build: `npm run assets:production:build`
- Deploy: `npx wrangler deploy --config deploy/production.wrangler.jsonc`
- Project: `miaowu-english-production`

Production worker config explicitly binds **only**
`miaowu-english-prod` D1 ID `649c71b3-340c-49bf-b806-3d39256851d3`.
Never use repository-root `wrangler.jsonc`, which belongs to the staging
Worker. Do not accept an auto-generated PR that changes the root config.

Production and preview `workers.dev` routes are disabled by the owner.
A successful build **does not** mean the public Pages host is live or that
paid products are approved. Separate production `ACTIVATION_PEPPER` secret
and production Pages Service Binding are still required. Never put secrets,
real credentials, reader data or paid manuscript in this file.

This is an intentionally nonfunctional metadata change. Preserve the
already-verified public test site and staging database.
