# Local agent sandbox (macOS Seatbelt)

Contain **AI coding agents and subagents** to company repo paths only — fail-closed, never fail-open.

Recent incidents (e.g. subagent `rm -rf` expanding `$HOME` incorrectly) show why unrestricted agent shell on a laptop is unacceptable. ClawQL applies the same **Panguard ATR fail-closed** philosophy at the developer machine: if containment cannot be verified, the agent does not run.

## One-liner setup

```bash
curl -fsSL https://clawql.com/install | bash
clawql sandbox init
clawql sandbox verify   # macOS — must pass before harness launch when failClosed
```

## Quick start (team workflow)

### 1. Standard repo folder

```bash
mkdir -p ~/company-work/cloned-repos
cd ~/company-work/cloned-repos
git clone git@github.com:your-org/your-repo.git
```

Clone **company repos only** here — not personal projects, not `~/Documents`.

### 2. Initialize ClawQL sandbox

```bash
clawql sandbox init
# Or restrict to a specific path:
clawql sandbox init --path ~/company-work/cloned-repos
```

Writes:

| File                                | Purpose                                  |
| ----------------------------------- | ---------------------------------------- |
| `~/.ClawQL/sandbox/config.json`     | Allowed/denied paths, `failClosed: true` |
| `~/.ClawQL/sandbox/clawql-agent.sb` | Seatbelt profile for agent harness       |
| `~/.ClawQL/sandbox/clawql-exec.sb`  | Tighter profile for `sandbox_exec` MCP   |
| `~/.ClawQL/sandbox/clawql-safe`     | Manual wrapper script                    |

Default **denied** paths: `~/.ssh`, `~/Documents`, `~/Desktop`, `~/Downloads`, `~/.aws`, `~/.config`, `~/.gnupg`, `~/.kube`.

### 3. Verify containment (macOS)

```bash
clawql sandbox verify
```

Probes run under `sandbox-exec`:

- Cannot read denied paths (e.g. `~/.ssh`)
- Can read allowed repo roots
- Cannot write outside allowed paths

**If verification fails, `clawql codex` / `clawql claude` refuse to launch** (fail-closed).

### 4. Launch agents inside the sandbox

```bash
clawql codex          # Codex + ClawQL MCP, wrapped in Seatbelt when configured
clawql claude         # Claude Code harness
```

Or manually:

```bash
~/.ClawQL/sandbox/clawql-safe codex
```

## Escalation path

| Level                    | Use when                        | Tool                                                |
| ------------------------ | ------------------------------- | --------------------------------------------------- |
| **1 — Seatbelt**         | Daily coding on macOS           | `clawql sandbox init` (this guide)                  |
| **2 — MCP sandbox_exec** | Isolated snippets from agents   | `CLAWQL_ENABLE_SANDBOX=1`, `macos-seatbelt` backend |
| **3 — Kata Containers**  | Enterprise K8s / production MCP | Helm `sandboxKata`                                  |
| **4 — UTM VM**           | Computer Use, max isolation     | Share only `~/company-work/cloned-repos` into VM    |

Same architecture as [Module 11: Sandboxing](../security/security-best-practices-series/11-sandboxing-kata-gvisor-seatbelt.md) — lighter options first, VM when risk demands it.

## Claude Code built-in sandbox

Claude Code `/sandbox` is complementary. Teams can also set:

```json
{
  "sandbox": {
    "enabled": true,
    "allowedPaths": ["~/company-work/cloned-repos"],
    "deniedPaths": ["~/.ssh", "~/Documents"]
  }
}
```

ClawQL's `clawql sandbox init` is harness-agnostic — it protects **Codex, Claude, Cursor, and OpenCode** launches via `clawql <harness>`.

## Commands

```bash
clawql sandbox init [--path DIR] [--skip-verify]
clawql sandbox verify
clawql sandbox status
```

## Related

- [Sandbox plugin](../plugins/sandbox.md)
- [ADR 0008: Fail-closed local agent containment](../adr/0008-fail-closed-local-agent-sandbox.md)
- [Panguard ATR (enterprise)](../security/mcp-proxy-jwt-atr.md)
