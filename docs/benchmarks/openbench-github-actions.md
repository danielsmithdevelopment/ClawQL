# One-off GitHub Actions A/B (clawql-on vs clawql-off)

Manual workflow: spin up **clawql-inference** with **direct BYOK** providers
(DeepSeek, Groq, …), run the same model with and without ClawQL MCP (via
OpenCode), post a Step Summary, upload JSON, tear down.

OpenRouter remains an **optional escape hatch** (`openrouter/*` +
`OPENROUTER_API_KEY`) — not required to benchmark ClawQL.

## Prerequisites

1. Repository secret **`DEEPSEEK_API_KEY`** (preferred for the default model),
   **or** another vendor BYOK secret (`GROQ_API_KEY`, `OPENAI_API_KEY`, …)
2. Optional: **`OPENROUTER_API_KEY`** only when you choose an `openrouter/*` model
3. Branch containing `openbench/` + `.github/workflows/openbench-ab.yml`

## Architecture

```text
OpenCode (clawql-on | clawql-off)
        │  OpenAI-compatible
        ▼
clawql inference serve
        │
        ├── deepseek / groq / fireworks / …   (direct BYOK — default)
        └── openrouter/*                      (optional escape hatch)
```

| Arm            | Difference                                                            |
| -------------- | --------------------------------------------------------------------- |
| **clawql-on**  | `clawql opencode --non-interactive` + ClawQL MCP + same inference URL |
| **clawql-off** | Raw OpenCode → same inference URL, isolated HOME, **no** ClawQL MCP   |

## How to run

1. Actions → **OpenBench A/B (clawql on vs off)** → **Run workflow**
2. Suggested first try:

| Input    | Value                           |
| -------- | ------------------------------- |
| `task`   | `memory-dependent-continuation` |
| `model`  | `deepseek/deepseek-chat`        |
| `trials` | `1`                             |
| `arms`   | `clawql-on,clawql-off`          |

Direct BYOK examples:

- `deepseek/deepseek-chat`
- `clawql/cheap-chat` (alias → DeepSeek)
- `groq/llama-3.3-70b-versatile`

Optional OpenRouter escape hatch:

- `openrouter/qwen/qwen3.6-plus`
- `openrouter/deepseek/deepseek-chat`

Via `gh`:

```bash
gh workflow run openbench-ab.yml \
  --ref cursor/openbench-clawql-benchmark-4ff0 \
  -f task=memory-dependent-continuation \
  -f model=deepseek/deepseek-chat \
  -f trials=1
```

## Local equivalent

```bash
export DEEPSEEK_API_KEY=sk-…
npm ci && npm run build
npm install -g opencode-ai@latest   # or your OpenCode install path

# terminal 1 — inference gateway (all BYOK builtins; OpenRouter optional)
node bin/clawql.mjs inference serve --port 8080

# terminal 2 — A/B
export CLAWQL_BIN="$PWD/bin/clawql.mjs"
python3 openbench/scripts/run-ab-compare.py \
  --task memory-dependent-continuation \
  --model deepseek/deepseek-chat \
  --inference-url http://127.0.0.1:8080/v1 \
  --trials 1 \
  --out /tmp/ab-results.json \
  --summary-md /tmp/ab-summary.md
```

## Files

- Workflow: [`.github/workflows/openbench-ab.yml`](../../.github/workflows/openbench-ab.yml)
- Runner: [`openbench/scripts/run-ab-compare.py`](../../openbench/scripts/run-ab-compare.py)
- Providers / catalog: `packages/clawql-inference` (BYOK builtins + optional `openrouter`)
