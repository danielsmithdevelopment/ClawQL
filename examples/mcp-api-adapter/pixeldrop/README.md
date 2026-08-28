# PixelDrop — Smart Upload Demo

Side-by-side demo of a **deliberately broken** photo upload UI vs a **/mcp-ui smart-upload template** that fixes it client-side, then calls the **same backend** via WebMCP.

Inspired by the OpenRouter/HEIC upload failure class (Wes Bos tweet, Aug 2026): reject exotic formats, no resize, no drag handling — all fixable in the browser before the upload request fires.

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

1. **HEIC from iPhone** — left rejects with "Unsupported binary file"; right converts to JPEG and uploads (if browser decodes HEIC).
2. **Large JPEG/PNG (>2MB)** — left rejects size; right resizes/compresses under 2MB.
3. **Drag-and-drop (desktop)** — left ignores drops; right handles drop on the smart-upload pane.

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
| Drag-and-drop anywhere | Works | **N/A** — no drag gesture; use file picker |
| HEIC conversion (`createImageBitmap`) | Browser-dependent | **Test on real iPhone Safari** before claiming |
| Resize / canvas / JPEG encode | Works | Should work (standard Web APIs) |

Do not demo "we fixed iPhone HEIC" until tested with a real HEIC from the camera roll on actual iOS Safari.

## Deliberate JS exception

Same category as the flamegraph charting decision: `/mcp-ui` is server-rendered HTMX, but file uploads legitimately need client-side conversion **before** `hx-post` fires. One narrow, documented exception — no build step, no framework.

## Next steps (not in this folder)

- Wire `file-upload-smart.htmx.html` into `resolveMcpUiTemplate()` for upload/photo/image tools
- Publish static harness to `landing-page/demo/public/` for shareable clawql.com URL
- Real WebMCP CDP test against Chrome preview with `document.modelContext`
