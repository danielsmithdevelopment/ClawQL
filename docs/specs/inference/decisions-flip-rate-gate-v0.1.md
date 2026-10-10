# Decisions flip-rate / perturbation gate — v0.1

**Status:** shipping  
**Package:** `clawql-inference`  
**Related:** [decisions-fanout-eval-v0.1](./decisions-fanout-eval-v0.1.md) · [openai-decisions-compat-v0.1](./openai-decisions-compat-v0.1.md) · [gateway-ladder-v0.1](./gateway-ladder-v0.1.md)

## Why

Held-out accuracy alone is not enough for `productionTrusted`. Microsoft-style decision models advertise flip-rate / perturbation robustness: small input changes should not swing the answer when the model is “sure.” ClawQL owns that gate on the **customer** distribution — before a site inherits trust, answers must stay stable under a fixed perturbation suite.

## Endpoint

| Path                      | Notes                                      |
| ------------------------- | ------------------------------------------ |
| `POST /decision/flip-rate` | Operator / CI surface (ClawQL-shaped)     |

## Request

```json
{
  "useSiteId": "search_provider_tool_routing",
  "maxFlipRate": 0.1,
  "families": ["whitespace", "case", "punctuation", "synonym"],
  "cases": [
    {
      "caseId": "billing-1",
      "state": "I was charged twice for my order.",
      "questions": [
        {
          "type": "choice",
          "name": "department",
          "options": [
            { "id": "billing", "description": "Payments" },
            { "id": "shipping", "description": "Delivery" }
          ]
        }
      ]
    }
  ]
}
```

## Perturbation families (v0.1)

| Family        | Transforms                                              |
| ------------- | ------------------------------------------------------- |
| `whitespace`  | collapse runs, trim, leading/trailing pad                |
| `case`        | lower, upper, title-ish first-token capitalize           |
| `punctuation` | strip trailing `!?.`, lightly add `?`                    |
| `synonym`     | small closed swap list (`charged`↔`billed`, etc.)        |

Families are deterministic (no RNG) so CI is reproducible.

## Metrics

| Field            | Meaning                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `baseline`       | Answer on original `state` (null if abstained)                          |
| `perturbations`  | Count of applied transforms that produced a comparable answer           |
| `flips`          | Perturbations whose answer ≠ baseline                                   |
| `flipRate`       | `flips / perturbations` (0 when no comparable perturbations)            |
| `passed`         | `flipRate <= maxFlipRate` and baseline answered                         |

Suite-level `passed` requires every case passed (fail-closed).

## Trust coupling

v0.1 **reports** pass/fail for operators and CI. Wiring into `productionTrusted` in `clawql-core` held-out is a follow-on (gate must run on frontier-adjudicated suites with live GLiNER).

Fan-out eval may later attach flip-rate as a secondary column before recommending a backend.

## Gate caution

Flip-rate does not replace held-out correctness or calibration. A stable wrong answer still fails honesty.
