# Demo video checklist (5–10 min)

Record only after `npm run demo:record-prep` (or `demo:gate`) prints **GATE PASS**. Every scene is a live run or a screen recording of one — no mocked steps. Judges can warm up with `npm run demo:judge-smoke`.

## Scenes

0. **Branded open (10–15s)** — Screen-record [`video-cards/open.html`](./video-cards/open.html). Thesis on screen; say it aloud from [`PITCH.md`](./PITCH.md).
1. **Cold start (30s)** — Clone **public** repo, `npm ci`, Apache-2.0 + “no mocked steps.”
2. **Seed + forks (60s)** — Live Artifacts forks if Oct 12 worked; else local `.local/.../artifacts/repos/` with “local witnesses” label.
3. **Agents (90s)** — Prefer one live agent on `att_1`; label the other two `replay` if used.
4. **Events → evaluation (90s)** — Vitest + `git notes show` from a clean clone.
5. **Safety beat (45s)** — `att_3` blocked: `egress:https://evil.example`.
6. **Decision (60s)** — Calibrated auto-merge and/or `/approve.html`; show `trustReason`.
7. **Merge (45s)** — Winner rebased; losers stood down.
8. **Release — never cut (90s)** — Live Turbo tx in gateway if available; else dry-run + honest label. `artifacts-verify`.
9. **Canary (30s)** — Live 10% gradual deploy if available; else `.local/canary/status.json` dry-run label.
10. **Board (45s)** — `board:serve` + hydrate; canary panel.
11. **Optional x402 unlock (30–45s)** — Only if live Artifacts worked. Encrypted permanence → pay $0.01 Base Sepolia → private buyer Artifacts repo. [`X402_UNLOCK.md`](./X402_UNLOCK.md). Skip entirely if short on time or live path failed.
12. **Close (15s)** — [`video-cards/close.html`](./video-cards/close.html) + public repo + `JUDGE_RUNBOOK.md`.

Between beats, optional title cards: [`video-cards/beat.html`](./video-cards/beat.html)?`t=`&`s=`.

## Caption note

Event model is **at-least-once delivery + dedup** (idempotent by `repo+commit`). “Processed once” means one evidence note per commit, not exactly-once transport.

## Cut list (if short on time)

1. Review agent — already cut  
2. Second-task conflict — already cut  
3. Board polish — plain table OK  
4. Forced rollback — show trigger in manifest only (keep canary %)
