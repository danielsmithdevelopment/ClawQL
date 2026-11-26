# Benchmark workflows

## Reusable board runner (`benchmark.yml`)

Audit **1.13**. Prefer calling `.github/workflows/benchmark.yml` for jobs that are
only: checkout → `npm ci` → optional build → board command → upload evidence.

### Inputs

| Input | Required | Purpose |
| ----- | -------- | ------- |
| `board` | yes | Short id (job name / default artifact name) |
| `command` | yes | Shell that runs the board |
| `artifacts` | yes | Multiline paths/globs for `upload-artifact` |
| `arms` | no | Exported as `BOARD_ARMS` and `OPENBENCH_ARMS` |
| `artifact_name` | no | Defaults to `board-<board>` |
| `node_version` | no | Default `22` |
| `npm_ci_args` | no | Default `--ignore-scripts` |
| `build_command` | no | Skip when empty |
| `timeout_minutes` | no | Default `30` (string; parsed as number) |
| `if_no_files_found` | no | Default `warn` |

### Callers migrated onto it

- `governance-policy-depth.yml` — `smoke` and `cells` jobs
- `multi-attack-injection.yml` — smoke board (needs `clawql-api` build)

### Keep out of the reusable workflow

Leave specialized orchestration in one-off workflows:

- OpenBench live A/B (credential preflight, OpenCode, R2 traces) — `openbench-ab.yml`
- Fast Decision GLiNER sidecars / marker gates — `fast-decision-*.yml`
- Peer Docker / flaky continue-on-error arms — still inline in `governance-policy-depth.yml`

New simple boards: add a thin trigger file with path filters / `workflow_dispatch`,
then `uses: ./.github/workflows/benchmark.yml` with `board` / `arms` / `artifacts`.
