# Harvey LAB ts-v2 Smoke — Run-Engineering Postmortem (2026-11-15, task-001 arm B)

Scope: local Mac smoke `ts-v2-smoke-001-20261114`, task `firm-knowledge/tasks/001`,
arm `nemotron-clawql` (gate arm per `harvey-lab-ts-v2-smoke-gate.md`), on branch
`cursor/harvey-lab-rightsizing-remeasure-2725`. Documents the four environment
blockers that repeatedly killed launch attempts, and the verified fixes. The 11/25
all-pass (CPR 64.4 / 9.4) metrics remain QUARANTINED — nothing here cites them.

## Blocker 1 — `docker pull` hangs indefinitely (credential-helper hang)

Symptom: harness sat in "Setup harness" 10h+; `docker ps` empty; two stuck
`docker-credential-desktop get` processes accumulated across days. ghcr.io itself
was reachable (200 in ~0.2s), so this was NOT network.

Root cause: `~/.docker/config.json` had `credsStore: "desktop"` (and
`credHelpers.ghcr.io`). The colima Docker Desktop credential helper hangs on
`get` — every `docker pull` blocks forever waiting for it, even for
**public** images that need no auth.

Fix (applied 2026-11-14/15):
- Backup: `~/.docker/config.json.bak-<ts>`.
- Removed `credsStore`, `credHelpers`, and `auths.ghcr.io` from
  `~/.docker/config.json`. Public images then pull without any credential round-trip.
- Verified: `docker pull ghcr.io/harveyai/lab-sandbox:latest` completes in ~3s.

Residual note: the colima docker image store is independent of podman's. The
harness pulls via docker (podman shim), so the docker store must hold the image.
`podman images` having it is NOT sufficient for the docker-side check.

## Blocker 2 — Tika IDP sidecar: amd64-only image on arm64 host

Symptom: `docker run apache/tika:2.9.2.0-full` → container exits immediately with
`exec /bin/sh: exec format error`. The published image is linux/amd64 only (no
multi-arch manifest), and the host is arm64 (colima aarch64) with no Rosetta
wired into the docker VM. Also, the script's Java fallback had no JVM on the Mac.

Fix (applied 2026-11-15):
1. `brew install openjdk` → arm64 OpenJDK 27 at `/opt/homebrew/opt/openjdk`.
2. Run the native Tika server jar (the harness's own documented fallback artifact,
   already at `/tmp/clawql-lab-idp/tika-server-standard.jar`, 70 MB):

   ```
   JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
   PATH="$JAVA_HOME/bin:$PATH"
   $JAVA_HOME/bin/java -Xmx512m \
     -jar /tmp/clawql-lab-idp/tika-server-standard.jar \
     --host 127.0.0.1 --port 9998
   ```

Pitfalls found while doing this:
- `JAVA_HOME` + a clean env are REQUIRED: Tika's watchdog fork re-execs `java`;
  without it the fork resolves the `/usr/bin/java` stub and dies with
  "Unable to locate a Java Runtime" even though the parent started fine.
- The forked worker (second java pid) is the one actually listening; both must be
  alive. `curl http://127.0.0.1:9998/version` must return `Apache Tika 2.9.2`
  before launching `run-lab-local.sh` — the script's own docker path will then be
  skipped because :9998 is already healthy.
- Option D (skip Tika entirely, `CLAWQL_LAB_IDP_SIDECARS=0`) was tested as a
  fallback and WORKS for task-001, but the gate doc lists Tika as a dependency,
  so the run was completed with Tika UP.

## Blocker 3 — MCP 401: server-side `.env` autoloading defeats `noAuth`

