# Draft GHSA — Native MCP resume could re-use a single-use approval

**Status:** Fix merged to `main` via PR #1459 (2026-11-04). Draft GHSA ready to
publish with the next release that includes that commit.  
**Public retract:** **Not required** — no npm, Helm chart, or managed-hosting
release shipped the vulnerable path; finding was pre-public / `main`-only.  
**Severity:** High (for any deployment that exposed native destructive tools under
`CLAWQL_OPERATION_RISK_ENFORCE=1` with human resume via `approvedExecutionId`).  
**CVE:** TBD (assign when publishing on GitHub Security Advisories)  
**Fix PR:** https://github.com/danielsmithdevelopment/ClawQL/pull/1459

## Summary

`gateNativeToolBeforeInvoke` allowed a native MCP tool to run when
`approvedExecutionId` was present **without** calling
`tryConsumeApprovedMandate`. A single approved pending execution could be
resumed more than once (serial or concurrent), violating the product’s
single-use approval guarantee.

## Affected versions

| Channel                            | Affected?                                          | Notes                                                                                                           |
| ---------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **npm `clawql-mcp`**               | **No published release**                           | Latest npm is **7.2.0** (2026-08-05). Vulnerable code landed **2026-10-19** (`2fbacf791`) — **after** `v7.2.0`. |
| **Git tags ≤ `v7.2.0`**            | No                                                 |                                                                                                                 |
| **`main` / unreleased 8.0.0 tree** | **Yes**, from 2026-10-19 until PR #1459 merges     | Anyone running images or checkouts from `main` in that window                                                   |
| **Helm / managed hosting**         | Only if the image was built from vulnerable `main` | Managed hosting is waitlist; confirm image digests/tags against the intro commit                                |

**Fixed in:** PR #1459 (consume CAS before native handler; finalize after). Ship as
the next published release that includes that commit (planned **8.0.0** or a
security patch if 8.0 ships without it).

## Impact

- **Integrity of governance:** consequential native tools could execute twice on
  one human approval.
- Catalog `execute` / `resume` via execute-core was **not** affected (already
  consumed atomically).

## Mitigation / upgrade

1. Upgrade to a release that includes PR #1459 (or run that commit on `main`).
2. Until then: do not pass `approvedExecutionId` into native MCP tool args for
   destructive tools; prefer catalog `execute` + `clawql resume` only.
3. Operators: run the audit hunt below on any WORM trails from the vulnerable
   window.

## Operator audit hunt

```bash
# Any deployment you operate — look for one pex_ id with ≥2 consume/success events
node scripts/formal/audit-mandate-double-execute.mjs --dir "$CLAWQL_HOME/worm"
# or export / Postgres WORM:
# node scripts/formal/audit-mandate-double-execute.mjs --file trail.ndjson
```

Exit `2` = investigate those `executionId`s. Exit `0` = no multi-hit IDs in the
scanned files.

## Disclosure plan

1. Merge #1459; cut a release that includes the fix.
2. Publish this note as a **GitHub Security Advisory** (GHSA) with the fixed
   version range (`< fixed` for any pre-release packages/images that carried
   the Oct 19–fix window; npm 7.x marked unaffected). Prompt advisory still
   builds trust even when no public package needs a retract.
3. Notify operators of managed / self-hosted fleets that ran `main` images after
   2026-10-19 (if any).

Publishing the GHSA requires a maintainer with Security Advisory write access
(this agent’s `gh` is read-only).

## Credits

Found during implicit-FSM / payments coverage review (native resume vs
mandate consume), 2026-11-03.
