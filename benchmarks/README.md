# Benchmarks

ClawQL adapters and task packs for **external** eval harnesses. Specs, ledgers, and write-ups stay in [`docs/benchmarks/`](../docs/benchmarks/). Executor-comparison scripts stay in [`scripts/benchmarks/`](../scripts/benchmarks/). The docs site `/benchmarks` routes live in [`apps/docs/`](../apps/docs/) and [`apps/www/`](../apps/www/).

| Path | What it is |
| ---- | ---------- |
| [`openbench/`](openbench/) | MCP OpenBench tasks (Track A/B) + ClawQL adapter |
| [`agents-bench/`](agents-bench/) | Agents OpenBench dry harness (Family S ATR stubs) |
| [`extractbench/`](extractbench/) | ExtractBench IDP provider overlay |
| [`harness-bench/`](harness-bench/) | `clawql-harness` plugin compare + MCP UI traces |
| [`harvey-labs/`](harvey-labs/) | Harvey LAB `firm-knowledge` overlay |

```bash
npm run openbench:validate
```

Product integration **docs** (Panguard, Cursor vault) are [`docs/integrations/`](../docs/integrations/), not this tree.

Repo-root `integrations/` is **gitignored** for local-only experiments and is not committed.
