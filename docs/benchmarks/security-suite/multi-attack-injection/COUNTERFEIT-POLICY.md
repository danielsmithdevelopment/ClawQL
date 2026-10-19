# Counterfeit-policy cell

**Cite:** [Datadog Security Labs — Jev as a judge: How counterfeit policy steers Jev](https://securitylabs.datadoghq.com/articles/jev-as-a-judge-how-counterfeit-policy-steers-jev/) (2026-10-15).

## One question

Can attacker-controlled content **rewrite the gate’s policy** (label-and-taxonomy rewrite) so a risky tool call is allowed?

Datadog evaluated Jev on public prompt-injection datasets, then tested whether prepended **counterfeit policy** could steer classifications and bypass LangChain’s tool-risk gating. The attack supplies desired answers and replaces attack-category definitions inside the content the judge is reading. A model-judged gate has no structural way to tell its real instructions from counterfeit ones in that content.

## Arms

| Arm                            | Status                                   | What it measures                                                                                                                                                 |
| ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ClawQL deterministic**       | **Measured** (smoke n=4 channel plants)  | Whether a counterfeit policy in email/ticket/doc/webhook can relabel the channel as trusted or un-park an OVERRIDE — **0 of 4**                                  |
| **Model-judged defaults**      | **Pending**                              | LangChain tool-risk / Jev stock config on a **public** Datadog-cited set with counterfeit policy prepended                                                       |
| **Model-judged best-config**   | **Pending**                              | Same corpus through **JevShield** (or documented best mitigation) with the **"data, not instructions"** preamble on                                               |

There is **no** harness stand-in that “follows policy-shaped text.” That would fail by construction — the same credibility failure as attributing a deny-tools proxy to Executor. Until the live arms are measured, **Datadog’s independent result is the peer evidence.**

## Live peer bar (do not lower)

When the model-judged arms run, make the comparison solid:

1. **Scale.** Apply the counterfeit-policy technique to one of the same public sets Datadog used (DeepSet, xTRam1, zachz, Yanismiraoui) — hundreds to thousands of examples, reproducible by anyone. Do not publish a four-case toy as the peer column.
2. **Best configuration.** Give the model-judged product its own hardening: JevShield wraps tool content in a “data, not instructions” preamble specifically to resist this. Run that as the best-config arm. If counterfeit policies still get through, the finding is stronger; if the mitigation holds, publish that honestly.
3. **Native only.** Never a ClawQL stand-in for the peer gate.

ClawQL’s deterministic **0 of 4** (channel smoke) holds either way. The point is that the arm it is compared against is just as solid.

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
