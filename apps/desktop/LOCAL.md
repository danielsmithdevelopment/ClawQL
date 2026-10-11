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

## Tests

```bash
npm test
```

## Optional unsigned packages (still no store signup)

On this machine you can produce **unsigned** installers for smoke-testing:

```bash
npm run dist:linux    # AppImage + deb (works on Linux CI/dev hosts)
# macOS host: npm run dist:mac
# Windows host: npm run dist:win
```

Signing/notarization is a later release step — see [README.md](README.md) and [docs/design/clawql-desktop.md](../../docs/design/clawql-desktop.md).
