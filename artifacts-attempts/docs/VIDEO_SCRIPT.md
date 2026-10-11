# Demo video checklist (5–10 min)

Record only after `npm run demo:record-prep` (or `demo:gate`) prints **GATE PASS**. Every scene is a live run or a screen recording of one — no mocked steps. Judges can warm up with `npm run demo:judge-smoke`.

## Scenes

1. **Cold start (30s)** — Clone repo, `npm ci`, show README “no mocked steps” + Apache-2.0.
2. **Seed + forks (60s)** — `npm run demo:local` starts; show three bare forks created under `.local/demo-run/artifacts/repos/`.
3. **Agents / replay (90s)** — Show `--replay` patches applying in parallel worktrees; label clearly if replay (not live models).
4. **Events → evaluation (90s)** — Show vitest output per attempt; open a `git notes show` on a commit after fetch into a clean clone.
5. **Safety beat (45s)** — `att_3` blocked: evidence note `policy.violations` includes `egress:https://evil.example`.
6. **Decision (60s)** — Calibrated path auto-merges **or** run `demo:approval-path` and click Approve on `/approve.html`. Show board trust line (`calibrated_confident` / `uncalibrated`).
7. **Merge (45s)** — Winner rebased onto main; re-test green; losers stood down (notes remain).
8. **Release — never cut (90s)** — Dry-run Arweave dir + `artifacts-verify --local-manifest …`; call out Merkle root + `buildEnvironment.fork/commit`. State that live Turbo is the production swap.
9. **Canary (30s)** — Open `.local/canary/status.json`: 10% canary + rollback trigger from the manifest (dry-run; live = Workers gradual deploy API).
10. **Board (45s)** — `board:serve` + `board:hydrate-from` (after a prior demo snapshot); live table updates; canary panel shows 10% + rollback trigger.
11. **Close (30s)** — Point judges at `docs/JUDGE_RUNBOOK.md`; mention Workers Paid / Artifacts billing Oct 15.

## Caption note

Event model is **at-least-once delivery + dedup** (idempotent by `repo+commit`). “Processed once” means one evidence note per commit, not exactly-once transport.

## Cut list (if short on time)

1. Review agent — already cut  
2. Second-task conflict — already cut  
3. Board polish — plain table OK  
4. Forced rollback — show trigger in manifest only (keep canary %)
