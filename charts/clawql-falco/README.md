# clawql-falco (Helm)

Optional **PrometheusRule** definitions for **Falco** metrics that pair with ClawQL’s **sandbox** / runtime story ([issue #209](https://github.com/danielsmithdevelopment/ClawQL/issues/209)). This chart does **not** bundle Falco itself — install the upstream chart, then apply these rules.

## Prerequisites

- [Prometheus Operator](https://github.com/prometheus-operator/prometheus-operator) (`PrometheusRule` CRD) in the cluster.
- Falco **≥ 0.41** with **Prometheus metrics** enabled and scraped (see `falco-upstream-values.example.yaml`).
- Metric names such as `falcosecurity_falco_rules_matches_total` and `falcosecurity_falco_outputs_queue_num_drops_total` (see [Falco metrics](https://falco.org/docs/concepts/metrics/)).

## Upstream Falco (RBAC)

The **falcosecurity/falco** chart creates its own **ServiceAccount**, **ClusterRole**, and **ClusterRoleBinding** for syscall/K8s metadata access. Minimum operator steps: pick namespace, install chart, confirm DaemonSet pods are **Running**, and ensure your driver choice (**modern_ebpf** in the example) matches the node kernel.

No extra cluster RBAC is required **for this rules chart** — it only creates a `PrometheusRule` in the release namespace.

## Install

1. Install Falco (example pins chart **8.0.2**; adjust for your fleet):

   ```bash
   helm repo add falcosecurity https://falcosecurity.github.io/charts
   helm upgrade --install falco falcosecurity/falco -n falco --create-namespace \
     --version 8.0.2 -f charts/clawql-falco/falco-upstream-values.example.yaml
   ```

2. Install ClawQL rules (namespace must be watched by your Prometheus **`ruleNamespaceSelector`** / **`ruleSelector`**):

   ```bash
   helm upgrade --install clawql-falco-rules ./charts/clawql-falco -n monitoring --create-namespace
   ```

3. If Prometheus uses label selectors on rules, set matching labels, for example:

   ```bash
   helm upgrade --install clawql-falco-rules ./charts/clawql-falco -n monitoring \
     --set 'prometheusRules.additionalRuleLabels.release=kube-prometheus-stack'
   ```

## Alert naming (`ClawQL*`)

| Alert                                       | Intent |
| ------------------------------------------- | ------ |
| `ClawQLFalcoOutputQueueDrops`               | Falco is dropping outputs — risk of missed notifications. |
| `ClawQLFalcoHighSeverityRuleMatches`        | Sustained high rate of priority **Alert / Critical / Error** rule matches. |
| `ClawQLFalcoSuspiciousContainerExecutionSpike` | Spike on common **shell / exec** defaults — correlate with **`sandbox_exec`** and bridge logs. |
| `ClawQLFalcoTotalRuleMatchNoiseStorm`       | Extremely high aggregate match rate — tuning / FP storm vs attack. |

## Merkle / integrity (future)

When ClawQL exposes a counter such as **`clawql_merkle_tamper_attempt_total`** (name TBD), add a `PrometheusRule` row here or in your overlay with a `rate()`/`increase()` threshold. Until that metric ships, these Falco-only rules still cover runtime execution noise correlated with sandbox abuse.

## Slack / `notify` routing

Point Alertmanager receivers at Slack (or forward to the MCP **`notify`** tool path from [#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)) using label matchers on `clawql.io/alert-family`.

## Runbook / triage

1. **Confirm signal vs noise** — open Falco logs / sidekick for the firing window; check whether a single noisy rule dominates (`falcosecurity_falco_rules_matches_total{rule_name=...}`).
2. **Drops first** — if `ClawQLFalcoOutputQueueDrops` fires, fix sink backpressure and Falco CPU/memory before muting execution alerts.
3. **Correlate with ClawQL** — for execution spikes, compare timestamps with MCP **`audit`** ring buffer, **`sandbox_exec`** volume, and Seatbelt / bridge denials ([`sandbox_exec` / #207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)).
4. **Tuning** — raise `prometheusRules.defaultAlerts.*.minRatePerSecond` / `for` in `values.yaml`, add `mute_time_intervals` in Alertmanager, or add Falco `tags` / `exceptions` for known-good workloads — avoid permanent silences without a ticket.

## Lint

From repo root (also run by `make helm-lint`):

```bash
helm lint charts/clawql-falco
helm template test charts/clawql-falco --namespace monitoring >/dev/null
```
