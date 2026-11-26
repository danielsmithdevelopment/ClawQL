# Security dynamic pass (regulated refusals)

## Process-level suite (CI today)

`regulated-refusals.e2e.test.ts` is the audit synthesis **dynamic pass** for
`CLAWQL_TIER=regulated`. It exercises process-level gates without a Kubernetes
cluster:

| #   | Refusal                                                         | Mechanism                                              |
| --- | --------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | `CLAWQL_WORM_ENABLED=0` refuses boot                            | `ensureProcessWormHostBootedEffect`                    |
| 2   | MCP `resume` approve fails (decline-only)                       | `resumeClawqlExecutionEffect` channel=`mcp`            |
| 3   | `noAuth` refused (loopback and non-loopback)                    | `assertMcpHttpAuthBindPolicyEffect`                    |
| 4a  | `CLAWQL_HTTP_GRAPHQL=1` refused                                 | `assertHttpGraphqlAllowedEffect`                       |
| 4b  | Webhook without shared token → 503                              | `checkWebhookToken`                                    |
| 4c  | Inference remote model refused after regulated profile defaults | `applyRegulatedProfileEnvEffect` + local-only assert   |

```bash
npm run test:regulated-refusals
# or: npx vitest run --config vitest.e2e.config.ts scripts/security/regulated-refusals.e2e.test.ts
```

Workflow: `.github/workflows/regulated-refusals.yml` (path-filtered).

Companion unit coverage for the auth-bind gate lives in
`src/http/mcp-http-auth-bind.test.ts` (default unit CI).

## Future: kind job (not required for this pass)

A follow-up CI job should install `kind` + Helm and assert the same refusals
against a live regulated chart (`deploy/helm` / `values-regulated.yaml`):

1. Deploy with `CLAWQL_TIER=regulated` and `CLAWQL_WORM_ENABLED=0` → pod CrashLoop / refuse ready.
2. MCP Streamable HTTP from an in-cluster client: `resume` approve JSON-RPC fails; decline succeeds.
3. Service bind with `CLAWQL_AUTH_MODE=noAuth` on ClusterIP / non-loopback → container exit.
4. GraphQL route absent / boot refuse when `CLAWQL_HTTP_GRAPHQL=1`.
5. Webhook endpoints return 503 without tokens; inference gateway refuses cloud model ids.

Until that job lands, treat the process suite as the merge gate and keep kind
evidence as a scheduled/manual lab (similar to `scripts/kubernetes/test-argo-workflow-kind.sh`).
