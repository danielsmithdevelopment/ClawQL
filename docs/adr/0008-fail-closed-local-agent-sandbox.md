# ADR 0008: Fail-closed local agent containment (`clawql sandbox`)

- Status: Accepted
- Date: 2026-07-11
- Related: [`clawql-sandbox`](../../packages/clawql-sandbox/), [Agent setup — local sandbox](../getting-started/agent-setup.md#local-agent-sandbox-macos-seatbelt), [Panguard ATR](../security/mcp-proxy-jwt-atr.md), [Module 11: Sandboxing](../security/security-best-practices-series/11-sandboxing-kata-gvisor-seatbelt.md)

## Context

AI coding agents spawn **subagents** with shell access. Mis-expanded variables (e.g. `$HOME` in a cleanup command) can delete entire user directories. Enterprise stacks already **fail closed** on policy (Panguard ATR). Developer laptops had no equivalent guardrail in the ClawQL toolchain.

`clawql-sandbox` already provided **`sandbox_exec`** (Kata, Docker, Seatbelt, bridge) for MCP-isolated snippets. It did not configure **full agent process containment** or verify filesystem boundaries before harness launch.

## Decision

### 1) `clawql sandbox init` — per-harness Seatbelt profiles + verification

- Writes `~/.ClawQL/sandbox/{claude,codex,cursor,opencode}.sb` with parameterized `(param "WORK_DIR")` rules
- Writes `~/.claude/settings.json` for Claude Code native `/sandbox` (inner layer)
- `clawql <harness>` invokes `sandbox-exec -f {harness}.sb -D WORK_DIR=…` (outer layer)
- Runs containment probes on macOS; **throws on failure** during init when verify runs

### 2) Fail-closed harness launch

When sandbox is **enabled** in config:

- `clawql codex | claude | cursor | opencode` calls `ensureHarnessSandboxGate(harness)`
- Uses **harness-specific** profile path
- Verification must pass; otherwise **exit 1** — agent never launches unsandboxed
- `clawql doctor --smoke` re-runs sandbox verify when enabled

### 3) Escalation tiers (documented, not mutually exclusive)

| Tier               | Target                           |
| ------------------ | -------------------------------- |
| macOS Seatbelt     | Local daily dev                  |
| `sandbox_exec` MCP | In-agent code snippets           |
| Kata (Helm)        | In-cluster production            |
| UTM VM             | Computer Use / maximum isolation |

### 4) Default path policy

- **Allowed:** `~/company-work/cloned-repos` + `~/.ClawQL` (vault/MCP home)
- **Denied:** `~/.ssh`, `~/Documents`, `~/Desktop`, `~/Downloads`, `~/.aws`, `~/.config`, `~/.gnupg`, `~/.kube`

Operators override with `clawql sandbox init --path <dir>`.

## Consequences

### Positive

- Subagent filesystem incidents contained to allowed repo roots
- Same fail-closed philosophy as enterprise Panguard — different deployment target
- One command onboarding: `clawql sandbox init`

### Trade-offs

- Full verify requires macOS (`sandbox-exec`); Linux CI writes config with `--skip-verify` semantics in CLI
- Seatbelt does not replace VM isolation for Computer Use — UTM path documented
- Tighter profiles may block legitimate tool paths until `allowedPaths` is extended

## Alternatives considered

- **Rely on Claude Code `/sandbox` only** — does not cover Codex/Cursor/OpenCode; no ClawQL verify gate
- **Fail open with warning** — rejected; matches the incident class we're preventing
- **Docker-only local sandbox** — heavier than Seatbelt for daily macOS dev
