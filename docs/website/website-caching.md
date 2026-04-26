# Documentation site caching (`docs.clawql.com`)

The docs site is a **Next.js** app on **Cloudflare Workers** (OpenNext). Caching is layered:

1. **`Cache-Control` on responses** — set in **`website/next.config.mjs`** (`headers()`). Cloudflare’s CDN respects **`s-maxage`** and **`stale-while-revalidate`** for shared edge caches; **`max-age=0`** on HTML keeps browsers revalidating while the edge can cache briefly.
2. **`public/_headers`** — applies to **static assets** served from the **ASSETS** binding (e.g. hashed `/_next/static/*`, logo). Long **`immutable`** TTLs are safe for fingerprinted files.

## Defaults (repo)

| Pattern                                  | Behavior                                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **`/:path*`** (default)                  | `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400` — edge may cache ~1h; serve stale up to 24h while revalidating. |
| **`/_next/image`**                       | Long-lived cache (optimized images are content-addressed by URL).                                                                |
| **`/_next/static/:path*`**               | `immutable` + 1 year — matches hashed webpack chunks.                                                                            |
| **`/ClawQL-logo.jpeg`** (via `_headers`) | Shorter browser/edge TTL so a replaced file is picked up without renaming.                                                       |

Tune **`s-maxage`** / **`stale-while-revalidate`** in **`next.config.mjs`** if you need fresher HTML after every deploy (lower edge TTL) or more offload under load (higher TTL).

## Cloudflare dashboard / API (optional)

You can add **Cache Rules** (phase **`http_request_cache_settings`**) on the **`clawql.com`** zone for **`docs.clawql.com`** (e.g. extra bypass or longer edge TTL for specific paths). That requires a token with **zone** write / rulesets permissions — the read-only **`zones.get`** / **`listZoneRulesets`** checks used from ClawQL **`execute`** do not modify settings.

**Cache Reserve** and **tiered cache** are paid/plan-dependent; see Cloudflare docs if you upgrade.

## Purge after deploy

After a release, purge cache for **`docs.clawql.com`** in the Cloudflare dashboard (**Caching** → **Configuration** → **Purge Cache**) if you increase edge TTLs and need immediate consistency.
