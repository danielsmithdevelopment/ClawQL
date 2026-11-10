# Deferred: multi-gateway inference board

**Status:** do not publish this week. Internal planning only.

## Why wait

A head-to-head timed to another project’s supply-chain incident reads as ambulance-chasing. Publish ClawQL’s own [supply-chain posture](../security/supply-chain-posture.md) first (vendor-neutral). Revisit a board after the news cycle cools (on the order of a couple of weeks), with the same measurement discipline as other ClawQL benchmarks.

Do not imply ClawQL is immune to supply-chain attacks. npm and containers have had serious compromises; the posture page states how risk is reduced and verified.

## Board shape (when ready)

### Part A — gateway overhead (mock provider)

- **Peers (examples, not a hit list):** at least three gateways besides ClawQL-inference (e.g. a pinned clean release of a popular Python proxy in an isolated env with **no real credentials**, Bifrost, Portkey and/or Cloudflare AI Gateway — adjust to what maintainers will engage).
- **Metrics:** p50 / p99 / p999 at fixed RPS, peak throughput, memory, startup time.
- **Protocol:** same session, three runs each; invite maintainers to tune their own configs.
- **Framing:** once real model latency is in path, gateway overhead is usually a rounding error. Do not try to “win” a microsecond race against a compiled binary.

### Part B — governance capability table

Checked against each project’s **documentation** (mark “not offered” only when verified):

- Spend caps that stop (per key / per team)
- Model provenance policy (deny by vendor/origin across aliases and aggregators) + compliance reporting
- Provider keys encrypted by the **customer’s** Vault / KMS, fail-closed
- Tamper-evident audit trail per call

### Headline that ages well

Competitive on speed; distinctive on governing what goes through the gateway.

## Do not

- Lead with another vendor’s incident name in the title or hero.
- Run production credentials through a freshly compromised release “for science.”
- Publish Part A alone without Part B.
