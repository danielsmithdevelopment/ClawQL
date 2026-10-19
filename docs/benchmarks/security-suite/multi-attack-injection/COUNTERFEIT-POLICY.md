# Counterfeit-policy cell

**Cite:** [Datadog Security Labs — Jev as a judge: How counterfeit policy steers Jev](https://securitylabs.datadoghq.com/articles/jev-as-a-judge-how-counterfeit-policy-steers-jev/) (2026-10-15).

## One question

Can attacker-controlled content **rewrite the gate’s policy** (label-and-taxonomy rewrite) so a risky tool call is allowed?

Datadog evaluated Jev on public prompt-injection datasets, then tested whether prepended **counterfeit policy** could steer classifications and bypass LangChain’s tool-risk gating (Jev asked for the probability that a tool call is risky). The attack supplies desired answers and replaces attack-category definitions inside the content the judge is reading. A model-judged gate has no structural way to tell its real instructions from counterfeit ones in that content.

## Arms (same four planted attacks)

| Arm | Gate | What it measures |
| --- | ---- | ---------------- |
| **ClawQL deterministic** | Product defaults (source labels, park destructive writes, data-flow) | Whether a counterfeit policy in email/ticket/doc/webhook can relabel the channel as trusted or un-park an OVERRIDE |
| **Model-judged (structural)** | Scripted judge that **follows** policy-shaped text inside untrusted content | The structural failure mode Datadog measured — not a Jev API claim |
| **Model-judged (live)** | LangChain tool-risk / Jev / JevShield recommended config | Fair peer measurement when `MAI_MODEL_JUDGED_URL` is set; otherwise **pending ≠ not_offered** |

## Why this vindicates ClawQL’s design

A model can **advise** a gate but must never **be** the gate. ClawQL’s gate decides on facts an attacker cannot rewrite through content:

- Spec-derived risk
- Data-flow labels on **where content came from**
- Approvals bound to a person’s key

A counterfeit policy in an email cannot relabel the email as trusted, because trust comes from its **source**, not from what its text says.

## Framing for the page

> Datadog showed that model-judged gates can be talked out of their own policy. ClawQL’s gate does not take instructions from the content it judges.

## Decision sites (ClawQL warning)

ClawQL uses decision models for routing and triage, and plans server-side operation resolution. Any place untrusted text reaches a classifier is open to this attack:

1. **Add counterfeit-policy inputs** to the adversarial set when proving each decision site — next to Microsoft’s paraphrase-and-reorder flip test (`flip-rate` family `counterfeit_policy`). A site that flips under a counterfeit policy must not decide anything consequential.
2. **Keep operation resolution to automatic reads only.** A steered resolver that picks the wrong *read* wastes a turn; one that picked a *write* could do damage — writes always go to a person with the exact operation named.

## Run

```bash
npm run build -w clawql-api   # once
npm run benchmark:multi-attack-injection:counterfeit-policy
```

Artifact: [results-counterfeit-policy.json](./results-counterfeit-policy.json).
