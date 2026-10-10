# OpenAI Decisions API compatibility — `/v1/decisions` (v0.1)

**Status:** shipping  
**Package:** `clawql-inference`  
**Related:** [[Inference gateway GTM ladder]] · [gateway-ladder-v0.1](./gateway-ladder-v0.1.md) · [OpenAI Decisions guide](https://developers.openai.com/api/docs/guides/decisions) · Microsoft-Decision-1

## Why

OpenAI’s Decisions API (gpt-6-luna) and Microsoft-Decision-1 made “decision models” a hyperscaler category. ClawQL’s `/decision` was early to the same three question types and ticket-triage demo. Compatibility means SDK clients (`client.decisions.create`) work by changing `baseURL`, while ClawQL keeps the trust lifecycle vendors leave to the developer.

**Pitch:** _Bring any decision model. ClawQL proves which one to trust, for each decision you make._

**Drop-in honesty:** Official SDKs ignore unknown fields like `calibrated`. Unproven answers therefore return `type: "refusal"` by default (every SDK already makes callers handle refusals). Uncalibrated probability answers are returned only with an explicit opt-in.

## Endpoints

| Path                 | Shape                | Notes                                                 |
| -------------------- | -------------------- | ----------------------------------------------------- |
| `POST /v1/decisions` | OpenAI Decisions     | Canonical for SDK drop-in                             |
| `POST /decision`     | ClawQL / System One  | `state` + `questions` (`choice` \| `noul` \| `score`) |
| `POST /v1/systemone` | Alias of `/decision` | Unchanged                                             |

## Model field

| `model` value                                    | Behavior                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `clawql-auto`                                    | Local Fast Decision first; escalate to Luna on abstain when keyed                     |
| `clawql` \| `gliner2` \| `gliner` \| `heuristic` | Local Fast Decision only                                                              |
| `gpt-6-luna`                                     | Remote OpenAI Decisions when `OPENAI_API_KEY` / `CLAWQL_DECISIONS_OPENAI_API_KEY` set |
| Anything else                                    | HTTP 400 OpenAI error shape (`invalid_request_error`) so SDKs raise                   |

## OpenAI request mapping

| OpenAI                                        | ClawQL                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `input` (string \| messages)                  | `state` (concatenated `input_text`)                                     |
| `questions[].type=predicate`                  | `noul` (`instructions` → `statement`)                                   |
| `questions[].type=choice` + `choices[].value` | `choice` + `options[].id`                                               |
| `questions[].type=score` + `levels[]`         | `score` (weighted average of level indices 0..n-1)                      |
| Images (`input_image`)                        | Forward to Luna **only** with explicit image egress consent (see below) |

## Fail-closed calibration (SDK-visible)

| Condition                                         | Default response                    | Opt-in for probabilities                                                                                                                                                |
| ------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site/backend not calibrated (`calibrated: false`) | `answers[].type = "refusal"`        | Header `x-clawql-allow-uncalibrated: 1`, body `allow_uncalibrated: true`, env `CLAWQL_DECISIONS_ALLOW_UNCALIBRATED=1`, or site in `CLAWQL_DECISIONS_UNCALIBRATED_SITES` |
| `score` questions (ordinal calib not shipped)     | Always refusal unless opt-in above  | Same opt-in; response still reports `calibrated: false`                                                                                                                 |
| Luna / remote                                     | Refusal (vendor probs ≠ site trust) | Same opt-in                                                                                                                                                             |

## Image egress policy

Redaction cannot scrub personal data from images. **Having `OPENAI_API_KEY` is not consent** to send images to OpenAI.

Images reach Luna only when all of the following hold:

1. Explicit egress consent: `x-clawql-allow-external-images: 1`, body `allow_external_images: true`, env `CLAWQL_DECISIONS_ALLOW_EXTERNAL_IMAGES=1` (optionally restricted by `CLAWQL_DECISIONS_EXTERNAL_IMAGE_SITES`), or virtual-key `allowExternalDecisionImages`
2. A vision backend is available (`OPENAI_API_KEY` / Luna)
3. Fail-closed calibration rules still apply to the returned answers

Otherwise: `answers[].type = "refusal"` with an explicit message.

## OpenAI response + ClawQL extensions

OpenAI fields: `id`, `object: "decision"`, `model`, `created`, `answers` (`predicate` \| `choice` \| `score` \| `refusal`), `usage`.

Always included:

| Field         | Meaning                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| `calibrated`  | Site + backend earned trust on **your** held-out data (false for Luna / score) |
| `escalated`   | Local abstain → Luna / Review path engaged                                     |
| `use_site_id` | Decision site                                                                  |
| `backend_id`  | e.g. `gliner2`, `heuristic`, `openai/gpt-6-luna`                               |
| `trace_id`    | WORM / audit correlation                                                       |
| `clawql`      | Nested ClawQL metadata                                                         |

Score `probabilities` use the OpenAI SDK shape: `{ label, value: levelIndex, probability }`.

## Multi-backend trust layer (product)

Vendors return probabilities calibrated on **their** distributions. ClawQL owns:

1. **Per-site held-out evaluation** — answers-on-its-own @ zero wrong answers
2. **Site-fit calibration** — fit on one split, score on another
3. **Flip-rate / perturbation robustness** (Microsoft-style) — operator gate + held-out `productionTrusted` conjunct
4. **Escalation** — local → Luna / Decision-1 → human Review
5. **Backend version pins** — version change → re-prove

### Fan-out evaluation service

See [decisions-fanout-eval-v0.1](./decisions-fanout-eval-v0.1.md) — `POST /decision/eval` (bulk mode ships).

1. **Bulk evaluation** (v0.1) — run every backend on a labeled set; recommend cheapest meeting the quality bar
2. **Disagreement mining** (follow-on) — unlabeled batch; disagreements → Review labels
3. **Live ensembles** (follow-on) — optional quorum; only when it raises answers-on-its-own

Hygiene: redaction before egress; data-class → permitted backends; per-provider rate limits; vendor terms for publishing comparisons.

## Gate caution

Decision-model probabilities may **advise** tool/payment gates. Deterministic rules and spec-derived risk stay authoritative — never replace the gate with a probability alone.

## SDK conformance (CI)

- **GW-16** — Official OpenAI JavaScript SDK against ClawQL `baseURL` (predicate, choice, score, refusal, error)
- **GW-17** — Official OpenAI Python SDK (same matrix)

Vitest: `packages/clawql-inference/src/decision/openai-sdk-conformance.test.ts`  
Python: `packages/clawql-inference/scripts/openai_decisions_sdk_conformance.py`

## Env

| Variable                                               | Role                                                      |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `OPENAI_API_KEY` / `CLAWQL_DECISIONS_OPENAI_API_KEY`   | Luna remote                                               |
| `CLAWQL_DECISIONS_OPENAI_BASE_URL` / `OPENAI_BASE_URL` | Override upstream (default `https://api.openai.com/v1`)   |
| `CLAWQL_DECISIONS_ALLOW_UNCALIBRATED`                  | Global opt-in to uncalibrated answers (`1`)               |
| `CLAWQL_DECISIONS_UNCALIBRATED_SITES`                  | Comma-separated site ids allowed uncalibrated             |
| `CLAWQL_DECISIONS_ALLOW_EXTERNAL_IMAGES`               | Global image egress consent (`1`)                         |
| `CLAWQL_DECISIONS_EXTERNAL_IMAGE_SITES`                | When set with global flag, restrict egress to these sites |
