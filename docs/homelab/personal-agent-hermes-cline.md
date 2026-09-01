# ClawQL Personal Agent Setup — Hermes/Ornith + Cline/Ornith

**Status:** Design / operator target · August 2026 · Mac Mini M4 Pro (64GB)  
**Author:** Daniel Smith (@danielsmithdev)  
**Default:** both Hermes and Cline use **Ornith-1.5-35B-A3B** (one MLX server). Nemotron is the fallback worker if Ornith smoke regresses Harvey LAB cells.

> **Repo lineage note:** Harvey LAB “11/25 all-pass” below is the prior GHA / Nemotron+ClawQL ledger on legacy `python-duckdb-v1`. Current product path is **`ts-clawql-data-v2`**: SQL gold **25/25** (no inference); **agent** contiguous 001–025 is still gated on Mac mini smoke — see [`harvey-lab-ts-v2-smoke-gate.md`](../benchmarks/harvey-lab-ts-v2-smoke-gate.md) and [`harvey-lab-stack-lineage.md`](../benchmarks/harvey-lab-stack-lineage.md). Do not cite legacy scores as current ClawQL agent performance.

---

## 1. Overview

This document describes the personal AI agent assistant on the Mac Mini M4 Pro, in the context of the locked homelab topology (Mini control plane, MS-A2 GPU IDP, N5 Pro storage/enrich).

**Hermes** (Ornith-1.5-35B-A3B) is the orchestrator — goals, decomposition, delegation, evaluation, skill library, Telegram.

**Cline** (Ornith by default; Nemotron optional) is the executor — code, terminal, ClawQL MCP tools, structured results back to Hermes.

**ClawQL MCP** sits beneath both — vault memory, `clawql_sql`, Panguard, WORM. Same-weights does **not** mean same agent: ATR scopes, tools, and verification gates keep the role split.

Two-layer traces: clawql-inference captures model calls; WORM captures consequential non-inference actions (skills, FS writes, delegation).

### 1.1 Homelab topology (locked)

```
MAC MINI M4 PRO (64GB unified) — Control plane + primary inference
  k3s control plane (Rancher)
  ClawQL MCP server :8080
  clawql-inference gateway :8091
  Hermes agent (Ornith-1.5-35B-A3B via MLX) :8082
  Cline agent (Ornith default — same :8082; or Nemotron on :8081)
  Cline ACP :8095
  Headscale · Omada Controller

MS-A2 + RTX 5090 — GPU compute (k3s worker)
  vLLM Qwen3.8-27B (ExtractBench) · SAM 3.1 · Dolphin-v2
  DPO/GRPO · PorTAL

N5 PRO TRUENAS (96GB ECC) — Storage + always-on enrich (k3s worker)
  ClickHouse :8123 · MinIO :9000 (WORM + R2) · Tika :9998 · LangExtract :8090
  890M / 50 TOPS: PP-DocLayout · dots.ocr · nomic-embed · Presidio · classifier · ontology auto-tag

MACBOOK AIR M4 / PRO M3 PRO — docked overflow MLX + transient k3s workers
```

**IDP path (context for Hermes skills):** N5 layout/PII/classify → TextBased=Tika | Complex=MS-A2 Dolphin(±SAM) → N5 tag/embed → Qwen field map → WORM.

**Secrets:** Telegram tokens and OAuth material via `clawql-auth` **SecretStore** (SQLite default on Mini) — see [`clawql-auth-package-spec.md`](../security/clawql-auth-package-spec.md).

### 1.2 Only open question (model)

Ornith smoke on Harvey LAB tasks **001, 004, 007, 018, 022** decides whether Cline stays on Ornith (shared MLX server, serialized) or switches to Nemotron (separate `:8081`, concurrent, domain-calibrated). Until that smoke fails, **assume Ornith for both**.

---

## 2. Why This Pairing

### 2.1 Hermes + Ornith-1.5-35B-A3B

Ornith-1.5-35B-A3B was trained with a three-stage self-improvement loop: the model proposes new tasks, generates task-specific scaffolds, and produces solution rollouts for reinforcement learning. That loop strengthens orchestration (decompose, recognize patterns, formalize skills) **and** agentic coding (SWE-bench / Terminal-Bench class workloads) — so one checkpoint can power both Hermes and Cline without forcing a weaker worker.

Hermes's runtime self-improvement loop compounds on top of this. After every completed task, Hermes evaluates its own performance and writes a reusable skill document. The next time a similar task arrives, Hermes queries its skill library instead of reasoning from scratch. Over weeks and months, the skill library grows to cover your specific workflows — benchmark sweep initiation, ExtractBench optimization, Harvey LAB result analysis, homelab service management — and the agent gets measurably faster and more accurate on those tasks.

Hermes's Honcho user modelling system builds an evolving profile of your preferences, communication style, and work patterns through conversational interaction. This is not a static profile — it refines continuously as you interact. After several weeks, Hermes understands that you prefer terse status updates, that benchmark results should include the full per-task table not just the aggregate, and that infrastructure alerts should come at any hour but non-urgent status updates should wait until morning.

### 2.2 Cline + Ornith (default) · Nemotron (fallback)

**Default:** Cline uses the same Ornith-1.5-35B-A3B weights as Hermes, typically via the **same** MLX server on `:8082` (routed through clawql-inference `:8091`). Benefits on a 64GB Mini: one model resident in unified memory, simpler ops, strong published agentic-coding scores. Role split stays in ATR, ACP, and SOUL — not in which `.safetensors` you load.

**Per-role sampling** (same server, different request params):

| Agent  | Temperature   | Notes                                                                       |
| ------ | ------------- | --------------------------------------------------------------------------- |
| Hermes | `0.6`         | Matches Ornith published bench conditions; multi-turn planning              |
| Cline  | `0.2` (start) | Colder for edits/SQL; A/B warmer (~1.0 / top_p 0.95) if tool-calling flakes |

**Fallback:** Nemotron 3.5 Lightning on a **separate** MLX process at `:8081` if Ornith smoke (§10.1) regresses vs the known Nemotron/Harvey path (prior GHA ledger 11/25 on legacy stack — lineage note above; failure modes documented). Bring Nemotron back for concurrent Hermes+Cline load or SQL-domain specialization — not as day-one default.

Cline is Apache 2.0, VS Code/CLI native, ACP + SDK hooks for WORM, native MCP for ClawQL. Hermes is the brain, Cline is the hands — even when both speak Ornith.

### 2.3 Why Not OpenClaw

The documented OpenClaw + Hermes pattern uses OpenClaw as the front-end orchestrator because OpenClaw is a multi-channel messaging gateway — it handles Slack, Telegram, Discord routing simultaneously. For a personal single-developer setup you do not need a multi-channel gateway. You need an orchestrator with memory that delegates coding tasks to a specialist.

OpenClaw also had nine CVEs in four days in March 2026 including one scoring CVSS 9.9, and a supply chain audit of ClawHub found 341 malicious skills in an initial scan of 2,857. Running OpenClaw on your primary development machine with access to your ClawQL vault, codebase, and local services is the wrong security posture. Hermes has zero reported CVEs as of August 2026 and a significantly smaller attack surface.

