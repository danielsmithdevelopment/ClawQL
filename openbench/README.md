# OpenBench × ClawQL

Adopt [OpenBench](https://github.com/minghinmatthewlam/openbench) to benchmark
ClawQL as a coding-agent harness layer (Track A) and to ship ClawQL-specific
tasks that exercise memory, token efficiency, and multi-provider API scaffolding
(Track B).

OpenBench answers: *same model, same task — how much does the harness matter?*
ClawQL answers: *how much does a governed MCP gateway (search/execute/memory)
change correctness, tokens, and turns?*

## Layout

```
openbench/
  adapters/clawql.py          # Python adapter (OpenBench contract)
  candidates/clawql-claude.toml
  tasks/                      # ClawQL-specific tasks (OpenBench directory contract)
    memory-dependent-continuation/
    token-budget-constrained/
    multi-provider-api-workflow/
    codegraph-feature-api-surface/   # B-3.1 Phase 1
    memory-conflict-pricing/         # B-4.1 Phase 1
    memory-stale-after-update/       # B-4.2 Phase 1
    memory-injection-attempt/        # B-4.3 Phase 1
  validate_tasks.py           # fail-on-workspace / pass-on-solution
  scripts/run-with-openbench.sh
  README.md
```

Advanced suites B-1…B-6 (specs + Phase 1 packs):
[`docs/benchmarks/openbench-advanced-specs.md`](../docs/benchmarks/openbench-advanced-specs.md).

## Prerequisites

1. ClawQL CLI on `PATH` (`npm i -g clawql-mcp` or repo `bin/clawql.mjs`).
2. **clawql-inference** with an inference key. **OpenRouter-first:** set
   `OPENROUTER_API_KEY` and use `openrouter/*` models (default CI path). Direct
   BYOK (`DEEPSEEK_API_KEY`, …) is optional when you have vendor keys.
3. OpenCode CLI for the coding-agent harness (`opencode`).
4. Optional: clone OpenBench for matrix runs against stock harnesses.

```bash
git clone https://github.com/minghinmatthewlam/openbench.git
```

## Track A — ClawQL as a harness

Headless launch through clawql-inference (OpenRouter-first):

```bash
# terminal 1
OPENROUTER_API_KEY=sk-or-… clawql inference serve --port 8080

# terminal 2
CLAWQL_OPENBENCH=1 clawql opencode --non-interactive \
  --model clawql/openrouter/deepseek/deepseek-chat \
  --inference-url http://127.0.0.1:8080/v1 \
  --task-file /path/to/instruction.md \
  --workdir /path/to/disposable/workspace \
  --timeout 300
```

Machine-readable summary lines:

```
CLAWQL_TOKENS: 12345
CLAWQL_TURNS: 8
CLAWQL_BENCH_JSON: {"completed":true,"tokens":12345,...}
```

Copy the adapter into an OpenBench tree:

```bash
cp openbench/adapters/clawql.py /path/to/openbench/obench/adapters/clawql.py
```

Then run (from the OpenBench repo):

```bash
CLAWQL_OPENBENCH_HARNESS=codex \
python -m bench.run --harness clawql --model gpt-5.5 --task build-a-cli --trials 3
```

Or use the BYO manifest without a Python adapter:

```bash
python -m bench.run --candidate /path/to/ClawQL/openbench/candidates/clawql-opencode-deepseek.toml ...
```

Prefer the Python adapter: it writes the instruction file, parses
`CLAWQL_BENCH_JSON`, and seeds/removes memory for memory-dependent tasks.

## Track B — ClawQL-specific tasks

| Task | What it measures |
|------|------------------|
| `memory-dependent-continuation` | Prior argon2id + 900s TTL decisions live only in vault memory after seed removal; raw harnesses that follow the misleading bcrypt comment fail. |
| `token-budget-constrained` | Correct YAML `parse_config` under a 5k-token budget; exploration-heavy agents overspend. |
| `multi-provider-api-workflow` | Offline Cloudflare Worker + GitHub releases scaffold; rewards structured API discovery over dumping specs. |

Validate checkers offline (no model, no network):

```bash
python3 openbench/validate_tasks.py
```

To contribute these upstream, copy `tasks/<name>/` into OpenBench's `tasks/`
(or a contributed tier) and follow their `CONTRIBUTING-TASKS.md`.

## Environment

| Variable | Purpose |
|----------|---------|
| `CLAWQL_OPENBENCH=1` | Allow unsandboxed harness on Linux CI; mark bench mode |
| `CLAWQL_HARNESS_ALLOW_UNSANDBOXED=1` | Same soft-fail for Seatbelt gate |
| `CLAWQL_OPENBENCH_HARNESS` | Underlying CLI (`opencode` for A/B) |
| `CLAWQL_INFERENCE_URL` / `OPENBENCH_INFERENCE_URL` | clawql-inference OpenAI-compat base |
| `OPENROUTER_API_KEY` (preferred start) | Aggregator key for default `openrouter/*` models |
| `DEEPSEEK_API_KEY` (etc.) | Direct BYOK when you skip OpenRouter |

## One-off GitHub Actions A/B

Manual workflow **OpenBench A/B (clawql on vs off)** — starts
**clawql-inference**, runs OpenCode on/off. Preferred secret:
`OPENROUTER_API_KEY` with default model `openrouter/deepseek/deepseek-chat`. See
[`docs/benchmarks/openbench-github-actions.md`](../docs/benchmarks/openbench-github-actions.md).

```bash
gh workflow run openbench-ab.yml \
  -f task=memory-dependent-continuation \
  -f model=openrouter/deepseek/deepseek-chat \
  -f trials=1
```

Local dry path (same script):

```bash
python3 openbench/scripts/run-ab-compare.py --help
```

## Related

- Planning-context token benchmarks (existing): [`docs/benchmarks/`](../docs/benchmarks/)
- Adoption narrative: [`docs/benchmarks/openbench.md`](../docs/benchmarks/openbench.md)
- Upstream OpenBench: https://github.com/minghinmatthewlam/openbench
- Announcement context: https://x.com/mattlam_/status/2079606933007352037
