# Apps

User-facing apps.

| Path | Role |
| ---- | ---- |
| [`dashboard/`](dashboard/) | Next.js operator UI (Agent Chat, provider secrets, custom sources). Helm image `ghcr.io/.../clawql-dashboard`. |
| [`desktop/`](desktop/) | Electron shell around the dashboard — **macOS `.dmg`**, **Windows NSIS**, **Linux AppImage/deb**. |
| [`mobile/`](mobile/) | Expo **iOS + Android** approval app (Home / Review / Profile, NFC key, EAS / Maestro). |
| [`www/`](www/) | clawql.com marketing (static export → GitHub Pages / Cloudflare Pages). |
| [`docs/`](docs/) | docs.clawql.com (Next + OpenNext Worker `clawql-docs`). Markdown sources stay in repo [`docs/`](../docs/). |

```bash
cd apps/dashboard && npm install && npm run dev   # http://localhost:3040
make desktop-dev                                 # Electron + dashboard + OpenClaw bridge
make desktop-dist-linux                          # or desktop-dist-mac / desktop-dist-win
cd apps/mobile && npm install && npm start        # Expo fixture mode — no store signup
cd apps/mobile && npm run local:ready             # confirm local path (no Apple/Google)
cd apps/mobile && npm run store:check             # optional: packaging preflight (when ready)
cd apps/www && npm install && npm run dev         # http://localhost:3000
cd apps/docs && npm install && npm run dev        # http://localhost:3000 (docs site)
```

Helm still uses the key `dashboard.*`; the folder name is the app, not the chart values schema.