Related OpenClaw docs (enterprise / multi-channel, not this personal stack): [`using-openclaw-with-clawql.md`](../openclaw/using-openclaw-with-clawql.md). Buzz / Hermes ecosystem framing: [`clawql-buzz-nostr.md`](../gtm/pragmaticvectors/clawql-buzz-nostr.md).

---

## 3. Architecture

### 3.1 Full Request Flow

```
You (Telegram or terminal)
        │
        ▼
Hermes (Ornith-1.5-35B-A3B, Mac Mini MLX :8082)
  ├── Queries skill library (SQLite on N5 NFS, no inference call)
  ├── Reads vault memory via clawql memory_recall → ClickHouse
  ├── Decomposes goal into subtasks
  ├── Decides: handle directly or delegate to Cline
  │
  ├── DIRECT HANDLING (Hermes executes)
  │     → Hermes calls ClawQL MCP tools directly
  │     → Returns result to you via Telegram
  │
  └── DELEGATION (Cline executes)
            │
            ▼
        Cline (Ornith default via :8082 / :8091; Nemotron optional :8081)
          ├── Reads and writes codebase files (ACP)
          ├── Runs terminal commands
          ├── Calls ClawQL MCP tools (clawql_sql, memory_recall)
          └── Returns structured result to Hermes
                    │
                    ▼
        Hermes evaluates result (mechanical done-criteria — exit codes / tests)
          ├── If yes: write skill document, report to you
          └── If no: replan, re-delegate, or escalate to you
                    │
                    ▼
        You receive status update via Telegram
```

### 3.2 ClawQL MCP Tool Availability

Both agents connect to the ClawQL MCP server running on the Mac Mini at `:8080`. Tool availability is controlled per agent via ATR scoping at session creation. Prefer **ACP for filesystem/shell**; MCP for ClawQL tools.

Shipped MCP names (enable **`CLAWQL_ENABLE_DATA=1`** and **`CLAWQL_ENABLE_WEB=1`**): `memory_recall`, `memory_ingest`, `data_query` (alias **`clawql_sql`**), `web_search`, `search`, `execute`, `audit`, `cache`. There is **no** `clawql_think` tool yet. `file_read` / `file_write` / `terminal_exec` are Cline-native, not MCP.

**Hermes ATR scope (orchestration tasks):**

```json
{
  "tools": [
    "memory_recall",
    "memory_ingest",
    "clawql_sql",
    "web_search",
    "search",
    "execute",
    "audit"
  ],
  "budget": {
    "maxTokens": 500000,
    "maxUsd": 5.0
  }
}
```

**Cline ATR scope (execution tasks):**

```json
{
  "tools": ["clawql_sql", "memory_recall", "search", "execute", "audit"],
  "budget": {
    "maxTokens": 200000,
    "maxUsd": 2.0
  }
}
```

Panguard enforces these scopes at the infrastructure layer. A tool call outside the declared scope is blocked and a WORM entry is written regardless of what the model decided.

### 3.3 Port Assignments

```
:8080  — ClawQL MCP server (primary)
:8082  — MLX Ornith-1.5-35B-A3B (Hermes + default Cline)
:8081  — MLX Nemotron (optional Cline fallback / concurrent worker)
:8091  — clawql-inference gateway (routes agents, captures traces)
:8095  — Cline ACP server (Hermes subagent delegation)
```

**Default:** one Ornith MLX instance on `:8082`; Hermes and Cline both reach it through `:8091` with different agent labels and temperatures. **Optional:** start Nemotron on `:8081` and retarget Cline after a failed Ornith smoke (§10.1).

Harvey LAB smoke historically used `:8081` (Nemotron) + `:8091` — see the [ts-v2 smoke gate](../benchmarks/harvey-lab-ts-v2-smoke-gate.md). Personal-agent default flips to Ornith on `:8082` for both roles.

---

## 4. Model Setup

### 4.1 Ornith-1.5-35B-A3B (Hermes + default Cline)

```bash
# Pull MLX weights
huggingface-cli download \
  ornith-ai/Ornith-1.5-35B-A3B-MLX \
  --local-dir ~/models/ornith-1.5-35b-a3b

# Apply Qwen Sharp chat template (covers Ornith 3.5/3.6/3.8 compatible models)
huggingface-cli download \
  peculiar-ragdoll/Qwen-Sharp-Chat-Templates \
  chat_template.jinja \
  --local-dir /tmp/sharp-template

cp /tmp/sharp-template/chat_template.jinja \
  ~/models/ornith-1.5-35b-a3b/

# Single MLX server — Hermes and Cline (default)
# Mini Metal: keep prompt-cache-size=1 and concurrency=1 or KV cache OOMs
# (`metal::malloc` resource limit). Prefer scripts/dev/start-ornith-mlx-for-personal-agent.sh
mlx_lm.server \
  --model ~/models/ornith-1.5-35b-a3b \
  --port 8082 \
  --host 127.0.0.1 \
  --temp 0.6 \
  --max-tokens 2048 \
  --prompt-cache-size 1 \
  --prompt-cache-bytes 2GB \
  --decode-concurrency 1 \
  --prompt-concurrency 1
```

Hermes may advertise a **64K** context for tool calling, but on this Mini compact earlier (`compression.threshold_tokens: 8192`) and cap `max_tokens` at **2048**. Disable `auxiliary.title_generation` so a second Ornith call does not share the GPU with the main turn. Temperature 0.6 matches Ornith published bench conditions for the orchestrator; Cline overrides per-request via clawql-inference.

### 4.2 Nemotron 3.5 Lightning (optional Cline fallback)

Only if §10.1 Ornith smoke fails Harvey criteria or you need a second concurrent worker:

```bash
curl http://localhost:8081/v1/models || \
mlx_lm.server \
  --model mlx-community/Llama-3.1-Nemotron-3.5-Lightning-30B-A3B-4bit \
  --port 8081 \
  --host 127.0.0.1 \
  --temp 0.0 \
  --seed 42
```

Then point Cline / clawql-inference `cline` route at `:8081` / `nemotron-3.5-lightning`. Temperature 0.0 favors deterministic SQL/code paths.

### 4.3 clawql-inference Gateway Configuration

```yaml
# clawql-inference/config/personal-agent.yaml
# Default: both agents → Ornith on :8082

models:
  hermes:
    endpoint: "http://localhost:8082/v1"
    model: "ornith-1.5-35b-a3b"
    temperature: 0.6
    agent: "hermes"
    trace_capture: true
    worm_enabled: true

  cline:
    endpoint: "http://localhost:8082/v1" # same Ornith server (default)
    model: "ornith-1.5-35b-a3b"
    temperature: 0.2
    agent: "cline"
    trace_capture: true
    worm_enabled: true
    # Fallback after failed Ornith smoke:
    # endpoint: "http://localhost:8081/v1"
    # model: "nemotron-3.5-lightning"
    # temperature: 0.0

trace_output:
  local: "~/.clawql/traces/personal-agent/"
  r2_bucket: "clawql-openbench-traces"
  r2_prefix: "raw/personal-agent/"

worm:
  local_endpoint: "http://n5-pro.tailnet:9000"
  local_bucket: "clawql-worm-personal"
  r2_endpoint: "https://r2.clawql.com"
  r2_bucket: "clawql-worm-personal"
  merkle_enabled: true
```

