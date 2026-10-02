# clawql-sandbox

Isolated code execution for the **`sandbox_exec`** MCP tool ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)) and **local agent containment** via `clawql sandbox init`.

## Local agent containment (CLI)

```bash
clawql sandbox init      # Seatbelt profiles + clawql-safe wrapper
clawql sandbox verify    # containment probes (macOS)
clawql codex             # fail-closed harness launch when enabled
```

Programmatic API: `import { runSandboxInit, ensureHarnessSandboxGate } from "clawql-sandbox/init"`.

See [Agent setup — local sandbox](../../docs/getting-started/agent-setup.md#local-agent-sandbox-macos-seatbelt).

## Plugin entry

When **`CLAWQL_ENABLE_SANDBOX=1`**, **`SandboxPlugin`** (`createSandboxPlugin` from `clawql-sandbox/plugin`) registers `sandbox_exec` via `onRegister`. Composed from `buildMcpPlugins()` in `src/composition/clawql-api-adapters.ts`.

## Backends (priority in `auto`)

| Backend                                 | When                                           | Env                                                        |
| --------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| **Agent Substrate** (primary, ADR 0011) | Cloud Hypervisor microVM or gVisor             | `CLAWQL_SANDBOX_AGENT_SUBSTRATE_*` / pin `agent-substrate` |
| **Kata Containers**                     | Kubernetes Job + `runtimeClassName` (fallback) | `CLAWQL_SANDBOX_KATA_*` / pin `kata`                       |
| **Docker / Podman**                     | Local CLI `docker run`                         | `docker`, `CLAWQL_SANDBOX_DOCKER_*`                        |
| **Cloudflare bridge**                   | Workers `@cloudflare/sandbox`                  | `CLAWQL_SANDBOX_BRIDGE_URL` + token                        |
| **macOS Seatbelt**                      | Dev macOS only                                 | `macos-seatbelt`                                           |

### Agent Substrate (recommended for untrusted / arbitrary code)

See [ADR 0011](../../docs/adr/0011-isolation-agent-substrate-sandbox-celld.md).

- **`CLAWQL_SANDBOX_BACKEND=agent-substrate`** (or aliases `substrate`, `gvisor`, `cloud-hypervisor`)
- **`CLAWQL_SANDBOX_AGENT_SUBSTRATE_ENABLED=1`** — include in auto cascade (mock mode without URL)
- **`CLAWQL_SANDBOX_AGENT_SUBSTRATE_RUNTIME`** — `cloud-hypervisor` (default) or `gvisor`
- **`CLAWQL_SANDBOX_AGENT_SUBSTRATE_URL`** + **`CLAWQL_SANDBOX_AGENT_SUBSTRATE_API_TOKEN`** — live control plane
- **`CLAWQL_SANDBOX_AGENT_SUBSTRATE_MODE`** — `mock` \| `live`
- **`CLAWQL_SANDBOX_AGENT_SUBSTRATE_ALLOW_PRODUCTION=1`** — required for customer-facing production after allowlist GA reconfirmation (§5)

**Not for celld cells.** Fixed-shape orchestration stays on celld V8 isolates (same ADR).

### Kata (fallback for production Kubernetes)

- **`CLAWQL_SANDBOX_BACKEND=kata`** or auto when Agent Substrate is not configured and RuntimeClass exists
- **`CLAWQL_SANDBOX_KATA_RUNTIME_CLASS`** — default `kata-qemu` (match Helm `security.kata.runtimeClassName`)
- **`CLAWQL_SANDBOX_KATA_NAMESPACE`** — Job namespace (default: pod ServiceAccount namespace)
- **`CLAWQL_SANDBOX_KATA_SERVICE_ACCOUNT`** — optional Job pod ServiceAccount
- **`CLAWQL_SANDBOX_KATA_ENABLED=0`** — disable Kata probe (fall through to Docker/bridge)

Requires in-cluster RBAC to create Jobs, ConfigMaps, read Pod logs. See Helm `sandboxKata` and [runtime-class-containment.md](../../docs/security/runtime-class-containment.md).

## Roadmap

- PVC-backed session persistence for Kata Jobs
- Argo Workflows integration via `AutomationPlugin` (ADR 0004, #243)

See [`docs/reference/clawql-plugin-registry.md`](../../docs/reference/clawql-plugin-registry.md).
