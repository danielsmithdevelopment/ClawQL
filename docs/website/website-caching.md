# Documentation site caching (`docs.clawql.com`)

The docs site is a **Next.js** app on **Cloudflare Workers** (OpenNext). Caching is layered:

1. **`Cache-Control` on responses** — set in **`website/next.config.mjs`** (`headers()`). Cloudflare’s CDN respects **`s-maxage`** and **`stale-while-revalidate`** for shared edge caches; **`max-age=0`** on HTML keeps browsers revalidating while the edge can cache briefly.
2. **`public/_headers`** — applies to **static assets** served from the **ASSETS** binding (e.g. hashed `/_next/static/*`, logo). Long **`immutable`** TTLs are safe for fingerprinted files.

## Defaults (repo)

| Pattern                                                                                                                                                | Behavior                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **`/:path*`** (default)                                                                                                                                | `public, max-age=0, s-maxage=604800, stale-while-revalidate=2592000` (~7d edge, ~30d stale) — see **`website/src/lib/edge-cache-control.mjs`**. |
| **Heavy MDX routes** (case studies, vision, operations guide, contributor spec, ouroboros spec, defense-in-depth, security training, token efficiency) | `s-maxage=2592000` (~30d), `stale-while-revalidate=7776000` (~90d) — purge after urgent edits.                                                  |
| **`/_next/image`**                                                                                                                                     | Long-lived cache (optimized images are content-addressed by URL).                                                                               |
| **`/_next/static/:path*`**                                                                                                                             | `immutable` + 1 year — matches hashed webpack chunks.                                                                                           |
| **`/ClawQL-logo.jpeg`** (via `_headers`)                                                                                                               | Shorter browser/edge TTL so a replaced file is picked up without renaming.                                                                      |

## OpenNext (Workers CPU / Error 1102)

**`website/open-next.config.ts`** uses **`staticAssetsIncrementalCache`** with **`enableCacheInterception: true`** so prerendered HTML is served from **Workers Static Assets** when possible, skipping **NextServer** JS on cache hits (recommended for fully static sites — see [OpenNext SSG caching](https://opennext.js.org/cloudflare/caching#ssg-site)).

Root layout sets **`export const dynamic = 'force-static'`** so all routes default to build-time HTML unless a segment opts into dynamic rendering.

`public/_headers` mirrors **`/_next/static/*`**, **`.well-known/*`**, **`/case-studies/*`**, and the logo for responses served from the **ASSETS** binding.

Tune **`s-maxage`** / **`stale-while-revalidate`** in **`next.config.mjs`** if you need fresher HTML after every deploy (lower edge TTL) or more offload under load (higher TTL).

## Cloudflare dashboard / API (optional)

You can add **Cache Rules** (phase **`http_request_cache_settings`**) on the **`clawql.com`** zone for **`docs.clawql.com`** (e.g. extra bypass or longer edge TTL for specific paths). That requires a token with **zone** write / rulesets permissions — the read-only **`zones.get`** / **`listZoneRulesets`** checks used from ClawQL **`execute`** do not modify settings.

**Cache Reserve** and **tiered cache** are paid/plan-dependent; see Cloudflare docs if you upgrade.

## Purge after deploy

After a release, purge cache for **`docs.clawql.com`** in the Cloudflare dashboard (**Caching** → **Configuration** → **Purge Cache**) if you increase edge TTLs and need immediate consistency.
