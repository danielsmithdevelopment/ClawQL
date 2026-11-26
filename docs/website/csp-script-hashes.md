# CSP `script-src` hashes (www + docs)

Audit later **9.14**: replace `script-src 'self' 'unsafe-inline'` on marketing/docs Cloudflare `_headers` with **`sha256-…` hashes** of known inline scripts. `style-src` still allows `'unsafe-inline'` (critical CSS / Tailwind).

## How hashes are produced

Per [CSP Level 2 §4.2.5](https://www.w3.org/TR/CSP2/#source-list-valid-hashes):

1. Take the **exact UTF-8 body** of each inline `<script>…</script>` (no tags, no surrounding whitespace normalization beyond what the HTML emitter wrote).
2. Compute **SHA-256**, encode the digest as **standard Base64** (not hex).
3. Emit a source expression: `'sha256-<base64>'`.

Browsers match the hash against the script body **byte-for-byte**. Any change to JSON-LD (or Next flight payloads) requires regenerating hashes.

## `apps/www` (static export → Cloudflare Pages `_headers`)

| Step      | Script                              | What it does                                                                                                                                                            |
| --------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prebuild  | `scripts/generate-agent-assets.mjs` | Writes `public/_headers` with hashes for **sitewide JSON-LD** (`wwwJsonLdScriptBodies` in `scripts/csp-script-hashes.mjs`, kept in sync with `SiteStructuredData.tsx`). |
| Postbuild | `scripts/seal-csp-from-html.mjs`    | Scans `out/**/*.html`, unions **every** inline script (JSON-LD + Next/Turbopack flight), rewrites `out/_headers` `script-src`.                                          |

```bash
cd apps/www
NEXT_PUBLIC_SITE_URL=https://clawql.com npm run build   # prebuild → next → postbuild seal
```

## `apps/docs` (OpenNext → Workers ASSETS `_headers`)

| Step           | Script                                    | What it does                                                                                                                                                                              |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prebuild       | `scripts/generate-public-headers-csp.mjs` | Patches `public/_headers` with hashes for **site JSON-LD + case-study JSON-LD** (`docsKnownInlineScriptBodies`).                                                                          |
| After OpenNext | `scripts/seal-csp-from-html.mjs`          | Scans `.open-next/assets/**/*.html`, rewrites ASSETS `_headers` with the full inline set. Wired into `deploy` / `upload` / `preview` npm scripts and `.github/workflows/deploy-docs.yml`. |

```bash
cd apps/docs
NEXT_PUBLIC_SITE_URL=https://docs.clawql.com node scripts/generate-public-headers-csp.mjs
# after opennextjs-cloudflare build:
node scripts/seal-csp-from-html.mjs
```

## Maintenance

- Prefer changing structured data via the React components, then re-run the generators so hash modules stay aligned (`wwwJsonLdScriptBodies` / `DOCS_CASE_STUDY_PROPS`).
- Do **not** reintroduce `script-src … 'unsafe-inline'` on these `_headers` files.
- New inline author scripts (analytics snippets, etc.) must be added to the known-body helpers **or** rely on the post-build seal (deploy path only).
