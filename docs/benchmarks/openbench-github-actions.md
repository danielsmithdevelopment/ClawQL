# One-off / CI GitHub Actions A/B (clawql-on vs clawql-off)

Workflow: [`.github/workflows/openbench-ab.yml`](../../.github/workflows/openbench-ab.yml)

Spins up **clawql-inference**, runs the same model with and without ClawQL MCP
(via OpenCode), posts a Step Summary, uploads JSON, tears down.

**OpenRouter-first:** if you already have an OpenRouter key and do not yet have
per-provider Anthropic/OpenAI/DeepSeek keys, set **`OPENROUTER_API_KEY`** and
keep the default `openrouter/*` model. Direct BYOK remains fully supported when
you add vendor secrets later.

## When it runs

| Trigger                                               | Behavior                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **`workflow_dispatch`**                               | Manual knobs (task / model / trials / arms). **Fails** if no matching OpenRouter / BYOK secret                    |
| **`pull_request` / `push` to `main`** (path-filtered) | CI smoke with defaults. **Skips live A/B (exit 0)** when secrets are missing; always runs offline task validation |
| Main **CI** workflow                                  | Always runs `python3 openbench/validate_tasks.py` (offline checkers only)                                         |

Path filters include `openbench/**`, `packages/clawql-inference/**`, and the workflow/docs themselves.

## Prerequisites (live A/B)

1. Repository secret **`OPENROUTER_API_KEY`** (recommended start — default model
   is `openrouter/deepseek/deepseek-chat`), **or** a direct vendor BYOK secret
   (`DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, …)
   when you choose a non-`openrouter/*` model
2. Branch containing `openbench/` + `.github/workflows/openbench-ab.yml`

Fork PRs cannot read these secrets — live A/B is skipped; offline validation still runs.

## Architecture

```text
OpenCode (clawql-on | clawql-off)
        │  OpenAI-compatible
        ▼
clawql inference serve
        │
        ├── openrouter/*                      (OpenRouter-first — existing aggregator key)
        └── deepseek / groq / openai / …      (direct BYOK when you have vendor keys)
```

| Arm            | Difference                                                            |
| -------------- | --------------------------------------------------------------------- |
| **clawql-on**  | `clawql opencode --non-interactive` + ClawQL MCP + same inference URL |
| **clawql-off** | Raw OpenCode → same inference URL, isolated HOME, **no** ClawQL MCP   |

## How to run (manual)

1. Actions → **OpenBench A/B (clawql on vs off)** → **Run workflow**
2. Suggested first try (OpenRouter key only):

| Input    | Value                              |
| -------- | ---------------------------------- |
| `task`   | `memory-dependent-continuation`    |
| `model`  | `openrouter/deepseek/deepseek-chat` |
| `trials` | `1`                                |
| `arms`   | `clawql-on,clawql-off`             |

OpenRouter examples:

- `openrouter/deepseek/deepseek-chat`
- `openrouter/qwen/qwen3.6-plus`

Direct BYOK (when you have vendor keys):

- `deepseek/deepseek-chat`
- `clawql/cheap-chat` (alias → DeepSeek)
- `groq/llama-3.3-70b-versatile`
- `anthropic/claude-sonnet-4-6`

Via `gh`:

```bash
gh workflow run openbench-ab.yml \
  --ref main \
  -f task=memory-dependent-continuation \
  -f model=openrouter/deepseek/deepseek-chat \
  -f trials=1
```

## Local equivalent

```bash
export OPENROUTER_API_KEY=sk-or-…
npm ci && npm run build
npm install -g opencode-ai@latest   # or your OpenCode install path

# terminal 1 — inference gateway (OpenRouter and/or BYOK)
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
- Offline validate: [`openbench/validate_tasks.py`](../../openbench/validate_tasks.py) (`npm run openbench:validate`)
- Providers / catalog: `packages/clawql-inference` (BYOK builtins + `openrouter`)
