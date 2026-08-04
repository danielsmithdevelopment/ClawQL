# Local Privacy Filter (sparse-MoE / token-classifier backup after Presidio)

**Tracking:** [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245)

Optional **local-first** second redaction pass on ClawQL gateway text paths. Default **off**. When enabled, text is sent to an on-operator HTTP sidecar that runs either demo heuristics or the open-weight [`openai/privacy-filter`](https://huggingface.co/openai/privacy-filter) model — **never** an OpenAI cloud PII API.

## Data flow

```
raw text
  → (optional) Microsoft Presidio analyzer + anonymizer
  → (optional) Privacy Filter POST /redact   ← this layer
  → execute response / memory_ingest / ingest_external_knowledge / export scrub
```

| Stage          | What is preserved                                                                  | What is dropped / masked                                 |
| -------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Input          | Full string until a layer runs                                                     | —                                                        |
| Presidio       | Non-entity tokens; structure of tool JSON                                          | Matched NER entities (operator anonymizer rules)         |
| Privacy Filter | Non-span tokens; `spans[]` metadata in sidecar response (not persisted by gateway) | Matched taxonomy spans replaced with `[CATEGORY]`        |
| Downstream     | Masked string only on success path                                                 | Original PII if both layers off or failure-policy `warn` |

Chain helper: `maybeGatewayRedactText` in `clawql-api` (`packages/clawql-api/src/redaction/gateway-redact.ts`).

## Enable

```bash
# Primary (existing)
CLAWQL_ENABLE_PRESIDIO=1
CLAWQL_PRESIDIO_ANALYZER_URL=http://127.0.0.1:5001
CLAWQL_PRESIDIO_ANONYMIZER_URL=http://127.0.0.1:5002

# Backup (this feature) — all local
CLAWQL_ENABLE_PRIVACY_FILTER=1
CLAWQL_PRIVACY_FILTER_URL=http://127.0.0.1:8091
CLAWQL_PRIVACY_FILTER_FAILURE_POLICY=warn
# CLAWQL_PRIVACY_FILTER_MODEL=openai/privacy-filter
```

Reference sidecar: [`deployment/samples/privacy-filter-http/`](../../deployment/samples/privacy-filter-http/).

Compose:

```bash
cd examples/clawql-local-docker-compose
docker compose -f docker-compose.yml \
  -f docker-compose.presidio.override.yml \
  -f docker-compose.privacy-filter.override.yml up -d
```

Helm (opt-in):

```bash
--set enablePrivacyFilter=true \
--set documentPipeline.privacyFilter.enabled=true
```

## Threat model

**In scope**

- Reduce blast radius of verbatim PII on MCP execute/ingest hops by masking on the operator network.
- Defense-in-depth: Privacy Filter may catch spans Presidio missed (different taxonomy / ML vs rules).
- Data residency: raw payload stays on operator hardware; model weights are downloaded to local cache (or offline checkpoint).

**Out of scope / non-guarantees**

- Not a legal anonymization or DLP suite.
- Not Stirling-PDF document-stage redaction (separate IDP hop).
- Demo mode is heuristic CI/smoke only — use `PRIVACY_FILTER_MODE=live` with evaluated weights for production intent.
- Failure policy `warn` (default) can return **unmasked** text if the sidecar is unreachable; use `block` to fail closed.
- Over-redaction can remove useful context; under-redaction can miss novel formats.

## Latency / memory envelope

| Mode     | Typical memory | Notes                                                       |
| -------- | -------------- | ----------------------------------------------------------- |
| demo     | &lt; 50 MiB    | Regex only; CI smoke                                        |
| live CPU | ~2–4 GiB+      | ~1.5B params / ~50M active MoE; first request loads weights |
| live GPU | VRAM-dependent | Set `PRIVACY_FILTER_DEVICE`                                 |

## Smoke

```bash
./deployment/samples/privacy-filter-http/smoke.sh
```

## Related

- [MCP clients — Presidio](https://docs.clawql.com/mcp-clients#presidio-redaction)
- [IDP matrix](../roadmap/idp-master-requirements-matrix.md)
- [Security index](README.md)
