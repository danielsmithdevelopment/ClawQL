---
name: clawql-console-webmcp
description: >-
  Make the ClawQL managed console agent-ready with WebMCP: read-only and
  preparation tools only; never expose approve/decline. Use when adding or
  auditing console WebMCP tools, approval-integrity cells, or applying Chrome
  webmcp-skills / webmcp-types guidance inside ClawQL.
---

# ClawQL console WebMCP

Upstream: [GoogleChromeLabs/webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools) `webmcp-skills` (Sarah Drasner / Chrome AI & Web Ecosystem) and [`@mcp-b/webmcp-types`](https://github.com/WebMCP-org/npm-packages/tree/main/packages/webmcp-types).

WebMCP lets sites register structured tools for browser agents. **Hints are not enforcement** (`readOnlyHint`, `consequentialHint`, `untrustedContentHint`). ClawQL’s enforcement for the console is structural: **no approve tool exists**.

## Rules for this repo

1. **Split preview from commit.** List pending requests, show exact changes, search audit, draft a policy, open Review UI. Do **not** register approve / decline / confirm_commit / sign_mandate.
2. **Annotations are opt-in `true` only.** Never write `: false` boilerplate. Reads → `readOnlyHint: true`. UGC / agent-authored text → also `untrustedContentHint: true`. Navigation / initiate hand-off → omit annotations. Never put `consequentialHint` on a tool that is not a real-world commit — and do not expose that commit over WebMCP here.
3. **No `toolautosubmit`** for consequential flows. Final approval stays the Review UI + security key.
4. **Budgets** (Chrome tool-design): name ≤30, description ≤500, output ≤1500 chars.
5. **Catalog + CI:** `apps/dashboard/src/lib/webmcp/console-tool-catalog.ts` + `auditConsoleWebMcpCatalog()`. Approval-integrity cell: agent searches for an approve tool and finds none.

## Types

Prefer `as const satisfies` InputSchema patterns from `@mcp-b/webmcp-types` when adding the package; until then use `apps/dashboard/src/types/webmcp.d.ts`.

## Related

- `docs/benchmarks/security-suite/approval-integrity/webmcp-no-approve.md`
- Chrome references: annotations, agent-security, tool-design under `webmcp-skills/skills/build-webmcp-tools/references/`
