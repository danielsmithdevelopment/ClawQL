# One-off GitHub Actions A/B (clawql-on vs clawql-off)

Manual workflow: spin up **clawql-inference → OpenRouter**, run the same model
with and without ClawQL MCP (via OpenCode), post a Step Summary, upload JSON,
tear down.

This is the preferred path: **any OpenRouter model**, routed through the
inference gateway you already built — not a single-vendor CLI lock-in.

## Prerequisites

1. Repository secret **`OPENROUTER_API_KEY`**
2. Branch containing `openbench/` + `.github/workflows/openbench-ab.yml`

## Architecture

```text
OpenCode (clawql-on | clawql-off)
        │  OpenAI-compatible
        ▼
clawql inference serve   (OPENROUTER_API_KEY)
        │
        ▼
OpenRouter  →  deepseek / qwen / llama / gpt / claude / …
```

| Arm            | Difference                                                            |
| -------------- | --------------------------------------------------------------------- |
| **clawql-on**  | `clawql opencode --non-interactive` + ClawQL MCP + same inference URL |
| **clawql-off** | Raw OpenCode → same inference URL, isolated HOME, **no** ClawQL MCP   |

## How to run

1. Actions → **OpenBench A/B (clawql on vs off)** → **Run workflow**
2. Suggested first try:

| Input    | Value                               |
| -------- | ----------------------------------- |
| `task`   | `memory-dependent-continuation`     |
| `model`  | `openrouter/deepseek/deepseek-chat` |
| `trials` | `1`                                 |
| `arms`   | `clawql-on,clawql-off`              |

Any OpenRouter catalog id works, e.g.:

- `openrouter/qwen/qwen3.6-plus`
- `openrouter/openai/gpt-4o-mini`
- `openrouter/meta-llama/llama-3.3-70b-instruct`
- `deepseek/deepseek-chat` (auto-prefixed to `openrouter/…`)

Via `gh`:

```bash
gh workflow run openbench-ab.yml \
  --ref cursor/openbench-clawql-benchmark-4ff0 \
  -f task=memory-dependent-continuation \
  -f model=openrouter/deepseek/deepseek-chat \
  -f trials=1
```

## Local equivalent

```bash
export OPENROUTER_API_KEY=sk-or-…
npm ci && npm run build
npm install -g opencode-ai@latest   # or your OpenCode install path

# terminal 1 — inference gateway
CLAWQL_INFERENCE_PROVIDERS=openrouter \
  node bin/clawql.mjs inference serve --port 8080

# terminal 2 — A/B
export CLAWQL_BIN="$PWD/bin/clawql.mjs"
python3 openbench/scripts/run-ab-compare.py \
  --task memory-dependent-continuation \
  --model openrouter/deepseek/deepseek-chat \
  --inference-url http://127.0.0.1:8080/v1 \
  --trials 1 \
  --out /tmp/ab-results.json \
  --summary-md /tmp/ab-summary.md
```

## Files

- Workflow: [`.github/workflows/openbench-ab.yml`](../../.github/workflows/openbench-ab.yml)
- Runner: [`openbench/scripts/run-ab-compare.py`](../../openbench/scripts/run-ab-compare.py)
- OpenRouter provider: `packages/clawql-inference` (`openrouter` builtin)
