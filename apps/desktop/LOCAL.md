# Local development — **no code-signing / store accounts**

Desktop runs fully on your machine. Apple Developer, Windows Authenticode, and Linux package signing are only for *publishing* downloads.

## Dev (recommended)

```bash
# from repo root (dashboard deps once)
cd apps/dashboard && npm install
cd ../desktop && npm install
npm run dev
```

Or: `make desktop-dev`

This starts the OpenClaw bridge, dashboard (`CLAWQL_DESKTOP_MODE=1` on `:3040`), and an Electron window. No certificates.

## PhoneApprove / managed Review (local fixture)

```bash
npm run dev:managed
# equivalent: CLAWQL_DESKTOP_MANAGED_FIXTURE=1 npm run dev
```

Sets `CLAWQL_CONSOLE_SURFACE=managed` so `/review` serves the Acme fixture queue (same surface as mobile). Deep links:

- `clawql://review/:id`
- `https://cloud.clawql.com/app/review/:id`

Cold-start argv and second-instance / macOS `open-url` navigate to `http://127.0.0.1:3040/review?requestId=…`.

## What works without signing

| Surface | Local without signup |
| ------- | -------------------- |
| Agent chat + local vault | ✅ |
| Managed Review fixture (`dev:managed`) | ✅ |
| `clawql://` deep-link parse + focus | ✅ |
| Unit tests / `local:ready` | ✅ `npm test` · `npm run local:ready` |
| Unsigned Linux AppImage/deb | ✅ `npm run dist:linux` |

## Tests

```bash
npm test
npm run local:ready
```

## Optional unsigned packages (still no store signup)

```bash
npm run dist:linux    # AppImage + deb (works on Linux CI/dev hosts)
# macOS host: npm run dist:mac
# Windows host: npm run dist:win
```

Signing/notarization is a later release step — see [README.md](README.md) and [docs/design/clawql-desktop.md](../../docs/design/clawql-desktop.md).
