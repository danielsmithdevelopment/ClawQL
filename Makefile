.PHONY: deploy-cloud-run deploy-k8s deploy-docs local-k8s-up bootstrap-vault-eso local-k8s-mcp-delete local-docker-up helm-lint helm-ui-template-tests helm-workflow-template-tests helm-argocd-template-tests kustomize-local-lint lint-k8s-manifests smoke-grpcurl-istio-gateway-mcp smoke-mcp-http-istio-gateway smoke-localhost-uis verify-vault-policy verify-mcp-core-tools-local

# Validate charts/clawql-mcp (requires helm on PATH)
helm-lint:
	@helm lint charts/clawql-mcp -f charts/clawql-mcp/values-lint.yaml
	@helm lint charts/clawql-falco
	@helm template test charts/clawql-falco --namespace monitoring >/dev/null
	@helm template test charts/clawql-mcp --namespace clawql --set envFromSecret=clawql-lint-provider-env >/dev/null
	@helm template test charts/clawql-mcp --namespace clawql \
		-f charts/clawql-mcp/values-docker-desktop.yaml \
		--set envFromSecret=clawql-lint-provider-env >/dev/null
	@helm template test charts/clawql-mcp --namespace clawql \
		--set documentPipeline.enabled=true \
		--set stores.postgres.enabled=true \
		--set stores.dragonfly.enabled=true \
		--set stores.postgres.auth.password=devpass \
		--set envFromSecret=clawql-lint-provider-env >/dev/null
	@helm template test charts/clawql-mcp --namespace clawql \
		--set kyverno.imageSignaturePolicy.enabled=false \
		--set envFromSecret=clawql-lint-provider-env >/dev/null
	@helm template test charts/clawql-mcp --namespace clawql \
		-f charts/clawql-mcp/values-mcp-proxy-panguard-bridge.example.yaml \
		--set kyverno.imageSignaturePolicy.enabled=false \
		--set envFromSecret=clawql-lint-provider-env >/dev/null
	@helm template test charts/clawql-mcp --namespace clawql \
		-f charts/clawql-mcp/test-values-mcp-proxy-custom.yaml \
		--set kyverno.imageSignaturePolicy.enabled=false \
		--set envFromSecret=clawql-lint-provider-env >/dev/null
	@helm template test charts/clawql-mcp --namespace clawql \
		--set openclaw.enabled=true \
		--set dashboard.enabled=true \
		--set-string openclaw.gatewayToken=helm-lint-test-token \
		--set kyverno.imageSignaturePolicy.enabled=false \
		--set envFromSecret=clawql-lint-provider-env >/dev/null
	@helm template test charts/clawql-mcp --namespace clawql \
		--set goose.enabled=true \
		--set goose.replicaCount=1 \
		--set-string goose.openaiApiKey=helm-lint-test \
		--set kyverno.imageSignaturePolicy.enabled=false \
		--set envFromSecret=clawql-lint-provider-env >/dev/null
	@echo "helm-lint OK"

# After applying docs/deployment/vault-istio-authorizationpolicy*.yaml to a live cluster
verify-vault-policy:
	@bash scripts/kubernetes/verify-vault-policy.sh

# Validate docker/kustomize/overlays/local (requires kubectl; temporary patch for hostPath)
kustomize-local-lint:
	@export VAULT_HOST_PATH=/tmp/clawql-kustomize-test && \
		python3 -c 'import json,os; p=os.environ["VAULT_HOST_PATH"]; print(json.dumps([{"op":"replace","path":"/spec/template/spec/volumes/0","value":{"name":"obsidian-vault","hostPath":{"path":p,"type":"DirectoryOrCreate"}}}]))' \
		> docker/kustomize/overlays/local/patch-mcp-vault-hostpath.json
	@kubectl kustomize docker/kustomize/overlays/local >/dev/null
	@rm -f docker/kustomize/overlays/local/patch-mcp-vault-hostpath.json
	@echo "kustomize-local-lint OK"

helm-ui-template-tests:
	@bash scripts/kubernetes/test-helm-ui-templates.sh