---

## 5. Hermes Configuration

### 5.1 Installation

```bash
# Requires Python 3.11
python3.11 -m venv ~/.venv/hermes
source ~/.venv/hermes/bin/activate
pip install hermes-agent

# Initialize
hermes init --workspace ~/.hermes/personal
```

### 5.2 Agent Configuration

```yaml
# ~/.hermes/personal/hermes.yaml

agent:
  name: "ClawQL Assistant"
  model: "openai/ornith-1.5-35b-a3b"
  base_url: "http://localhost:8091/v1" # routes through clawql-inference
  api_key: "local"
  temperature: 0.6

memory:
  backend: "sqlite"
  path: "~/.hermes/personal/memory.db"
  # Also syncs to ClawQL vault for cross-session persistence
  clawql_vault_sync: true
  clawql_mcp_url: "http://localhost:8080/mcp"

skills:
  path: "~/.hermes/personal/skills/"
  auto_generate: true
  review_before_save: false # trust Ornith's skill generation

learning:
  enabled: true
  min_task_complexity: 3 # only generate skills for non-trivial tasks
  batch_mode: false # immediate skill updates, not async

subagents:
  cline:
    type: "acp"
    endpoint: "http://localhost:8095/acp" # Cline ACP server
    # Ornith by default (same Mini weights as Hermes). Switch to
    # openai/nemotron-3.5-lightning only if Ornith smoke fails (§10.1).
    model: "openai/ornith-1.5-35b-a3b"
    base_url: "http://localhost:8091/v1"
    capabilities:
      - "code_edit"
      - "terminal_exec"
      - "file_read"
      - "file_write"
      - "mcp_tools"

channels:
  telegram:
    enabled: true
    bot_token: "${TELEGRAM_BOT_TOKEN}"
    allowed_users: ["${YOUR_TELEGRAM_USER_ID}"]

  terminal:
    enabled: true

scheduling:
  enabled: true
  timezone: "America/Los_Angeles"

honcho:
  enabled: true
  profile_path: "~/.hermes/personal/honcho_profile.json"
```

### 5.3 SOUL.md — Hermes Personality and Values

```markdown
# ClawQL Assistant — SOUL.md

## Identity

You are a personal AI assistant for Daniel Smith, a solo developer building ClawQL.
You manage his development workflows, benchmark runs, and infrastructure.
You communicate via Telegram and terminal.

## Communication style

- Terse. Lead with the answer.
- Status updates: one line per active task, full table for benchmark results.
- Failures: say what failed, why, and what you did about it.
- Never ask for permission on tasks Daniel has delegated. Execute and report.
- Non-urgent updates can wait until morning. Failures wake him up.

## What you know about Daniel's work

- ClawQL: AI agent infrastructure — vault memory, ontology, Panguard, WORM audit trail.
- Harvey LAB: legal agent benchmark; publishable scores require ts-clawql-data-v2 agent gate.
- ExtractBench: document extraction benchmark, 80.1% current mean, target 95.59%.
- Homelab: Mac Mini (control plane), MS-A2 + RTX 5090 (GPU), N5 Pro TrueNAS (storage).
- SeeTheGreens: mortgage LOS using ClawQL IDP pipeline.
- RockYourLobster: hardened agent deployments for regulated enterprise.

## Delegation policy

Delegate to Cline when the task requires:

- Reading or modifying files in the ClawQL codebase
- Running terminal commands on the Mac Mini
- Executing benchmark harness scripts
- Git operations

Handle directly when the task requires:

- Memory recall or vault queries
- Benchmark result analysis and interpretation
- Status reporting to Daniel
- Planning and task decomposition
- Scheduling and cron management

## What not to do

- Never push to main without Daniel's explicit approval.
- Never modify values-homelab.yaml or tier-map.json without approval.
- Never send external emails or messages on Daniel's behalf without approval.
- Always write a WORM entry before any file modification or terminal execution.
```

### 5.4 Skill Document Schema

Hermes generates skill documents automatically after completing complex tasks. Three canonical schemas for recurring workflows:

**Harvey LAB benchmark sweep:**

```yaml
# ~/.hermes/personal/skills/harvey-lab-benchmark-sweep.yaml

name: harvey-lab-benchmark-sweep
version: 1
description: Run Harvey LAB contiguous 001-025 via ts-clawql-data-v2 stack on Mac Mini

trigger:
  keywords:
    - harvey lab
    - benchmark sweep
    - run contiguous
    - 001-025
    - firm-knowledge
  min_complexity: 4

acceptance_criteria:
  - Pre-ingest fingerprint shows Node DuckDB (not legacy python-duckdb-v1)
  - call-store contains clawql_sql rows for each task
  - aggregate-contiguous-001-025.json written with stack_version ts-clawql-data-v2
  - WORM entries for session start, each delegation, and session end

steps:
  - id: preflight
    action: delegate
    agent: cline
    task: |
      Run bash integrations/harvey-labs/scripts/preflight-ts-v2-smoke.sh
      Confirm dist/server-http.js exists (npm run build if missing)
      Confirm MLX Ornith at :8082 and clawql-inference at :8091
      (Nemotron :8081 only if Ornith smoke failed — §10.1)

  - id: quarantine
    action: delegate
    agent: cline
    task: bash integrations/harvey-labs/scripts/quarantine-legacy-call-store.sh

  - id: smoke-001
    action: delegate
    agent: cline
    task: |
      LAB_TASK=firm-knowledge/tasks/001 LAB_ARMS=ornith-clawql \
      bash integrations/harvey-labs/scripts/run-lab-local.sh
    gate: must pass before contiguous

  - id: contiguous
    action: delegate
    agent: cline
    task: bash integrations/harvey-labs/scripts/run-contiguous-001-025.sh
    depends_on: smoke-001

  - id: report
    action: direct
    task: |
      Read integrations/harvey-labs/results/ts-v2/aggregate-contiguous-001-025.json
      Send Telegram message with full per-task pass/fail table
      memory_ingest outcome to vault with wikilink [[Harvey LAB ts-v2]]

worm:
  session_kind: HARVEY_LAB_SWEEP
  required_entry_types:
    - SESSION_START
    - DELEGATION
    - TERMINAL_EXEC
    - SESSION_END
```

**ExtractBench optimization loop:**

