#!/usr/bin/env bash
# One-shot: create GitHub epic + per-package issues for docs/vision/clawql-modularization.md
# Idempotency: running twice will create a second epic with the same title — run once per program.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

gh label create "modularization-epic" --color "5319E7" --description "Hub issue for modularization package delivery epic" 2>/dev/null || true
gh label create "modularization-platform" --color "0E8A16" --description "Platform/horizontal package — epic closes when all platform issues are closed" 2>/dev/null || true
gh label create "modularization-vertical" --color "B60205" --description "Industry vertical — tracked separately; does not block epic closure" 2>/dev/null || true
gh label create "modularization-shipped" --color "1D76DB" --description "Already shipped; track alignment + publish/versioning with modularization plan" 2>/dev/null || true

EPIC_BODY=$(cat <<'EOF'
## Scope

Tracks **creation, modularization alignment, and npm publishing** for every package named in [ClawQL Modularization](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/vision/clawql-modularization.md) (§2 — package ecosystem).

## Definition of done (close this epic)

**Close this epic when every issue with label `modularization-platform` is closed** (platform / horizontal packages + shipped-package alignment tasks).

**Do not wait on `modularization-vertical` issues.** Vertical packages depend on domain expertise and longer validation cycles; they stay open on their own timelines and may spin follow-up epics per vertical.

## Labels

| Label | Meaning |
| ----- | ------- |
| `modularization-epic` | This hub issue only |
| `modularization-platform` | Counts toward epic closure |
| `modularization-vertical` | Tracked here; does **not** block epic |
| `modularization-shipped` | Shipped today; issue tracks modularization contract + release alignment |

## Reference

- Vision: [`docs/vision/clawql-modularization.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/vision/clawql-modularization.md)
- k3s security stack (production context): [`docs/security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md)
EOF
)

# gh issue create prints the issue URL (no --json on older gh)
EPIC_URL=$(gh issue create \
  --title "Epic: ClawQL Modularization — package creation & publish" \
  --body "$EPIC_BODY" \
  --label "modularization-epic")
EPIC=$(echo "$EPIC_URL" | grep -oE '[0-9]+$' | tail -1)

echo "Created epic #$EPIC ($EPIC_URL)"

PLATFORM_ISSUES=()

platform_body() {
  local epic="$1"
  local pkg="$2"
  cat <<EOF
Part of epic #${epic}.

**Package:** \`${pkg}\`  
**Track:** platform — **must be closed to close the epic.**

## Goal

Deliver this package per [ClawQL Modularization §2](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/vision/clawql-modularization.md) (layout, responsibilities, dependency rules).

## Acceptance checklist

- [ ] Lives under the planned monorepo layout (\`packages/\` or \`internal/\` as appropriate).
- [ ] Exports / public API matches the modularization doc for this package.
- [ ] Versioning follows §9 (notably: \`clawql-core\` major bumps propagate; verticals version independently — this item is platform).
- [ ] Published to **npm** where the plan calls for a publishable package, **or** documented as **monorepo-internal only** for \`@clawql/*\` if not published standalone.
- [ ] Linked from docs (ecosystem / modularization / README) as appropriate.
EOF
}

vertical_body() {
  local epic="$1"
  local pkg="$2"
  cat <<EOF
Part of epic #${epic}.

**Package:** \`${pkg}\`  
**Track:** vertical — **does not block epic closure** (industry-specific workstreams).

## Goal

Implement the vertical plugin / tools described in [ClawQL Modularization §2 / §4](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/vision/clawql-modularization.md), behind \`CLAWQL_ENABLE_*\` style gates.

## Notes

Coordinate domain SMEs (compliance, data agreements, sample corpora). Consider a child epic per vertical when execution starts.

## Acceptance checklist (high level)

- [ ] \`Plugin\` surface from \`clawql-core\` with domain MCP tools.
- [ ] Document + memory integration paths per doc.
- [ ] Published / versioned per §9 vertical policy when ready — **not required** to close the parent modularization epic.
EOF
}

shipped_body() {
  local epic="$1"
  local pkg="$2"
  cat <<EOF
Part of epic #${epic}.

**Package:** \`${pkg}\`  
**Track:** platform + **shipped** — align modularization contracts and release policy; **must be closed to close the epic** once acceptance is defined for this repo.

## Goal

Keep shipped artifacts consistent with the modularization plan (types, boundaries, publish cadence).

## Acceptance checklist

- [ ] Semver / type sync rules in §9 reflected in CI or docs.
- [ ] Release / publish path documented for this package.
- [ ] Cross-links from modularization or ecosystem docs where helpful.
EOF
}

create_platform() {
  local pkg="$1"
  local title="Package: ${pkg} — create, align, publish (modularization)"
  case "$pkg" in @clawql/*) title="Package: ${pkg} — internal monorepo module (modularization)" ;; esac
  local url n
  url=$(gh issue create --title "$title" \
    --body "$(platform_body "$EPIC" "$pkg")" \
    --label "modularization-platform")
  n=$(echo "$url" | grep -oE '[0-9]+$' | tail -1)
  PLATFORM_ISSUES+=("$n")
}

create_shipped() {
  local pkg="$1"
  local url n
  url=$(gh issue create --title "Package: ${pkg} — shipped; modularization alignment & publish" \
    --body "$(shipped_body "$EPIC" "$pkg")" \
    --label "modularization-platform" \
    --label "modularization-shipped")
  n=$(echo "$url" | grep -oE '[0-9]+$' | tail -1)
  PLATFORM_ISSUES+=("$n")
}

for pkg in clawql-core clawql-api clawql-auth clawql-documents clawql-memory clawql-pageindex clawql-telemetry clawql-sandbox clawql-automation; do
  create_platform "$pkg"
done

for pkg in '@clawql/merkle' '@clawql/cuckoo' '@clawql/utils'; do
  create_platform "$pkg"
done

for pkg in clawql-mcp clawql-ouroboros mcp-grpc-transport; do
  create_shipped "$pkg"
done

for pkg in clawql-lending clawql-blockchain clawql-legal clawql-healthcare clawql-insurance clawql-supplychain clawql-government clawql-manufacturing clawql-education clawql-engineering; do
  gh issue create --title "Package: ${pkg} — vertical (modularization; post-epic)" \
    --body "$(vertical_body "$EPIC" "$pkg")" \
    --label "modularization-vertical" >/dev/null
done

LIST=""
for n in $(printf '%s\n' "${PLATFORM_ISSUES[@]}" | sort -n); do
  LIST="${LIST}- #${n}"$'\n'
done

gh issue comment "$EPIC" --body "$(cat <<EOF
### Child issues (platform — required to close epic)

$LIST

### Vertical issues

Open issues with \`label:modularization-vertical\` for industry packages. They are **not** part of the epic closure gate.

_Filter: \`label:modularization-vertical\`_
EOF
)"

echo "Epic: https://github.com/danielsmithdevelopment/ClawQL/issues/$EPIC"
echo "Platform issue count: ${#PLATFORM_ISSUES[@]}"
