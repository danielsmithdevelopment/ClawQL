# Security dynamic pass (regulated refusals)

## Process-level suite (fast)

`regulated-refusals.e2e.test.ts` exercises process-level gates without spawning
the HTTP server or a Kubernetes cluster:

| #   | Refusal                                                         | Mechanism                                            |
| --- | --------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | `CLAWQL_WORM_ENABLED=0` refuses boot                            | `ensureProcessWormHostBootedEffect`                  |
| 2   | MCP `resume` approve fails (decline-only)                       | `resumeClawqlExecutionEffect` channel=`mcp`          |
| 3   | `noAuth` refused (loopback and non-loopback)                    | `assertMcpHttpAuthBindPolicyEffect`                  |
| 4a  | `CLAWQL_HTTP_GRAPHQL=1` refused                                 | `assertHttpGraphqlAllowedEffect`                     |
| 4b  | Webhook without shared token → 503                              | `checkWebhookToken`                                  |
| 4c  | Inference remote model refused after regulated profile defaults | `applyRegulatedProfileEnvEffect` + local-only assert |

```bash
npm run test:regulated-refusals
```

## Wire-level suite (D1)

`regulated-wire.e2e.test.ts` spawns `dist/server-http.js` under
`CLAWQL_TIER=regulated` with real S3 Object Lock and drives every refusal over
HTTP. Harness: `regulated-wire-harness.ts` (spawn, OIDC mint via `jose` + PEM
path, request sink, bucket helpers).

| #    | Trigger                                  | Expected                                 | Must not happen                        |
| ---- | ---------------------------------------- | ---------------------------------------- | -------------------------------------- |
| 1    | `CLAWQL_WORM_ENABLED=0`                  | Non-zero exit; stderr WORM disabled      | Port never opens                       |
| 1b   | `CLAWQL_SOURCES_ALLOW_HTTP=1`            | Non-zero exit; stderr SOURCES_ALLOW_HTTP | Port never opens                       |
| 2    | Bucket without Object Lock               | Boot refused by Object Lock verification | Port never opens                       |
| 3    | `noAuth` + allow-unauthenticated         | Non-zero exit; stderr noAuth             | Port never opens                       |
| 4    | `CLAWQL_HTTP_GRAPHQL=1`                  | Non-zero exit                            | Port never opens                       |
| 5–7b | MCP JWT / resume approve+decline         | 401 / decline-only / decline succeeds    | No tool run / still pending / declined |
| 8    | Operator channel via `clawql resume` CLI | Regulated console-only refuse            | Still pending                          |
| 9    | Webhook no/wrong token                   | 503 / 401                                | Handler side effects absent            |
| 10   | Inference `openai/gpt-4o`                | Local-only refuse                        | Inference sink empty                   |
| 11   | `sources_propose` HTTPS SSRF targets     | SSRF guard refuse                        | Sink empty                             |
| 12   | `GET /chain/verify`                      | Chain verifies                           | —                                      |
| 13   | Concurrent x402 same proof               | One allow; second settle already-settled | —                                      |

**SSRF hostname→loopback (F4):** `assertSafeSourceFetchUrlResolved` uses a hard-coded
`dns/promises.lookup` with no injectable resolver today, so the suite cannot force a
hostname that resolves to loopback without changing system DNS. Literal
`https://127.0.0.1` / link-local IPs cover the IP path; hostname rebinding remains a
documented gap until the egress module accepts an injected lookup.

```bash
npm run build
# LocalStack or MinIO with Object Lock:
export CLAWQL_WORM_S3_ENDPOINT=http://127.0.0.1:4566   # or :9000 for MinIO
export CLAWQL_WORM_S3_ACCESS_KEY_ID=test
export CLAWQL_WORM_S3_SECRET_ACCESS_KEY=test
npm run test:regulated-wire
```

**Object Lock backend:** CI uses digest-pinned LocalStack (`localstack/localstack:4.3.0@sha256:…`)
because anonymous MinIO pulls fail on GHA (same as `ci.yml`). Prefer MinIO locally
via `packages/clawql-audit/docker-compose.minio-object-lock.yml` when pullable.

OIDC uses `CLAWQL_AUTH_OIDC_PUBLIC_KEY_PEM_PATH` (static key) so the suite does
not need a loopback JWKS URL under regulated.

Workflow: `.github/workflows/regulated-refusals.yml` (path-filtered) runs both
jobs.

## Kind jobs (D2 / D3)

- **D2 (PR):** `regulated-kind.yml` → `test-regulated-kind.sh` with
  `CLAWQL_REGULATED_KIND_MODE=partial` (local unsigned image, Cosign off).
- **D3 (nightly / dispatch):** `regulated-kind-signed.yml` → same driver with
  `MODE=signed` (published GHCR `:nightly`, Kyverno Cosign on, N1–N5).
  Summary prints **SIGNED PARTIAL** until K2 / K4-neg / in-cluster D1 land.
  N3/N4 require a positive control (same pod shape admitted under the real
  subject) and match verifyImages vs webhook-unreachable denials specifically.
  N1 `cosign verify` defaults to the same `REAL_SUBJECT` pin as Kyverno
  (`docker-publish.yml`), not any workflow in the repo.
  **Fault-removal oracle:** `workflow_dispatch` with `run_fault_oracle=true`
  runs N2/N3/N4 arms in parallel (`fail-fast: false`). Each arm undoes one
  deliberate fault and must fail at exactly that check; the arm is green only
  when the driver exits non-zero with an `N2|N3|N4 FAIL:` line. Cite the one
  dispatch run ID (three job arms) when closing D3.

Kata stays disabled on kind — not runtime-isolation evidence.
## Evidence wording

These jobs are **test evidence** for the regulated profile, not certification
(no FedRAMP-ready / HIPAA-certified language). Prefer **at most once**, never
exactly once.