```yaml
# ~/.hermes/personal/skills/extractbench-optimization-loop.yaml

name: extractbench-optimization-loop
version: 1
description: Iterative ExtractBench experiment — baseline, hypothesis, run, compare, vault ingest

trigger:
  keywords:
    - extractbench
    - extraction benchmark
    - optimize extraction
    - 95.59
  min_complexity: 3

acceptance_criteria:
  - Baseline mean recorded before any change
  - Single-variable change per experiment iteration
  - Post-run mean compared to baseline with delta
  - Failed experiments ingested to vault with failure reason

steps:
  - id: baseline
    action: delegate
    agent: cline
    task: |
      Run ExtractBench harness with current config
      Record mean accuracy and per-document scores to /tmp/extractbench-baseline.json

  - id: hypothesize
    action: direct
    task: |
      Query vault memory_recall for prior ExtractBench experiments
      Propose single change (prompt, chunk size, or model param)
      Write hypothesis to WORM before delegation

  - id: experiment
    action: delegate
    agent: cline
    task: |
      Apply hypothesized change
      Re-run ExtractBench harness
      Write results to /tmp/extractbench-experiment-{timestamp}.json

  - id: evaluate
    action: direct
    task: |
      Compare experiment mean to baseline
      If delta >= 0.5%: memory_ingest success insight with wikilink [[ExtractBench]]
      If delta < 0: memory_ingest failure insight, revert change via Cline
      Send Telegram summary with baseline, experiment, delta

worm:
  session_kind: EXTRACTBENCH_LOOP
  required_entry_types:
    - SESSION_START
    - SKILL_QUERY
    - DELEGATION
    - FILE_WRITE
    - SESSION_END
```

**Homelab service check:**

```yaml
# ~/.hermes/personal/skills/homelab-service-check.yaml

name: homelab-service-check
version: 1
description: Verify Mac Mini control-plane services and alert on failure

trigger:
  keywords:
    - homelab check
    - service health
    - is everything up
    - infrastructure status
  schedule: "0 */4 * * *" # also triggered by cron.yaml

acceptance_criteria:
  - All critical endpoints respond within 5s
  - Failures reported to Telegram immediately
  - All-green summary batched to morning brief only

services:
  - name: clawql-mcp
    url: http://localhost:8080/health
    critical: true
  - name: mlx-ornith
    url: http://localhost:8082/v1/models
    critical: true
  - name: clawql-inference
    url: http://localhost:8091/v1/models
    critical: true
  - name: cline-acp
    url: http://localhost:8095/acp/health
    critical: false
  - name: mlx-nemotron
    url: http://localhost:8081/v1/models
    critical: false # optional Cline fallback after failed Ornith smoke
  - name: n5-minio
    url: http://n5-pro.tailnet:9000/minio/health/live
    critical: true

steps:
  - id: probe
    action: direct
    task: |
      For each service in services list, curl -sf --max-time 5
      Record status code and latency
      Write WORM entry per probe (no inference)

  - id: alert
    action: direct
    task: |
      If any critical service failed: send Telegram alert immediately
      Format: "FAIL {service}: {status} ({latency}ms)"
      If all green and not morning-brief window: suppress notification

  - id: morning-brief
    action: direct
    task: |
      If triggered by morning-brief cron: send full status table
      Include uptime since last failure per service

worm:
  session_kind: HOMELAB_HEALTH
  required_entry_types:
    - CRON_TRIGGER
    - SESSION_START
    - SESSION_END
```

---

## 6. Cline Configuration

### 6.1 Installation

```bash
npm install -g @cline/cli
# or VS Code extension: ms-cline.cline

# Initialize ACP server (for Hermes subagent delegation)
cline server --port 8095 --acp-enabled
```

### 6.2 Cline Configuration File

```json
// ~/.cline/config.json
{
  "model": {
    "provider": "openai-compatible",
    "baseUrl": "http://localhost:8091/v1",
    "apiKey": "local",
    "modelId": "ornith-1.5-35b-a3b"
  },
  "mcp": {
    "servers": [
      {
        "name": "clawql",
        "url": "http://localhost:8080/mcp",
        "enabled": true
      }
    ]
  },
  "acp": {
    "enabled": true,
    "port": 8095,
    "allowedOrchestrators": ["hermes"]
  },
  "workspace": {
    "root": "/Users/danielsmith/ClawQL-harvey-lab",
    "allowedPaths": [
      "/Users/danielsmith/ClawQL-harvey-lab",
      "/Users/danielsmith/ClawQL",
      "/tmp/harvey-labs-work2"
    ]
  },
  "approvals": {
    "fileWrite": "auto",
    "terminalExec": "auto",
    "gitPush": "require"
  }
}
```

---

## 7. Two-Layer Trace Capture

### 7.1 What Each Layer Captures

**clawql-inference layer** captures every model call that routes through it:

- Hermes inference calls (planning, decomposition, evaluation)
- Cline inference calls (code generation, SQL writing, terminal planning)
- Token counts, costs, timing
- Tool call arguments and MCP results
- Full transcript.jsonl for training flywheel

**WORM audit trail** captures every consequential action regardless of inference:

- Hermes skill library reads and writes (SQLite, no inference call)
- Hermes → Cline delegation messages (ACP, no inference call)
- Cline filesystem reads and writes (no inference call)
- Cline terminal command execution (no inference call)
- Cron job triggers (no inference call)
- Session start and end
- Panguard blocks on any out-of-scope action
- All ClawQL MCP tool calls (auto-appended to the `audit` ring as `category=mcp_tool`; optional Loki stream `job=clawql-audit`)

Together these provide complete coverage. Nothing consequential happens without a record.

### 7.2 Hermes AIAgent Subclass for WORM Instrumentation

Install at `~/.hermes/personal/extensions/worm_agent.py` and register in `hermes.yaml`:

```yaml
agent:
  runtime_class: "~/.hermes/personal/extensions/worm_agent.WORMInstrumentedAgent"
```

