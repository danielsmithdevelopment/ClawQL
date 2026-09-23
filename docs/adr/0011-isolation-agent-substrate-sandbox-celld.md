---
title: "Isolation Architecture: Agent Substrate for clawql-sandbox, celld for clawql-cellrt"
status: "September 2026 — decided, part of 8.0.0"
version: "0.1"
adr: "0011"
package: "packages/clawql-sandbox/ (Agent Substrate adoption) + celld / clawql-cellrt (unchanged V8-isolate model)"
---

# ADR 0011: Isolation Architecture

## Agent Substrate for clawql-sandbox, celld for clawql-cellrt

**September 2026 · Decided · Part of 8.0.0**

---

## 1. The Decision

`clawql-sandbox` **targets** Google's open-source **Agent Substrate** (Cloud Hypervisor microVM or gVisor, operator's choice) as its isolation backend for untrusted arbitrary-code execution, replacing the originally-planned bespoke Kata Containers/Docker/Seatbelt build as the *intended* primary production path. Legacy backends (Kata, Docker, Cloudflare bridge, Seatbelt) remain available as fallbacks and for local/dev.

**Implementation honesty (as of this ADR's first code drop):** the tree ships a ClawQL-owned **control-plane adapter** (in-process mock + optional HTTP client to an operator-provided URL). It does **not** yet vendor or depend on Google's Agent Substrate packages/CRDs. Until that integration lands, treat “adopts Agent Substrate” as the architectural decision + selection/WORM scaffolding, not as a claim that Substrate microVMs are running in this repo.

`clawql-cellrt` / **celld** continues to use celld's V8-isolate model, unchanged. **These are not competing choices for the same problem** — they are the correct backend for two genuinely different problems. This ADR exists so that distinction is never silently re-litigated by treating "Agent Substrate is newer/denser/Google-backed" as a reason to also apply it to celld's workload.

---

## 2. Why Adopt Agent Substrate for clawql-sandbox

Same principle already applied to celld: do not reimplement a hard, already-solved infrastructure problem when a credible, open-source, purpose-built solution exists. Agent Substrate is Kubernetes-native, open source, and aligned with ClawQL's Helm-first distribution identity. Published characteristics (density, sub-500ms resume, high suspend/resume throughput) fit the execute / `sandbox_exec` arbitrary-code threat model.

Adopting Agent Substrate **supersedes** the earlier parked question of whether `clawql-sandbox` should independently match ComputeSDK Scale Invitational concurrency/cold-start benchmarks (Modal, E2B, Northflank) — those numbers are inherited from Agent Substrate rather than rebuilt in-house.

---

## 3. Why celld Is Not Replaced

### 3.1 Different problems

|                   | Agent Substrate / `clawql-sandbox`                                               | celld / `clawql-cellrt`                                                                                |
| ----------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Threat model      | Untrusted / unpredictable code; host-escape, credential theft, exfiltration risk | Fixed-shape TypeScript orchestration; no `child_process`/`fs`/`net` by construction                    |
| Question answered | How do I safely run code I cannot fully trust or predict?                        | How do I run enormous numbers of small, already-trusted-by-construction pieces as cheaply as possible? |
| Resume cost class | ~sub-500ms microVM/gVisor restore                                                | ~sub-1ms–sub-5ms V8 isolate cold start                                                                 |

Moving cell workloads onto Agent Substrate would buy a security guarantee the workload cannot need, at a measurable latency regression.

### 3.2 Permanent decision rule

```
Does this workload need to execute code whose behavior is not
fully known or fixed in advance — agent-authored scripts, arbitrary
tool invocations, anything a model could plausibly have generated
on the fly, with a genuine host-escape or credential-theft risk if
uncontained?

  YES -> clawql-sandbox (Agent Substrate: Cloud Hypervisor microVM
         or gVisor, operator's choice)

  NO — fixed-shape orchestration logic, authored in advance,
  bounded pre-declared actions, still independently enforced by
  Panguard regardless of host isolation

  -> celld / clawql-cellrt (V8 isolate)
```

New workloads must classify explicitly against this rule in their introducing specification — never by analogy to "we already use Agent Substrate elsewhere" or "we already use celld elsewhere."

Code: `classifyIsolationWorkload` / `IsolationDecisionService` in `clawql-sandbox`.

---

## 4. What Adoption Changes in clawql-sandbox

| Before                                     | After                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Primary plan: bespoke Kata/Docker/Seatbelt | Primary: Agent Substrate; Kata/Docker/bridge/Seatbelt remain fallbacks |

**ClawQL still builds on top:**

1. **WORM audit** — every Agent Substrate suspend/resume and sandboxed execution produces `clawql-audit` entries (Agent Substrate has no ClawQL trail; ClawQL bridges it).
2. **Execute-batching / scope-limited globals** — unchanged in shape; host isolation mechanism only.
3. **Hook enforcement** — Panguard / spend-cap / `pre-execute` still fire at the `execute()` layer, independent of sandbox technology.
4. **Credential isolation** — evaluate Agent Substrate egress-gateway credential injection against outbound-payment signer key-isolation (reinforce or simplify; do not blindly duplicate).

---

## 5. Production Readiness Caveat

As of this writing, Agent Substrate is open source and generally available for **non-production** workloads; production GA support is allowlist-based. Before customer-facing production depends on Agent Substrate, reconfirm status. Gate: `CLAWQL_SANDBOX_AGENT_SUBSTRATE_ALLOW_PRODUCTION=1` after operator confirmation — same discipline as celld alpha caveats elsewhere.

---

## 6. Implementation map

| Artifact            | Path                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| This ADR            | `docs/adr/0011-isolation-agent-substrate-sandbox-celld.md`                                          |
| Backend             | `packages/clawql-sandbox/src/agent-substrate/`                                                      |
| Decision rule       | `packages/clawql-sandbox/src/isolation-decision.ts`                                                 |
| celld / cellrt note | `docs/streams/clawql-celld.md`, `docs/streams/clawql-cellrt.md` (isolation rule; runtime unchanged) |

---

## Consequences

- **Positive:** Credible K8s-native isolation for untrusted code; clear permanent split with celld; WORM visibility into suspend/resume.
- **Negative / follow-ups:** Production allowlist reconfirmation; egress-gateway vs payments signer evaluation; Kata remains maintained as fallback until Agent Substrate is the default everywhere operators need.
- **Non-goals:** Replacing celld with Agent Substrate; claiming Agent Substrate's published benchmarks as ClawQL-measured until validated on our clusters.

---

_Isolation Architecture Decision Record · ADR 0011 · v0.1 · September 2026_  
_Contact: daniel@clawql.com_
