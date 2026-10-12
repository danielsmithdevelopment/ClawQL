# OpenRouter Microsoft-Decision-1 — v0.1

**Status:** shipping  
**Package:** `clawql-inference`  
**Related:** [openai-decisions-compat-v0.1](./openai-decisions-compat-v0.1.md) · [decisions-fanout-eval-v0.1](./decisions-fanout-eval-v0.1.md) · [gateway-ladder-v0.1](./gateway-ladder-v0.1.md)

## Why

Microsoft-Decision-1 is a hyperscaler decision model available through OpenRouter’s Decisions / System One API (not chat completions). ClawQL exposes it as a **candidate backend**: OpenAI SDK clients can pin `model=microsoft-decision-1`, and fan-out eval can compare it against local Fast Decision / Luna — without claiming `productionTrusted` until held-out + flip-rate prove the site.

## Surfaces

| Path                  | Behavior                                                             |
| --------------------- | -------------------------------------------------------------------- |
| `POST /v1/decisions`  | `model=microsoft-decision-1` → OpenRouter Decisions when key present |
| `POST /decision/eval` | Backend ids/models matching Decision-1 / OpenRouter decision pins    |

## Credentials

| Env                                             | Role                                      |
| ----------------------------------------------- | ----------------------------------------- |
| `OPENROUTER_API_KEY`                            | Primary                                   |
| `CLAWQL_DECISIONS_OPENROUTER_API_KEY`           | Override for decisions only               |
| `CLAWQL_DECISIONS_OPENROUTER_BASE_URL`          | Default `https://openrouter.ai/api/alpha` |
| `CLAWQL_OPENROUTER_HTTP_REFERER` / `_APP_TITLE` | Optional OpenRouter headers               |

Missing key → HTTP **503** on `/v1/decisions` pin, or fan-out backend `skipped` (not a whole-job 500).

## Wire shape

Upstream request uses OpenRouter’s map-shaped questions (`criteria` object / array). ClawQL converts from OpenAI Decisions array questions and converts the answer map back to OpenAI `answers[]` so SDK clients and fail-closed refusal stay unchanged.

Default model pin: `microsoft/microsoft-decision-1`.

## Honesty

- Remote Decision-1 answers are **never** site-calibrated → fail-closed `refusal` unless `allow_uncalibrated` / header / env opt-in (same as Luna).
- Trust does **not** transfer from OpenRouter vendor scores. Use held-out + flip-rate before `productionTrusted`.

## Flip-rate measure rung

`POST /decision/flip-rate` accepts `model=microsoft-decision-1` (or `backendId`) so the perturbation suite calls OpenRouter Decision-1. Fan-out mining attach supports the same pin via `flipRate.model`. Results are operator/CI reports only — they do **not** light `calibrated` or held-out `productionTrusted`.

## Routing held-out candidate rung

Convert frozen v0.4 routing held-out (+ frontier labels) → fan-out cases via `heldOutCasesToFanout`, then `buildDecision1CandidateReport` runs bulk (local + Decision-1, `matchMode: twin`, local `costPerCase=0`, optional `spend_ledger` / `decision1CostPerCase`) and flip-rate with the Decision-1 pin. Artifact template: `packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/decision1-v04-routing-candidate-TEMPLATE.json`. Readout: `DECISION1_V04_CANDIDATE_READOUT.md`. Verdict always carries `productionTrustedClaim: false`.

### Held-out measure scorer (opt-in)

`CLAWQL_HELD_OUT_SCORER=openrouter-decision-1` selects `createOpenRouterDecision1FastDecisionScorerLayer` in `scripts/run-held-out-adjudication.mts`. Backend id is always `openrouter/microsoft/microsoft-decision-1` (≠ `gliner2`), so held-out `productionTrusted` stays false even with perfect accuracy + live labels. Default scorer remains GLiNER2. Bound flip-rate spend with `CLAWQL_FLIP_RATE_GATE=0` when measuring.

Operator fill: marker `packages/clawql-core/src/classifier/held-out/.run-decision1-v04-candidate` → workflow `decision1-v04-candidate.yml` (needs repo secret `OPENROUTER_API_KEY`), or `npx tsx scripts/run-decision1-v04-candidate.mts`.

## Fan-out example

```json
{
  "mode": "bulk",
  "backends": [
    { "id": "local", "model": "clawql", "costPerCase": 0 },
    {
      "id": "openrouter/microsoft/microsoft-decision-1",
      "model": "microsoft/microsoft-decision-1",
      "costPerCase": 0.001
    }
  ],
  "cases": []
}
```
