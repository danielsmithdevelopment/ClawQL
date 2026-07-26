# OpenBench A/B failure root cause (2026-07-26)

Live run: [Actions #30182389422](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30182389422)
(`memory-dependent-continuation`, `openrouter/deepseek/deepseek-chat`, 1 trial).

## What the checker said

Both arms scored **0.333** (import succeeded; argon2id + 900s TTL failed):

```text
FAIL: expected argon2id hashing
FAIL: expected 900s reset TTL behavior
SCORE: 0.3333333333333333
```

Workspace seed leaves misleading `bcrypt` / `3600` placeholders in `src/auth.py`.
The correct answers live only in vault memory after the seed file is removed.

## Root cause (clawql-on)

`clawql opencode --non-interactive` set `OPENCODE_CONFIG_CONTENT` to a
**provider-only** JSON block. OpenCode treats that env as the full config, so the
MCP server written to `~/.config/opencode/opencode.json` was never loaded.

Without ClawQL MCP, **clawql-on could not call `memory_recall`** on the seeded
temp vault — so it behaved like clawql-off and followed the bcrypt comment.

Secondary gaps:

- Seeded vault path was set as `CLAWQL_OBSIDIAN_VAULT_PATH` for the harness
  process, but MCP child env (when present) only passed `CLAWQL_HOME`.
- Agents stopped after ~1 turn without editing toward argon2id/900s.

## Fix

1. Embed **provider + MCP** in `OPENCODE_CONFIG_CONTENT` (`buildOpencodeConfigContent`).
2. Pass `CLAWQL_HOME` / `CLAWQL_OBSIDIAN_VAULT_PATH` / `CLAWQL_ENABLE_MEMORY` into
   the MCP child; prefer workspace `bin/clawql-mcp.mjs` in CI.
3. `run-ab-compare.py` sets `CLAWQL_HOME` to the seeded vault and no longer
   overrides `OPENCODE_CONFIG_CONTENT` with a provider-only JSON.
4. Instruction requires an explicit `memory_recall` before edits.

## Follow-up (this change set)

- Default CI model → cheap `openrouter/google/gemini-2.5-flash-lite`.
- PR/push matrix runs all three OpenBench tasks when secrets are present.
