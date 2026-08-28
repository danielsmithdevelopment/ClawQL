# PixelDrop — Smart Upload Demo

Side-by-side demo of a **deliberately broken** photo upload UI vs a **/mcp-ui smart-upload template** that fixes it client-side, then calls the **same backend** via WebMCP.

Inspired by the OpenRouter/HEIC upload failure class (Wes Bos tweet, Aug 2026). The demo concept targets HEIC + resize + drag — but **only resize is verified today**. See [`VERIFICATION.md`](VERIFICATION.md) for the full proven/unproven matrix.

## What is verified vs unproven

| Claim | Status |
| --- | --- |
| Large image resize/compress before upload (desktop) | **Verified** — 18MB PNG 8000×6000 → 2048×1536, uploaded via same `uploadToBackend()` |
| Same backend path as broken frontend (`up_…` IDs) | **Verified** |
| HEIC from iPhone camera roll in Safari | **Unproven** — `createImageBitmap` never tested on real device |
| WebMCP discovery → execute (bolt-on path) | **Unproven** — harness bypasses WebMCP; use `webmcp-cdp-smoke.mjs` when Chrome preview available |

**Safe public lead:** resize/compression wrapper calling the site's own backend without code changes.

**Do not claim yet:** "We fixed the iPhone HEIC problem" or "WebMCP bolt-on works end-to-end."

**Interim HEIC framing:** "Expected to work on Safari where HEIC decodes natively — pending device verification."

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

## What to try

1. **Large JPEG/PNG (>2MB)** — left rejects size; right resizes/compresses under 2MB. **(Verified on desktop.)**
2. **Drag-and-drop (desktop)** — left ignores drops; right handles drop on the smart-upload pane.
3. **HEIC from iPhone** — left rejects with "Unsupported binary file"; right *may* convert to JPEG and upload **if** the browser decodes HEIC. **Not verified — see [`VERIFICATION.md`](VERIFICATION.md) Priority 1.**

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
| Resize / canvas / JPEG encode | **Verified** (18MB PNG test) | Expected to work (standard Web APIs) |
| Drag-and-drop anywhere | Works in template scope | **N/A** — no drag gesture; use file picker |
| HEIC conversion (`createImageBitmap`) | Untested even on desktop | **Unproven** — tweet's core pain point; needs real iPhone Safari test |

Do not use "we fixed iPhone HEIC" in public framing until [`VERIFICATION.md`](VERIFICATION.md) Priority 1 passes.

## Before flagship demo (Act 2/3)

1. **iPhone Safari + camera-roll HEIC** (~5 min, any iPhone) — determines whether the tweet's pain point is actually solved
2. **WebMCP CDP smoke** — `node webmcp-cdp-smoke.mjs` with Chrome preview; exercises discovery → execute, not the harness bypass

Neither blocks merging this folder as an example artifact on `main`.

## Deliberate JS exception

Same category as the flamegraph charting decision: `/mcp-ui` is server-rendered HTMX, but file uploads legitimately need client-side conversion **before** `hx-post` fires. One narrow, documented exception — no build step, no framework.

## Next steps (not in this folder)

- Wire `file-upload-smart.htmx.html` into `resolveMcpUiTemplate()` for upload/photo/image tools
- Publish static harness to `landing-page/demo/public/` for shareable clawql.com URL
- Complete [`VERIFICATION.md`](VERIFICATION.md) Priority 1 (iPhone HEIC) and Priority 2 (WebMCP CDP)
