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
