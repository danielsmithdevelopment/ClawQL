# OpenAI Decisions API compatibility — `/v1/decisions` (v0.1)

**Status:** shipping  
**Package:** `clawql-inference`  
**Related:** [[Inference gateway GTM ladder]] · [gateway-ladder-v0.1](./gateway-ladder-v0.1.md) · [OpenAI Decisions guide](https://developers.openai.com/api/docs/guides/decisions) · Microsoft-Decision-1

## Why

OpenAI’s Decisions API (gpt-6-luna) and Microsoft-Decision-1 made “decision models” a hyperscaler category. ClawQL’s `/decision` was early to the same three question types and ticket-triage demo. Compatibility means SDK clients (`client.decisions.create`) work by changing `baseURL`, while ClawQL keeps the trust lifecycle vendors leave to the developer.

**Pitch:** _Bring any decision model. ClawQL proves which one to trust, for each decision you make._

## Endpoints

| Path                 | Shape                | Notes                                                 |
| -------------------- | -------------------- | ----------------------------------------------------- |
| `POST /v1/decisions` | OpenAI Decisions     | Canonical for SDK drop-in                             |
| `POST /decision`     | ClawQL / System One  | `state` + `questions` (`choice` \| `noul` \| `score`) |
| `POST /v1/systemone` | Alias of `/decision` | Unchanged                                             |

## OpenAI request mapping

| OpenAI                                        | ClawQL                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `input` (string \| messages)                  | `state` (concatenated `input_text`)                                         |
| `questions[].type=predicate`                  | `noul` (`instructions` → `statement`)                                       |
| `questions[].type=choice` + `choices[].value` | `choice` + `options[].id`                                                   |
| `questions[].type=score` + `levels[]`         | `score` (weighted average of level indices 0..n-1)                          |
| `model=gpt-6-luna`                            | Remote OpenAI when `OPENAI_API_KEY` / `CLAWQL_DECISIONS_OPENAI_API_KEY` set |
| `model=clawql` \| `gliner2` \| other          | Local Fast Decision (GLiNER / heuristic)                                    |
| Images (`input_image`)                        | Forward to Luna when keyed; otherwise `answers[].type=refusal`              |

## OpenAI response + ClawQL extensions

OpenAI fields: `id`, `object: "decision"`, `model`, `created`, `answers` (`predicate` \| `choice` \| `score` \| `refusal`).

Always included:

| Field         | Meaning                                                                             |
| ------------- | ----------------------------------------------------------------------------------- |
| `calibrated`  | Site + backend earned trust on **your** held-out data (false for Luna until proven) |
| `escalated`   | Local abstain → Luna / Review path engaged                                          |
| `use_site_id` | Decision site                                                                       |
| `backend_id`  | e.g. `gliner2`, `heuristic`, `openai/gpt-6-luna`                                    |
| `trace_id`    | WORM / audit correlation                                                            |
| `clawql`      | Nested ClawQL metadata                                                              |

## Multi-backend trust layer (product)

Vendors return probabilities calibrated on **their** distributions. ClawQL owns:

1. **Per-site held-out evaluation** — answers-on-its-own @ zero wrong answers
2. **Site-fit calibration** — fit on one split, score on another
3. **Flip-rate / perturbation robustness** (Microsoft-style) before `productionTrusted`
4. **Escalation** — local → Luna / Decision-1 → human Review
5. **Backend version pins** — version change → re-prove

### Fan-out evaluation service (follow-on)

Three modes (see vault / GTM notes):

1. **Bulk evaluation** — run every backend on a labeled set; recommend cheapest meeting the quality bar
2. **Disagreement mining** — unlabeled batch; disagreements → Review labels
3. **Live ensembles** — optional quorum; only when it raises answers-on-its-own

Hygiene: redaction before egress; data-class → permitted backends; per-provider rate limits; vendor terms for publishing comparisons.

## Gate caution

Decision-model probabilities may **advise** tool/payment gates. Deterministic rules and spec-derived risk stay authoritative — never replace the gate with a probability alone.

## Env

| Variable                                               | Role                                                    |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `OPENAI_API_KEY` / `CLAWQL_DECISIONS_OPENAI_API_KEY`   | Luna remote                                             |
| `CLAWQL_DECISIONS_OPENAI_BASE_URL` / `OPENAI_BASE_URL` | Override upstream (default `https://api.openai.com/v1`) |
