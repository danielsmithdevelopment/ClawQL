# PixelDrop demo — verification status

Use this file to decide **what you can claim publicly** vs what still needs a real test.

## Verified (desktop, this thread)

| Claim | Evidence | Date |
| --- | --- | --- |
| Broken demo rejects files >2MB | 18MB PNG → left pane error: "File too large (17.9MB)…" | 2026-08-28 |
| Smart template resizes oversized images | 8000×6000 → 2048×1536 conversion note | 2026-08-28 |
| Smart template compresses under 2MB backend limit | Processed output enabled submit + upload | 2026-08-28 |
| Same backend path as broken frontend | Upload ID `up_4yuzrboy` via `uploadToBackend()` in iframe | 2026-08-28 |
| Harness loads; template injects correctly | `smoke-test.mjs` + browser inspection | 2026-08-28 |

**Safe public lead:** "We wrapped a broken upload with a /mcp-ui template that resizes and compresses large images client-side, then calls the site's own backend capability — without changing their code."

## Unverified — do not imply these are proven

| Claim | Why unproven | Blocks flagship demo? |
| --- | --- | --- |
| **HEIC from iPhone camera roll decodes in Safari** | `createImageBitmap` on real `.heic` never tested on physical iPhone | **Yes** — this is the tweet's exact pain point |
| **WebMCP discovery → execute path** | Harness bypasses WebMCP; calls `uploadToBackend()` directly | **Yes** — bolt-on pitch depends on this mechanism |
| Drag-and-drop on mobile | N/A by platform (no drag gesture) | No — desktop-only feature |
| HEIC on desktop Chrome | Browser-dependent; no real HEIC file tested here | Partial — secondary to iPhone story |

**Unsafe framing:** "We fixed the iPhone HEIC problem" or "WebMCP bolt-on works end-to-end" until the two tests below pass.

**Acceptable interim framing:** "Resize/compression verified on desktop; HEIC expected to work on Safari where `createImageBitmap` decodes HEIC — **pending device verification**."

---

## Priority 1: iPhone Safari HEIC test (~5 minutes)

**Goal:** Confirm `createImageBitmap` decodes a real camera-roll HEIC and the smart template uploads successfully.

**Prerequisites**

- iPhone with at least one HEIC photo in Photos (default on modern iPhones)
- Mac or LAN access to serve the demo (or deploy to HTTPS host)
- Same Wi‑Fi if using local IP (Safari requires secure context for some APIs; `http://127.0.0.1` works on-device only when served on the phone itself — use `python3 -m http.server 8765 --bind 0.0.0.0` and open `http://<your-lan-ip>:8765/smart-upload-test-harness.html`, or use ngrok/cloudflare tunnel for HTTPS)

**Steps**

1. Serve the demo folder over HTTP(S) reachable from the iPhone.
2. Open `smart-upload-test-harness.html` in **Safari** on the iPhone.
3. On the **left (broken)** pane: select a camera-roll HEIC.  
   **Expected:** "Unsupported binary file" (or similar) — confirms the bug reproduces.
4. On the **right (smart-upload)** pane: select the **same** HEIC via "Or click to choose a file".  
   **Expected (pass):** preview appears, conversion note mentions JPEG, Upload enables, success with `up_…` ID.  
   **Expected (fail):** "Could not read … as an image" — HEIC decode not available; need polyfill (e.g. heic2any).
5. Record: iOS version, Safari version, filename, conversion note text, upload ID or error message.
6. Update the **Verified** table in this file with results.

**Pass criteria:** Right pane uploads a real camera-roll HEIC that left pane rejects.

---

## Priority 2: WebMCP CDP test (Chrome preview)

**Goal:** Exercise the real discovery → execute path that production `clawql sources add --kind webmcp` uses — not the harness iframe bypass.

**Prerequisites**

- Chrome **preview** (or build) with WebMCP enabled and `document.modelContext` available
- CDP endpoint, e.g. `http://127.0.0.1:9222`  
  Launch example:  
  `google-chrome --remote-debugging-port=9222 --enable-features=...` (see current WebMCP preview docs)
- Demo served over HTTP:  
  `cd examples/mcp-api-adapter/pixeldrop && python3 -m http.server 8765`

**Option A — ClawQL source registration (full stack)**

```bash
# Terminal 1: serve PixelDrop
cd examples/mcp-api-adapter/pixeldrop && python3 -m http.server 8765

# Terminal 2: register WebMCP source (from repo root, ClawQL built)
clawql sources add http://127.0.0.1:8765/pixeldrop-broken-demo.html \
  --kind webmcp --name pixeldrop --webmcp-cdp-url http://127.0.0.1:9222

# Discover and execute upload_photo via ClawQL search/execute or /mcp-ui catalog
```

**Option B — CDP smoke script (this folder)**

```bash
node examples/mcp-api-adapter/pixeldrop/webmcp-cdp-smoke.mjs \
  --page-url http://127.0.0.1:8765/pixeldrop-broken-demo.html \
  --cdp-url http://127.0.0.1:9222
```

**Pass criteria**

1. `upload_photo` discovered via `document.modelContext.getTools()`
2. Execute with a small base64 JPEG returns `{ uploadId, timestamp }`
3. Gallery on the page updates (same as broken frontend success path)

**On failure:** Script prints CDP/WebMCP availability errors; do not claim bolt-on works until green.

---

## Merge vs demo-ready

| Milestone | Requirement |
| --- | --- |
| **Merge to `main` as example artifact** | Desktop resize test + harness — **done** (PR #997) |
| **Flagship "we fixed your upload" demo (Act 2/3)** | Priority 1 **and** Priority 2 above |
| **"Fixed iPhone HEIC" headline** | Priority 1 pass only |
