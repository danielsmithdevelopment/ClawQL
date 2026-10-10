# Decisions fan-out evaluation — v0.1 (bulk)

**Status:** shipping  
**Package:** `clawql-inference`  
**Related:** [openai-decisions-compat-v0.1](./openai-decisions-compat-v0.1.md) · [gateway-ladder-v0.1](./gateway-ladder-v0.1.md) · [[Inference gateway GTM ladder]]

## Why

Vendors return probabilities on **their** distributions. ClawQL’s pitch is: _bring any decision model; we prove which one to trust for each decision site._ That proof needs a fan-out evaluator that runs the same labeled cases across backends and reports honesty metrics — not a leaderboard of vendor self-scores.

## Endpoint

| Path                 | Shape                         | Notes                                      |
| -------------------- | ----------------------------- | ------------------------------------------ |
| `POST /decision/eval` | ClawQL fan-out eval request  | Operator / CI surface (not OpenAI-shaped)  |

OpenAI SDK clients stay on `POST /v1/decisions`. Eval is a ClawQL control-plane tool.

## Modes

| Mode                   | v0.1 | Behavior                                                                 |
| ---------------------- | ---- | ------------------------------------------------------------------------ |
| `bulk`                 | yes  | Run every requested backend on a labeled set; recommend cheapest that meets the quality bar |
| `disagreement_mining`  | later | Unlabeled batch; emit disagreements for Review                           |
| `ensemble`             | later | Live quorum only when it raises answers-on-its-own                       |

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

## Metrics (per backend)

| Field               | Meaning                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `answered`          | Non-abstain answers produced                                         |
| `correct`           | Answered and matched expected                                        |
| `wrong`             | Answered and mismatched expected                                     |
| `abstained`         | Soft abstain / no answer                                             |
| `answersOnItsOwn`   | `correct` when `wrong <= maxWrongAnswers` (else 0) — honesty bar     |
| `meetsQualityBar`   | `wrong <= maxWrongAnswers` and `answered >= minAnswered`             |
| `costEstimate`      | `costPerCase * cases.length` when `costPerCase` provided             |

**Recommendation:** among backends that `meetsQualityBar`, pick lowest `costEstimate` (ties → first listed). If none meet the bar, omit `recommendation` and report why.

## Disagreement side-channel

Even in `bulk`, cases where selected answers differ across backends are listed under `disagreements` for Review / disagreement-mining follow-on.

## Hygiene (enforced)

- Redaction of case `state` before remote egress is the caller’s responsibility in v0.1; remote backends still honor image-egress and uncalibrated policies on `/v1/decisions`.
- Remote Luna requires `OPENAI_API_KEY` (or override); missing key → backend `skipped` with reason, not a hard 500 for the whole job.
- Eval never sets `calibrated: true` on live traffic — it only measures.

## Gate caution

Fan-out metrics may **advise** which backend to pin for a site. Deterministic gates and spec-derived risk stay authoritative.

## Follow-ons

1. `disagreement_mining` mode (unlabeled)
2. Flip-rate / perturbation robustness gate before `productionTrusted`
3. Microsoft-Decision-1 / OpenRouter decision backends as fan-out candidates
4. Cost models from virtual-key spend ledger