Symptom: `lab-pre-ingest.mjs → LabMcpClient.ensureSession` → HTTP 401
"Invalid or missing API key" against the task-scoped MCP on :8080. Tried:
exporting `CLAWQL_AUTH_MODE=*** in the launcher (no effect), running the server
in a fully clean env (no effect), testing without `CLAWQL_HARVEY_LAB` (no effect).

Root cause (found by adding a one-line debug to `applyGatewayAuth` in
`dist/http/mcp-http-server.js` and reading `dist/host/load-env.js`):
`dist/server-http.js` **imports `dist/host/load-env.js`, which unconditionally
loads `cwd/.env` with `override:true`**. Since the repo `.env` sets
`CLAWQL_AUTH_MODE=*** + `CLAWQL_API_KEY`, the server ALWAYS runs in apiKey
mode with that static key — environment exports from the launcher are overridden
at process start. This also means the sanctioned `noAuth` local mode is
unreachable while `ClawQL/.env` contains an `CLAWQL_AUTH_MODE` line.

Fix (minimal, no code change): source `ClawQL/.env` in the launcher so the lab's
pre-ingest client process sees `CLAWQL_API_KEY`, which
`lab-mcp-client.mjs` sends as `x-api-key`. Server and client agree on the same
static key; 401 clears. (Approved by Daniel 2026-11-15.)

Verified: pre-ingest completed — 266 matters catalogued, bulk docs ingested.

Side observation (not a blocker for the gate): the bulk
`ingest_external_knowledge` write was parked by Panguard
(`mandate_required`, `park_destructive_write`, risk HIGH) and the script fell
back to per-matter `memory_ingest`, and `CLAWQL_ENABLE_DATA!=1` skipped
`data_ingest`. The harness proceeded and the agent completed the task. Worth a
look before Phase 1 full runs if trace/completeness of the DuckDB sidecar
matters to the rightsizing question.

## Blocker 4 — judge step: wrong module path in `run-lab-local.sh`

