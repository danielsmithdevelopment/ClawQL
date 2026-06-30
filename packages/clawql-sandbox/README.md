# clawql-sandbox

Isolated code execution for the **`sandbox_exec`** MCP tool ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)).

## Plugin entry

When **`CLAWQL_ENABLE_SANDBOX=1`**, **`SandboxPlugin`** (`createSandboxPlugin` from `clawql-sandbox/plugin`) registers `sandbox_exec` via `onRegister`. Composed from `buildMcpPlugins()` in `src/clawql-api-adapters.ts`.

## Backends (priority in `auto`)

| Backend                                  | When                                | Env                                                          |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| **Kata Containers** (default in-cluster) | Kubernetes Job + `runtimeClassName` | Unset `CLAWQL_SANDBOX_BACKEND` in-cluster → auto; pin `kata` |
| **Docker / Podman**                      | Local CLI `docker run`              | `docker`, `CLAWQL_SANDBOX_DOCKER_*`                          |
| **Cloudflare bridge**                    | Workers `@cloudflare/sandbox`       | `CLAWQL_SANDBOX_BRIDGE_URL` + token                          |
| **macOS Seatbelt**                       | Dev macOS only                      | `macos-seatbelt`                                             |

### Kata (recommended for production Kubernetes)

- **`CLAWQL_SANDBOX_BACKEND=kata`** or unset in-cluster (auto prefers Kata when RuntimeClass exists)
- **`CLAWQL_SANDBOX_KATA_RUNTIME_CLASS`** — default `kata-qemu` (match Helm `security.kata.runtimeClassName`)
- **`CLAWQL_SANDBOX_KATA_NAMESPACE`** — Job namespace (default: pod ServiceAccount namespace)
- **`CLAWQL_SANDBOX_KATA_SERVICE_ACCOUNT`** — optional Job pod ServiceAccount
- **`CLAWQL_SANDBOX_KATA_ENABLED=0`** — disable Kata probe (fall through to Docker/bridge)

Requires in-cluster RBAC to create Jobs, ConfigMaps, read Pod logs. See Helm `sandboxKata` and [runtime-class-containment.md](../../docs/security/runtime-class-containment.md).

## Roadmap

- PVC-backed session persistence for Kata Jobs
- Argo Workflows integration via `AutomationPlugin` (ADR 0004, #243)

See [`docs/reference/clawql-plugin-registry.md`](../../docs/reference/clawql-plugin-registry.md).
