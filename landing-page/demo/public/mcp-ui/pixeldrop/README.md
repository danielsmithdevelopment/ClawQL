# PixelDrop — Smart Upload Demo

Side-by-side demo of a **deliberately broken** photo upload UI vs a **/mcp-ui smart-upload template** that fixes it client-side, then calls the **same backend** via WebMCP.

Inspired by the OpenRouter/HEIC upload failure class (Wes Bos tweet, Aug 2026). **HEIC + resize verified on real iPhone** (Safari and iOS Chrome, 2026-08-28). See [`VERIFICATION.md`](VERIFICATION.md).

## What is verified vs unproven

| Claim | Status |
| --- | --- |
| HEIC from iPhone camera roll (Safari + iOS Chrome) | **Verified** — `IMG_6432.HEIC` → `up_7vjocs3`, native decode, no polyfill |
| Large image resize/compress (desktop + iPhone) | **Verified** — 18MB PNG; 3.7MB JPEG on iPhone |
| Same backend path as broken frontend (`up_…` IDs) | **Verified** |
| WebMCP discovery → execute (bolt-on path) | **Open** — Priority 2; desktop Chrome preview only |

**Safe public lead:** "We fixed the iPhone HEIC upload problem — tested on Safari and iOS Chrome with real camera-roll files, client-side conversion, same backend."

**Do not claim yet:** "WebMCP bolt-on works end-to-end" until Priority 2 passes.

## Files

| File | Role |
| --- | --- |
| `pixeldrop-broken-demo.html` | Fictional "PixelDrop" gallery with intentional frontend bugs + WebMCP `upload_photo` tool |
| `file-upload-smart.htmx.html` | `/mcp-ui` HTMX template fragment (`{{toolName}}` placeholder) — convert/resize/drag before submit |
| `smart-upload-test-harness.html` | Left/right comparison harness (broken iframe vs injected smart template) |

## Run locally

**Must be served over HTTP** — `file://` blocks `fetch()` and iframe same-origin access.

```bash
cd examples/mcp-api-adapter/pixeldrop
python3 -m http.server 8765
```

Open: [http://127.0.0.1:8765/smart-upload-test-harness.html](http://127.0.0.1:8765/smart-upload-test-harness.html)

**Published copy:** [https://clawql.com/mcp-ui/pixeldrop/smart-upload-test-harness.html](https://clawql.com/mcp-ui/pixeldrop/smart-upload-test-harness.html) (after landing-page deploy)

## What to try

1. **Large JPEG/PNG (>2MB)** — left rejects size; right resizes/compresses under 2MB. **(Verified on desktop.)**
2. **Drag-and-drop (desktop)** — left ignores drops; right handles drop on the smart-upload pane.
3. **HEIC from iPhone** — left rejects with "Unsupported binary file"; right converts to JPEG and uploads. **Verified on Safari and iOS Chrome (2026-08-28).**

Both sides should show the **same upload ID format** (`up_…`) and timestamp when the smart side succeeds — proof it's the identical `uploadToBackend()` call path.

## Architecture

```
User file
    │
    ▼
┌─────────────────────────────────────┐
│  /mcp-ui smart-upload template      │  ← deliberate small JS exception
│  (HEIC→JPEG, resize, drag handling) │
└─────────────────────────────────────┘
    │ clean base64 file
    ▼
┌─────────────────────────────────────┐
│  WebMCP upload_photo tool         │  ← site's declared capability
│  (PixelDrop uploadToBackend)      │
└─────────────────────────────────────┘
```

The harness **bypasses WebMCP discovery** and calls `uploadToBackend()` in the iframe directly — isolating conversion/resize logic from WebMCP browser support. Production flow: `clawql sources add <url> --kind webmcp` → `/mcp-ui` catalog → HTMX execute → WebMCP tool.

## Mobile — honest caveats

| Fix | Desktop | Mobile |
| --- | --- | --- |
| Resize / canvas / JPEG encode | **Verified** (desktop + iPhone Safari) | **Verified** — 3.7MB JPEG + HEIC on clawql.com |
| Drag-and-drop anywhere | Works in template scope | **N/A** — no drag gesture; use file picker |
| HEIC conversion (`createImageBitmap`) | Untested on desktop Chrome | **Verified** — Safari + iOS Chrome, same device, `IMG_6432.HEIC` (2026-08-28) |

**iPhone HEIC claim is verified on both mobile browsers.** WebMCP CDP (Priority 2) is the only open item — see [`VERIFICATION.md`](VERIFICATION.md).

## Before flagship demo (Act 2/3)

1. ~~**iPhone Safari + camera-roll HEIC**~~ — **Done** (Safari + iOS Chrome, 2026-08-28)
2. **WebMCP CDP smoke** — `node webmcp-cdp-smoke.mjs` with Chrome preview
3. **Optional:** ~30s iPhone screen recording of HEIC rejection-then-fix for public demo clip (recommended in VERIFICATION.md)

## Deliberate JS exception

Same category as the flamegraph charting decision: `/mcp-ui` is server-rendered HTMX, but file uploads legitimately need client-side conversion **before** `hx-post` fires. One narrow, documented exception — no build step, no framework.

## Next steps (not in this folder)

- Wire `file-upload-smart.htmx.html` into `resolveMcpUiTemplate()` for upload/photo/image tools
- Publish static harness to `landing-page/demo/public/` for shareable clawql.com URL
- Complete [`VERIFICATION.md`](VERIFICATION.md) Priority 1 (iPhone HEIC) and Priority 2 (WebMCP CDP)