```python
# ~/.hermes/personal/extensions/worm_agent.py

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from hermes.agent import AIAgent


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class WORMClient:
    """Append-only WORM writer — local MinIO + R2, Merkle chain enabled."""

    def __init__(self) -> None:
        self.local_endpoint = os.environ.get(
            "WORM_LOCAL_ENDPOINT", "http://n5-pro.tailnet:9000"
        )
        self.local_bucket = os.environ.get(
            "WORM_LOCAL_BUCKET", "clawql-worm-personal"
        )
        self.r2_endpoint = os.environ.get(
            "WORM_R2_ENDPOINT", "https://r2.clawql.com"
        )
        self.r2_bucket = os.environ.get("WORM_R2_BUCKET", "clawql-worm-personal")
        self.merkle_enabled = os.environ.get("WORM_MERKLE_ENABLED", "1") == "1"
        self._prev_hash: str | None = None

    def _merkle_hash(self, payload: dict[str, Any]) -> str:
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        chained = f"{self._prev_hash or 'GENESIS'}:{canonical}"
        digest = hashlib.sha256(chained.encode()).hexdigest()
        self._prev_hash = digest
        return digest

    def append(
        self,
        *,
        session_id: str,
        agent: str,
        kind: str,
        detail: dict[str, Any],
        delegation_id: str | None = None,
    ) -> dict[str, Any]:
        entry = {
            "id": str(uuid.uuid4()),
            "ts": _utcnow(),
            "sessionId": session_id,
            "delegationId": delegation_id,
            "agent": agent,
            "kind": kind,
            "detail": detail,
        }
        if self.merkle_enabled:
            entry["merkleHash"] = self._merkle_hash(entry)

        key = f"sessions/{session_id}/{entry['ts']}-{kind.lower()}.json"
        body = json.dumps(entry).encode()

        with httpx.Client(timeout=10.0) as client:
            # Local MinIO (primary, low latency)
            client.put(
                f"{self.local_endpoint}/{self.local_bucket}/{key}",
                content=body,
                headers={"Content-Type": "application/json"},
            )
            # R2 mirror (async durability — best effort)
            try:
                client.put(
                    f"{self.r2_endpoint}/{self.r2_bucket}/{key}",
                    content=body,
                    headers={"Content-Type": "application/json"},
                )
            except httpx.HTTPError:
                pass  # local copy is authoritative; R2 catches up on retry

        return entry


class WORMInstrumentedAgent(AIAgent):
    """Hermes runtime with WORM instrumentation on non-inference paths."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.worm = WORMClient()
        self._session_id = str(uuid.uuid4())
        self.worm.append(
            session_id=self._session_id,
            agent="hermes",
            kind="SESSION_START",
            detail={"workspace": os.path.expanduser("~/.hermes/personal")},
        )

    @property
    def session_id(self) -> str:
        return self._session_id

    def query_skill_library(self, query: str) -> list[dict[str, Any]]:
        self.worm.append(
            session_id=self._session_id,
            agent="hermes",
            kind="SKILL_QUERY",
            detail={"query": query},
        )
        return super().query_skill_library(query)

    def update_skill_library(self, skill: dict[str, Any]) -> None:
        self.worm.append(
            session_id=self._session_id,
            agent="hermes",
            kind="SKILL_WRITE",
            detail={"skill_name": skill.get("name"), "version": skill.get("version")},
        )
        super().update_skill_library(skill)

    async def delegate_to_subagent(
        self,
        subagent: str,
        task: str,
        **kwargs: Any,
    ) -> Any:
        delegation_id = str(uuid.uuid4())
        self.worm.append(
            session_id=self._session_id,
            agent="hermes",
            kind="DELEGATION",
            detail={"subagent": subagent, "task_preview": task[:500]},
            delegation_id=delegation_id,
        )
        result = await super().delegate_to_subagent(subagent, task, **kwargs)
        self.worm.append(
            session_id=self._session_id,
            agent="hermes",
            kind="DELEGATION_RESULT",
            detail={"subagent": subagent, "success": result is not None},
            delegation_id=delegation_id,
        )
        return result

    def on_cron_trigger(self, job_name: str, schedule: str) -> None:
        self.worm.append(
            session_id=self._session_id,
            agent="hermes",
            kind="CRON_TRIGGER",
            detail={"job": job_name, "schedule": schedule},
        )
        super().on_cron_trigger(job_name, schedule)

    async def shutdown(self) -> None:
        self.worm.append(
            session_id=self._session_id,
            agent="hermes",
            kind="SESSION_END",
            detail={},
        )
        await super().shutdown()
```

### 7.3 Cline SDK Hooks for WORM Instrumentation

Register in `~/.cline/config.json`:

```json
{
  "hooks": {
    "file": "~/.cline/hooks/worm-instrumentation.ts"
  }
}
```

```typescript
// ~/.cline/hooks/worm-instrumentation.ts

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

type WormKind = "FILE_WRITE" | "TERMINAL_EXEC" | "SESSION_START" | "SESSION_END";

interface WormEntry {
  id: string;
  ts: string;
  sessionId: string;
  delegationId?: string;
  agent: "cline";
  kind: WormKind;
  detail: Record<string, unknown>;
  merkleHash?: string;
}

let prevHash: string | null = null;

function merkleHash(entry: Omit<WormEntry, "merkleHash">): string {
  const canonical = JSON.stringify(entry, Object.keys(entry).sort());
  const chained = `${prevHash ?? "GENESIS"}:${canonical}`;
  const digest = createHash("sha256").update(chained).digest("hex");
  prevHash = digest;
  return digest;
}

async function appendWorm(entry: Omit<WormEntry, "id" | "ts" | "merkleHash">): Promise<void> {
  const payload: WormEntry = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    ...entry,
  };
  payload.merkleHash = merkleHash(payload);

  const localEndpoint = process.env.WORM_LOCAL_ENDPOINT ?? "http://n5-pro.tailnet:9000";
  const bucket = process.env.WORM_LOCAL_BUCKET ?? "clawql-worm-personal";
  const key = `sessions/${payload.sessionId}/${payload.ts}-${payload.kind.toLowerCase()}.json`;

  await fetch(`${localEndpoint}/${bucket}/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function getSessionContext(): { sessionId: string; delegationId?: string } {
  const ctxPath = process.env.CLINE_SESSION_CONTEXT ?? "/tmp/cline-session-context.json";
  try {
    return JSON.parse(readFileSync(ctxPath, "utf8"));
  } catch {
    return { sessionId: "unknown" };
  }
}

/** Called before Cline writes a file — WORM entry precedes the write. */
export async function beforeFileWrite(ctx: {
  path: string;
  contentPreview: string;
}): Promise<void> {
  const { sessionId, delegationId } = getSessionContext();
  await appendWorm({
    sessionId,
    delegationId,
    agent: "cline",
    kind: "FILE_WRITE",
    detail: { path: ctx.path, bytes: ctx.contentPreview.length, phase: "before" },
  });
}

export async function afterFileWrite(ctx: { path: string; success: boolean }): Promise<void> {
  const { sessionId, delegationId } = getSessionContext();
  await appendWorm({
    sessionId,
    delegationId,
    agent: "cline",
    kind: "FILE_WRITE",
    detail: { path: ctx.path, success: ctx.success, phase: "after" },
  });
}

export async function beforeTerminalExec(ctx: { command: string; cwd: string }): Promise<void> {
  const { sessionId, delegationId } = getSessionContext();
  await appendWorm({
    sessionId,
    delegationId,
    agent: "cline",
    kind: "TERMINAL_EXEC",
    detail: { command: ctx.command, cwd: ctx.cwd, phase: "before" },
  });
}

export async function afterTerminalExec(ctx: {
  command: string;
  exitCode: number;
  stdoutPreview: string;
}): Promise<void> {
  const { sessionId, delegationId } = getSessionContext();
  await appendWorm({
    sessionId,
    delegationId,
    agent: "cline",
    kind: "TERMINAL_EXEC",
    detail: {
      command: ctx.command,
      exitCode: ctx.exitCode,
      stdoutPreview: ctx.stdoutPreview.slice(0, 500),
      phase: "after",
    },
  });
}

export async function onSessionStart(ctx: { sessionId: string }): Promise<void> {
  await appendWorm({
    sessionId: ctx.sessionId,
    agent: "cline",
    kind: "SESSION_START",
    detail: { orchestrator: "hermes" },
  });
}

