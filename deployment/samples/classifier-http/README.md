# Reference classifier HTTP service ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248))

Minimal **heuristic** classifier for local IDP demos. **Do not** use in production — train and deploy your tenant model per [`docs/runbooks/fine-tuned-classifier.md`](../../docs/runbooks/fine-tuned-classifier.md).

## API

| Method | Path | Body | Response |
| ------ | ---- | ---- | -------- |
| `GET` | `/health` | — | `{ "ok": true, "model_version": "…" }` |
| `POST` | `/classify` | `{ "docling_md"?, "docling_json"?, "text"?, "doc_id"?, "min_confidence"? }` | `{ "label", "confidence", "model_version", "needs_hitl" }` |

## Run locally

```bash
node deployment/samples/classifier-http/server.mjs
curl -s http://localhost:8080/health
curl -s -X POST http://localhost:8080/classify \
  -H 'content-type: application/json' \
  -d '{"docling_md":"# Form W-2 Wage and Tax Statement"}'
```

## Wire to ClawQL MCP

```bash
CLAWQL_ENABLE_IDP_CLASSIFIER=1
CLASSIFIER_BASE_URL=http://localhost:8080
CLASSIFIER_MIN_CONFIDENCE=0.85
```

Then call MCP **`classify_document`** with Docling markdown or plain text.

## Docker

```bash
docker build -t clawql-classifier-reference deployment/samples/classifier-http
docker run --rm -p 8080:8080 clawql-classifier-reference
```

## Compose stack

See [`docker/compose/docling-classifier.compose.yml`](../../docker/compose/docling-classifier.compose.yml) for Docling + classifier side-by-side.

## License

Apache-2.0 (same as ClawQL). **Model weights are not shipped** — only this reference server.
