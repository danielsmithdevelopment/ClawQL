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
  validate_tasks.py           # fail-on-workspace / pass-on-solution
  scripts/run-with-openbench.sh
  README.md
```

## Prerequisites

1. ClawQL CLI on `PATH` (`npm i -g clawql-mcp` or repo `bin/clawql.mjs`).
2. An underlying agent CLI (`claude`, `codex`, or `opencode`) with credentials.
3. Optional: clone OpenBench for matrix runs against stock harnesses.

```bash
git clone https://github.com/minghinmatthewlam/openbench.git
```

## Track A — ClawQL as a harness

Headless launch (Seatbelt soft-fail allowed via `CLAWQL_OPENBENCH=1`):

```bash
CLAWQL_OPENBENCH=1 clawql claude --non-interactive \
  --model claude-opus-4-8 \
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
python -m bench.run --harness clawql --model claude-opus-4-8 --task build-a-cli --trials 3
```

Or use the BYO manifest without a Python adapter:

```bash
python -m bench.run --candidate /path/to/ClawQL/openbench/candidates/clawql-claude.toml ...
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
| `CLAWQL_OPENBENCH_HARNESS` | Underlying CLI for the Python adapter (`claude` default) |
| `CLAWQL_INFERENCE_URL` / `OPENBENCH_INFERENCE_URL` | Optional inference gateway |

## Related

- Planning-context token benchmarks (existing): [`docs/benchmarks/`](../docs/benchmarks/)
- Adoption narrative: [`docs/benchmarks/openbench.md`](../docs/benchmarks/openbench.md)
- Upstream OpenBench: https://github.com/minghinmatthewlam/openbench
- Announcement context: https://x.com/mattlam_/status/2079606933007352037