export async function onSessionEnd(ctx: { sessionId: string }): Promise<void> {
  await appendWorm({
    sessionId: ctx.sessionId,
    agent: "cline",
    kind: "SESSION_END",
    detail: {},
  });
}
```

### 7.4 Session ID Linkage

Every WORM entry across both agents carries the same `sessionId` for the duration of a task. Hermes sets `sessionId` at session start; ACP delegation passes it to Cline via `/tmp/cline-session-context.json`. Reconstruct the full action chain with DuckDB over exported WORM JSON:

```sql
-- ~/.clawql/queries/worm-session-reconstruct.sql
-- Run against exported WORM entries (local MinIO mirror or R2 export)

SELECT
  e.ts,
  e.agent,
  e.kind,
  e.delegation_id,
  e.detail->>'path'       AS file_path,
  e.detail->>'command'    AS terminal_cmd,
  e.detail->>'subagent'   AS subagent,
  e.detail->>'skill_name' AS skill_name,
  e.merkle_hash
FROM worm_entries e
WHERE e.session_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY e.ts ASC;

-- Expected chain for a Harvey LAB sweep:
-- SESSION_START (hermes)
-- SKILL_QUERY   (hermes) — matched harvey-lab-benchmark-sweep
-- DELEGATION    (hermes) — preflight step
-- SESSION_START (cline)
-- TERMINAL_EXEC (cline)  — preflight-ts-v2-smoke.sh
-- DELEGATION    (hermes) — smoke-001 step
-- TERMINAL_EXEC (cline)  — run-lab-local.sh
-- SKILL_WRITE   (hermes) — skill refinement after success
-- SESSION_END   (cline)
-- SESSION_END   (hermes)
```

---

## 8. Telegram Setup

### 8.1 Bot Creation

1. Message [@BotFather](https://t.me/BotFather) on Telegram.
2. `/newbot` → name: `ClawQL Assistant` → username: `clawql_assistant_bot` (or available variant).
3. Copy the bot token — store in env, never commit:

   ```bash
   export TELEGRAM_BOT_TOKEN="<token-from-botfather>"
   export YOUR_TELEGRAM_USER_ID="<your-numeric-user-id>"
   # Get user ID: message @userinfobot or inspect getUpdates after messaging your bot
   ```

4. Start a chat with your bot and send `/start`.
5. Hermes reads `${TELEGRAM_BOT_TOKEN}` and `${YOUR_TELEGRAM_USER_ID}` from env (see §5.2 `hermes.yaml`).

### 8.1.1 OAuth re-auth DMs (Phase 7)

When outbound OAuth refresh fails (`invalid_grant` / missing token), Hermes should DM you a **re-auth URL only** (never refresh tokens or client secrets).

```ts
import { createTelegramReauthNotifierFromEnv } from "clawql-agents";
import { notifyReauthRequiredEffect } from "clawql-auth";
import { Effect } from "effect";

const notifier = createTelegramReauthNotifierFromEnv();
if (notifier) {
  await Effect.runPromise(
    notifyReauthRequiredEffect(notifier, reauthError, { channel: "telegram" })
  );
}
```

Message shape:

```
ClawQL re-auth required: google
Reason: invalid_grant
Open: https://…/oauth/authorize?provider=google&state=…
```

Requires the same `TELEGRAM_BOT_TOKEN` + `YOUR_TELEGRAM_USER_ID` as §8.1. Wire `buildReauthUrl` on `OAuthTokenStore` so `ReauthRequiredError.reauthUrl` is populated.

### 8.2 Notification Formats

Hermes sends terse messages per SOUL.md. Canonical formats:

**Benchmark completion:**

```
Harvey LAB contiguous 001-025: 25/25 PASS (ts-clawql-data-v2)
001 ✓ 002 ✓ 003 ✓ ... 025 ✓
Duration: 4h 12m | WORM session: 550e8400
```

**Service failure (immediate, any hour):**

```
FAIL clawql-mcp: connection refused (2ms)
Action: restarted via launchctl, recheck in 60s
```

**ExtractBench experiment:**

```
ExtractBench: 80.1% → 81.4% (+1.3%) | chunk_size 512→768
Hypothesis confirmed. Vault ingested. Reverting not needed.
```

**Morning summary (07:00 PT, non-urgent batch):**

```
Morning brief — all green
MCP ✓ Ornith ✓ Inference ✓ MinIO ✓
Active: none | Last sweep: 3d ago (25/25)
```

### 8.3 Cron Schedule

```yaml
# ~/.hermes/personal/cron.yaml

timezone: America/Los_Angeles

jobs:
  - name: morning-brief
    schedule: "0 7 * * *"
    skill: homelab-service-check
    notify: telegram
    params:
      mode: morning-brief

  - name: service-health
    schedule: "0 */4 * * *"
    skill: homelab-service-check
    notify: telegram
    params:
      mode: alert-only # suppress if all green

  - name: benchmark-monitor
    schedule: "0 9 * * 1" # Monday 09:00 — check if sweep overdue
    action: direct
    task: |
      If no Harvey LAB sweep in 14 days, remind Daniel
      Do not auto-start sweep without explicit request

  - name: r2-sync-verify
    schedule: "30 3 * * *"
    action: delegate
    agent: cline
    task: |
      Compare local WORM bucket object count vs R2 mirror
      Alert if drift > 10 objects or any Merkle chain break

  - name: worm-completeness
    schedule: "0 4 * * 0" # Sunday 04:00
    action: delegate
    agent: cline
    task: python ~/.hermes/personal/scripts/verify_worm_completeness.py --days 7
```

Do **not** commit real `TELEGRAM_BOT_TOKEN` values; use env / K8s secrets only.

---

## 9. Kubernetes Deployment

Optional Rancher deployment pins Hermes and Cline ACP to the `mac-mini` node. Hermes data and models mount from N5 Pro NFS. Secrets via `hermes-secrets`. HostPath workspace for Cline is a deliberate personal-dev tradeoff — do not copy into multi-tenant clusters.

**Hermes deployment:**

```yaml
# deploy/homelab/hermes-deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: hermes-personal
  namespace: clawql-homelab
  labels:
    app: hermes-personal
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hermes-personal
  template:
    metadata:
      labels:
        app: hermes-personal
    spec:
      nodeSelector:
        kubernetes.io/hostname: mac-mini
      containers:
        - name: hermes
          image: ghcr.io/danielsmithdevelopment/hermes-agent:2026.08
          command: ["hermes", "serve", "--config", "/data/hermes.yaml"]
          env:
            - name: TELEGRAM_BOT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: hermes-secrets
                  key: telegram-bot-token
            - name: YOUR_TELEGRAM_USER_ID
              valueFrom:
                secretKeyRef:
                  name: hermes-secrets
                  key: telegram-user-id
            - name: WORM_LOCAL_ENDPOINT
              value: "http://n5-pro-minio.clawql-homelab.svc:9000"
            - name: WORM_LOCAL_BUCKET
              value: "clawql-worm-personal"
          ports:
            - containerPort: 8787
              name: hermes-api
          volumeMounts:
            - name: hermes-data
              mountPath: /data
            - name: hermes-extensions
              mountPath: /root/.hermes/personal/extensions
            - name: ornith-model
              mountPath: /models/ornith-1.5-35b-a3b
              readOnly: true
          resources:
            requests:
              memory: "8Gi"
              cpu: "4"
            limits:
              memory: "16Gi"
              cpu: "8"
          livenessProbe:
            httpGet:
              path: /health
              port: 8787
            initialDelaySeconds: 30
            periodSeconds: 30
      volumes:
        - name: hermes-data
          persistentVolumeClaim:
            claimName: hermes-personal-pvc
        - name: hermes-extensions
          configMap:
            name: hermes-worm-extensions
        - name: ornith-model
          nfs:
            server: n5-pro.tailnet
            path: /mnt/tank/models/ornith-1.5-35b-a3b
