# Standalone public repo extract

**Required for submission.** When a human creates the public `artifacts-attempts` GitHub repo (agents cannot create it), copy this tree as the root:

```bash
# from ClawQL monorepo
rsync -a --exclude node_modules --exclude .local --exclude dist \
  artifacts-attempts/ /tmp/artifacts-attempts-public/
cd /tmp/artifacts-attempts-public
git init
git add .
git commit -m "Initial Apache-2.0 artifacts-attempts competition entry"
# add remote + push to the new public repo
```

## Must stay true after extract

- Root `package.json` workspaces + `package-lock.json`
- `LICENSE` Apache-2.0
- Docs: `README.md`, `docs/JUDGE_RUNBOOK.md`, `docs/ARCHITECTURE.md`, `docs/VIDEO_SCRIPT.md`, `docs/SUBMISSION.md`, `docs/STATUS.md`
- CI: either keep a slim workflow (copy of `.github/workflows/artifacts-attempts.yml` with paths adjusted to `/`) or document `npm ci && npm run build && npm test && npm run demo:judge-smoke`

## Do not copy

- Monorepo-only secrets / ClawQL private packages
- `.local/` demo runs
- `dist/` build outputs (rebuild with `npm run build`)

## Live Cloudflare (Oct 12 priority after public push)

Copy `.env.example`, set Workers Paid + Artifacts + Turbo secrets, then `LIVE_PROBE=1 npm run demo:live-check`. Until live forks work, film the local-witness path with honest labels. Optional unlock beat: [`X402_UNLOCK.md`](./X402_UNLOCK.md).
