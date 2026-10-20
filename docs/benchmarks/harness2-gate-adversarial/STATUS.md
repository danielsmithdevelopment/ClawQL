# Harness² × ClawQL gate — status ledger

**Board:** [`SPEC.md`](./SPEC.md) · [`STEP2.md`](./STEP2.md) · [`README.md`](./README.md)  
**Thesis:** [`docs/vision/harness2-authority-outside.md`](../../vision/harness2-authority-outside.md)

## Merge ledger (product → board → www → step 2 scaffold)

| Item                                              | PR                                                                  | State              |
| ------------------------------------------------- | ------------------------------------------------------------------- | ------------------ |
| Native-tool gate (park / IFC)                     | [#1355](https://github.com/danielsmithdevelopment/ClawQL/pull/1355) | Merged → `main`    |
| Step 1 board + conflict cleanup                   | [#1362](https://github.com/danielsmithdevelopment/ClawQL/pull/1362) | Merged → `main`    |
| `/benchmarks` multi-attack 0/12 + Harness² step 1 | [#1363](https://github.com/danielsmithdevelopment/ClawQL/pull/1363) | Merged → `main`    |
| Step 2 JobBench freeze + equal-arm orchestrator   | [#1364](https://github.com/danielsmithdevelopment/ClawQL/pull/1364) | Open (this branch) |

## Measurement status

| Step | Optimizer         | Gate                      | Artifact                                                         | Publishable?                                  |
| ---- | ----------------- | ------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| v0   | Stand-in          | Modeled                   | [`results-illustrative-v0.json`](./results-illustrative-v0.json) | **No** (illustrative)                         |
| 1    | Stand-in          | Real ClawQL               | [`results-step1.json`](./results-step1.json)                     | ClawQL claim only — **not** a Harness² result |
| 2    | Upstream Harness² | ClawQL MCP vs passthrough | `results-step2.json`                                             | **Blocked** — see below                       |

## Step 2 blocker (2026-10-20)

Equal-arm JobBench orchestration is on `main` (`npm run benchmark:harness2-gate-adversarial:step2-equal-arms`). A live scored run was **not** completed in the cloud-agent environment — **orchestrator only**, no publishable `results-step2.json` yet.

### What is ready

- Frozen board: **JobBench** (`--bench jb`, sequential, `k=2`, OpenCode) — see [`STEP2.md`](./STEP2.md)
- Upstream checkout can be installed: `uv pip install -e '.[render]'` then `harness2-setup jb`
- JobBench dataset installs from Hugging Face without a token (public)
- Dry-run probes `HARNESS2_ROOT` and lists missing credentials without inventing scores

### What is missing (credentials)

Upstream Harness² JobBench expects (see [SETUP.md](https://github.com/google-research/harness2/blob/main/docs/SETUP.md)):

| Variable                                                                           | Purpose                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `HARNESS2_SOLVER_MODEL`                                                            | OpenCode `provider/model` for the executor                    |
| `HARNESS2_IMPROVER_MODEL`                                                          | Improver (defaults to solver)                                 |
| `HARNESS2_JUDGE_MODEL`                                                             | JobBench judge model id                                       |
| `GOOGLE_CLOUD_PROJECT` **or** `HARNESS2_JUDGE_BASE_URL` + `HARNESS2_JUDGE_API_KEY` | Judge auth (Vertex ADC or alternate OpenAI-compatible judge)  |
| `CLAWQL_MCP_URL`                                                                   | ClawQL arm MCP endpoint (default `http://127.0.0.1:8080/mcp`) |

Verified locally (agent host, 2026-10-20): `harness2-check --bench jb` fails only on those credential lines after a successful `harness2-setup jb`. No OpenRouter / OpenAI / Vertex keys were present in that environment.

### Honesty

- Do **not** treat step-1 numbers as a Harness² result.
- Do **not** invent `results-step2.json` scores without upstream `harness2` + `harness2-judge` + `harness2-report` artifacts.
- When credentials exist:

```bash
HARNESS2_ROOT=/path/to/harness2 \
  npm run benchmark:harness2-gate-adversarial:step2-equal-arms -- --run
```

Then fill evade / adapt / lesson-poison fields from harness diffs + ClawQL WORM before claiming `board_pass`.

## CI note (Streams / Bifrost)

Always-on Streams celld and Bifrost peer jobs were already removed from every-PR CI on `main` (`streams-celld.yml` path-filtered; governance peers `workflow_dispatch` only).
