# Documentation site caching (`docs.clawql.com`)

The docs site is a **Next.js** app on **Cloudflare Workers** (OpenNext). Caching is layered:

1. **`Cache-Control` on responses** — set in **`website/next.config.mjs`** (`headers()`). Cloudflare’s CDN respects **`s-maxage`** and **`stale-while-revalidate`** for shared edge caches; **`max-age=0`** on HTML keeps browsers revalidating while the edge can cache briefly.
2. **`public/_headers`** — applies to **static assets** served from the **ASSETS** binding (e.g. hashed `/_next/static/*`, logo). Long **`immutable`** TTLs are safe for fingerprinted files.

## Defaults (repo)

| Pattern                                  | Behavior                                                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`/:path*`** (default)                  | `public, max-age=0, s-maxage=86400, stale-while-revalidate=604800` — shared edge may cache HTML ~24h; serve stale up to 7d while revalidating (see **`website/next.config.mjs`**).                      |
| **`/case-studies/:path*`**               | Longer edge reuse: `s-maxage=604800` (7d), `stale-while-revalidate=2592000` (~30d) — case studies are large MDX and the most **Worker CPU**–sensitive routes on Cloudflare Free; purge after urgent edits. |
| **`/vision/slide-deck`**                 | Same long edge TTL as case studies — full ~80-slide deck MDX (async chunk); purge after urgent edits.                                                                                                  |
| **`/security/defense-in-depth`**         | Same pattern — comprehensive defense-in-depth MDX (async chunk); purge after urgent edits.                                                                                                              |
| **`/_next/image`**                       | Long-lived cache (optimized images are content-addressed by URL).                                                                                                                                        |
| **`/_next/static/:path*`**               | `immutable` + 1 year — matches hashed webpack chunks.                                                                                                                                                  |
| **`/ClawQL-logo.jpeg`** (via `_headers`) | Shorter browser/edge TTL so a replaced file is picked up without renaming.                                                                                                                             |

`public/_headers` mirrors **`/_next/static/*`**, **`.well-known/*`**, **`/case-studies/*`**, and the logo for responses served from the **ASSETS** binding.

Tune **`s-maxage`** / **`stale-while-revalidate`** in **`next.config.mjs`** if you need fresher HTML after every deploy (lower edge TTL) or more offload under load (higher TTL).

## Cloudflare dashboard / API (optional)

You can add **Cache Rules** (phase **`http_request_cache_settings`**) on the **`clawql.com`** zone for **`docs.clawql.com`** (e.g. extra bypass or longer edge TTL for specific paths). That requires a token with **zone** write / rulesets permissions — the read-only **`zones.get`** / **`listZoneRulesets`** checks used from ClawQL **`execute`** do not modify settings.

**Cache Reserve** and **tiered cache** are paid/plan-dependent; see Cloudflare docs if you upgrade.

## Purge after deploy

After a release, purge cache for **`docs.clawql.com`** in the Cloudflare dashboard (**Caching** → **Configuration** → **Purge Cache**) if you increase edge TTLs and need immediate consistency.
