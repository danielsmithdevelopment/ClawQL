# Release checklist — workspace packages first publish (`0.1.0`)

**Goal:** Ensure every **unpublished** ClawQL workspace package is at **`0.1.0`** in-tree and ready for npm when the publish workflow runs.

**Policy:** [`clawql-workspace-package-versioning.md`](./clawql-workspace-package-versioning.md)  
**Targets file:** [`scripts/release/package-npm-version-targets.json`](../../scripts/release/package-npm-version-targets.json)

---

## Pre-merge verification

### 1. Apply canonical versions

```bash
node scripts/release/apply-package-npm-versions.mjs
npm install
```

### 2. Version spot-check

```bash
# Gateway stays 8.0.0
node -p "require('./package.json').version"

# Workspace libs at 0.1.0 (ouroboros 0.1.1, mcp-grpc-transport 1.0.0)
for d in packages/*/package.json; do
  node -pe "const p=require('./$d'); p.name+': '+p.version"
done | sort

# No stale 8.0.0 pins in packages/
rg '"8\\.0\\.0"' packages/ package.json || echo "OK: no 8.0.0 workspace pins"
```

### 3. npm registry audit (expect 404 for first-publish set)

```bash
while read -r pkg ver; do
  [[ "$pkg" =~ ^# ]] && continue
  [[ -z "$pkg" ]] && continue
  npm_ver=$(npm view "$pkg" version 2>/dev/null || echo NOT_PUBLISHED)
  printf "%-24s target=%-8s npm=%s\n" "$pkg" "$ver" "$npm_ver"
done <<'EOF'
clawql-api 0.1.0
clawql-core 0.1.0
clawql-audit 0.1.0
clawql-merkle 0.1.0
clawql-observability 0.1.0
clawql-analytics 0.1.0
mcp-api-adapter 0.1.0
clawql-ouroboros 0.1.1
mcp-grpc-transport 1.0.0
clawql-mcp 8.0.0
EOF
```

### 4. Build and test

```bash
npm run build
npm test
npm run test:npm-pack-audit-wedge   # if audit wedge pack path is in scope
```

### 5. CI smokes (on PR)

- MCP Docker workspace deps smoke
- npm pack install smoke
- clawql-audit standalone deps
- LGTM+ compose smoke (observability)

---

## Exceptions (do not reset to `0.1.0`)

| Package              | In-tree | Reason                                               |
| -------------------- | ------- | ---------------------------------------------------- |
| `clawql-mcp`         | 8.0.0   | Gateway major line                                   |
| `clawql-ouroboros`   | 0.1.1   | Already on npm at 0.1.1                              |
| `mcp-grpc-transport` | 1.0.0   | Already on npm at 0.2.0; next publish is major 1.0.0 |

---

## Publish with `clawql-mcp@8.0.0` tag

When cutting **`v8.0.0`**, the npm publish workflow walks [`npm-publish-order.json`](../../scripts/release/npm-publish-order.json). Each `clawql-*` row publishes at its **`package.json` version** (mostly **`0.1.0`**).

Confirm after publish:

```bash
npm view clawql-api version          # → 0.1.0 (first time)
npm view clawql-mcp version          # → 8.0.0
npm view clawql-ouroboros version    # → 0.1.1 (unchanged until bumped)
npm view mcp-grpc-transport version  # → 1.0.0 (when grpc major ships)
```

---

## Open PR coordination

Rebase branches that touch `package.json` / lockfile onto main after this lands, then:

```bash
node scripts/release/apply-package-npm-versions.mjs && npm install
```

Watch for agent/observability/analytics PRs that add new workspace packages — add them to `package-npm-version-targets.json` at **`0.1.0`** if unpublished.

---

## Rollback

- Do not republish `0.1.0` if a bad tarball ships; cut **`0.1.1`** per package.
- Gateway rollback: pin `clawql-mcp@7.2.0` (still on npm).