Symptom: after agent run completed (31 turns, 356.8s wall, 479k input / 13k output
tokens, `finish_reason: finish_tool`), the runner invoked
`uv run python -m evaluation.run_eval` → `ModuleNotFoundError: No module named
'evaluation'`. The correct module in the checkout is
`lab_core.evaluation.run_eval` (documented in that file's own header). Also
`run-lab-local.sh` invokes it without `cd`-ing to the harvey-labs root first for
the judge step (agent step used a different path layout), so the module is not
resolvable.

Fix: run the judge from the `HARVEY_LABS` root as
`lab_core.evaluation.run_eval` (see `Judge run` section below).

## Working launch recipe (verified, 2026-11-15)

Prereqs: MLX Nemotron on :8081, clawql-inference on :8091, Ollama judge
(qwen3.6:35b) on :11434, native Tika on :9998 (recipes above),
`docker pull` able to complete (credsStore removed).

```
caffeinate -dimsu -t 4500 bash /tmp/harvey-final6.sh
```

`/tmp/harvey-final6.sh` (also saved under
`ClawQL/docs/benchmarks/harvey-lab-local-smoke-launch.sh`):
sources `ClawQL/.env` (bash, `set -a`) so the pre-ingest client has the MCP key;
sets `PATH` for the OpenJDK; sets
`CLAWQL_LAB_SKIP_CLONE=1 CLAWQL_LAB_PODMAN_VIA_DOCKER=1 CLAWQL_LAB_STACK_VERSION=ts-clawql-data-v2`,
`HARVEY_LABS=/tmp/harvey-labs-work3/harvey-labs`, `LAB_TASK=firm-knowledge/tasks/001`,
`LAB_RUN_ID=ts-v2-smoke-001-20261114`, `LAB_ARMS=nemotron-clawql`, then
`exec bash benchmarks/harvey-labs/scripts/run-lab-local.sh`.

Judge (separate, because of Blocker 4):

```
cd /tmp/harvey-labs-work3/harvey-labs
# .env sourced in a bash -c wrapper (same key requirement for any MCP-touching step)
uv run python -m lab_core.evaluation.run_eval \
  --run-id "firm-knowledge/tasks/001/NVIDIA-Nemotron-3-5-Lightning-30B-A3B-4bit/20261115-060347" \
  --task "firm-knowledge/tasks/001" \
  --judge-model "ollama/qwen3.6:35b"
```

## Agent run outcome (unjudged at time of writing)

`run_id=firm-knowledge/tasks/001/NVIDIA-Nemotron-3-5-Lightning-30B-A3B-4bit/20261115-060347`
- Turns: 31 / max 40; Finished: True (`finish_tool`)
- Input 479,049 / output 12,971 tokens; wall clock 356.8s
- Pre-ingest: 266 matters; docs=266; HSR ontology flags 0/266 (see Blocker 3 note
  on the parked bulk write + skipped data_ingest before interpreting)
- Judge: qwen3.6:35b via clawql-inference :8091 — score appended below when done.

## Judge run (qwen3.6:35b via clawql-inference :8091)

**Result: FAIL — score 0.00, 1/7 criteria** (C-007 precision is the only pass; it
passes trivially because the agent asserted no qualifying matters).
Judge tokens: 492,020. `n_grading_errors: 0`.

**This score is a HARN ENVIRONMENT ARTIFACT, not a model read.** Evidence from the
transcript + pre-ingest log:

1. Pre-ingest printed `CLAWQL_ENABLE_DATA!=1 — skipping data_ingest`. The Node
   DuckDB **never loaded 266 matters into the server** — contrary to
   `start-clawql-for-lab.sh` which claims to set it, the live server came up
   data-off. Consequence:
   - The **gate criterion #1 FAILS** (`harvey-lab-ts-v2-smoke-gate.md`): the
     `ClawQL pre-ingest: Node DuckDB … matters=…` fingerprint line is absent; the
     legacy-skip line is present.
   - The agent's `clawql_sql` turn queried `matters` and got back what looked like
     8 antitrust matters (1045/1046 series), all `hsr_second_request=false`,
     because the data layer wasn't the full DMS.
2. `ingest_external_knowledge` (bulk, 266 docs) was **parked by Panguard**
   (`mandate_required`, risk HIGH, `park_destructive_write`) — the pre-ingest
   script then fell back to per-matter `memory_ingest`, but the model's
   `memory_recall(schema=legal.Matter)` still only surfaced the degenerate 8.
3. The agent spent 18 of 31 turns bash-globbing the filesystem for documents that
   were never mounted into `/workspace/documents` (turns 4–21), then correctly
   answered "0 of 8" from the evidence actually given to it (per the task rubric's
   "write 0 of N when none found after covering the corpus" rule).

Gate verdict: **RED**. Per the gate doc, contiguous 001–025 must NOT start.

### To make it green (follow-up work, needs approval)

- A. Run with the MCP server actually data-on and verify the `Node DuckDB …
  matters=266` fingerprint appears in pre-ingest log. Requires either
  `CLAWQL_ENABLE_DATA=1` to reach the server process (verify `load-env.js`
  ordering, possibly `.env` has `CLAWQL_ENABLE_DATA=` commented-out line
  shadowing) OR a one-off launch path that sets it explicitly and confirms.
- B. Decide on the Panguard mandate for `ingest_external_knowledge` in lab
  pre-ingest: either (a) add a lab-scoped exemption / pre-signed mandate for the
  task-sandbox vault, or (b) change `lab-pre-ingest.mjs` to call
  `memory_ingest` (non-destructive) in the bulk loop instead of
  `ingest_external_knowledge`. Both touch policy — Daniel's call.
- C. Re-run the gate (same recipe above + A + B). Judge again with
  qwen3.6:35b (internal) — any publishable number still requires
  claude-sonnet-4-6 per the gate doc.

## Path A — decided & executed 2026-11-15 (Daniel: "Go with path A. Make sure
to check on the runs and ensure they're not hanging on an error.")

Decision: run task-001 with the MCP server confirmed data-on. The blocker in
attempt #1 was the **client** side (`lab-pre-ingest.mjs` reads its own
`CLAWQL_ENABLE_DATA`), plus the Panguard park on the bulk write is a second,
independent gate the same run will still hit. Two items:

