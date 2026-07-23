# One-off GitHub Actions A/B (clawql-on vs clawql-off)

Use a **manual** workflow to spin up an ephemeral runner, compare the same
**OpenAI Codex** model with and without ClawQL, post a Step Summary, upload
JSON, then tear down.

Anthropic / Claude Code are **not** used on this path.

## Prerequisites

1. Repository secret **`OPENAI_API_KEY`** (Settings → Secrets and variables → Actions).
2. This branch (or `main` once merged) containing `openbench/` and the workflow file.

No self-hosted runners, OpenBench clone, or long-lived infra — the job is
`ubuntu-latest` and exits when finished.

## How to run

1. GitHub → **Actions** → **OpenBench A/B (clawql on vs off)**
2. **Run workflow**
3. Pick inputs:

| Input | Suggested first try |
|-------|---------------------|
| `task` | `memory-dependent-continuation` |
| `model` | `gpt-5.5` |
| `trials` | `1` |
| `timeout_s` | `300` |
| `arms` | `clawql-on,clawql-off` |

4. Wait for the run to finish. Open **Summary** for the table.
5. Download artifact `openbench-ab-<task>-<run_id>` for `results.json`.

CLI equivalent (same script the workflow calls):

```bash
export OPENAI_API_KEY=…
npm ci && npm run build
npm install -g @openai/codex@latest
export CLAWQL_BIN="$PWD/bin/clawql.mjs"
export CLAWQL_OPENBENCH=1 CLAWQL_HARNESS_ALLOW_UNSANDBOXED=1

python3 openbench/scripts/run-ab-compare.py \
  --task memory-dependent-continuation \
  --model gpt-5.5 \
  --trials 1 \
  --timeout 300 \
  --out /tmp/ab-results.json \
  --summary-md /tmp/ab-summary.md
```

Via `gh`:

```bash
gh workflow run openbench-ab.yml \
  -f task=memory-dependent-continuation \
  -f model=gpt-5.5 \
  -f trials=1 \
  -f timeout_s=300 \
  -f arms=clawql-on,clawql-off

gh run watch
```

## What each arm does

| Arm | Agent | Memory seed |
|-----|-------|-------------|
| **clawql-on** | `clawql codex --non-interactive` (MCP pre-wired) | Seeded into a temp Obsidian vault, then **removed** from the workspace |
| **clawql-off** | Raw `codex exec --json` | Seed removed; isolated `CODEX_HOME` — **no** ClawQL MCP |

The checker (not the harness) grades success. Ephemeral workdirs are deleted
unless `CLAWQL_AB_KEEP_WORKDIR=1`.

## Cost / safety notes

- Each trial × arm spends real OpenAI tokens. Start with **1 trial**.
- The workflow is **manual only** (no `push` / `schedule` trigger).
- Job timeout is 120 minutes; per-cell timeout defaults to 300s.
- Artifact retention is 14 days, then GitHub deletes it.

## Files

- Workflow: [`.github/workflows/openbench-ab.yml`](../../.github/workflows/openbench-ab.yml)
- Runner: [`openbench/scripts/run-ab-compare.py`](../../openbench/scripts/run-ab-compare.py)
- Pack overview: [`openbench/README.md`](../../openbench/README.md)
