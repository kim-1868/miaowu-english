# Pages production Service Binding activation deployment

This non-runtime document exists only to trigger a fresh production deployment of `miaowu-english-pages` after configuring the Cloudflare Pages Production Service Binding `PRODUCTION_ORIGIN` -> `miaowu-english-production`.

- Target branch: `00-pages-production`
- Deployment should use `npm run pages:production:build` and `pages-production/dist`.
- Does not change Worker code, secrets, D1 bindings, or site assets.
- Post-deploy probe: `/__miaowu_prod_edge_probe` should report `productionBindingPresent: true`.
- If false, verify Pages Settings > Bindings > Production and save the binding before initiating another deployment.
