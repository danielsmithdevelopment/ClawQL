# clawql-operator

Opt-in Kubernetes operator scaffold for ClawQL ([#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)).

Phase 1 validates `ClawQLInstance` specs and publishes tier-spec ConfigMaps. It does **not** replace `charts/clawql-mcp` or env-based `CLAWQL_ENABLE_*` flags.

See [clawql-operator-helm.md](../../docs/deployment/clawql-operator-helm.md).
