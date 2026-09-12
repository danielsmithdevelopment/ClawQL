# Apps

User-facing apps.

| Path | Role |
| ---- | ---- |
| [`dashboard/`](dashboard/) | Next.js operator UI (Agent Chat, provider secrets, custom sources). Helm image `ghcr.io/.../clawql-dashboard`. |
| [`desktop/`](desktop/) | Electron shell around the dashboard (ClawQL.app / `.dmg`). |
| [`www/`](www/) | clawql.com marketing (static export → GitHub Pages / Cloudflare Pages). |
| [`docs/`](docs/) | docs.clawql.com (Next + OpenNext Worker `clawql-docs`). Markdown sources stay in repo [`docs/`](../docs/). |

```bash
cd apps/dashboard && npm install && npm run dev   # http://localhost:3040
make desktop-dev                                 # Electron + dashboard + OpenClaw bridge
cd apps/www && npm install && npm run dev         # http://localhost:3000
cd apps/docs && npm install && npm run dev        # http://localhost:3000 (docs site)
```

Helm still uses the key `dashboard.*`; the folder name is the app, not the chart values schema.