**A1. `CLAWQL_ENABLE_DATA=1` in launcher env** (client). Verified:
`packages/clawql-api/src/config/optional-flags.ts:282-299` gates *server*
availability of the Node-DuckDB layer on the same flag + `isAvailable()` and
that `data_ingest` MCP tool is only exposed when the engine actually attached.
`scripts/start-clawql-for-lab.sh:47` already exports `CLAWQL_ENABLE_DATA=1`
for the **server**. But `lab-pre-ingest.mjs:138` reads **the pre-ingest
process's** own env — the harness client — and bails to legacy skip if the
client env doesn't have it. Fix: launcher `export CLAWQL_ENABLE_DATA=1`
before calling `run-lab-local.sh`. This is the one flag the harness needs.

**A2. Panguard park on `ingest_external_knowledge`** (server). This is the
second, orthogonal gate: even when the data_on flag is set, the Panguard
policy still refuses the bulk write with `mandate_required` (risk HIGH,
`park_destructive_write`). Options for the lab path (need Daniel's call):
  (a) A lab-scoped mandate token / policy override — cleanest if the server
      can accept a task-scoped `CLAWQL_LAB_MANDATE` env or header.
  (b) Replace the bulk `ingest_external_knowledge` call in
      `lab-pre-ingest.mjs` with per-matter `memory_ingest` (non-destructive,
      already allowed) — this is the fallback the script already uses when
      the park fires, so it's effectively a no-op in behavior; the real win
      is to stop the park path from being the *primary* and let the server
      treat `memory_ingest` as the accepted write for lab pre-seeds.
  (c) Panguard policy change: mark `ingest_external_knowledge` as
      `lab:allowed` when `CLAWQL_HARVEY_LAB=1` and a task-scoped vault is
      bound (`CLAWQL_OBSIDIAN_VAULT_PATH` matches `HarveyLABVault/<task>`).

Status: A1 ready, A2 in-flight (needs Daniel's choice between a/b/c). Server
stack restored (MLX :8081, clawql-inference :8091, Ollama judge :11434,
LangExtract :8090, Tika native :9998, MCP server :8080).

## 2026-11-15 incident & recovery log

1. Attempt #1 (proc_e7ada3cedc59) agent ran task-001 end-to-end, judged 0.00 —
   score NOT publishable because of the two env/policy gates above.
2. During cleanup, a broad `pkill -f 'bin/clawql-mcp'` + a lab-pid-group kill
   also took out:
   - `bin/clawql.mjs inference serve` :8091 (gateway to the judge)
   - `mlx_lm.server` :8081 (Nemotron, the agent)
   - Any residual MCP server from the first attempt.
   **Lesson for future cleanups:** match the exact process
   (`clawql-mcp-http` via `/tmp/clawql-lab.pid` in `start-clawql-for-lab.sh`),
   never `bin/clawql*` which spans both MCP and inference gateways.
3. Restored:
   - `mlx_lm.server --model mlx-community/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-4bit --port 8081`
   - `benchmarks/harvey-labs/scripts/start-clawql-inference-for-lab.sh 8091 <run_id>`
   - Ollama :11434 (judge), LangExtract :8090, Tika :9998, MCP :8080.
   - Verified all five listeners healthy before relaunch.

## Not changed / out of scope

- No changes to `values-homelab.yaml` or `tier-map.json`.
- No public docs touched; quarantine of 11/25 metrics intact.
- `dist/http/mcp-http-server.js` debug line was added for diagnosis and
  REMOVED before this doc was written; dist is back to built state.
- `~/.docker/config.json` was modified (credsStore removed). Backup kept at
  `~/.docker/config.json.bak-<ts>`. If Docker Desktop auth to private registries
  is ever needed, restore from backup and scope the helper to only the registries
  that actually need it.
