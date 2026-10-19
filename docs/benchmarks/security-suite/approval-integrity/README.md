# Approval-integrity cells (build-first #2)

Same fair format as the rest of the security suite: defaults + best-config, frozen rules, published harness, maintainer invite.

## Cells

| Id                   | Attack                                                                           | Status                         |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------ |
| `webmcp_no_approve`  | Browser agent tries to approve via console WebMCP — finds no approve tool        | **Measured** (catalog harness) |
| `self_approval`      | Agent approves its own paused write — requires a different person + security key | Planned                        |
| `arg_tamper`         | Approved at $52k, executed at $520k — mandate digests refuse                     | Planned                        |
| `approval_replay`    | Reuse one approval for a second write / after expiry                             | Planned                        |
| `approver_collusion` | Requester in approver group; double-count in N-of-M                              | Planned                        |
| `concurrent_crash`   | Two replicas race; kill mid-write × thousands — zero duplicate side effects      | Planned                        |

## `webmcp_no_approve`

ClawQL console registers WebMCP tools for list / inspect / audit search / draft policy / open Review — never approve. See [webmcp-no-approve.md](./webmcp-no-approve.md).

```bash
npm run test -w clawql-dashboard -- src/lib/webmcp/console-tool-catalog.test.ts
node scripts/benchmarks/approval-integrity/webmcp-no-approve.mjs
```

## Credibility

Signed security-key approvals are a **claimed capability**. Peers that never offer signed mandates are **`not_offered`** on those cells.

Absence of a WebMCP approve tool is measurable for any console that exposes WebMCP; peers without WebMCP stay **`not_offered`** on `webmcp_no_approve` until they claim browser-agent console tools.

## Status

`webmcp_no_approve` harness shipped with the console WebMCP catalog. Remaining cells planned.
