# Decisions fan-out evaluation — v0.1 (bulk + disagreement_mining + ensemble)

**Status:** shipping  
**Package:** `clawql-inference`  
**Related:** [openai-decisions-compat-v0.1](./openai-decisions-compat-v0.1.md) · [decisions-flip-rate-gate-v0.1](./decisions-flip-rate-gate-v0.1.md) · [decisions-openrouter-decision1-v0.1](./decisions-openrouter-decision1-v0.1.md) · [gateway-ladder-v0.1](./gateway-ladder-v0.1.md) · [[Inference gateway GTM ladder]]

## Why

Vendors return probabilities on **their** distributions. ClawQL’s pitch is: _bring any decision model; we prove which one to trust for each decision site._ That proof needs a fan-out evaluator that runs the same cases across backends and reports honesty metrics — not a leaderboard of vendor self-scores.

## Endpoint

| Path                  | Shape                       | Notes                                     |
| --------------------- | --------------------------- | ----------------------------------------- |
| `POST /decision/eval` | ClawQL fan-out eval request | Operator / CI surface (not OpenAI-shaped) |

OpenAI SDK clients stay on `POST /v1/decisions`. Eval is a ClawQL control-plane tool.

## Modes

| Mode                  | v0.1 | Behavior                                                                                    |
| --------------------- | ---- | ------------------------------------------------------------------------------------------- |
| `bulk`                | yes  | Run every requested backend on a labeled set; recommend cheapest that meets the quality bar |
| `disagreement_mining` | yes  | Unlabeled batch; emit cross-backend disagreements for Review                                |
| `ensemble`            | yes  | Majority quorum over backends; recommend **only** when it raises answers-on-its-own         |

## Bulk request

```json
{
  "mode": "bulk",
  "useSiteId": "search_provider_tool_routing",
  "qualityBar": { "maxWrongAnswers": 0, "minAnswered": 1 },
  "backends": [
    { "id": "local", "model": "clawql", "costPerCase": 0 },
    { "id": "openai/gpt-6-luna", "model": "gpt-6-luna", "costPerCase": 0.002 }
  ],
  "cases": [
    {
      "caseId": "billing-1",
      "state": "I was charged twice for my order.",
      "questions": [
        {
          "type": "choice",
          "name": "department",
          "options": [
            { "id": "billing", "description": "Payments and refunds" },
            { "id": "shipping", "description": "Delivery" }
          ]
        }
      ],
      "expected": [{ "name": "department", "answer": "billing" }]
    }
  ]
}
```

## Disagreement mining request

Unlabeled — omit `expected`. Optional `flipRate` attaches the perturbation gate to each disagreed case (local decide path) so Review sees stability alongside split answers.

```json
{
  "mode": "disagreement_mining",
  "useSiteId": "search_provider_tool_routing",
  "backends": [
    { "id": "local", "model": "clawql" },
    { "id": "openai/gpt-6-luna", "model": "gpt-6-luna" }
  ],
  "flipRate": { "maxFlipRate": 0.1, "families": ["whitespace", "case", "punctuation", "synonym"] },
  "cases": [
    {
      "caseId": "billing-1",
      "state": "I was charged twice for my order.",
      "questions": [
        {
          "type": "choice",
          "name": "department",
          "options": [
            { "id": "billing", "description": "Payments and refunds" },
            { "id": "shipping", "description": "Delivery" }
          ]
        }
      ]
    }
  ]
}
```

## Metrics (per backend)

| Field             | Meaning                                                                               |
| ----------------- | ------------------------------------------------------------------------------------- |
| `answered`        | Non-abstain answers produced                                                          |
| `correct`         | Answered and matched expected (bulk only; 0 in mining)                                |
| `wrong`           | Answered and mismatched expected (bulk only; 0 in mining)                             |
| `abstained`       | Soft abstain / no answer                                                              |
| `answersOnItsOwn` | `correct` when `wrong <= maxWrongAnswers` (else 0) — honesty bar                      |
| `meetsQualityBar` | Bulk: `wrong <= maxWrongAnswers` and `answered >= minAnswered`; mining always `false` |
| `costEstimate`    | `costPerCase * cases.length` when `costPerCase` provided                              |

**Bulk recommendation:** among backends that `meetsQualityBar`, pick lowest `costEstimate` (ties → first listed). If none meet the bar, omit `recommendation` and report why.

**Mining:** no recommendation. `disagreements` / `reviewCount` is the Review queue. When `flipRate` is set, each disagreement may include a `flipRate` summary (`passed`, `flipRate`, `flips`, `perturbations`, `baseline`) from the local decide path.

## Disagreement side-channel

Even in `bulk`, cases where selected answers differ across backends are listed under `disagreements`. Mining elevates that queue to the primary product surface.

## Hygiene (enforced)

- Redaction of case `state` before remote egress is the caller’s responsibility in v0.1; remote backends still honor image-egress and uncalibrated policies on `/v1/decisions`.
- Remote Luna requires `OPENAI_API_KEY` (or override); missing key → backend `skipped` with reason, not a hard 500 for the whole job.
- Eval never sets `calibrated: true` on live traffic — it only measures.
- Mining refuses non-empty `expected` so unlabeled Review stays honest (use `bulk` for labeled eval).

## Gate caution

Fan-out metrics may **advise** which backend to pin for a site. Deterministic gates and spec-derived risk stay authoritative. Flip-rate attach on mining does **not** replace held-out `productionTrusted` (see [decisions-flip-rate-gate-v0.1](./decisions-flip-rate-gate-v0.1.md)).

## Ensemble

Labeled cases (same as bulk). Per case: unique plurality among non-null backend answers (≥2 answering; ties abstain). Synthetic `ensemble` report is appended. Recommendation is `ensemble` **only** when `answersOnItsOwn` strictly exceeds every single backend; otherwise keep cheapest single meeting the bar (fail-closed — never ship a quorum that does not raise honesty).

## Follow-ons

1. ~~`disagreement_mining` mode (unlabeled)~~ — shipped
2. ~~Flip-rate × fan-out disagreement mining~~ — optional `flipRate` attach on mining
3. ~~Microsoft-Decision-1 / OpenRouter decision backends as fan-out candidates~~ — [decisions-openrouter-decision1-v0.1](./decisions-openrouter-decision1-v0.1.md)
4. Cost models from virtual-key spend ledger
5. ~~Live `ensemble` quorum when it raises answers-on-its-own~~ — shipped
