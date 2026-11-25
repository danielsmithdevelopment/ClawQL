# Pass 7 — Operations and deploy

Nov 25, 2026 · static review of `manifests/`, `docker/`, `infra/`, both operator packages, `scripts/` (non-benchmark), and deploy-related workflows. Findings implemented on `cursor/audit-fix-pass7-e722` (stacked after Pass 6 / #1545).

## Findings

| ID   | Priority         | Location                                               | Issue                                                                           | Fix                                                                                              | Size |
| ---- | ---------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| 7.01 | Fix now          | `manifests/charts/clawql-mcp` stores Postgres          | Default `change-me` password embedded when document pipeline + Postgres enabled | Empty default; helm `fail` unless `existingSecret` or `devAllowWeakSecrets`                      | S    |
| 7.02 | Fix now          | chart `service.type`, `docker/kubernetes-starter.yaml` | MCP Service defaulted to `LoadBalancer` without TLS                             | Default `ClusterIP`; starter matches                                                             | S    |
| 7.03 | Fix now          | chart `podSecurityContext` / `securityContext`         | Empty `{}` — root-capable by default                                            | SOC2-style non-root / drop-ALL as chart defaults                                                 | S    |
| 7.04 | Fix now          | `clawql-operator` RBAC + `mcp-rollout.ts`              | Cluster-wide ConfigMap/Deployment patch; cross-namespace rollout                | Namespaced Role; refuse foreign `mcp.namespace`; Secrets `get`                                   | M    |
| 7.05 | Fix now          | chart gatewayAuth + starter Secret                     | Plaintext `apiKey` / committed `replace-me` Secret                              | Refuse plaintext without `devAllowWeakSecrets`; starter documents `kubectl create secret` only   | S    |
| 7.06 | Before regulated | Helm + operator tier enum                              | No `regulated` tier / no first-class values profile                             | `pluginTiers.tier=regulated`, `values-regulated.yaml`, operator preset, inject `CLAWQL_TIER`     | M    |
| 7.11 | Before regulated | Onyx values demo passwords                             | `minioadmin` / `StrongPassword123!` / `change-me` in base values                | Empty defaults + helm fail; lab overlay keeps demos behind `devAllowWeakSecrets`                 | S    |
| 7.15 | Cleanup          | `docker/compose/*` Label Studio                        | Default `changeme` + host-published UI                                          | Require `LABEL_STUDIO_PASSWORD`; bind `127.0.0.1`                                                | S    |
| 7.50 | Fix now          | `scripts/deploy/deploy-cloud-run.sh`                   | `ALLOW_UNAUTH=true` + no gateway auth env                                       | Default `false`; require `apiKey`/`oidc`; refuse public without `CLAWQL_ALLOW_PUBLIC_CLOUDRUN=1` | L    |
| 7.51 | Fix now          | `infra/pulumi/.../aws-idp-k3s.ts`                      | SSH/API SG default `0.0.0.0/0`                                                  | Require `sshCidrBlocks` / `apiCidrBlocks`; refuse world-open                                     | L    |
| 7.52 | Fix now          | `infra/pulumi/.../aws.ts`                              | Golden-host MCP `:8080` world-open                                              | Require `mcpHttpCidrBlocks`; refuse `0.0.0.0/0` unless `allowPublicMcp`                          | M    |
| 7.53 | Before regulated | `infra/gitops/projects/clawql.yaml`                    | `sourceRepos: "*"` allowed any fork                                             | Pin org repo only                                                                                | L    |
| 7.60 | Before regulated | celld CE OIDC role                                     | `sub: repo:org/repo:*`                                                          | Narrow to `ref:refs/heads/main`                                                                  | S    |
| 7.61 | Cleanup          | `k8s-docker-desktop-set-mcp-auth.sh`                   | Default CORS `*`                                                                | Unset by default; `*` needs `CLAWQL_ALLOW_CORS_STAR=1`                                           | S    |

## Deferred (still open)

| ID        | Priority                   | Notes                                                                                                          |
| --------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 7.07      | Before regulated           | MCP NetworkPolicy default-deny — chart pieces exist for web/NATS/gateway only                                  |
| 7.08      | Before regulated           | gRPC TLS cert wiring in Helm (runtime already refuses insecure non-loopback under regulated)                   |
| 7.09      | Before regulated           | In-cluster NATS `CLAWQL_NATS_ALLOW_INSECURE=1` auto-inject                                                     |
| 7.10      | Before regulated           | Vault/ESO cleartext `http://…:8200`                                                                            |
| 7.12      | Before regulated           | docker.sock + root for local sandbox — keep lab-gated                                                          |
| 7.13      | Before regulated           | JWT/ATR mcpProxy off by default — `values-regulated.yaml` enables proxy; full mesh STRICT still overlay        |
| 7.14      | Cleanup                    | Two operators maturity narrative                                                                               |
| 7.54–7.59 | Before regulated / Cleanup | GitOps selfHeal + `:latest`, Packer long-lived keys, Pulumi `up` Environment gate, provider catalog refresh CI |

## Consolidation

Keep `clawql-operator` (ClawQLInstance) and `clawql-k8s-operator` (burst/mesh) separate. Regulated posture lives in `values-regulated.yaml` (+ SOC2 overlay), not tribal knowledge alone.

## Hold claims

Do **not** claim “human-approved payments” until Pass 6 follow-ups **Y1–Y3** land (operator-only approve auth, claims tenant only, quote-bound approval). Outbound spend caps and regulated local-only are done (X2/X4).
