#!/usr/bin/env bash
# CI + local: unit tests and TypeScript build for infra/pulumi (no cloud credentials).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PULUMI_DIR="${ROOT}/infra/pulumi"

cd "${PULUMI_DIR}"

echo "==> Install infra/pulumi dependencies"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "==> Pulumi provision unit tests"
npm test

echo "==> Pulumi provision TypeScript build"
npm run build

echo "==> pulumi provision checks passed"
