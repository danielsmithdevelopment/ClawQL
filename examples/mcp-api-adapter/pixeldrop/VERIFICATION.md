# PixelDrop demo — verification status

Use this file to decide **what you can claim publicly** vs what still needs a real test.

## Verified

| Claim | Evidence | Date |
| --- | --- | --- |
| Broken demo rejects files >2MB | 18MB PNG → left pane error: "File too large (17.9MB)…" (desktop) | 2026-08-28 |
| Smart template resizes oversized images | 8000×6000 → 2048×1536 (desktop); 5712×4284 → 2048×1536 (iPhone Safari) | 2026-08-28 |
| Smart template compresses under 2MB backend limit | Processed output enabled submit + upload | 2026-08-28 |
| Same backend path as broken frontend | Upload IDs `up_4yuzrboy`, `up_p4yvp4nc`, `up_7vjocs3` via `uploadToBackend()` | 2026-08-28 |
| Harness loads; template injects correctly | `smoke-test.mjs` + browser inspection | 2026-08-28 |
| **HEIC from iPhone camera roll in Safari** | `IMG_6432.HEIC` → left: "Unsupported binary file: image/heic"; right: "Converted from image/heic to JPEG · Resized from 2316×3088 to 1536×2048" → `up_7vjocs3` on clawql.com harness | 2026-08-28 |
| **Large JPEG on iPhone Safari** | `IMG_6370.jpeg` 3.7MB → left rejects 2MB limit; right resizes and uploads `up_p4yvp4nc` | 2026-08-28 |

**Safe public lead:** "We wrapped a broken upload with a /mcp-ui template that converts HEIC, resizes oversized photos, and calls the site's own backend — tested on real iPhone Safari, no changes to their code."

**Also safe:** "Same HEIC the broken UI rejects (`image/heic`) uploads successfully after client-side conversion to JPEG."

## Still unverified

| Claim | Why unproven | Blocks flagship demo? |
| --- | --- | --- |
| **WebMCP discovery → execute path** | Harness bypasses WebMCP; calls `uploadToBackend()` directly | **Yes** — bolt-on pitch depends on this mechanism |
| Drag-and-drop on mobile | N/A by platform (no drag gesture) | No — desktop-only feature |
| HEIC on desktop Chrome | Browser-dependent; not tested with real `.heic` on desktop | No — iPhone story is the primary claim |

**Do not claim yet:** "WebMCP bolt-on works end-to-end" until Priority 2 below passes.

---

## Priority 1: iPhone Safari HEIC test — **PASSED**

**Result (2026-08-28):** Real device test on clawql.com harness in iPhone Safari.

| Pane | File | Outcome |
| --- | --- | --- |
| Left (broken) | `IMG_6432.HEIC` | `Unsupported binary file: "image/heic"` |
| Right (smart-upload) | same HEIC | `Converted from image/heic to JPEG · Resized from 2316×3088 to 1536×2048` → Upload ID `up_7vjocs3` |

**Also verified same session:** `IMG_6370.jpeg` (3.7MB) — left rejects size; right resizes 5712×4284 → 2048×1536 → `up_p4yvp4nc`.

No heic2any polyfill required on iPhone Safari — native `createImageBitmap` decoded the camera-roll HEIC.

---

## Priority 2: WebMCP CDP test (Chrome preview) — **OPEN**

**Goal:** Exercise the real discovery → execute path that production `clawql sources add --kind webmcp` uses — not the harness iframe bypass.

**Prerequisites**

- Chrome **preview** (or build) with WebMCP enabled and `document.modelContext` available
- CDP endpoint, e.g. `http://127.0.0.1:9222`
- Demo served over HTTP:  
  `cd examples/mcp-api-adapter/pixeldrop && python3 -m http.server 8765`

**Option A — ClawQL source registration (full stack)**

```bash
clawql sources add http://127.0.0.1:8765/pixeldrop-broken-demo.html \
  --kind webmcp --name pixeldrop --webmcp-cdp-url http://127.0.0.1:9222
```

**Option B — CDP smoke script**

```bash
node examples/mcp-api-adapter/pixeldrop/webmcp-cdp-smoke.mjs \
  --page-url http://127.0.0.1:8765/pixeldrop-broken-demo.html \
  --cdp-url http://127.0.0.1:9222
```

**Pass criteria:** `upload_photo` discovered + execute returns `{ uploadId, timestamp }`.

---

## Demo-ready status

| Milestone | Status |
| --- | --- |
| Merge to `main` as example artifact | **Done** (PR #997) |
| **"Fixed iPhone HEIC" headline** | **Done** — Priority 1 passed on real iPhone Safari |
| Flagship demo (full WebMCP bolt-on story) | **Blocked** on Priority 2 only |
