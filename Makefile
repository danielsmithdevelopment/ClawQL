.PHONY: deploy-cloud-run deploy-k8s local-k8s-up local-k8s-mcp-delete local-docker-up helm-lint kustomize-local-lint lint-k8s-manifests

# Validate charts/clawql-mcp (requires helm on PATH)
helm-lint:
	@helm lint charts/clawql-mcp
	@helm template test charts/clawql-mcp --namespace clawql >/dev/null
	@helm template test charts/clawql-mcp --namespace clawql \
		-f charts/clawql-mcp/values-docker-desktop.yaml \
		--set-string vault.hostPath.path=/tmp/clawql-helm-test >/dev/null
	@echo "helm-lint OK"

# Validate docker/kustomize/overlays/local (requires kubectl; temporary patch for hostPath)
kustomize-local-lint:
	@export VAULT_HOST_PATH=/tmp/clawql-kustomize-test && \
		python3 -c 'import json,os; p=os.environ["VAULT_HOST_PATH"]; print(json.dumps([{"op":"replace","path":"/spec/template/spec/volumes/0","value":{"name":"obsidian-vault","hostPath":{"path":p,"type":"DirectoryOrCreate"}}}]))' \
		> docker/kustomize/overlays/local/patch-mcp-vault-hostpath.json
	@kubectl kustomize docker/kustomize/overlays/local >/dev/null
	@rm -f docker/kustomize/overlays/local/patch-mcp-vault-hostpath.json
	@echo "kustomize-local-lint OK"

lint-k8s-manifests: helm-lint kustomize-local-lint

# Docker Desktop Kubernetes: default Helm; optional CLAWQL_LOCAL_K8S_INSTALLER=kustomize
local-k8s-up:
	@bash scripts/local-k8s-docker-desktop.sh

# Remove MCP deployment+Service (e.g. before Helm after kubectl apply / Kustomize)
local-k8s-mcp-delete:
	@bash scripts/local-k8s-mcp-delete.sh

# Docker Compose: MCP :8080 + GraphQL :4000, restart unless-stopped
local-docker-up:
	@docker compose -f docker/docker-compose.yml up -d --build

# Optional exports for MCP-only features (memory / sandbox): CLAWQL_OBSIDIAN_VAULT_PATH,
# CLAWQL_SANDBOX_BRIDGE_URL, CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN — see docs/deploy-cloud-run.md
deploy-cloud-run:
	@if [ -z "$$PROJECT_ID" ]; then echo "PROJECT_ID is required"; echo "Example: PROJECT_ID=my-proj REGION=us-central1 make deploy-cloud-run"; exit 1; fi
	@REGION="$${REGION:-us-central1}" bash scripts/deploy-cloud-run.sh

deploy-k8s:
	@if [ -z "$$IMAGE" ] || [ -z "$$TAG" ]; then echo "IMAGE and TAG are required"; echo "Example: ENV=dev IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp TAG=abc123 make deploy-k8s"; exit 1; fi
	@ENV="$${ENV:-dev}" DRY_RUN="$${DRY_RUN:-false}" IMAGE="$$IMAGE" TAG="$$TAG" bash scripts/deploy-k8s.sh
