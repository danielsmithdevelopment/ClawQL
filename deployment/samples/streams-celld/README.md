# Streams celld on Kubernetes — sample pack

Helm overlay: [`charts/clawql-mcp/values-streams-celld.example.yaml`](../../charts/clawql-mcp/values-streams-celld.example.yaml)

Worker skeleton: [`examples/streams-celld/`](../../examples/streams-celld/)

Learn walkthrough: [Streams getting started — Lab 5b](https://docs.clawql.com/learn/streams-getting-started#lab-5b--clawql-streams-wrangler-skeleton--bundle-check-30-min)

## Checklist

1. **Bucket credentials** — Kubernetes Secret with `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`. Scope to the celld fleet bucket only.
2. **Deploy Worker bundle** — from repo root:

   ```bash
   cd examples/streams-celld
   clawql streams celld deploy \
     --bucket "$CELLD_BUCKET" \
     --endpoint "$S3_ENDPOINT" \
     --region auto
   ```

3. **Helm install** — celld StatefulSet probes `/.well-known/celld/health` (v0.4.0+).

   ```bash
   helm upgrade --install clawql charts/clawql-mcp \
     -f charts/clawql-mcp/values-streams-celld.example.yaml \
     --set envFromSecret=clawql-provider-env \
     --set streams.celld.bucket="$CELLD_BUCKET" \
     --set streams.celld.endpoint="$S3_ENDPOINT" \
     -n clawql --create-namespace
   ```

4. **Smoke webhook** — port-forward the celld Service worker port and POST to the skeleton:

   ```bash
   kubectl -n clawql port-forward svc/clawql-mcp-celld 8080:8080
   curl -s -X POST http://127.0.0.1:8080/webhook/demo \
     -H 'content-type: application/json' \
     -H 'x-clawql-event-id: k8s-smoke-1' \
     -d '{"source":"helm-smoke"}' | jq .
   ```

5. **Diagnose fleet** — from a pod or local CLI with the same bucket env:

   ```bash
   clawql streams celld diagnose --bucket "$CELLD_BUCKET" --endpoint "$S3_ENDPOINT"
   kubectl -n clawql exec sts/clawql-mcp-celld-0 -- celld cell list --bucket "$CELLD_BUCKET"
   ```

## Upgrade note (v0.3 → v0.4)

Stop **every** v0.3.x celld node before starting v0.4.0 — no rolling update. See [celld v0.4.0 release](https://github.com/denoland/celld/releases/tag/v0.4.0).

## Related

- [celld integration spec](../../docs/streams/clawql-celld.md)
- [ClawQL Streams spec](../../docs/streams/clawql-streams.md)
- [Kubernetes & Helm docs](https://docs.clawql.com/deployment/kubernetes)
