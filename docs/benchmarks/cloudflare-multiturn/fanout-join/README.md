# Fan-out / join board

Program-mode promotion board (ADR 0015): six independent Cloudflare reads plus a
**workers ⋈ routes** join that no single `where` can express.

| Doc | Role |
| --- | --- |
| [`SPEC.md`](./SPEC.md) | Task, arms, token policy, pre-committed claim |
| `run-fanout-board.mjs` | Harness |
| `lib/fanout-join-shapes.mjs` | Plan + join assembly |
| `lib/fanout-join-checks.mjs` | Success checks |

```bash
# Unit checks
node --test scripts/benchmarks/cloudflare-multiturn/lib/fanout-join-shapes.test.mjs

# Smoke (ClawQL known-op + program + tokens-only CF code-mode)
CF_MT_ITERS=5 CF_MT_ARMS=clawql_known_op,clawql_program,cloudflare_codemode \
  node scripts/benchmarks/cloudflare-multiturn/run-fanout-board.mjs

# Include Executor v2 (needs local Executor + ensure app)
CF_MT_ITERS=5 CF_MT_ARMS=clawql_known_op,clawql_program,executor_v2,cloudflare_codemode \
  node scripts/benchmarks/cloudflare-multiturn/run-fanout-board.mjs
```

Artifacts land in this directory (`smoke-*` or `board-*`).

### Smoke readout (N=5)

- **Turns win:** program 1 vs known-op 6 (`turns_win: true`).
- **Token promotion:** cleared — program ~2 650 weighted vs known-op ~2 694
  (`token_promotion: true`) with `plan.return: true` compact merge. See [`SPEC.md`](./SPEC.md).

### Publish readout (3×10 000)

- Artifact: [`board-summary-n10000-r3.json`](./board-summary-n10000-r3.json)
- All three reps: `win: true` (`turns_win` + `token_promotion`), task success 1.0
- Program ~**2 650.6** weighted / 1 turn vs known-op **2 694** / 6 turns
- Arms published: known-op, program, cloudflare_codemode (`executor_v2` deferred)

### Real-model gate

Rules frozen in [`real-model-cursor-gate-precommit.json`](./real-model-cursor-gate-precommit.json) (see SPEC).

```bash
CF_MT_REAL_ITERS=5 node scripts/benchmarks/cloudflare-multiturn/prepare-fanout-real-model-cursor-gate.mjs
# Run interleaved Cursor Task sessions per WORKFLOW.md under /tmp/cf-mt-fanout-gate
node scripts/benchmarks/cloudflare-multiturn/lib/aggregate-fanout-cursor-gate.mjs --state /tmp/cf-mt-fanout-gate
```

Claim gate is ≥50 sessions/arm/model; N=5 is a pilot under the same frozen rules.
