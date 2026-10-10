# Day-1 checks (Oct 9, 2026)

Confirmed against Cloudflare Artifacts / Queues / Workers / CI docs before pipeline code. Throwaway binding verification still required on a Workers Paid account.

## Checklist

### 1. Forking and token scope — **confirmed (docs)**

- Fork: `using source = await env.ARTIFACTS.get(repo); await source.fork(attemptName, { defaultBranchOnly: true })`.
- Tokens are **repo-scoped**. Mint with `repo.createToken("write" | "read", ttlSeconds)`.
- A write token for `tsk_…-att_3` can push only that fork — wrong-fork push is refused by Artifacts auth, not by our policy layer.
- Pin **Wrangler ≥ 4.145.0** for Artifacts binding types.

**Witness plan:** coordinator acceptance — three forks from `baseCommit`; push with another attempt's token fails.

### 2. Events — **confirmed (docs)**

- Event type: `cf.artifacts.repo.pushed`.
- Delivery: Queues **event subscriptions**, or Workflow `triggers.events` targeting the evaluator directly.
- Payload includes `ref`, `before`, `after`, `commits[]`.
- Intake normalizes to `{ type: "push", repo, commit, at }` for the queue/Workflow; idempotency key = `repo + commit`.

### 3. Git notes — **confirmed (docs intent); throwaway verify still needed**

- Cloudflare [best practices](https://developers.cloudflare.com/artifacts/concepts/best-practices/) explicitly recommend git notes for harness metadata and pushing `refs/notes/*`.
- Design keeps notes on the fork. **Fallback:** if a throwaway push of `refs/notes/commits` is dropped, store notes in R2 keyed by `repo/commit` and document it in the README (same verify CLI path).

### 4. Where tests run — **confirmed (docs)**

- A Workflow cannot run `npm test` in-process.
- Use **`@cloudflare/ci`** Sandbox containers: `ci.runner({ name: "test", command: "npm test" })` from the evaluator Workflow, with Containers + R2 cache bindings.
- Alternative for Day 1 local: evaluator shell-outs via a Node harness; production path is Sandbox.

### 5. Arweave funding — **confirmed (pattern)**

- Prefer **ar.io Turbo credits** on a dedicated wallet (secret `ARWEAVE_JWK` / Turbo key), optionally with **credit sharing** so the release Worker holds a capped agent keypair.
- Dry-run mode writes `.local/arweave/<tx>/` so judges can verify the Merkle path without spending.
- Live publish needs prepaid Turbo credits; README states cost (~$0.07 for a ~10 MB demo bundle).

### 6. Gradual deployments — **confirmed (docs)**

- API: `POST /accounts/{account_id}/workers/scripts/{script_name}/deployments` with `strategy: "percentage"` and versions totaling 100.
- CLI: `wrangler versions upload` then `wrangler versions deploy`.
- Manifest `policy.canaryPercent` drives the percentage; rollback trigger stays in the manifest (forced rollback is cut).

## Open-question decisions (locked for the build)

| Question | Decision |
| --- | --- |
| Default `/v1/decisions` for judges | **`DECISIONS_URL` env.** Video demo uses a ClawQL gateway (calibrated → auto-merge). README default for judges without ClawQL is **OpenAI-compatible** (missing `calibrated` → always approval page). Both are honest. |
| No-keys mode | **Yes.** `agents/run-attempt.sh --replay demo/fixtures/patches/<att>.patch` replays recorded patches, labeled `agent.client: "replay"` in evidence. Pipeline stays live; agents are not claimed live. |
| Demo repo | **`demo/webhooks-service`** — small Node service with a real retry-storm bug and a Vitest suite. |

## Risks carried forward

- Artifacts beta: every call goes through `packages/artifacts-client` with REST fallback.
- Five-day clock: cut list in the handoff applies evening of any slip; Oct 14 morning stays free for recording.
