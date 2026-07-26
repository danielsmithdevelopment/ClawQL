# OpenBench A/B failure root cause (2026-07)

## Timeline

| Run                                                                                      | Model                                     | Symptom                                                |
| ---------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| [30182389422](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30182389422) | `openrouter/deepseek/deepseek-chat`       | memory task both arms **0.333**                        |
| [30186357429](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30186357429) | `openrouter/google/gemini-2.5-flash-lite` | **all three** tasks: 1 turn, no edits (matrix widened) |

## Layer 1 — MCP wiped by `OPENCODE_CONFIG_CONTENT` (fixed)

`clawql opencode --non-interactive` set `OPENCODE_CONFIG_CONTENT` to a
**provider-only** JSON block. OpenCode treats that env as the full config, so the
MCP server written to `~/.config/opencode/opencode.json` was never loaded.

Without ClawQL MCP, **clawql-on could not call `memory_recall`** on the seeded
temp vault — so it behaved like clawql-off and followed the bcrypt comment.

Fix: embed **provider + MCP + `permission: { "*": "allow" }`** in
`OPENCODE_CONFIG_CONTENT` (`buildOpencodeConfigContent`), pass vault env into the
MCP child, prefer workspace `bin/clawql-mcp.mjs`.

## Layer 2 — clawql-inference stripped tool calling (this fix)

After layer 1, CI still failed on **every** task with:

- `turns: 1`, `exit_code: 0`, checker fail
- clawql-on ~20–28s (MCP startup), clawql-off ~3–5s
- OpenCode JSONL for clawql-off showed the model emitting **fake** tool syntax in
  text, then `reason: "stop"` — e.g. a fenced JSON array with
  `tool_code: memory_recall(...)` instead of a real `tool_calls` response.

Root cause: `POST /v1/chat/completions` in clawql-inference:

1. Dropped `tools` / `tool_choice` / `tool_calls` / `role: tool` messages
2. Always returned `finish_reason: "stop"` with text-only `content`
3. Streaming path parsed only `delta.content`, discarding `delta.tool_calls`

OpenCode (via `@ai-sdk/openai-compatible`) sends real edit/bash/MCP tools on every
agent turn. Without passthrough, cheap models invent `tool_code` JSON and stop —
so **both arms** fail equally on memory, token-budget, and multi-provider tasks.

### Fix

When a request uses tool calling, OpenAI-compatible providers **passthrough** the
raw body to upstream (OpenRouter / BYOK) and return upstream JSON or SSE
unchanged (with public `model` rewritten). Text-only requests keep the existing
gateway path (cache / efficiency layers).

## CI matrix (widened)

PR/push OpenBench runs **all three** tasks with the cheap default
`openrouter/google/gemini-2.5-flash-lite` when `OPENROUTER_API_KEY` is set:

- `memory-dependent-continuation`
- `token-budget-constrained`
- `multi-provider-api-workflow`

Artifacts include `agent-logs/trial-*-{arm}.log` for post-mortem.
