# Draft outreach — Executor maintainers (Rhys / Useful Software)

Ready to send once you review. Tone: congratulations first, then equal-arm harness invite — **no comparison claims attached**. Same courtesy already used for Obot and Bifrost before publishing peer rows.

---

**Subject:** Congratulations on Executor 2 — equal-arm harness invite before we remasure

Hi Rhys —

Congratulations on Executor 2. The integration-layer work (OpenAPI / MCP / GraphQL / custom functions, OS credential store, workerd runtime) is a serious product surface, and we wanted to say that cleanly without attaching a scoreboard.

We publish equal-arm MCP gateway boards on [clawql.com/benchmarks](https://clawql.com/benchmarks). Several cells still cite Executor **2.0.0-β.15** (or an earlier β where the artifact omitted the exact build). Those rows are labeled **remeasure in progress** on the live page; we will not leave β.15 numbers next to a fresh v2 launch without a remasure.

**Before we publish new numbers**, we want you to review the harness and suggest config fixes — same invitation we already use for Obot and Bifrost.

### What we will remasure first

1. **HTTP multiplex concurrency + process-tree memory** (highest priority — the β.15 board showed ~2 clients at 100 ms p99 and ~2.1 GB anon; those are the most load-sensitive cells and the most likely to have been beta artifacts).
2. Cloudflare zone-audit tokens / session latency.
3. Pets multiturn tokens (the “3.38×” headline).
4. Interleaved n=10k latency, Topology-A chaos, governance pause/resume cells.
5. Fresh: Executor best-config governance + multi-attack rows (never measured).

Target binary: **latest Executor 2 channel** (`executor@beta` → currently `2.0.0-beta.37`). When `latest` moves to a stable `2.0.0`, we remasure again and promote that as the peer baseline.

### Harness pointers (open in the ClawQL repo)

| Board               | Entry                                                            | Notes                                                                            |
| ------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| CF HTTP concurrency | `scripts/benchmarks/http-concurrency-heap-ab.mjs`                | `ARMS=…,executor_v2` · Streamable HTTP · Bearer auth                             |
| CF zone-audit board | `scripts/benchmarks/cloudflare-multiturn/run-board.mjs`          | OpenAPI app → local replay mock (`ensure-executor-openapi-app.mjs`)              |
| Pets multiturn      | `scripts/benchmarks/gateway-multi-multiturn.mjs`                 | Equal-arm fat catalog                                                            |
| Governance cells    | `scripts/benchmarks/governance-policy-depth/ci-executor-peer.sh` | Pause / resume probe — resume cell is harness-driven, **not** stock auto-approve |

Artifacts / method: `docs/benchmarks/cloudflare-multiturn/` and `docs/benchmarks/gateway-multi-comparison/`.

### Config questions for you

- Preferred stock flags for a fair HTTP multiplex arm (`executor service` / `serve`, port, worker/concurrency knobs)?
- Anything we should change in the OpenAPI→mock app wiring so we are not under- or over-taxing the sandbox? (We already updated the harness for β.37’s scoped `defineApp({}, …)` requirements — empty `{ accounts: {} }` no longer builds.)
- Memory: we exclude motel diagnostics from the process-tree plateau — is that the right product-path cut for you?

Happy to adjust the arm to whatever you consider a fair operator default, then remasure on the same host before anyone promotes new Executor cells.

Thanks —
[Name]

---

## Checklist before send

- [ ] Confirm harness restored on the remasure branch (`scripts/benchmarks/cloudflare-multiturn/`, `http-concurrency-heap-ab.mjs`)
- [ ] Confirm /benchmarks still labels β figures (PR #1479)
- [ ] Decide channel (email `rhys@executor.sh`, Discord, Shared Slack connect, or GitHub issue)
- [ ] Sign with real name / ClawQL contact
- [ ] Do **not** attach a comparison table or “we beat you on X” framing
