.PHONY: deploy-cloud-run deploy-k8s local-k8s-up local-docker-up

# Docker Desktop Kubernetes: build image + kubectl apply -k docker/kustomize/overlays/local
local-k8s-up:
	@bash scripts/local-k8s-docker-desktop.sh

# Docker Compose: MCP :8080 + GraphQL :4000, restart unless-stopped
local-docker-up:
	@docker compose -f docker/docker-compose.yml up -d --build

deploy-cloud-run:
	@if [ -z "$$PROJECT_ID" ]; then echo "PROJECT_ID is required"; echo "Example: PROJECT_ID=my-proj REGION=us-central1 make deploy-cloud-run"; exit 1; fi
	@REGION="$${REGION:-us-central1}" bash scripts/deploy-cloud-run.sh

deploy-k8s:
	@if [ -z "$$IMAGE" ] || [ -z "$$TAG" ]; then echo "IMAGE and TAG are required"; echo "Example: ENV=dev IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp TAG=abc123 make deploy-k8s"; exit 1; fi
	@ENV="$${ENV:-dev}" DRY_RUN="$${DRY_RUN:-false}" IMAGE="$$IMAGE" TAG="$$TAG" bash scripts/deploy-k8s.sh