---
apiVersion: v1
kind: Service
metadata:
  name: hermes-personal
  namespace: clawql-homelab
spec:
  selector:
    app: hermes-personal
  ports:
    - port: 8787
      targetPort: 8787
      name: hermes-api
  type: ClusterIP
```

**Cline ACP deployment:**

```yaml
# deploy/homelab/cline-deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: cline-acp
  namespace: clawql-homelab
  labels:
    app: cline-acp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cline-acp
  template:
    metadata:
      labels:
        app: cline-acp
    spec:
      nodeSelector:
        kubernetes.io/hostname: mac-mini
      containers:
        - name: cline
          image: ghcr.io/danielsmithdevelopment/cline-acp:2026.08
          command: ["cline", "server", "--port", "8095", "--acp-enabled"]
          env:
            - name: WORM_LOCAL_ENDPOINT
              value: "http://n5-pro-minio.clawql-homelab.svc:9000"
            - name: WORM_LOCAL_BUCKET
              value: "clawql-worm-personal"
          ports:
            - containerPort: 8095
              name: acp
          volumeMounts:
            - name: cline-config
              mountPath: /root/.cline
            - name: workspace
              mountPath: /Users/danielsmith/ClawQL-harvey-lab
          resources:
            requests:
              memory: "2Gi"
              cpu: "1"
            limits:
              memory: "4Gi"
              cpu: "2"
          livenessProbe:
            httpGet:
              path: /acp/health
              port: 8095
            initialDelaySeconds: 15
            periodSeconds: 20
      volumes:
        - name: cline-config
          configMap:
            name: cline-config
        - name: workspace
          hostPath:
            path: /Users/danielsmith/ClawQL-harvey-lab
            type: Directory
---
apiVersion: v1
kind: Service
metadata:
  name: cline-acp
  namespace: clawql-homelab
spec:
  selector:
    app: cline-acp
  ports:
    - port: 8095
      targetPort: 8095
      name: acp
  type: ClusterIP
```

**Rancher / kubectl apply:**

```bash
# Create namespace and secrets (run once)
kubectl create namespace clawql-homelab
kubectl create secret generic hermes-secrets \
  --namespace clawql-homelab \
  --from-literal=telegram-bot-token="${TELEGRAM_BOT_TOKEN}" \
  --from-literal=telegram-user-id="${YOUR_TELEGRAM_USER_ID}"

# ConfigMaps from local files
kubectl create configmap hermes-worm-extensions \
  --namespace clawql-homelab \
  --from-file=worm_agent.py=~/.hermes/personal/extensions/worm_agent.py

kubectl create configmap cline-config \
  --namespace clawql-homelab \
  --from-file=config.json=~/.cline/config.json \
  --from-file=worm-instrumentation.ts=~/.cline/hooks/worm-instrumentation.ts

# PVC for Hermes state (N5 Pro storage class)
kubectl apply -f deploy/homelab/hermes-pvc.yaml

# Deploy via Rancher UI or kubectl
kubectl apply -f deploy/homelab/hermes-deployment.yaml
kubectl apply -f deploy/homelab/cline-deployment.yaml

# Verify pods pinned to mac-mini
kubectl get pods -n clawql-homelab -o wide

# Rancher: import cluster → Apps → deploy from repo path deploy/homelab/
# Set node affinity mac-mini in Rancher workload editor if not using nodeSelector
```

---

## 10. Validation Procedure

Run this checklist before treating the stack as production-ready on the Mac Mini.

### 10.1 Ornith Smoke (five Harvey tasks) — decides Cline model

Hermes and Cline both **start on Ornith**. Run this gate before treating the personal agent as production-ready. Pass → keep Ornith for Cline. Fail → switch Cline (and optionally coding paths) to Nemotron `:8081`, re-run, document in vault.

```bash
#!/usr/bin/env bash
# ~/.hermes/personal/scripts/ornith-smoke.sh
set -euo pipefail

TASKS=(001 004 007 018 022)
HARVEY_LABS="${HARVEY_LABS:-$HOME/harvey-labs}"
ORINTH_PORT=8082
INFERENCE_PORT=8091

echo "=== Ornith smoke: ${TASKS[*]} ==="

for task in "${TASKS[@]}"; do
  echo "--- Task ${task} ---"
  LAB_TASK="firm-knowledge/tasks/${task}" \
  LAB_ARMS=ornith-clawql \
  CLAWQL_INFERENCE_URL="http://localhost:${INFERENCE_PORT}/v1" \
  MLX_MODEL_PORT="${ORINTH_PORT}" \
  bash integrations/harvey-labs/scripts/run-lab-local.sh
done

echo "=== Ornith smoke complete — keep Cline on Ornith, or fall back to Nemotron ==="
```

| Smoke result | Cline default                                                     |
| ------------ | ----------------------------------------------------------------- |
| Ornith pass  | Keep `ornith-1.5-35b-a3b` for both Hermes and Cline               |
| Ornith fail  | Switch Cline to Nemotron `:8081`; re-run smoke; document in vault |

Pass criteria: all five tasks pass under Sonnet 4.6 judge (or internal Ollama baseline for smoke-only); pre-ingest fingerprint shows Node DuckDB; call-store contains `clawql_sql` rows.

### 10.2 MCP Tool Availability

```bash
# Hermes-scoped tools (orchestration ATR)
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "X-ClawQL-ATR: $(cat ~/.hermes/personal/atr-hermes.json | base64 -w0)" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'

# Expected: memory_recall, memory_ingest, clawql_sql, web_search, search, execute, audit
# (no clawql_think; file_* / terminal_* are Cline-native, not MCP)

# Cline-scoped tools (execution ATR)
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "X-ClawQL-ATR: $(cat ~/.cline/atr-cline.json | base64 -w0)" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq '.result.tools[].name'

# Expected: clawql_sql, memory_recall, search, execute, audit

# clawql-inference lists Ornith (required); Nemotron only if fallback enabled
curl -s http://localhost:8091/v1/models | jq '.data[].id'
# Expected: mlx/ornith-1.5-35b-a3b (and openai/ornith-1.5-35b-a3b alias)
```

### 10.3 WORM Completeness Verification

```python
#!/usr/bin/env python3
# ~/.hermes/personal/scripts/verify_worm_completeness.py

