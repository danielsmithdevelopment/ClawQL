# Release checklist — clawql-observability@0.1.0

**Goal:** First public npm publish of **`clawql-observability`** at **`0.1.0`**.

**Context:** The package was developed in-tree through Phase 5 but **never published**. Prior workspace versions (`0.2.0` in draft release notes, `0.7.0` in `package.json`) were internal labels — see [`clawql-observability-versioning.md`](./clawql-observability-versioning.md).

---

## Pre-publish verification

### 1. Version alignment

```bash
node -p "require('./packages/clawql-observability/package.json').version"
# → 0.1.0

node -p "require('./package.json').dependencies['clawql-observability']"
# → 0.1.0

npm view clawql-observability version 2>&1 || true
# → 404 (expected until first publish)
```

### 2. Build and test

```bash
npm run build -w clawql-observability
npm run test -w clawql-observability
npm run smoke:compose -w clawql-observability   # optional local LGTM+ smoke
```

### 3. Root integration (host wiring)

```bash
npm run build
npm test -- src/compose-horizontal-plugin-layers.test.ts
# Observability flag + dynamic layer tests
```

### 4. CI smokes (on merge PR)

- **LGTM+ stack smoke** — compose + OTLP read-back
- **MCP Docker workspace deps smoke** — full monorepo Docker build
- **npm pack install smoke** — packed tarball installs cleanly

### 5. Documentation

- [ ] `packages/clawql-observability/CHANGELOG.md` — **0.1.0** entry complete
- [ ] `packages/clawql-observability/README.md` — versioning section points to policy doc
- [ ] `RELEASE_NOTES_v8.0.0.md` — observability row says **0.1.0**
- [ ] `docs/release/clawql-observability-versioning.md` — policy current
- [ ] Website `/observability` — no stale `0.7.0` / `0.2.0` package version claims (feature docs OK)

---

## Publish options

### A. With `clawql-mcp@8.0.0` monorepo tag (preferred when gateway ships)

Follow [`v8.0.0-checklist.md`](./v8.0.0-checklist.md). The npm publish workflow walks [`scripts/release/npm-publish-order.json`](../../scripts/release/npm-publish-order.json); **`clawql-observability`** publishes before **`clawql-mcp`**.

```bash
git checkout main && git pull origin main
node -p "require('./packages/clawql-observability/package.json').version"  # 0.1.0
bash scripts/release/git-release-tag.sh --push   # when cutting v8.0.0
gh run list --workflow "npm publish" --limit 5
```

### B. Standalone observability publish (if gateway tag delayed)

Only if your org’s npm OIDC workflow supports publishing a subset. Confirm with maintainers — the repo’s default path is the ordered full publish on `v*` tags.

```bash
# Illustrative — actual command depends on workflow_dispatch / wedge scripts:
# Publish clawql-api, clawql-audit, clawql-core, then clawql-observability per npm-publish-order.json
```

---

## Post-publish verification

```bash
npm view clawql-observability version
# → 0.1.0

npm pack clawql-observability@0.1.0 --dry-run
# Confirm files: dist/, alloy/, alerts/, dashboards/, docker/, helm/, worker/, README.md

# Smoke install in empty dir
mkdir /tmp/obs-test && cd /tmp/obs-test
npm init -y
npm install clawql-observability@0.1.0 clawql-api@0.1.0 clawql-core@0.1.0 clawql-audit@0.1.0
node -e "import('clawql-observability').then(m => console.log(Object.keys(m).slice(0,5)))"
```

Announce:

- Package changelog: [`packages/clawql-observability/CHANGELOG.md`](../../packages/clawql-observability/CHANGELOG.md)
- Public docs: [docs.clawql.com/observability](https://docs.clawql.com/observability)
- v8.0 release notes observability bullet (if shipping with gateway)

---

## Rollback

- npm does not unpublish lightly; ship **`0.1.1`** for fixes.
- Document pin: `"clawql-observability": "0.1.0"` in consumer `package.json`.

---

## Out of scope for 0.1.0

- N-of-M exporter quorum in TypeScript (deferred; Alloy-scoped if ever added)
- Separate npm tag name — uses package version **`0.1.0`**, not `v0.1.0` git tag by itself (unless maintainers add a dedicated tag policy)
