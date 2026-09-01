# PixelDrop demo — verification status

Use this file to decide **what you can claim publicly** vs what still needs a real test.

## Mobile claim — current honest state (2026-08-28)

| Environment | HEIC decode | Resize oversized JPEG | Result |
| --- | --- | --- | --- |
| **iPhone Safari** | Native, no polyfill | Verified | `IMG_6432.HEIC` → `up_7vjocs3`; `IMG_6370.jpeg` 3.7MB → `up_p4yvp4nc` |
| **iOS Chrome** | Native, no polyfill | Verified (same session) | Same device, same `IMG_6432.HEIC`, same clean pass as Safari |
| **Desktop** | Not tested with real `.heic` | Verified | 18MB PNG 8000×6000 → resize/compress → `up_4yuzrboy` |
| **WebMCP CDP discovery→execute** | — | — | **Still open** (Priority 2; desktop Chrome preview only) |

**Plain statement:** iOS Chrome using WebKit under the hood was a reasonable inference until tested on the same device with the same camera-roll HEIC. It is now a **tested fact** — same file type, same outcome, no polyfill, both browsers anyone actually uses on iPhone.

The claim **"we fixed the iPhone HEIC problem"** is solid on iPhone Safari and iOS Chrome, with real camera-roll files. No caveats needed on that specific point.

---

## Verified (detail)

| Claim | Evidence | Date |
| --- | --- | --- |
| Broken demo rejects HEIC | `IMG_6432.HEIC` → left: `Unsupported binary file: "image/heic"` | 2026-08-28 |
| Smart template converts HEIC → JPEG (Safari) | Same file → `Converted from image/heic to JPEG · Resized from 2316×3088 to 1536×2048` → `up_7vjocs3` | 2026-08-28 |
| Smart template converts HEIC → JPEG (iOS Chrome) | Same device, same `IMG_6432.HEIC`, same pass (second browser, same session) | 2026-08-28 |
| Broken demo rejects files >2MB | 18MB PNG (desktop); `IMG_6370.jpeg` 3.7MB (iPhone Safari) | 2026-08-28 |
| Smart template resizes oversized images | 8000×6000 → 2048×1536 (desktop); 5712×4284 → 2048×1536 (iPhone) | 2026-08-28 |
| Same backend path as broken frontend | Upload IDs `up_4yuzrboy`, `up_p4yvp4nc`, `up_7vjocs3` via `uploadToBackend()` | 2026-08-28 |

**Safe public lead:** "We wrapped a broken upload with a /mcp-ui template that converts HEIC and resizes oversized photos client-side, then calls the site's own backend — tested on real iPhone Safari and iOS Chrome with camera-roll HEIC, no code changes on their side, no polyfill."

## Still unverified

| Claim | Why unproven | Blocks flagship demo? |
| --- | --- | --- |
| **WebMCP discovery → execute path** | Harness bypasses WebMCP; calls `uploadToBackend()` directly | **Yes** — bolt-on pitch depends on this mechanism |
| Drag-and-drop on mobile | N/A by platform (no drag gesture) | No — desktop-only feature |
| HEIC on desktop Chrome | Not tested with real `.heic` on desktop | No — iPhone story is the primary claim |

**Do not claim yet:** "WebMCP bolt-on works end-to-end" until Priority 2 below passes.

---

## Priority 1: iPhone mobile HEIC + resize — **PASSED**

### Safari (screenshot evidence)

**URL:** https://clawql.com/mcp-ui/pixeldrop/smart-upload-test-harness.html  
**Date:** 2026-08-28

| Pane | File | Outcome |
| --- | --- | --- |
| Left (broken) | `IMG_6432.HEIC` | `Unsupported binary file: "image/heic"` |
| Right (smart-upload) | same HEIC | `Converted from image/heic to JPEG · Resized from 2316×3088 to 1536×2048` → `up_7vjocs3` |

**Also same session (Safari):** `IMG_6370.jpeg` (3.7MB) — left rejects 2MB limit; right resizes 5712×4284 → 2048×1536 → `up_p4yvp4nc`.

### iOS Chrome (same device, same session)

**Date:** 2026-08-28 — immediately after Safari pass, same iPhone, same `IMG_6432.HEIC`.

| Browser | File | Outcome |
| --- | --- | --- |
| iOS Chrome | `IMG_6432.HEIC` | Same clean pass as Safari — native decode, conversion to JPEG, successful upload |

No `heic2any` polyfill required on either iPhone browser.

---

## Demo video — public vs private

| Artifact | Contents | Recommendation |
| --- | --- | --- |
| Desktop recording (`pixeldrop_smart_upload_demo.mp4`) | 18MB PNG resize; left reject / right fix | **Public** — good for resize/compress story on desktop |
| iPhone screenshots (Safari HEIC + JPEG) | Rejection-then-fix moments | **Public** — embed in README / landing page today |
| **iPhone ~30s screen recording (HEIC)** | Live rejection on left, conversion note + upload on right | **Strongly recommend public** — stronger than a table for this visual demo; record on device (Settings → Control Center → Screen Recording), same harness URL, same `IMG_6432.HEIC` flow |

**Decision:** Use the iPhone screen recording as **primary public demo material** for the HEIC story (blog, landing page, social clip). Keep screenshots in `VERIFICATION.md` as dated audit trail. Desktop video remains supplementary for the resize path.

**To add:** Drop `pixeldrop-iphone-heic-demo.mp4` (or similar) under `landing-page/demo/public/mcp-ui/pixeldrop/` and link from README when recorded.

---

## Priority 2: WebMCP CDP / judge-environment test — **OPEN** (API surface fixed; runtime gate pending)

**Goal:** Exercise real discovery → execute on Chrome 149+ (or ChatGPT desktop browser) — not the harness iframe bypass.

### API surface (fixed 2026-08-28, before runtime gate)

| Item | Status |
| --- | --- |
| Register via `document.modelContext ?? navigator.modelContext` | **Fixed** in PixelDrop + landing `WebMcpRegister` |
| `execute` returns `JSON.stringify(...)` (DOMString) | **Fixed** — Chrome Imperative API returns string from `executeTool` |
| CDP `executeTool(tool, jsonString)` | **Fixed** in `webmcp-browser.ts` |
| Runtime verify on Chrome 149+ | **Blocked in cloud VM** — environment has Chrome **148.0.7778.96**; WebMCP flag/OT needs **149+** |

### Console probe (run on your Mac — the actual gate)

1. Chrome **149+** → `chrome://flags/#enable-webmcp-testing` → Enabled → **relaunch**
2. Open https://clawql.com/mcp-ui/pixeldrop/pixeldrop-broken-demo.html (hard-refresh after deploy)
3. Paste contents of `webmcp-console-probe.js` into DevTools console

**Pass:** `documentMC: true`, `tools` includes `upload_photo`, `executeParsed.uploadId` like `up_…`, `galleryGrew: true`, `executeRawType: "string"`.

**Fail modes to fear:** tools empty with no error (dead registration path); execute throws; result is object ChatGPT cannot parse as text.

```bash
# Optional local serve + CDP (still needs Chrome 149+ with flag + CDP port)
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
| **"Fixed iPhone HEIC" headline** | **Done** — Safari + iOS Chrome, real camera-roll HEIC |
| Public demo video (HEIC moment) | **Recommended** — record ~30s iPhone screen capture; not blocking the claim |
| Flagship demo (full WebMCP bolt-on story) | **Blocked** on Priority 2 only |
