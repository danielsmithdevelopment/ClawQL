# docs.clawql.com `/auth` + `/audit` static Worker

Tiny Cloudflare Worker that serves the public **Authentication** and **Audit Trail** pages while the main OpenNext docs Worker (`clawql-docs`) cannot be redeployed on the free plan (handler gzip &gt; 3 MiB — see [#87](https://github.com/danielsmithdevelopment/ClawQL/issues/87)).

## Why

Content for `/auth` and `/audit` lives in `website/src/app/{auth,audit}/` on `main`, but **Deploy docs (Cloudflare)** fails at `wrangler deploy`. Zone routes on this Worker (`docs.clawql.com/auth`, `/audit`, and trailing-slash variants) serve these two paths; everything else stays on `clawql-docs` (custom domain + `docs.clawql.com/*` route).

## Deploy

```bash
node scripts/generate-pages.mjs
npx wrangler deploy
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (CI can fall back to `website/wrangler.jsonc` `account_id`).

CI: `.github/workflows/deploy-docs.yml` job `deploy-auth-audit-static` runs on every docs deploy and does **not** depend on the OpenNext build succeeding.

## Edit copy

1. Update `website/src/app/auth/page.mdx` and `website/src/app/audit/page.mdx` (canonical source for the full docs site when OpenNext fits again).
2. Mirror into `scripts/generate-pages.mjs`, regenerate HTML, redeploy this Worker.