"""Verify WORM session completeness and Merkle chain integrity."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

REQUIRED_CHAINS = {
    "HARVEY_LAB_SWEEP": {
        "SESSION_START", "SKILL_QUERY", "DELEGATION",
        "TERMINAL_EXEC", "SESSION_END",
    },
    "HOMELAB_HEALTH": {"CRON_TRIGGER", "SESSION_START", "SESSION_END"},
    "EXTRACTBENCH_LOOP": {
        "SESSION_START", "DELEGATION", "FILE_WRITE", "SESSION_END",
    },
}


def fetch_entries(days: int) -> list[dict]:
    endpoint = "http://n5-pro.tailnet:9000"
    bucket = "clawql-worm-personal"
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    entries: list[dict] = []

    with httpx.Client(timeout=30.0) as client:
        resp = client.get(f"{endpoint}/{bucket}/?list-type=2&prefix=sessions/")
        resp.raise_for_status()
        # Parse listing and fetch each object (simplified — use minio SDK in production)
        for line in resp.text.split("<Key>"):
            if "</Key>" not in line:
                continue
            key = line.split("</Key>")[0]
            obj = client.get(f"{endpoint}/{bucket}/{key}")
            entry = json.loads(obj.content)
            ts = datetime.fromisoformat(entry["ts"].replace("Z", "+00:00"))
            if ts >= cutoff:
                entries.append(entry)
    return entries


def verify_merkle_chain(entries: list[dict]) -> list[str]:
    errors: list[str] = []
    by_session: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        by_session[e["sessionId"]].append(e)

    for session_id, session_entries in by_session.items():
        ordered = sorted(session_entries, key=lambda x: x["ts"])
        prev: str | None = None
        for entry in ordered:
            if "merkleHash" not in entry:
                continue
            canonical = {k: v for k, v in entry.items() if k != "merkleHash"}
            chained = f"{prev or 'GENESIS'}:{json.dumps(canonical, sort_keys=True, separators=(',', ':'))}"
            expected = hashlib.sha256(chained.encode()).hexdigest()
            if entry["merkleHash"] != expected:
                errors.append(
                    f"Merkle break in session {session_id} at {entry['ts']} ({entry['kind']})"
                )
            prev = entry["merkleHash"]
    return errors


def verify_session_completeness(entries: list[dict]) -> list[str]:
    errors: list[str] = []
    by_session: dict[str, set[str]] = defaultdict(set)
    for e in entries:
        by_session[e["sessionId"]].add(e["kind"])

    for session_id, kinds in by_session.items():
        if "SESSION_START" not in kinds:
            errors.append(f"Session {session_id}: missing SESSION_START")
        if "SESSION_END" not in kinds:
            errors.append(f"Session {session_id}: missing SESSION_END")
        if "DELEGATION" in kinds and "TERMINAL_EXEC" not in kinds:
            errors.append(f"Session {session_id}: DELEGATION without TERMINAL_EXEC")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()

    print(f"Fetching WORM entries from last {args.days} days...")
    entries = fetch_entries(args.days)
    print(f"Found {len(entries)} entries across {len(set(e['sessionId'] for e in entries))} sessions")

    merkle_errors = verify_merkle_chain(entries)
    completeness_errors = verify_session_completeness(entries)

    all_errors = merkle_errors + completeness_errors
    if all_errors:
        print("FAIL:")
        for err in all_errors:
            print(f"  - {err}")
        return 1

    print("PASS: all sessions complete, Merkle chains intact")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

### 10.4 Telegram Connectivity Test

```bash
# Send test message via Hermes API (or direct Bot API smoke)
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${YOUR_TELEGRAM_USER_ID}" \
  -d "text=ClawQL Assistant online — WORM + MCP stack validated $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Or trigger via Hermes terminal:
hermes chat --message "Send Telegram test: stack validation complete"
```

---

## 11. Benchmarking the Setup

Use the same Harvey LAB SQL gold set for both agents so results are comparable.

| Agent      | Model path                                                  | What to log                                  |
| ---------- | ----------------------------------------------------------- | -------------------------------------------- |
| **Hermes** | Ornith via `:8091` (required)                               | Case id, pass/fail, latency, tool-call count |
| **Cline**  | Ornith via `:8091` (default); Nemotron only if §10.1 failed | Same + whether edit/PR path was used         |

**Protocol:** warm Ornith; pin model ids; run **001, 004, 007, 018, 022** then expand; both agents on Ornith unless smoke forced Nemotron for Cline. Store summaries under `docs/benchmarks/results/` and/or ClawQL vault. Do not change gold expected SQL to make a model pass.

After one to two weeks of live use, also run OpenBench **Family M** (cross-session memory): (1) Hermes+Cline with vault, (2) bare Ornith/Nemotron + ClawQL MCP without Hermes memory, (3) Hermes with vault sync disabled (ablation).

---

## Related repo docs

- Homelab overview: [`README.md`](README.md)
- Start scripts: [`../../scripts/dev/start-clawql-for-personal-agent.sh`](../../scripts/dev/start-clawql-for-personal-agent.sh), [`../../scripts/dev/start-clawql-inference-for-personal-agent.sh`](../../scripts/dev/start-clawql-inference-for-personal-agent.sh)
- Cline MCP snippet: [`../../examples/personal-agent/README.md`](../../examples/personal-agent/README.md)
- Inference ports: [`inference-stack.md`](inference-stack.md)
- MCP on Mac Mini: [`mcp-mac-mini.md`](mcp-mac-mini.md)
- Harvey LAB smoke gate (Ornith decision): [`harvey-lab-ts-v2-smoke-gate.md`](../benchmarks/harvey-lab-ts-v2-smoke-gate.md)
- Stack lineage: [`harvey-lab-stack-lineage.md`](../benchmarks/harvey-lab-stack-lineage.md)
- Benchmark index: [`../benchmarks/README.md`](../benchmarks/README.md)
- ATR / JWT proxy: [`../security/mcp-proxy-jwt-atr.md`](../security/mcp-proxy-jwt-atr.md)
- Auth package / SecretStore: [`../security/clawql-auth-package-spec.md`](../security/clawql-auth-package-spec.md)
- OpenClaw (distinct path): [`using-openclaw-with-clawql.md`](../openclaw/using-openclaw-with-clawql.md)
- Agent behavior when tools are denied: [`../../AGENTS.md`](../../AGENTS.md)

## Decision log (locked)

| Decision         | Choice                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Hermes model     | **Ornith** (`ornith-1.5-35b-a3b` on `:8082`)                                              |
| Cline model      | **Ornith by default**; Nemotron only if smoke fails                                       |
| Control plane    | Mac Mini M4 Pro                                                                           |
| IDP / GPU        | MS-A2 (Blackwell)                                                                         |
| Storage / enrich | N5 Pro (ClickHouse, MinIO WORM, Tika, NPU)                                                |
| Laptops          | Transient clients only                                                                    |
| Open question    | Ornith smoke on **001, 004, 007, 018, 022** → keep Ornith for Cline vs switch to Nemotron |

---

_ClawQL Personal Agent Setup · August 2026_