helm-workflow-template-tests:
	@bash scripts/kubernetes/test-helm-workflow-templates.sh

helm-argocd-template-tests:
	@bash scripts/kubernetes/test-helm-argocd-templates.sh

helm-nats-keda-template-tests:
	@bash scripts/kubernetes/test-helm-nats-keda-templates.sh

lint-k8s-manifests: helm-lint helm-ui-template-tests helm-workflow-template-tests helm-argocd-template-tests helm-nats-keda-template-tests kustomize-local-lint

# Local desktop k8s: default Helm + Istio ambient + Gateway/VS + heavy observability; CLAWQL_LOCAL_K8S_ISTIO=0 skips mesh
local-k8s-up:
	@bash scripts/kubernetes/local-k8s-docker-desktop.sh

# Verify ClawQL GHCR container packages are **public** via **GET** (read:packages; GitHub exposes no visibility PATCH API)
ghcr-packages-public:
	@bash scripts/github/set-clawql-ghcr-packages-public.sh

# After local-k8s-up: install External Secrets (if needed), bootstrap dev Vault policy/auth/KV, apply ESO manifests
bootstrap-vault-eso:
	@bash scripts/kubernetes/bootstrap-local-vault-and-eso.sh

# After local-k8s-up with Istio + gateway: grpcurl grpc.health.v1.Health/Check on localhost:50051
smoke-grpcurl-istio-gateway-mcp:
	@bash scripts/kubernetes/smoke-grpcurl-istio-gateway-mcp.sh

# Streamable HTTP POST /mcp initialize via Istio :80 (matches Cursor; default URL 127.0.0.1)
smoke-mcp-http-istio-gateway:
	@bash scripts/kubernetes/smoke-mcp-http-istio-gateway.sh

# After local-k8s-up: assert tools/list includes ClawQL Core audit+cache (catches stale :latest digest — rollout restart MCP)
verify-mcp-core-tools-local:
	@npx tsx scripts/dev/verify-mcp-streamable-core-tools.ts

# Localhost ingress UI smoke checks (docs, mcp, flink, onyx, paperless, tika, gotenberg, nats)
smoke-localhost-uis:
	@bash scripts/kubernetes/smoke-localhost-uis.sh

# Remove MCP deployment+Service (e.g. before Helm after kubectl apply / Kustomize)
local-k8s-mcp-delete:
	@bash scripts/kubernetes/local-k8s-mcp-delete.sh

# Docker Compose: MCP :8080 + GraphQL :4000, restart unless-stopped
local-docker-up:
	@docker compose -f docker/docker-compose.yml up -d --build

# Optional exports for MCP-only features (memory / sandbox): CLAWQL_OBSIDIAN_VAULT_PATH,
# CLAWQL_SANDBOX_BRIDGE_URL, CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN — see docs/deployment/deploy-cloud-run.md
deploy-cloud-run:
	@if [ -z "$$PROJECT_ID" ]; then echo "PROJECT_ID is required"; echo "Example: PROJECT_ID=my-proj REGION=us-central1 make deploy-cloud-run"; exit 1; fi
	@REGION="$${REGION:-us-central1}" bash scripts/deploy/deploy-cloud-run.sh

deploy-k8s:
	@if [ -z "$$IMAGE" ] || [ -z "$$TAG" ]; then echo "IMAGE and TAG are required"; echo "Example: ENV=dev IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp TAG=abc123 make deploy-k8s"; exit 1; fi
	@ENV="$${ENV:-dev}" DRY_RUN="$${DRY_RUN:-false}" IMAGE="$$IMAGE" TAG="$$TAG" bash scripts/deploy/deploy-k8s.sh

# Docs site (website/) → Cloudflare Worker clawql-docs, docs.clawql.com — requires jq and
# CLAWQL_CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_TOKEN. Loads ./.env when present (same pattern as local dev).
deploy-docs:
	@bash -c 'set -a; [ -f .env ] && . ./.env; set +a; exec bash scripts/deploy/deploy-docs-to-cloudflare.sh'
