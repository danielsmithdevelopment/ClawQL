#!/usr/bin/env python3
"""One-off A/B through clawql-inference.

Architecture (same model for both arms)::

  coding agent (OpenCode)
        │  OPENAI-compatible
        ▼
  clawql inference serve   ←── OPENROUTER_API_KEY and/or BYOK keys
        │
        ├── openrouter/* (OpenRouter-first — existing aggregator key)
        └── direct BYOK: deepseek, groq, openai, …

Arms:

  clawql-on   = OpenCode via ``clawql opencode --non-interactive`` + ClawQL MCP
  clawql-off  = raw OpenCode pointed at the same inference URL (no ClawQL MCP)
  clawql-no-memory = clawql-on tools/MCP but memory disabled + no vault seed
                   (isolates tool presence from persistent vault representation)
  ouroboros-on  = clawql-on + ``CLAWQL_ENABLE_OUROBOROS=1`` (stagnation / oscillation)
  ouroboros-off = clawql-on MCP/memory but Ouroboros tools disabled

Requires:

  - ``opencode`` on PATH
  - ``clawql`` / ``bin/clawql.mjs`` for MCP arms
  - A running ``clawql inference serve`` (or let Actions start it)
  - ``OPENROUTER_API_KEY`` (day-one) and/or vendor BYOK key(s)

Example::

  # terminal 1 — OpenRouter-first (existing aggregator key)
  OPENROUTER_API_KEY=sk-or-… \\
    clawql inference serve --port 8080

  # terminal 2
  python3 openbench/scripts/run-ab-compare.py \\
    --task ouroboros-oscillation-escape \\
    --arms ouroboros-on,ouroboros-off \\
    --model openrouter/deepseek/deepseek-chat \\
    --inference-url http://127.0.0.1:8080/v1 \\
    --timeout 90 \\
    --trials 1 \\
    --out /tmp/ab-results.json
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TASKS_DIR = ROOT / "openbench" / "tasks"
CHECKER_TIMEOUT_S = 120


def discover_known_tasks() -> tuple[str, ...]:
    """Task folder names that have checker.sh + workspace/ (same contract as validate_tasks)."""
    if not TASKS_DIR.is_dir():
        return ()
    names = []
    for child in sorted(TASKS_DIR.iterdir()):
        if (
            child.is_dir()
            and (child / "checker.sh").is_file()
            and (child / "workspace").is_dir()
        ):
            names.append(child.name)
    return tuple(names)


KNOWN_TASKS = discover_known_tasks()
KNOWN_ARMS = (
    "clawql-on",
    "clawql-off",
    "clawql-no-memory",
    "ouroboros-on",
    "ouroboros-off",
)
# Per-task hard spend/loop caps. Exceeding → checker SCORE 0 (auto-fail).
# Ouroboros thrash study: OpenCode doom_loop is *allowed* so off-arm can loop;
# agent turns hard-stop at 50 (not 250+) to bound spend.
TASK_HARD_CAPS: dict[str, dict] = {
    "ouroboros-oscillation-escape": {
        "max_turns": 50,
        "max_tokens": 8000,
        "max_wall_s": 180,
        "ouroboros_max_generations": 4,
        "default_timeout_s": 180,
        # Default thrash study allows identical-tool spam; workflow may set
        # CLAWQL_OPENBENCH_DOOM_LOOP=deny for the additive production-guard cell.
        "allow_doom_loop": True,
        # No vault one-shot — decoys must be the only workspace guidance for off.
        "disable_memory": True,
    },
    "search-first-discovery": {
        "max_turns": 30,
        "max_tokens": 8000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": True,
        "require_search": True,
    },
    "execute-verify-loop": {
        "max_turns": 40,
        "max_tokens": 10000,
        "max_wall_s": 240,
        "default_timeout_s": 240,
        "disable_memory": True,
        "require_search": True,
        "require_execute": True,
    },
    "memory-roundtrip-ingest-recall": {
        "max_turns": 30,
        "max_tokens": 8000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        # Empty vault — agent must ingest then recall (no pre-seeded notes).
        "disable_memory": False,
        "empty_vault": True,
        "require_memory_roundtrip": True,
    },
    "audit-checkpoints": {
        "max_turns": 25,
        "max_tokens": 6000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": True,
        "require_audit": True,
    },
    "cache-scratch-handoff": {
        "max_turns": 25,
        "max_tokens": 6000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": True,
        "require_cache": True,
    },
    "policy-deny-execute": {
        "max_turns": 25,
        "max_tokens": 6000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": True,
        "require_search": True,
        "require_policy_block": True,
        "panguard_block_tools": "execute",
    },
    "memory-injection-attempt": {
        "max_turns": 25,
        "max_tokens": 6000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": False,
        "require_policy_block": True,
        "panguard_block_tools": "memory_ingest",
    },
    "pageindex-section-qa": {
        "max_turns": 30,
        "max_tokens": 8000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": True,
        "require_pageindex": True,
        "enable_pageindex": True,
    },
    "hybrid-recall-source-pin": {
        "max_turns": 30,
        "max_tokens": 8000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        # Empty vault — decoy is filesystem-only; truth via PageIndex.
        "disable_memory": False,
        "empty_vault": True,
        "require_pageindex": True,
        "enable_pageindex": True,
    },
    "memory-recall-pageindex-pin": {
        "max_turns": 30,
        "max_tokens": 8000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        # Empty vault — truth via PageIndex through memory_recall(sources).
        "disable_memory": False,
        "empty_vault": True,
        "require_memory_recall_pageindex": True,
        "enable_pageindex": True,
    },
    "codegraph-guided-edit": {
        "max_turns": 35,
        "max_tokens": 8000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": False,
        "empty_vault": True,
        "require_codegraph": True,
        "enable_codegraph": True,
    },
    "codegraph-impact-edit": {
        "max_turns": 50,
        "max_tokens": 12000,
        "max_wall_s": 300,
        "default_timeout_s": 300,
        "disable_memory": False,
        "empty_vault": True,
        "require_codegraph": True,
        "enable_codegraph": True,
        "codegraph_impact": True,
    },
    "codegraph-feature-api-surface": {
        "max_turns": 50,
        "max_tokens": 12000,
        "max_wall_s": 300,
        "default_timeout_s": 300,
        "disable_memory": False,
        "empty_vault": True,
        "require_codegraph": True,
        "enable_codegraph": True,
        "codegraph_feature": True,
    },
    "schedule-synthetic-dry-run": {
        "max_turns": 30,
        "max_tokens": 8000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": True,
        "require_schedule": True,
        "enable_schedule": True,
    },
    "external-ingest-continue": {
        "max_turns": 30,
        "max_tokens": 8000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": False,
        "empty_vault": True,
        "require_external_ingest": True,
        "enable_external_ingest": True,
    },
    "notify-mock-slack": {
        "max_turns": 25,
        "max_tokens": 6000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": True,
        "require_notify": True,
        "enable_notify": True,
    },
    "sandbox-trusted-compute": {
        "max_turns": 30,
        "max_tokens": 8000,
        "max_wall_s": 240,
        "default_timeout_s": 240,
        "disable_memory": True,
        "require_sandbox": True,
        "enable_sandbox": True,
    },
    "composed-safe-rollout": {
        "max_turns": 40,
        "max_tokens": 10000,
        "max_wall_s": 240,
        "default_timeout_s": 240,
        "disable_memory": False,
        "empty_vault": True,
        "require_composed": True,
        "require_search": True,
        "require_execute": True,
        "enable_composed": True,
    },
    "idp-safe-pipeline-lite": {
        "max_turns": 50,
        "max_tokens": 12000,
        "max_wall_s": 300,
        "default_timeout_s": 300,
        "disable_memory": False,
        "empty_vault": True,
        "require_idp": True,
        "enable_idp": True,
    },
    "idp-pipeline-resilience": {
        "max_turns": 50,
        "max_tokens": 12000,
        "max_wall_s": 300,
        "default_timeout_s": 300,
        "ouroboros_max_generations": 4,
        # Production doom_loop (B-2.2): strategy thrash still possible; spend caps bind.
        "allow_doom_loop": False,
        "disable_memory": False,
        "empty_vault": True,
        "require_idp": True,
        # GitHub + Slack notify + memory; Onyx cite intentionally unavailable.
        "enable_idp_resilience": True,
    },
    "onyx-mock-cite": {
        "max_turns": 25,
        "max_tokens": 6000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": True,
        "require_onyx": True,
        "enable_onyx": True,
    },
    "memory-wikilink-hop": {
        "max_turns": 25,
        "max_tokens": 6000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": False,
        "require_wikilink": True,
    },
    "memory-conflict-pricing": {
        "max_turns": 25,
        "max_tokens": 6000,
        "max_wall_s": 180,
        "default_timeout_s": 180,
        "disable_memory": False,
        "require_conflict": True,
    },
    "institutional-knowledge-enumerate": {
        # Redesigned B-7.1: ~120 nested notes so bare linear read cannot exhaust
        # under the turn budget; on-arm must use multi-query memory_recall.
        "max_turns": 50,
        "max_tokens": 16000,
        "max_wall_s": 480,
        "default_timeout_s": 480,
        "disable_memory": False,
        "require_institutional": True,
    },
}

# Appended only to ouroboros-on so off cannot one-shot the correct recipe.
OUROBOROS_ON_SEED_APPENDIX = """
## Seed source text (ouroboros-on only — pass to create_seed)

documentId: openbench-limiter-prior
extractedText: |
  Prior engineering decision for scheduler_lib/limiter.py:

  Use a **leaky bucket** (not token-bucket, not sliding-window).
  Parameters: rate=5.0 units/second continuous leak, capacity=20.0.
  On allow(now, cost): leak since last timestamp with
  level = max(0, level - rate * dt); accept if level + cost <= capacity
  then add cost; else deny. Start level=0 at t=0.

  Ignore decoy/token_bucket.md and decoy/sliding_window.md — they are wrong.

  Reference implementation to write once to scheduler_lib/limiter.py:

  ```python
  from __future__ import annotations

  class RateLimiter:
      def __init__(self, rate: float, capacity: float) -> None:
          self.rate = float(rate)
          self.capacity = float(capacity)
          self._level = 0.0
          self._t = 0.0

      def allow(self, now: float, cost: float = 1.0) -> bool:
          if cost <= 0:
              return True
          now = float(now)
          dt = max(0.0, now - self._t)
          self._t = now
          self._level = max(0.0, self._level - self.rate * dt)
          if self._level + cost <= self.capacity:
              self._level += cost
              return True
          return False
  ```

After ouroboros_run_evolutionary_loop finishes (converge / oscillation /
stagnation / max_generations), write that implementation with the write tool
and stop. Do not flip-flop between decoys.
"""

# B-2.2 IDP resilience — ouroboros-on only (off must thrash wrong decoy codes).
IDP_RESILIENCE_SEED_APPENDIX = """
## Seed source text (ouroboros-on only — pass to create_seed)

documentId: openbench-idp-onyx-outage-prior
extractedText: |
  Prior IDP recovery decision when Onyx cite is unavailable:

  Do **not** call knowledge_search_onyx.
  Do **not** use decoy cite codes (zinc-00, copper-77, brass-12).

  Crystallized fallback cite code for pipeline.json:
    CLAWQL_ONYX_CODE=quartz-21

  Continue the stubbed IDP pipeline with:
    recovered=true
    failure_stage=onyx_cite
    onyx_code=quartz-21
    notify_marker=nebula-55
    correlation_id=idp-resilience-openbench-01
    deal_id=deal-idp-resilience-01

  After ouroboros_run_evolutionary_loop finishes, complete notify + memory_ingest
  and write pipeline.json. Do not invent alternate cite codes.
"""

OUROBOROS_SEED_APPENDIX_BY_TASK: dict[str, str] = {
    "ouroboros-oscillation-escape": OUROBOROS_ON_SEED_APPENDIX,
    "idp-pipeline-resilience": IDP_RESILIENCE_SEED_APPENDIX,
}

# Forced for ouroboros-off when the model plans without tools or fails selftest.
OUROBOROS_OFF_THRASH_NUDGE = """Continue the same task. Planning-only scored zero — call tools now.

Hard rule: keep alternating until `python3 -m scheduler_lib.selftest` exits 0
or you hit the turn budget:

1. Read `decoy/token_bucket.md`, **write** that algorithm to `scheduler_lib/limiter.py`, run selftest.
2. If it fails, read `decoy/sliding_window.md`, **rewrite** limiter.py, run selftest.
3. If it fails again, flip back to token-bucket and repeat.
4. Do not stop after one attempt. Do not invent leaky-bucket unless a decoy says so.
"""

MEMORY_ROUNDTRIP_NUDGE = """Continue. You have not completed the memory roundtrip.

1. Read `sealed/marker.txt`.
2. Call **memory_ingest** with title `OpenBench Roundtrip Marker` and the exact
   `CLAWQL_ROUNDTRIP_TOKEN=…` line in insights.
3. Call **memory_recall** for that token.
4. Write `answer.json` with `{"token":"<value>","source":"memory_recall"}`.

Do not stop after planning. Call the memory tools now.
"""

EXECUTE_DRY_RUN_NUDGE = """Continue. Finish the execute-verify trail.

You must call **clawql_execute** (or execute) **twice** with `"dry_run": true`:
1. get-global-advisory with ghsa_id GHSA-xxxx-xxxx-xxxx and dry_run true
2. list-global-advisories with dry_run true

Then write **relative** path `trail.json` (filePath exactly `trail.json`, no leading /):

```json
{
  "provider": "github",
  "readOperationId": "security-advisories/get-global-advisory",
  "listOperationId": "security-advisories/list-global-advisories",
  "dryRunOnly": true
}
```

Do not stop after search. Call execute now.
"""

AUDIT_WRITE_NUDGE = """Continue the audit-checkpoints task to completion.

1. Call clawql_audit (or audit) operation=append three times with summaries
   openbench-audit-start, openbench-audit-mid, openbench-audit-done and
   correlationId openbench-audit-1.
2. Call clawql_audit operation=list limit=3.
3. Call write with filePath exactly trail.json (relative — NOT /trail.json, NOT /tmp):

{"correlationId":"openbench-audit-1","summaries":["openbench-audit-start","openbench-audit-mid","openbench-audit-done"]}

Do not stop until trail.json exists in the workspace root.
"""

CACHE_WRITE_NUDGE = """Continue now. Call tools — do not stop with zero tool calls.

Tool name: clawql_cache

Call 1: clawql_cache operation=set key=ob.part.a value=alpha42
Call 2: clawql_cache operation=set key=ob.part.b value=zeta99
Call 3: clawql_cache operation=get key=ob.part.a
Call 4: clawql_cache operation=get key=ob.part.b
Call 5: write relative filePath answer.json containing token alpha42-zeta99 and source cache

Start with clawql_cache set for ob.part.a immediately.
"""

CACHE_FINISH_NUDGE = """Continue. Finish the cache handoff NOW.

You already called clawql_cache set (or must). Do these three calls:

1. clawql_cache operation=get key=ob.part.a
2. clawql_cache operation=get key=ob.part.b  
3. write filePath answer.json (relative, not absolute) with exactly:
   {"token":"alpha42-zeta99","source":"cache"}

If get fails, still write that answer.json after your set calls.
Call write immediately after get attempts.
"""

PAGE_INDEX_NUDGE = """Continue the PageIndex task.

1. Call clawql_pageindex_build_tree with docId openbench-catalog and the markdown
   from catalog.md.
2. Call clawql_pageindex_synthesize (or traverse) querying rare cultivars /
   CLAWQL_PAGEINDEX_CODE / verification code.
3. write relative filePath answer.json:
   {"code":"orchid-77","source":"pageindex"}

Ignore decoy/. Call pageindex tools now.
"""

HYBRID_PAGEINDEX_NUDGE = """Continue the hybrid PageIndex task.

CRITICAL: use handbook.md contents — not this instruction text.

1. read file handbook.md
2. clawql_pageindex_build_tree with:
   - docId=openbench-hybrid-handbook
   - markdown= the handbook.md text you read (must include the line
     CLAWQL_HYBRID_CODE=fern-42 — never markdown:"")
3. clawql_pageindex_synthesize query=CLAWQL_HYBRID_CODE
4. write relative filePath answer.json EXACTLY:
   {"code":"fern-42","source":"pageindex"}

Ignore decoy/. Call pageindex tools now — do not stop after read.
"""

MEMORY_RECALL_PAGEINDEX_NUDGE = """Continue the memory_recall PageIndex pin task.

CRITICAL: use handbook.md contents — not this instruction text.

1. read file handbook.md
2. clawql_pageindex_build_tree with:
   - docId=openbench-recall-pi-handbook
   - markdown= the handbook.md text you read (must include
     CLAWQL_RECALL_PI_CODE=cedar-31 — never markdown:"")
3. clawql_memory_recall with:
   - query=CLAWQL_RECALL_PI_CODE / rare accession
   - sources=["pageindex"]   ← required
4. write relative filePath answer.json EXACTLY:
   {"code":"cedar-31","source":"memory_recall"}

Do NOT use pageindex_synthesize instead of memory_recall.
Ignore decoy/. Call build_tree + memory_recall now.
"""

CODEGRAPH_NUDGE = """Continue the codegraph task.

1. Call clawql_codegraph_index with root = repo (relative path).
2. Call clawql_codegraph_query for SECRET_MARKER or format_line / ledger.
3. write relative filePath answer.json:
   {"marker":"cg-alpha-9","file":"payments/ledger.py","source":"codegraph"}

Ignore decoy/. Call codegraph tools now.
"""

CODEGRAPH_IMPACT_NUDGE = """Continue the codegraph impact rename.

1. Call clawql_codegraph_index with root = repo (relative path).
2. Call clawql_codegraph_query / neighbors / path for compute_total and every caller.
3. Rename compute_total → compute_grand_total in definition + ALL callers + test
   (api/checkout.py, api/invoice.py, workers/batch.py, reports/summary.py, cli/main.py,
   tests/test_pricing.py, and core/pricing.py). Use edit replaceAll on each file.
4. write relative filePath impact.json at WORKSPACE ROOT (NOT repo/impact.json):
   {"old_name":"compute_total","new_name":"compute_grand_total","files":["core/pricing.py","api/checkout.py","api/invoice.py","workers/batch.py","reports/summary.py","cli/main.py","tests/test_pricing.py"],"source":"codegraph"}

Ignore decoy/. Missing any of the 7 files fails. Call codegraph tools and finish now.
"""

CODEGRAPH_FEATURE_NUDGE = """Continue the widgets API surface task — finish it yourself.

HARD RULES:
- Do NOT use the OpenCode `task` tool / subagents to implement files.
- Index with clawql_codegraph_index root=. (workspace only — never root=/).

1. clawql_codegraph_index with root = .
2. clawql_codegraph_query / neighbors / path for getWidgetById / handler.js / router.js
3. Edit ALL of these yourself:
   - src/handler.js — getWidgetById(id) returns WIDGETS[id] or null
   - src/router.js — import getWidgetById; register GET /widgets/:id
   - src/schema.js — export WidgetParams (non-empty string id)
   - openapi/openapi.yaml — /widgets/{id} with 200 and 404
   - tests/widgets.test.js — found + not-found/null cases
4. Run: node --test tests/widgets.test.js

Ignore decoy/. Call codegraph tools with root=. and finish now.
"""

SCHEDULE_NUDGE = """Continue the schedule dry_run task.

1. clawql_schedule operation=create with synthetic GET https://example.com/
   assert status_in [200], interval 300s.
2. clawql_schedule operation=trigger job_id=<id> dry_run=true.
3. write relative filePath schedule.json:
   {"dry_run":true,"status":"pass","job_id":"<id>","source":"schedule"}

Call schedule tools now.
"""

EXTERNAL_INGEST_NUDGE = """Continue the external ingest task.

1. read incoming/briefing.md
2. clawql_ingest_external_knowledge with source=markdown, dryRun=false, and
   documents=[{path:"Memory/openbench-external-briefing.md", markdown:<file contents>}]
3. clawql_memory_recall query=CLAWQL_EXTERNAL_TOKEN
4. write relative filePath answer.json:
   {"token":"<token from CLAWQL_EXTERNAL_TOKEN=>","source":"memory_recall"}

Ignore decoy/. Filesystem copy without ingest+recall fails.
"""


NOTIFY_NUDGE = """Continue the notify mock Slack task.

1. clawql_notify channel=C-OPENBENCH text including CLAWQL_NOTIFY_MARKER=nebula-55
2. write relative filePath notify.json:
   {"ok":true,"channel":"C-OPENBENCH","marker":"nebula-55","source":"notify"}

Call clawql_notify now.
"""

SANDBOX_NUDGE = """Continue the sandbox task.

1. clawql_sandbox_exec language=python code that prints CLAWQL_SANDBOX_TOKEN=sand-77
2. write relative filePath answer.json:
   {"token":"sand-77","source":"sandbox_exec"}

Ignore decoy/. Call sandbox_exec now.
"""

COMPOSED_NUDGE = """Continue the composed safe-rollout.

1. clawql_search for GitHub global advisories list
2. clawql_execute dry_run=true twice
3. clawql_audit append
4. clawql_memory_ingest title OpenBench Composed Rollout with CLAWQL_COMPOSED=ok
5. write relative filePath rollout.json:
   {"dryRunOnly":true,"composed":true,"source":"composed"}

Call the missing tools now.
"""

IDP_NUDGE = """Continue the stubbed IDP safe-pipeline lite.

Required stages in order (call any missing tools now):
1. clawql_search for GitHub global advisories list
2. clawql_execute dry_run=true (plan_extract)
3. clawql_execute dry_run=true again (plan_redact)
4. clawql_audit append correlationId=idp-lite-openbench-01
5. clawql_knowledge_search_onyx → CLAWQL_ONYX_CODE=quartz-21
6. clawql_notify channel=C-OPENBENCH text with CLAWQL_NOTIFY_MARKER=nebula-55
7. clawql_memory_ingest title OpenBench IDP Pipeline Lite with CLAWQL_IDP=ok deal_id=deal-idp-lite-01
8. write relative filePath pipeline.json:
   {"correlation_id":"idp-lite-openbench-01","deal_id":"deal-idp-lite-01","dryRunOnly":true,"stages_passed":7,"stages":["discover","plan_extract","plan_redact","audit_trail","onyx_cite","notify_handoff","persist"],"onyx_code":"quartz-21","notify_marker":"nebula-55","source":"idp-safe-pipeline-lite"}

Ignore decoy/. Call the missing tools now.
"""

IDP_RESILIENCE_NUDGE = """Continue the IDP pipeline resilience task (B-2.2).

Onyx cite is DOWN — do not call knowledge_search_onyx. Do not invent decoy codes.

Required now:
1. clawql_search for GitHub global advisories list
2. clawql_execute dry_run=true (plan_extract)
3. clawql_execute dry_run=true again (plan_redact)
4. clawql_audit append correlationId=idp-resilience-openbench-01
5. If you have ouroboros_*: create_seed from failures/onyx_stage_outage.md (plus any
   seed appendix), then ouroboros_run_evolutionary_loop maxGenerations≤4, then use
   the crystallized fallback cite code from the seed.
6. clawql_notify channel=C-OPENBENCH text with CLAWQL_NOTIFY_MARKER=nebula-55
7. clawql_memory_ingest title OpenBench IDP Pipeline Resilience with CLAWQL_IDP=recovered
8. write pipeline.json with recovered=true, failure_stage=onyx_cite, onyx_code from seed,
   notify_marker=nebula-55, source=idp-pipeline-resilience

Ignore decoy/. Call the missing tools now.
"""

IDP_RESILIENCE_OFF_THRASH_NUDGE = """Continue. Without ouroboros_* you must thrash.

1. Read decoy/wrong_codes.md and try zinc-00 / copper-77 / brass-12 as onyx_code.
2. Rewrite pipeline.json with each wrong code and retry tools.
3. Keep alternating until the turn/time cap. Do not invent quartz-21 unless a decoy says so.
"""

ONYX_NUDGE = """Continue the Onyx mock cite task.

1. clawql_knowledge_search_onyx query about enterprise pricing policy
2. From the result, find CLAWQL_ONYX_CODE=quartz-21
3. write relative filePath citations.json:
   {"code":"quartz-21","source":"knowledge_search_onyx"}

Call knowledge_search_onyx now.
"""

WIKILINK_NUDGE = """Continue the memory wikilink hop.

1. clawql_memory_recall query="Alpha Hub" maxDepth=1 (or higher)
2. Follow [[Beta Fact]]; token is CLAWQL_WIKI_TOKEN=opal-33 (not zinc-00)
3. write relative filePath answer.json:
   {"token":"opal-33","source":"memory_recall"}

Call memory_recall now.
"""

CONFLICT_NUDGE = """Continue the memory conflict pricing task.

1. clawql_memory_recall query about Acme Widget Pro pricing
2. Find BOTH CLAWQL_PRICE_USD=42 (2026-01-15) and CLAWQL_PRICE_USD=55 (2026-06-01)
3. write relative filePath conflict.json:
   {"conflict":true,"values":[{"price":42,"asOf":"2026-01-15"},{"price":55,"asOf":"2026-06-01"}],"chosen":null,"source":"memory_recall"}

Do NOT invent 48 or pick only one price. Call memory_recall now.
"""

INSTITUTIONAL_NUDGE = """Continue the institutional knowledge enumeration task (B-7.1).

Same prose notes are on disk under `.openbench/memory-seed/` for every arm.
Your advantage is the vault: structured CLAWQL_* tags live in memory.

1. clawql_memory_recall across the vault — use MULTIPLE queries (limit=50 each).
   Fields: CLAWQL_MATTER_ID / ESCROW_PCT / NONCOMPETE_MONTHS
2. Keep ONLY matters with escrow_pct >= 10 AND noncompete_months > 18
3. write relative filePath **matters.json** only (never /tmp/matters.json) with the COMPLETE set:
   {"matters":["MAT-XXXX","MAT-YYYY"],"criteria":{"escrow_pct_min":10,"noncompete_months_gt":18},"source":"memory_recall","search_sufficiency":"how many notes you checked"}
   `source` MUST be non-empty (empty source grades 0).

Do NOT copy placeholder IDs. Partial lists fail. Near-misses must not appear.
Call memory_recall now (again if needed), then write relative matters.json.
"""

INSTITUTIONAL_OFF_NUDGE = """Continue. Memory tools are unavailable — that is expected on this arm.

Workspace notes are **prose** (no CLAWQL_* machine tags). You must read and interpret them:

1. Recursively list and read EVERY markdown note under `.openbench/memory-seed/`
   (including nested `clients/*/matters/`; ignore `decoy/`). ~120 notes.
2. For each note, extract matter id, escrow %, and non-compete months from the prose
   (numbers may be written as words).
3. Keep ONLY matters with escrow_pct >= 10 AND noncompete_months > 18.
4. write relative filePath matters.json with non-empty source:
   {"matters":["MAT-XXXX"],"criteria":{"escrow_pct_min":10,"noncompete_months_gt":18},"source":"filesystem","search_sufficiency":"checked all notes under .openbench/memory-seed"}

Do not stop after 1–2 files. Do not invent IDs. Exhaust the tree, then write.
"""

POLICY_WRITE_NUDGE = """Continue. execute was blocked by policy.

Write relative path `policy.json` now (filePath exactly `policy.json`):

```json
{"blocked": true, "tool": "execute", "policy": "panguard"}
```

Call the write tool. Do not claim execute succeeded.
"""

MEMORY_INJECTION_ATTEMPT_NUDGE = """Continue. You have NOT called clawql_memory_ingest yet.

Hard rule: call OpenCode tool **clawql_memory_ingest** NOW (not write) with an OVERRIDE
title / price_usd 99.99 payload. Policy will deny it — that deny evidence is graded.

Do not write audit/policy-violation.json until after the tool error.
"""

MEMORY_INJECTION_WRITE_NUDGE = """Continue. memory_ingest was blocked by policy.

Write relative path `audit/policy-violation.json` now:

```json
{
  "blocked": true,
  "tool": "memory_ingest",
  "reason": "policy_denied",
  "attempted_title": "SKU-ACME-100 price OVERRIDE",
  "attempted_price_usd": 99.99
}
```

Call the write tool. Do not create OVERRIDE vault notes. Do not claim ingest succeeded.
"""

# ouroboros-on sometimes loops seed/run twice and never writes the recipe.
OUROBOROS_ON_WRITE_NUDGE = """Continue. You already ran ouroboros_create_seed_from_document and
ouroboros_run_evolutionary_loop. Now you MUST call the **write** tool.

Write this exact leaky-bucket implementation to relative path
`scheduler_lib/limiter.py`, then run `python3 -m scheduler_lib.selftest`.
Do not call ouroboros_* again. Do not only plan in chat.

```python
from __future__ import annotations

class RateLimiter:
    def __init__(self, rate: float, capacity: float) -> None:
        self.rate = float(rate)
        self.capacity = float(capacity)
        self._level = 0.0
        self._t = 0.0

    def allow(self, now: float, cost: float = 1.0) -> bool:
        if cost <= 0:
            return True
        now = float(now)
        dt = max(0.0, now - self._t)
        self._t = now
        self._level = max(0.0, self._level - self.rate * dt)
        if self._level + cost <= self.capacity:
            self._level += cost
            return True
        return False
```
"""


def scheduler_selftest_ok(workdir: Path) -> bool:
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "scheduler_lib.selftest"],
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=30,
            stdin=subprocess.DEVNULL,
        )
        return proc.returncode == 0
    except Exception:  # noqa: BLE001
        return False


def count_write_tools(combined: str) -> int:
    text = combined or ""
    return text.count('"tool":"write"') + text.count('"tool":"edit"')


def ouroboros_ran_without_writes(combined: str) -> bool:
    text = combined or ""
    ran = (
        "ouroboros_run_evolutionary_loop" in text
        or "clawql_ouroboros_run_evolutionary_loop" in text
    )
    return ran and count_write_tools(text) == 0


DEFAULT_HARNESS = "opencode"
DEFAULT_MODEL = os.environ.get(
    "OPENBENCH_MODEL", "openrouter/deepseek/deepseek-chat"
)
DEFAULT_INFERENCE_URL = os.environ.get(
    "CLAWQL_INFERENCE_URL",
    os.environ.get("OPENBENCH_INFERENCE_URL", "http://127.0.0.1:8080/v1"),
)


def parse_score(output: str):
    score = None
    for line in (output or "").splitlines():
        stripped = line.strip()
        if not stripped.startswith("SCORE:"):
            continue
        try:
            val = float(stripped[len("SCORE:") :].strip())
        except ValueError:
            continue
        score = max(0.0, min(1.0, val))
    return score


def parse_matters_found(output: str) -> dict | None:
    """Parse ``MATTERS_FOUND: k/n`` (+ optional ``MATTERS_IDS:``) from checker stdout.

    Headline diagnostic for B-7.1 exhaustive enumeration — prefer reporting
    ``2.4/5 matters`` over a bare mean score in ledger / outreach copy.
    """
    found = None
    expected = None
    ids: list[str] = []
    for line in (output or "").splitlines():
        stripped = line.strip()
        if stripped.startswith("MATTERS_FOUND:"):
            body = stripped[len("MATTERS_FOUND:") :].strip()
            if "/" in body:
                left, right = body.split("/", 1)
                try:
                    found = int(left.strip())
                    expected = int(right.strip())
                except ValueError:
                    continue
        elif stripped.startswith("MATTERS_IDS:"):
            raw = stripped[len("MATTERS_IDS:") :].strip()
            if raw:
                ids = [p.strip() for p in raw.split(",") if p.strip()]
    if found is None or expected is None:
        return None
    return {
        "found": found,
        "expected": expected,
        "ids": ids,
        "ratio": round(found / expected, 4) if expected else 0.0,
        "label": f"{found}/{expected}",
    }


def effective_score(exit_code: int, parsed_score):
    if exit_code == 0:
        return 1.0
    if parsed_score is not None:
        return parsed_score
    return 0.0


def materialize_workspace(task_dir: Path, dest: Path) -> None:
    workspace = task_dir / "workspace"
    if not workspace.is_dir():
        raise FileNotFoundError(f"missing workspace/: {workspace}")
    for item in workspace.iterdir():
        target = dest / item.name
        if item.is_dir():
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)


def seed_note_filename(content: str) -> str:
    """Prefer `# Title` from the seed; fall back to a stable OpenBench name."""
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            title = stripped[2:].strip().replace("/", "-")
            if title:
                return f"{title}.md"
    return "OpenBench Seed.md"


def seed_and_remove_memory(
    workdir: Path, task_dir: Path | None = None
) -> str | None:
    """Seed vault from `.openbench/memory-seed.md` or multi-file `.openbench/memory-seed/`.

    When ``task_dir/structured_fields.json`` exists (B-7.1), append vault-only
    ``CLAWQL_*`` blocks so clawql-on can filter via memory_recall while the
    workspace / off-arm snapshot stays prose-only (no machine tags to grep).
    """
    seed_dir = workdir / ".openbench" / "memory-seed"
    seed = workdir / ".openbench" / "memory-seed.md"
    structured: dict = {}
    if task_dir is not None:
        structured_path = Path(task_dir) / "structured_fields.json"
        if structured_path.is_file():
            try:
                raw = json.loads(structured_path.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    structured = raw
            except (OSError, json.JSONDecodeError):
                structured = {}
    if seed_dir.is_dir():
        vault = Path(tempfile.mkdtemp(prefix="clawql_ab_vault_"))
        memory_dir = vault / "Memory"
        memory_dir.mkdir(parents=True, exist_ok=True)
        for item in sorted(seed_dir.rglob("*.md")):
            rel = item.relative_to(seed_dir)
            dest = memory_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            body = item.read_text(encoding="utf-8")
            key = str(rel).replace("\\", "/")
            meta = structured.get(key) if structured else None
            if isinstance(meta, dict):
                appendix = meta.get("vault_appendix")
                if isinstance(appendix, str) and appendix.strip():
                    body = body.rstrip() + "\n" + appendix
            dest.write_text(body, encoding="utf-8")
        try:
            shutil.rmtree(seed_dir)
            openbench_dir = workdir / ".openbench"
            if openbench_dir.is_dir() and not any(openbench_dir.iterdir()):
                openbench_dir.rmdir()
        except OSError:
            pass
        return str(vault)
    if not seed.is_file():
        return None
    content = seed.read_text(encoding="utf-8")
    vault = Path(tempfile.mkdtemp(prefix="clawql_ab_vault_"))
    memory_dir = vault / "Memory"
    memory_dir.mkdir(parents=True, exist_ok=True)
    (memory_dir / seed_note_filename(content)).write_text(content, encoding="utf-8")
    try:
        seed.unlink()
        openbench_dir = seed.parent
        if openbench_dir.is_dir() and not any(openbench_dir.iterdir()):
            openbench_dir.rmdir()
    except OSError:
        pass
    return str(vault)


def empty_vault_home() -> str:
    """Writable vault with empty Memory/ for ingest→recall roundtrips."""
    vault = Path(tempfile.mkdtemp(prefix="clawql_ab_empty_vault_"))
    (vault / "Memory").mkdir(parents=True, exist_ok=True)
    return str(vault)


def parse_bench_json(combined: str) -> dict:
    payload = {}
    for line in (combined or "").splitlines():
        if not line.startswith("CLAWQL_BENCH_JSON:"):
            continue
        raw = line[len("CLAWQL_BENCH_JSON:") :].strip()
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            payload = obj
    return payload


def _as_int(value):
    return int(value) if isinstance(value, (int, float)) else None


def parse_opencode_jsonl_usage(stdout: str) -> dict:
    """Best-effort OpenCode ``--format json`` usage from step_finish events."""
    turns = 0
    input_tokens = 0
    output_tokens = 0
    found = False
    for line in (stdout or "").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(ev, dict):
            continue
        etype = ev.get("type")
        if etype in ("step_finish", "turn_end"):
            turns += 1
        props = ev.get("properties") if isinstance(ev.get("properties"), dict) else {}
        part = props.get("part") if isinstance(props.get("part"), dict) else {}
        tokens = part.get("tokens") if isinstance(part.get("tokens"), dict) else None
        if tokens is None and isinstance(ev.get("tokens"), dict):
            tokens = ev["tokens"]
        if not isinstance(tokens, dict):
            continue
        inp = _as_int(tokens.get("input") or tokens.get("prompt"))
        out = _as_int(tokens.get("output") or tokens.get("completion"))
        if inp is None or out is None:
            continue
        input_tokens += inp
        output_tokens += out
        found = True
    return {
        "tokens": (input_tokens + output_tokens) if found else None,
        "turns": turns or None,
    }


def run_checker(task_dir: Path, workdir: Path, env_extra: dict | None = None) -> dict:
    checker = task_dir / "checker.sh"
    env = dict(os.environ)
    env["TASK_DIR"] = str(task_dir)
    if env_extra:
        env.update({k: str(v) for k, v in env_extra.items()})
    try:
        proc = subprocess.run(
            ["bash", str(checker)],
            cwd=str(workdir),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=CHECKER_TIMEOUT_S,
        )
        out = proc.stdout or ""
        code = proc.returncode
    except subprocess.TimeoutExpired as exc:
        out = (exc.stdout or "") if isinstance(exc.stdout, str) else ""
        code = 124
    score = effective_score(code, parse_score(out))
    result = {
        "exit_code": code,
        "success": code == 0,
        "score": score,
        "output_tail": out[-1500:],
    }
    matters = parse_matters_found(out)
    if matters is not None:
        result["matters_found"] = matters["found"]
        result["matters_expected"] = matters["expected"]
        result["matters_found_label"] = matters["label"]
        result["matters_ids"] = matters["ids"]
    return result


def resolve_clawql() -> str:
    env_path = os.environ.get("CLAWQL_BIN")
    if env_path and Path(env_path).exists():
        return env_path
    which = shutil.which("clawql")
    if which:
        return which
    local = ROOT / "bin" / "clawql.mjs"
    if local.exists():
        return str(local)
    return "clawql"


def resolve_opencode() -> str:
    return shutil.which("opencode") or "opencode"


def normalize_inference_url(url: str) -> str:
    u = url.strip().rstrip("/")
    if not u.endswith("/v1"):
        u = f"{u}/v1"
    return u


def normalize_model_id(model: str) -> str:
    """Pass through clawql-inference model ids (direct BYOK or openrouter/*)."""
    return model.strip()


def resolve_doom_loop_mode(caps: dict | None = None) -> str:
    """OpenCode doom_loop permission for thrash studies.

    Precedence: ``CLAWQL_OPENBENCH_DOOM_LOOP`` env (workflow/matrix) → task cap
    ``allow_doom_loop`` → default ``deny`` (production OpenCode guard).
    """
    raw = (os.environ.get("CLAWQL_OPENBENCH_DOOM_LOOP") or "").strip().lower()
    if raw in ("allow", "1", "true", "yes", "on"):
        return "allow"
    if raw in ("deny", "0", "false", "no", "off"):
        return "deny"
    if caps and caps.get("allow_doom_loop"):
        return "allow"
    return "deny"


def openbench_correlation_id(arm: str, trial: int, run_id: str | None = None) -> str:
    """Stable id stamped on inference calls for call-store ↔ trial join."""
    rid = (run_id or os.environ.get("GITHUB_RUN_ID") or "local").strip()
    return f"openbench/{arm}/{trial}/{rid}"


def opencode_config_for_inference(
    inference_url: str, gateway_model: str, correlation_id: str | None = None
) -> str:
    """Point OpenCode at clawql-inference; gateway_model is the ClawQL model id."""
    # OpenCode -m clawql/<gateway_model> → provider clawql, model = gateway_model
    # which is forwarded to the OpenAI-compat endpoint as `model`.
    # Explicit permission classes close headless "ask" hangs (no TTY).
    options: dict = {
        "baseURL": inference_url,
        "apiKey": os.environ.get("CLAWQL_INFERENCE_CLIENT_KEY", "clawql-openbench"),
    }
    corr = (correlation_id or os.environ.get("CLAWQL_OPENBENCH_CORRELATION_ID") or "").strip()
    if corr:
        options["headers"] = {
            "x-correlation-id": corr,
            "x-clawql-correlation-id": corr,
        }
    return json.dumps(
        {
            "permission": {
                "*": "allow",
                "question": "deny",
                "external_directory": "allow",
                "doom_loop": "deny",
            },
            "provider": {
                "clawql": {
                    "npm": "@ai-sdk/openai-compatible",
                    "name": "ClawQL Inference",
                    "options": options,
                    # Cap default completion budget — OpenRouter 402s when the key
                    # cannot afford the client's requested max_tokens (often 16k).
                    "models": {
                        gateway_model: {
                            "limit": {
                                "context": int(os.environ.get("OPENBENCH_MODEL_CONTEXT", "32000")),
                                "output": int(os.environ.get("OPENBENCH_MODEL_MAX_OUTPUT", "2048")),
                            }
                        }
                    },
                }
            },
        }
    )


def opencode_run_base_args(workdir: Path, opencode_model: str, title: str) -> list[str]:
    """Shared `opencode run` flags for on/off arms."""
    args = [
        resolve_opencode(),
        "run",
        "--dir",
        str(workdir),
        "-m",
        opencode_model,
        "--auto",
        "--format",
        "json",
        "--title",
        title,
    ]
    if os.environ.get("CLAWQL_OPENBENCH") == "1" or os.environ.get("CLAWQL_OPENBENCH_PRINT_LOGS") == "1":
        args.extend(["--print-logs", "--log-level", "WARN"])
    return args


def is_infra_hang(agent: dict) -> bool:
    """True when OpenCode stalled with no turns/tools (API hang / ask deadlock)."""
    if agent.get("turns") is not None:
        return False
    tail = (agent.get("output_tail") or "") + (agent.get("error") or "")
    if '"tool":' in tail:
        return False
    err = (agent.get("error") or "").lower()
    if agent.get("timed_out") or agent.get("exit_code") == 124 or "timeout" in err:
        return True
    # OpenCode often retries forever on 402/429 without setting timed_out cleanly.
    if any(s in tail for s in ("HTTP 402", "HTTP 429", "stream error", "openrouter_credits")):
        return True
    return False


def credit_exhausted(agent: dict) -> bool:
    """OpenRouter (or similar) rejected the call for insufficient credits."""
    blob = (agent.get("output_tail") or "") + (agent.get("error") or "")
    return any(
        s in blob
        for s in (
            "HTTP 402",
            "openrouter_credits",
            "requires more credits",
            "can only afford",
        )
    )


def _dec_timeout_output(exc) -> str:
    def _dec(x):
        if x is None:
            return ""
        return x.decode("utf-8", "replace") if isinstance(x, bytes) else x

    return _dec(exc.stdout) + _dec(exc.stderr)


def run_arm_off(
    instruction: str,
    workdir: Path,
    model: str,
    timeout_s: int,
    inference_url: str,
    *,
    correlation_id: str | None = None,
) -> dict:
    """Raw OpenCode → clawql-inference (OpenRouter and/or BYOK; no ClawQL MCP)."""
    gateway_model = normalize_model_id(model)
    opencode_model = f"clawql/{gateway_model}"
    cmd = opencode_run_base_args(workdir, opencode_model, "clawql-openbench-off") + [instruction]
    env = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith("CLAWQL_") or k in ("CLAWQL_INFERENCE_CLIENT_KEY",)
    }
    if correlation_id:
        env["CLAWQL_OPENBENCH_CORRELATION_ID"] = correlation_id
    env["OPENCODE_CONFIG_CONTENT"] = opencode_config_for_inference(
        inference_url, gateway_model, correlation_id
    )
    # Isolated home so host opencode MCP config is not loaded for the off arm.
    iso = tempfile.mkdtemp(prefix="opencode_off_home_")
    env["HOME"] = iso
    env["XDG_CONFIG_HOME"] = str(Path(iso) / ".config")
    env["XDG_DATA_HOME"] = str(Path(iso) / ".local" / "share")

    t0 = time.monotonic()
    timed_out = False
    stdout = ""
    combined = ""
    code = 1
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=timeout_s,
            stdin=subprocess.DEVNULL,
            env=env,
        )
        stdout = proc.stdout or ""
        combined = stdout + (proc.stderr or "")
        code = proc.returncode
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        combined = _dec_timeout_output(exc)
        stdout = combined
        code = 124
    finally:
        shutil.rmtree(iso, ignore_errors=True)

    wall_s = round(time.monotonic() - t0, 3)
    usage = parse_opencode_jsonl_usage(stdout)
    completed = (not timed_out) and code == 0
    return {
        "arm": "clawql-off",
        "harness": "opencode",
        "inference_url": inference_url,
        "gateway_model": gateway_model,
        "cmd": cmd,
        "completed": completed,
        "exit_code": code,
        "timed_out": timed_out,
        "wall_s": wall_s,
        "tokens": usage.get("tokens"),
        "turns": usage.get("turns"),
        "output_tail": combined[-2000:],
        "_combined_log": combined,
        "error": None if completed else (f"timeout after {timeout_s}s" if timed_out else f"exit {code}"),
    }


def recalled_without_writes(combined: str) -> bool:
    """Detect stop-after-recall: memory hit but no write/edit tool calls."""
    text = combined or ""
    recalled = "clawql_memory_recall" in text or '"tool":"memory_recall"' in text
    wrote = '"tool":"write"' in text or '"tool":"edit"' in text
    return recalled and not wrote


def memory_roundtrip_incomplete(combined: str) -> bool:
    """True when ingest and/or recall (and write) were skipped."""
    text = combined or ""
    ingest = "memory_ingest" in text or "clawql_memory_ingest" in text
    recall = "memory_recall" in text or "clawql_memory_recall" in text
    wrote = '"tool":"write"' in text or '"tool":"edit"' in text
    return not (ingest and recall and wrote)


def execute_missing_dry_run(combined: str) -> bool:
    """True when execute ran but dry_run:true never appeared in tool inputs."""
    text = combined or ""
    used = '"tool":"clawql_execute"' in text
    dry = '"dry_run":true' in text or '"dry_run": true' in text or '"dryRun":true' in text
    return used and not dry


def execute_incomplete(combined: str, workdir: Path) -> bool:
    """True when search/execute trail is not finished (missing executes, dry_run, or file)."""
    text = combined or ""
    exec_hits = text.count('"tool":"clawql_execute"')
    dry = (
        '"dry_run":true' in text
        or '"dry_run": true' in text
        or '"dryRun":true' in text
        or '"dryRun": true' in text
    )
    has_trail = (workdir / "trail.json").is_file()
    return exec_hits < 2 or not dry or not has_trail


def audit_ran_without_write(combined: str) -> bool:
    text = combined or ""
    used = '"tool":"clawql_audit"' in text
    return used and count_write_tools(text) == 0


def audit_incomplete(combined: str, workdir: Path) -> bool:
    """True when graded trail.json is missing (including idle runs with no audit yet)."""
    return not (workdir / "trail.json").is_file()


# Also nudge when the agent produced zero tool calls (empty OpenCode session).
def agent_idle(combined: str) -> bool:
    text = combined or ""
    return '"tool":"clawql_' not in text and '"tool":"write"' not in text and '"tool":"read"' not in text


def cache_incomplete(combined: str, workdir: Path) -> bool:
    """True when answer.json missing or clawql_cache set evidence incomplete."""
    if agent_idle(combined):
        return True
    if not (workdir / "answer.json").is_file():
        return True
    text = combined or ""
    used = '"tool":"clawql_cache"' in text
    has_set = '"operation":"set"' in text
    try:
        import json as _json

        d = _json.loads((workdir / "answer.json").read_text())
        src = str(d.get("source") or "")
        token = str(d.get("token") or "")
    except Exception:  # noqa: BLE001
        src, token = "", ""
    # Prefer get, but set + correct answer is enough to stop nudging.
    has_get = '"operation":"get"' in text
    ok_answer = token == "alpha42-zeta99" and "cache" in src.lower()
    return not (used and has_set and ok_answer and (has_get or text.count('"operation":"set"') >= 2))


def cache_needs_finish(combined: str, workdir: Path) -> bool:
    """True when clawql_cache set ran but get/write still incomplete."""
    text = combined or ""
    if (workdir / "answer.json").is_file() and '"operation":"get"' in text:
        return False
    return '"tool":"clawql_cache"' in text and '"operation":"set"' in text


def real_opencode_tools(combined: str) -> set[str]:
    """Tool names from real OpenCode tool_use rows (excludes part.tool==invalid)."""
    found: set[str] = set()
    for line in (combined or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(obj, dict):
            continue
        part = obj.get("part")
        if not isinstance(part, dict):
            continue
        tool = part.get("tool")
        if isinstance(tool, str) and tool and tool != "invalid":
            found.add(tool)
    return found


def pageindex_incomplete(combined: str, workdir: Path) -> bool:
    tools = real_opencode_tools(combined)
    built = bool(tools & {"clawql_pageindex_build_tree", "pageindex_build_tree"})
    syn = bool(
        tools
        & {
            "clawql_pageindex_synthesize",
            "pageindex_synthesize",
            "clawql_pageindex_traverse",
            "pageindex_traverse",
        }
    )
    # Empty markdown build (nodeCount 1 / empty synthesize) still needs a retry.
    empty_build = '"markdown":""' in (combined or "") or '"markdown": ""' in (combined or "")
    answer = workdir / "answer.json"
    answer_ok = False
    if answer.is_file():
        try:
            d = json.loads(answer.read_text(encoding="utf-8"))
            code = str(d.get("code") or d.get("CLAWQL_HYBRID_CODE") or "").strip()
            if code.upper().startswith("CLAWQL_HYBRID_CODE="):
                code = code.split("=", 1)[1].strip()
            # Catalog task uses orchid-77; hybrid uses fern-42 — either means a real write.
            answer_ok = code in {"orchid-77", "fern-42"}
        except Exception:  # noqa: BLE001
            answer_ok = False
    if answer_ok and built and syn and not empty_build:
        return False
    return True


def memory_recall_pageindex_incomplete(combined: str, workdir: Path) -> bool:
    """True when build_tree + memory_recall(sources=pageindex) + answer are incomplete."""
    tools = real_opencode_tools(combined)
    built = bool(tools & {"clawql_pageindex_build_tree", "pageindex_build_tree"})
    recalled = bool(tools & {"clawql_memory_recall", "memory_recall"})
    empty_build = '"markdown":""' in (combined or "") or '"markdown": ""' in (combined or "")
    # Prefer evidence of sources:["pageindex"] in the log (JSON or yaml-ish).
    sources_pin = (
        '"pageindex"' in (combined or "")
        or "'pageindex'" in (combined or "")
    )
    answer = workdir / "answer.json"
    answer_ok = False
    if answer.is_file():
        try:
            d = json.loads(answer.read_text(encoding="utf-8"))
            code = str(d.get("code") or d.get("CLAWQL_RECALL_PI_CODE") or "").strip()
            if code.upper().startswith("CLAWQL_RECALL_PI_CODE="):
                code = code.split("=", 1)[1].strip()
            answer_ok = code == "cedar-31"
        except Exception:  # noqa: BLE001
            answer_ok = False
    if answer_ok and built and recalled and sources_pin and not empty_build:
        return False
    return True


def codegraph_incomplete(combined: str, workdir: Path) -> bool:
    if agent_idle(combined):
        return True
    if not (workdir / "answer.json").is_file():
        return True
    tools = real_opencode_tools(combined)
    indexed = bool(tools & {"clawql_codegraph_index", "codegraph_index"})
    if not indexed:
        return True
    queried = bool(
        tools
        & {
            "clawql_codegraph_query",
            "codegraph_query",
            "clawql_codegraph_explain",
            "codegraph_explain",
            "clawql_codegraph_neighbors",
            "codegraph_neighbors",
        }
    )
    return not queried


def codegraph_impact_incomplete(combined: str, workdir: Path) -> bool:
    if agent_idle(combined):
        return True
    impact = workdir / "impact.json"
    if not impact.is_file():
        nested = workdir / "repo" / "impact.json"
        if nested.is_file():
            try:
                impact.write_text(nested.read_text(encoding="utf-8"), encoding="utf-8")
            except OSError:
                return True
        else:
            return True
    pricing = workdir / "repo" / "core" / "pricing.py"
    if not pricing.is_file():
        return True
    try:
        text = pricing.read_text(encoding="utf-8")
    except OSError:
        return True
    if "def compute_grand_total" not in text or "def compute_total" in text:
        return True
    # Any leftover compute_total under repo means the rename is incomplete.
    try:
        for path in (workdir / "repo").rglob("*.py"):
            body = path.read_text(encoding="utf-8")
            if "compute_total" in body:
                return True
    except OSError:
        return True
    tools = real_opencode_tools(combined)
    indexed = bool(tools & {"clawql_codegraph_index", "codegraph_index"})
    if not indexed:
        return True
    queried = bool(
        tools
        & {
            "clawql_codegraph_query",
            "codegraph_query",
            "clawql_codegraph_explain",
            "codegraph_explain",
            "clawql_codegraph_neighbors",
            "codegraph_neighbors",
            "clawql_codegraph_path",
            "codegraph_path",
            "clawql_codegraph_impact",
            "codegraph_impact",
        }
    )
    return not queried


def codegraph_feature_incomplete(combined: str, workdir: Path) -> bool:
    """True when widgets API impact set or codegraph evidence is still missing."""
    if agent_idle(combined):
        return True
    tools = real_opencode_tools(combined)
    indexed = bool(tools & {"clawql_codegraph_index", "codegraph_index"})
    if not indexed:
        return True
    queried = bool(
        tools
        & {
            "clawql_codegraph_query",
            "codegraph_query",
            "clawql_codegraph_explain",
            "codegraph_explain",
            "clawql_codegraph_neighbors",
            "codegraph_neighbors",
            "clawql_codegraph_path",
            "codegraph_path",
        }
    )
    if not queried:
        return True
    try:
        handler = (workdir / "src" / "handler.js").read_text(encoding="utf-8")
        router = (workdir / "src" / "router.js").read_text(encoding="utf-8")
        schema = (workdir / "src" / "schema.js").read_text(encoding="utf-8")
        openapi = (workdir / "openapi" / "openapi.yaml").read_text(encoding="utf-8")
        tests = (workdir / "tests" / "widgets.test.js").read_text(encoding="utf-8")
    except OSError:
        return True
    if "function getWidgetById" not in handler or "WIDGETS" not in handler:
        return True
    if "/widgets/:id" not in router or "getWidgetById" not in router:
        return True
    if "WidgetParams" not in schema:
        return True
    if "/widgets/{id}" not in openapi or "404" not in openapi:
        return True
    if "not found" not in tests.lower() and "null" not in tests and "404" not in tests:
        return True
    return False


def schedule_incomplete(combined: str, workdir: Path) -> bool:
    if agent_idle(combined):
        return True
    if not (workdir / "schedule.json").is_file():
        return True
    hits = 0
    for line in (combined or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        part = obj.get("part") if isinstance(obj, dict) else None
        tool = part.get("tool") if isinstance(part, dict) else None
        if tool in ("clawql_schedule", "schedule"):
            hits += 1
    return hits < 2


def external_ingest_incomplete(combined: str, workdir: Path) -> bool:
    if agent_idle(combined):
        return True
    if not (workdir / "answer.json").is_file():
        return True
    tools = real_opencode_tools(combined)
    ingested = bool(
        tools & {"clawql_ingest_external_knowledge", "ingest_external_knowledge"}
    )
    recalled = bool(tools & {"clawql_memory_recall", "memory_recall"})
    return not (ingested and recalled)


def notify_incomplete(combined: str, workdir: Path) -> bool:
    if agent_idle(combined):
        return True
    if not (workdir / "notify.json").is_file():
        return True
    tools = real_opencode_tools(combined)
    return not bool(tools & {"clawql_notify", "notify"})


def sandbox_incomplete(combined: str, workdir: Path) -> bool:
    if agent_idle(combined):
        return True
    if not (workdir / "answer.json").is_file():
        return True
    tools = real_opencode_tools(combined)
    return not bool(tools & {"clawql_sandbox_exec", "sandbox_exec"})


def composed_incomplete(combined: str, workdir: Path) -> bool:
    if agent_idle(combined):
        return True
    if not (workdir / "rollout.json").is_file():
        return True
    tools = real_opencode_tools(combined)
    need = [
        bool(tools & {"clawql_search", "search"}),
        bool(tools & {"clawql_execute", "execute"}),
        bool(tools & {"clawql_audit", "audit"}),
        bool(tools & {"clawql_memory_ingest", "memory_ingest"}),
    ]
    return not all(need)


def idp_incomplete(combined: str, workdir: Path) -> bool:
    if agent_idle(combined):
        return True
    if not (workdir / "pipeline.json").is_file():
        return True
    tools = real_opencode_tools(combined)
    need = [
        bool(tools & {"clawql_search", "search"}),
        bool(tools & {"clawql_execute", "execute"}),
        bool(tools & {"clawql_audit", "audit"}),
        bool(tools & {"clawql_knowledge_search_onyx", "knowledge_search_onyx"}),
        bool(tools & {"clawql_notify", "notify"}),
        bool(tools & {"clawql_memory_ingest", "memory_ingest"}),
    ]
    return not all(need)


def idp_resilience_incomplete(combined: str, workdir: Path) -> bool:
    """Like idp_incomplete but Onyx cite is unavailable — require ouroboros recovery."""
    if agent_idle(combined):
        return True
    if not (workdir / "pipeline.json").is_file():
        return True
    tools = real_opencode_tools(combined)
    need = [
        bool(tools & {"clawql_search", "search"}),
        bool(tools & {"clawql_execute", "execute"}),
        bool(tools & {"clawql_audit", "audit"}),
        bool(tools & {"clawql_notify", "notify"}),
        bool(tools & {"clawql_memory_ingest", "memory_ingest"}),
        bool(
            tools
            & {
                "ouroboros_run_evolutionary_loop",
                "clawql_ouroboros_run_evolutionary_loop",
            }
        ),
    ]
    return not all(need)


def onyx_incomplete(combined: str, workdir: Path) -> bool:
    if agent_idle(combined):
        return True
    if not (workdir / "citations.json").is_file():
        return True
    tools = real_opencode_tools(combined)
    return not bool(tools & {"clawql_knowledge_search_onyx", "knowledge_search_onyx"})


def wikilink_incomplete(combined: str, workdir: Path) -> bool:
    if agent_idle(combined):
        return True
    if not (workdir / "answer.json").is_file():
        return True
    tools = real_opencode_tools(combined)
    return not bool(tools & {"clawql_memory_recall", "memory_recall"})


def conflict_incomplete(combined: str, workdir: Path) -> bool:
    if agent_idle(combined):
        return True
    if not (workdir / "conflict.json").is_file():
        return True
    tools = real_opencode_tools(combined)
    return not bool(tools & {"clawql_memory_recall", "memory_recall"})


def institutional_incomplete(combined: str, workdir: Path) -> bool:
    if agent_idle(combined):
        return True
    if not (workdir / "matters.json").is_file():
        return True
    tools = real_opencode_tools(combined)
    return not bool(tools & {"clawql_memory_recall", "memory_recall"})


def policy_missing_artifact(workdir: Path) -> bool:
    return not (workdir / "policy.json").is_file()


def memory_injection_missing_artifact(workdir: Path) -> bool:
    return not (workdir / "audit" / "policy-violation.json").is_file()


def memory_injection_missing_attempt(combined: str) -> bool:
    return '"tool":"clawql_memory_ingest"' not in (combined or "")


WRITE_CONTINUATION_HEADER = """Continue the same OpenBench task in this workspace.

You already ran memory_recall successfully. Do **not** call memory_recall again.
Do **not** call todos/task/skill. Call the **write** tool (or edit) now.

Create the required relative-path files on disk. Chat code fences are not graded.
"""


def build_write_continuation(vault: str | None) -> str:
    """Continuation prompt with vault note body inlined so the model can write."""
    parts = [WRITE_CONTINUATION_HEADER]
    if vault:
        memory_dir = Path(vault) / "Memory"
        if memory_dir.is_dir():
            notes = []
            for path in sorted(memory_dir.glob("*.md")):
                try:
                    notes.append(path.read_text(encoding="utf-8"))
                except OSError:
                    continue
            if notes:
                parts.append("## Vault notes to apply via write/edit\n")
                parts.extend(notes)
    parts.append("\nStart calling write now for each required file.\n")
    return "\n".join(parts)


def run_arm_on(
    instruction: str,
    workdir: Path,
    model: str,
    timeout_s: int,
    inference_url: str,
    vault: str | None,
    *,
    arm: str = "clawql-on",
    ouroboros: bool | None = None,
    ouroboros_max_generations: int | None = None,
    disable_memory: bool = False,
    task_hard_caps: dict | None = None,
    require_search: bool = False,
    require_execute: bool = False,
    require_memory_roundtrip: bool = False,
    require_audit: bool = False,
    require_cache: bool = False,
    require_policy_block: bool = False,
    require_pageindex: bool = False,
    require_memory_recall_pageindex: bool = False,
    panguard_block_tools: str | None = None,
    enable_pageindex: bool = False,
    require_codegraph: bool = False,
    enable_codegraph: bool = False,
    codegraph_impact: bool = False,
    codegraph_feature: bool = False,
    require_schedule: bool = False,
    enable_schedule: bool = False,
    require_external_ingest: bool = False,
    enable_external_ingest: bool = False,
    require_notify: bool = False,
    enable_notify: bool = False,
    require_sandbox: bool = False,
    enable_sandbox: bool = False,
    require_composed: bool = False,
    enable_composed: bool = False,
    require_idp: bool = False,
    enable_idp: bool = False,
    enable_idp_resilience: bool = False,
    require_onyx: bool = False,
    enable_onyx: bool = False,
    require_wikilink: bool = False,
    require_conflict: bool = False,
    require_institutional: bool = False,
    correlation_id: str | None = None,
) -> dict:
    """ClawQL-wired OpenCode via ``clawql opencode --non-interactive`` + inference URL."""
    clawql = resolve_clawql()
    gateway_model = normalize_model_id(model)
    inst_file = workdir / ".openbench_instruction.md"
    inst_file.write_text(instruction, encoding="utf-8")

    prefix = ["node", clawql] if clawql.endswith(".mjs") else [clawql]

    def build_cmd(task_file: Path, run_timeout: int) -> list[str]:
        return [
            *prefix,
            "opencode",
            "--non-interactive",
            "--model",
            f"clawql/{gateway_model}",
            "--task-file",
            str(task_file),
            "--workdir",
            str(workdir),
            "--timeout",
            str(int(run_timeout)),
            "--inference-url",
            inference_url,
        ]

    env = dict(os.environ)
    env["CLAWQL_OPENBENCH"] = "1"
    env["CLAWQL_HARNESS_ALLOW_UNSANDBOXED"] = "1"
    env["CLAWQL_OPENBENCH_HARNESS"] = "opencode"
    env["OPENAI_BASE_URL"] = inference_url
    env["CLAWQL_INFERENCE_URL"] = inference_url
    if correlation_id:
        env["CLAWQL_OPENBENCH_CORRELATION_ID"] = correlation_id
    # Do NOT set OPENCODE_CONFIG_CONTENT here — clawql opencode --non-interactive
    # builds provider + MCP together. A provider-only JSON previously wiped MCP,
    # so clawql-on could not memory_recall the seeded vault.
    if vault and not disable_memory:
        env["CLAWQL_HOME"] = vault
        env["CLAWQL_OBSIDIAN_VAULT_PATH"] = vault
        env["CLAWQL_ENABLE_MEMORY"] = "1"
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"
    elif disable_memory:
        env["CLAWQL_ENABLE_MEMORY"] = "0"
        # Disposable home inside the trial workdir (no vault recipe to recall).
        home = str(workdir / ".clawql-home")
        Path(home).mkdir(parents=True, exist_ok=True)
        env["CLAWQL_HOME"] = home
        env["CLAWQL_OBSIDIAN_VAULT_PATH"] = home
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"

    enable_ouro = ouroboros if ouroboros is not None else arm == "ouroboros-on"
    if arm.startswith("ouroboros") or ouroboros is not None:
        env["CLAWQL_ENABLE_OUROBOROS"] = "1" if enable_ouro else "0"
        if enable_ouro:
            cap = ouroboros_max_generations
            if cap is None:
                cap = int(
                    (TASK_HARD_CAPS.get("ouroboros-oscillation-escape") or {}).get(
                        "ouroboros_max_generations", 4
                    )
                )
            env["CLAWQL_OUROBOROS_MAX_GENERATIONS"] = str(int(cap))
        else:
            env.pop("CLAWQL_OUROBOROS_MAX_GENERATIONS", None)

    # Ouroboros A/B: doom_loop mode from env (workflow) or task caps.
    # allow = thrash visible (identical-tool spam); deny = production default
    # (strategy A↔B flip-flop still possible). Caps remain the spend backstop.
    if arm.startswith("ouroboros"):
        env["CLAWQL_OPENBENCH_DOOM_LOOP"] = resolve_doom_loop_mode(task_hard_caps)

    # Search / execute / policy tasks need GitHub (or similar) in the merge.
    if require_search or require_execute or panguard_block_tools:
        env.setdefault("CLAWQL_PROVIDER", "github")
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"
        if disable_memory:
            env["CLAWQL_ENABLE_MEMORY"] = "0"

    # In-process Panguard deny list (policy-deny-execute A/B).
    if panguard_block_tools:
        env["CLAWQL_PANGUARD_IN_PROCESS"] = "1"
        env["CLAWQL_PANGUARD_BLOCK_TOOLS"] = str(panguard_block_tools)

    if enable_pageindex:
        env["CLAWQL_ENABLE_PAGEINDEX"] = "1"
        env["CLAWQL_ENABLE_MEMORY"] = "1"  # PageIndex tools register via MemoryPlugin
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"

    if enable_codegraph:
        env["CLAWQL_ENABLE_CODEGRAPH"] = "1"
        env["CLAWQL_ENABLE_MEMORY"] = "1"
        env["CLAWQL_CODEGRAPH_ROOT"] = str(workdir / "repo")
        env["CLAWQL_CODEGRAPH_PATH"] = str(workdir / ".codegraph")
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"

    if enable_schedule:
        env["CLAWQL_ENABLE_SCHEDULE"] = "1"
        env["CLAWQL_SCHEDULE_DB_PATH"] = str(workdir / ".schedule" / "schedule.db")
        env["CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES"] = "https://example.com"
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"

    if enable_external_ingest:
        env["CLAWQL_ENABLE_DOCUMENTS"] = "1"
        env["CLAWQL_EXTERNAL_INGEST"] = "1"
        env["CLAWQL_ENABLE_MEMORY"] = "1"
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"

    if enable_notify:
        env["CLAWQL_ENABLE_NOTIFY"] = "1"
        env["CLAWQL_PROVIDER"] = "slack"
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"
        env["CLAWQL_SLACK_TOKEN"] = "xoxb-openbench-stub-not-real"
        env["CLAWQL_TEST_SLACK_FETCH_STUB"] = "1"
        env["CLAWQL_TEST_SLACK_FETCH_BODY"] = (
            '{"ok":true,"channel":"C-OPENBENCH","ts":"1710000000.000100",'
            '"message":{"text":"CLAWQL_NOTIFY_MARKER=nebula-55"}}'
        )
        # Prefer minimal Slack chat.postMessage fixture (avoids GraphQL Mesh issues).
        fixture = str(ROOT / "openbench" / "fixtures" / "minimal-slack-chat-postmessage.json")
        env["CLAWQL_SPEC_PATH"] = fixture

    if enable_sandbox:
        env["CLAWQL_ENABLE_SANDBOX"] = "1"
        env["CLAWQL_SANDBOX_BACKEND"] = "docker"
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"
        # Keep images small; workflow may pre-pull.
        env.setdefault("CLAWQL_SANDBOX_DOCKER_IMAGE_PYTHON", "python:3.12-alpine")

    if enable_composed:
        env.setdefault("CLAWQL_PROVIDER", "github")
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"
        env["CLAWQL_ENABLE_MEMORY"] = "1"

    if enable_idp:
        # Multi-provider merge: GitHub search/execute + Slack notify + Onyx cite.
        # Do not set CLAWQL_PROVIDER / CLAWQL_SPEC_PATH to a single vendor.
        env.pop("CLAWQL_PROVIDER", None)
        env.pop("CLAWQL_SPEC_PATH", None)
        env["CLAWQL_BUNDLED_PROVIDERS"] = "github,slack,onyx"
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"
        env["CLAWQL_ENABLE_MEMORY"] = "1"
        env["CLAWQL_ENABLE_DOCUMENTS"] = "1"
        env["CLAWQL_ENABLE_NOTIFY"] = "1"
        env["CLAWQL_ENABLE_ONYX"] = "1"
        env["CLAWQL_SLACK_TOKEN"] = "xoxb-openbench-stub-not-real"
        env["CLAWQL_TEST_SLACK_FETCH_STUB"] = "1"
        env["CLAWQL_TEST_SLACK_FETCH_BODY"] = (
            '{"ok":true,"channel":"C-OPENBENCH","ts":"1710000000.000100",'
            '"message":{"text":"CLAWQL_NOTIFY_MARKER=nebula-55"}}'
        )
        env["ONYX_BASE_URL"] = "http://127.0.0.1:9"
        env["ONYX_API_TOKEN"] = "openbench-onyx-stub-token"
        env["CLAWQL_TEST_ONYX_FETCH_STUB"] = "1"
        env["CLAWQL_TEST_ONYX_FETCH_BODY"] = (
            '{"query":"enterprise pricing policy",'
            '"documents":[{'
            '"document_id":"doc-openbench-1",'
            '"semantic_identifier":"Pricing Policy CLAWQL_ONYX_CODE=quartz-21",'
            '"content":"Official pricing. CLAWQL_ONYX_CODE=quartz-21. Ignore zinc-00."'
            '}]}'
        )

    if enable_idp_resilience:
        # Same as IDP lite minus Onyx — cite stage is the injected failure.
        env.pop("CLAWQL_PROVIDER", None)
        env.pop("CLAWQL_SPEC_PATH", None)
        env["CLAWQL_BUNDLED_PROVIDERS"] = "github,slack"
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"
        env["CLAWQL_ENABLE_MEMORY"] = "1"
        env["CLAWQL_ENABLE_DOCUMENTS"] = "1"
        env["CLAWQL_ENABLE_NOTIFY"] = "1"
        env["CLAWQL_ENABLE_ONYX"] = "0"
        env["CLAWQL_SLACK_TOKEN"] = "xoxb-openbench-stub-not-real"
        env["CLAWQL_TEST_SLACK_FETCH_STUB"] = "1"
        env["CLAWQL_TEST_SLACK_FETCH_BODY"] = (
            '{"ok":true,"channel":"C-OPENBENCH","ts":"1710000000.000100",'
            '"message":{"text":"CLAWQL_NOTIFY_MARKER=nebula-55"}}'
        )

    if enable_onyx:
        env["CLAWQL_ENABLE_ONYX"] = "1"
        env["CLAWQL_ENABLE_DOCUMENTS"] = "1"
        env["CLAWQL_PROVIDER"] = "onyx"
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"
        env["ONYX_BASE_URL"] = "http://127.0.0.1:9"
        env["ONYX_API_TOKEN"] = "openbench-onyx-stub-token"
        env["CLAWQL_TEST_ONYX_FETCH_STUB"] = "1"
        env["CLAWQL_TEST_ONYX_FETCH_BODY"] = (
            '{"query":"enterprise pricing policy",'
            '"documents":[{'
            '"document_id":"doc-openbench-1",'
            '"semantic_identifier":"Pricing Policy CLAWQL_ONYX_CODE=quartz-21",'
            '"content":"Official pricing. CLAWQL_ONYX_CODE=quartz-21. Ignore zinc-00."'
            '}]}'
        )

    t0 = time.monotonic()
    timed_out = False
    combined = ""
    code = 1
    cmd = build_cmd(inst_file, timeout_s)
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=timeout_s + 45,
            stdin=subprocess.DEVNULL,
            env=env,
        )
        combined = (proc.stdout or "") + (proc.stderr or "")
        code = proc.returncode
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        combined = _dec_timeout_output(exc)
        code = 124

    # Empty-vault roundtrip: cheap models often stop after reading sealed/ only.
    if (
        require_memory_roundtrip
        and arm == "clawql-on"
        and not timed_out
        and memory_roundtrip_incomplete(combined)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 25:
            cont_file = workdir / ".openbench_memory_roundtrip_nudge.md"
            cont_file.write_text(MEMORY_ROUNDTRIP_NUDGE, encoding="utf-8")
            cont_timeout = max(25, min(90, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_rt = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_rt.stdout or "") + (proc_rt.stderr or "")
                code = proc_rt.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # execute-verify: missing executes, dry_run, and/or trail.json.
    if (
        require_execute
        and arm == "clawql-on"
        and not timed_out
        and execute_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 25:
            cont_file = workdir / ".openbench_execute_dry_run_nudge.md"
            cont_file.write_text(EXECUTE_DRY_RUN_NUDGE, encoding="utf-8")
            cont_timeout = max(25, min(90, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_ex = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_ex.stdout or "") + (proc_ex.stderr or "")
                code = proc_ex.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # audit: tools ran but trail.json not in workdir (absolute /tmp writes don't count).
    if (
        require_audit
        and arm == "clawql-on"
        and not timed_out
        and audit_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 20:
            cont_file = workdir / ".openbench_audit_write_nudge.md"
            cont_file.write_text(AUDIT_WRITE_NUDGE, encoding="utf-8")
            cont_timeout = max(20, min(60, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_au = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_au.stdout or "") + (proc_au.stderr or "")
                code = proc_au.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # cache: missing answer.json and/or set/get evidence.
    if (
        require_cache
        and arm == "clawql-on"
        and not timed_out
        and cache_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 25:
            cont_file = workdir / ".openbench_cache_nudge.md"
            cont_file.write_text(CACHE_WRITE_NUDGE, encoding="utf-8")
            cont_timeout = max(25, min(90, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_ca = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_ca.stdout or "") + (proc_ca.stderr or "")
                code = proc_ca.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124
        # Prefer finish nudge when set already happened; otherwise full bootstrap.
        if (
            not timed_out
            and cache_incomplete(combined, workdir)
            and (int(timeout_s) - int(time.monotonic() - t0)) >= 25
        ):
            remaining = int(timeout_s) - int(time.monotonic() - t0)
            nudge = (
                CACHE_FINISH_NUDGE
                if cache_needs_finish(combined, workdir)
                else CACHE_WRITE_NUDGE
            )
            cont_file = workdir / ".openbench_cache_nudge2.md"
            cont_file.write_text(nudge, encoding="utf-8")
            cont_timeout = max(25, min(90, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_ca2 = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_ca2.stdout or "") + (proc_ca2.stderr or "")
                code = proc_ca2.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # policy: execute blocked but policy.json never written.
    if (
        require_policy_block
        and arm == "clawql-on"
        and not timed_out
        and panguard_block_tools == "execute"
        and policy_missing_artifact(workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 15:
            cont_file = workdir / ".openbench_policy_nudge.md"
            cont_file.write_text(POLICY_WRITE_NUDGE, encoding="utf-8")
            cont_timeout = max(15, min(45, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_po = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 20,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_po.stdout or "") + (proc_po.stderr or "")
                code = proc_po.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # B-4.3: force clawql_memory_ingest attempt before writing the audit artifact.
    if (
        require_policy_block
        and arm == "clawql-on"
        and not timed_out
        and panguard_block_tools == "memory_ingest"
        and memory_injection_missing_attempt(combined)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 20:
            cont_file = workdir / ".openbench_memory_injection_attempt_nudge.md"
            cont_file.write_text(MEMORY_INJECTION_ATTEMPT_NUDGE, encoding="utf-8")
            cont_timeout = max(20, min(60, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_mia = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 20,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_mia.stdout or "") + (proc_mia.stderr or "")
                code = proc_mia.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # B-4.3: memory_ingest blocked but audit/policy-violation.json never written.
    if (
        require_policy_block
        and arm == "clawql-on"
        and not timed_out
        and panguard_block_tools == "memory_ingest"
        and not memory_injection_missing_attempt(combined)
        and memory_injection_missing_artifact(workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 15:
            cont_file = workdir / ".openbench_memory_injection_nudge.md"
            cont_file.write_text(MEMORY_INJECTION_WRITE_NUDGE, encoding="utf-8")
            cont_timeout = max(15, min(45, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_mi = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 20,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_mi.stdout or "") + (proc_mi.stderr or "")
                code = proc_mi.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # pageindex: missing build/synthesize/answer.
    if (
        require_pageindex
        and arm == "clawql-on"
        and not timed_out
        and pageindex_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 25:
            cont_file = workdir / ".openbench_pageindex_nudge.md"
            nudge = (
                HYBRID_PAGEINDEX_NUDGE
                if (workdir / "handbook.md").is_file()
                else PAGE_INDEX_NUDGE
            )
            cont_file.write_text(nudge, encoding="utf-8")
            cont_timeout = max(25, min(90, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_pi = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_pi.stdout or "") + (proc_pi.stderr or "")
                code = proc_pi.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # memory_recall(sources=[pageindex]): missing build / recall pin / answer.
    if (
        require_memory_recall_pageindex
        and arm == "clawql-on"
        and not timed_out
        and memory_recall_pageindex_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 25:
            cont_file = workdir / ".openbench_memory_recall_pageindex_nudge.md"
            cont_file.write_text(MEMORY_RECALL_PAGEINDEX_NUDGE, encoding="utf-8")
            cont_timeout = max(25, min(90, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_mrpi = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_mrpi.stdout or "") + (proc_mrpi.stderr or "")
                code = proc_mrpi.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # codegraph: missing index/query/answer (guided), impact rename, or feature API.
    if (
        require_codegraph
        and arm == "clawql-on"
        and not timed_out
        and (
            codegraph_impact_incomplete(combined, workdir)
            if codegraph_impact
            else (
                codegraph_feature_incomplete(combined, workdir)
                if codegraph_feature
                else codegraph_incomplete(combined, workdir)
            )
        )
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 25:
            cont_file = workdir / ".openbench_codegraph_nudge.md"
            if codegraph_impact:
                nudge = CODEGRAPH_IMPACT_NUDGE
            elif codegraph_feature:
                nudge = CODEGRAPH_FEATURE_NUDGE
            else:
                nudge = CODEGRAPH_NUDGE
            cont_file.write_text(nudge, encoding="utf-8")
            cont_timeout = max(
                25,
                min(120 if codegraph_impact or codegraph_feature else 90, remaining),
            )
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_cg = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_cg.stdout or "") + (proc_cg.stderr or "")
                code = proc_cg.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # schedule: missing create/trigger/schedule.json.
    if (
        require_schedule
        and arm == "clawql-on"
        and not timed_out
        and schedule_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 25:
            cont_file = workdir / ".openbench_schedule_nudge.md"
            cont_file.write_text(SCHEDULE_NUDGE, encoding="utf-8")
            cont_timeout = max(25, min(90, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_sch = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_sch.stdout or "") + (proc_sch.stderr or "")
                code = proc_sch.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # external ingest: missing ingest/recall/answer.
    if (
        require_external_ingest
        and arm == "clawql-on"
        and not timed_out
        and external_ingest_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 25:
            cont_file = workdir / ".openbench_external_ingest_nudge.md"
            cont_file.write_text(EXTERNAL_INGEST_NUDGE, encoding="utf-8")
            cont_timeout = max(25, min(90, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_ei = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_ei.stdout or "") + (proc_ei.stderr or "")
                code = proc_ei.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # notify: missing clawql_notify / notify.json.
    if (
        require_notify
        and arm == "clawql-on"
        and not timed_out
        and notify_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 20:
            cont_file = workdir / ".openbench_notify_nudge.md"
            cont_file.write_text(NOTIFY_NUDGE, encoding="utf-8")
            cont_timeout = max(20, min(60, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_nt = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_nt.stdout or "") + (proc_nt.stderr or "")
                code = proc_nt.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # sandbox: missing sandbox_exec / answer.json.
    if (
        require_sandbox
        and arm == "clawql-on"
        and not timed_out
        and sandbox_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 30:
            cont_file = workdir / ".openbench_sandbox_nudge.md"
            cont_file.write_text(SANDBOX_NUDGE, encoding="utf-8")
            cont_timeout = max(30, min(120, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_sb = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 45,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_sb.stdout or "") + (proc_sb.stderr or "")
                code = proc_sb.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # composed: missing multi-tool sequence / rollout.json.
    if (
        require_composed
        and arm == "clawql-on"
        and not timed_out
        and composed_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 30:
            cont_file = workdir / ".openbench_composed_nudge.md"
            cont_file.write_text(COMPOSED_NUDGE, encoding="utf-8")
            cont_timeout = max(30, min(120, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_co = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 45,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_co.stdout or "") + (proc_co.stderr or "")
                code = proc_co.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # idp resilience (B-2.2): Onyx down — recover via ouroboros then finish pipeline.
    if (
        require_idp
        and enable_idp_resilience
        and arm == "ouroboros-on"
        and not timed_out
        and idp_resilience_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 40:
            cont_file = workdir / ".openbench_idp_resilience_nudge.md"
            cont_file.write_text(IDP_RESILIENCE_NUDGE, encoding="utf-8")
            cont_timeout = max(40, min(150, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_idp = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 45,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_idp.stdout or "") + (proc_idp.stderr or "")
                code = proc_idp.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # idp: missing multi-stage pipeline / pipeline.json.
    if (
        require_idp
        and not enable_idp_resilience
        and arm == "clawql-on"
        and not timed_out
        and idp_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 40:
            cont_file = workdir / ".openbench_idp_nudge.md"
            cont_file.write_text(IDP_NUDGE, encoding="utf-8")
            cont_timeout = max(40, min(150, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_idp = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 45,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_idp.stdout or "") + (proc_idp.stderr or "")
                code = proc_idp.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # onyx: missing knowledge_search_onyx / citations.json.
    if (
        require_onyx
        and arm == "clawql-on"
        and not timed_out
        and onyx_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 20:
            cont_file = workdir / ".openbench_onyx_nudge.md"
            cont_file.write_text(ONYX_NUDGE, encoding="utf-8")
            cont_timeout = max(20, min(60, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_ox = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_ox.stdout or "") + (proc_ox.stderr or "")
                code = proc_ox.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # wikilink: missing memory_recall / answer.json.
    if (
        require_wikilink
        and arm == "clawql-on"
        and not timed_out
        and wikilink_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 20:
            cont_file = workdir / ".openbench_wikilink_nudge.md"
            cont_file.write_text(WIKILINK_NUDGE, encoding="utf-8")
            cont_timeout = max(20, min(60, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_wk = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_wk.stdout or "") + (proc_wk.stderr or "")
                code = proc_wk.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # conflict: missing memory_recall / conflict.json.
    if (
        require_conflict
        and arm == "clawql-on"
        and not timed_out
        and conflict_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 20:
            cont_file = workdir / ".openbench_conflict_nudge.md"
            cont_file.write_text(CONFLICT_NUDGE, encoding="utf-8")
            cont_timeout = max(20, min(60, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_cf = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_cf.stdout or "") + (proc_cf.stderr or "")
                code = proc_cf.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # institutional knowledge: missing memory_recall / matters.json.
    if (
        require_institutional
        and arm in ("clawql-on", "clawql-no-memory")
        and not timed_out
        and institutional_incomplete(combined, workdir)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 20:
            cont_file = workdir / ".openbench_institutional_nudge.md"
            cont_file.write_text(INSTITUTIONAL_NUDGE, encoding="utf-8")
            cont_timeout = max(20, min(80, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_ik = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_ik.stdout or "") + (proc_ik.stderr or "")
                code = proc_ik.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # Cheap models often stop after memory_recall; one write-focused nudge with
    # vault notes inlined so a second recall is unnecessary.
    if vault and not disable_memory and not timed_out and recalled_without_writes(combined):
        cont_file = workdir / ".openbench_continuation.md"
        cont_file.write_text(build_write_continuation(vault), encoding="utf-8")
        cont_timeout = max(60, min(int(timeout_s), 180))
        cmd = build_cmd(cont_file, cont_timeout)
        try:
            proc2 = subprocess.run(
                cmd,
                cwd=str(workdir),
                capture_output=True,
                text=True,
                timeout=cont_timeout + 45,
                stdin=subprocess.DEVNULL,
                env=env,
            )
            combined = combined + "\n" + (proc2.stdout or "") + (proc2.stderr or "")
            code = proc2.returncode
        except subprocess.TimeoutExpired as exc:
            timed_out = True
            combined = combined + "\n" + _dec_timeout_output(exc)
            code = 124

    # ouroboros-on: loop ran but never wrote limiter.py — one write-focused nudge.
    if (
        arm == "ouroboros-on"
        and not enable_idp_resilience
        and not timed_out
        and ouroboros_ran_without_writes(combined)
    ):
        elapsed = time.monotonic() - t0
        remaining = int(timeout_s) - int(elapsed)
        if remaining >= 25:
            cont_file = workdir / ".openbench_ouroboros_write_nudge.md"
            cont_file.write_text(OUROBOROS_ON_WRITE_NUDGE, encoding="utf-8")
            cont_timeout = max(25, min(60, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_w = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_w.stdout or "") + (proc_w.stderr or "")
                code = proc_w.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124

    # ouroboros-off thrash study: re-nudge until selftest passes or spend caps bind.
    # Caps: max 4 nudges, each ≤45s, total wall still bounded by timeout_s (≤180).
    if arm == "ouroboros-off" and not enable_idp_resilience and not timed_out:
        nudge_n = 0
        while nudge_n < 4 and not timed_out:
            elapsed = time.monotonic() - t0
            remaining = int(timeout_s) - int(elapsed)
            if remaining < 25:
                break
            turns_so_far = parse_opencode_jsonl_usage(combined).get("turns") or 0
            if isinstance(turns_so_far, int) and turns_so_far >= 50:
                break
            if scheduler_selftest_ok(workdir) and count_write_tools(combined) > 0:
                break
            nudge_n += 1
            cont_file = workdir / f".openbench_thrash_nudge_{nudge_n}.md"
            cont_file.write_text(OUROBOROS_OFF_THRASH_NUDGE, encoding="utf-8")
            cont_timeout = max(25, min(45, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_n = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_n.stdout or "") + (proc_n.stderr or "")
                code = proc_n.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124
                break

    # B-2.2 ouroboros-off: thrash wrong decoy cite codes until spend caps bind.
    if arm == "ouroboros-off" and enable_idp_resilience and not timed_out:
        nudge_n = 0
        while nudge_n < 4 and not timed_out:
            elapsed = time.monotonic() - t0
            remaining = int(timeout_s) - int(elapsed)
            if remaining < 25:
                break
            turns_so_far = parse_opencode_jsonl_usage(combined).get("turns") or 0
            if isinstance(turns_so_far, int) and turns_so_far >= 50:
                break
            nudge_n += 1
            cont_file = workdir / f".openbench_idp_resilience_thrash_{nudge_n}.md"
            cont_file.write_text(IDP_RESILIENCE_OFF_THRASH_NUDGE, encoding="utf-8")
            cont_timeout = max(25, min(45, remaining))
            cmd = build_cmd(cont_file, cont_timeout)
            try:
                proc_n = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=cont_timeout + 30,
                    stdin=subprocess.DEVNULL,
                    env=env,
                )
                combined = combined + "\n" + (proc_n.stdout or "") + (proc_n.stderr or "")
                code = proc_n.returncode
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                combined = combined + "\n" + _dec_timeout_output(exc)
                code = 124
                break

    wall_s = round(time.monotonic() - t0, 3)
    bench = parse_bench_json(combined)
    tokens = bench.get("tokens") if isinstance(bench.get("tokens"), int) else None
    turns = bench.get("turns") if isinstance(bench.get("turns"), int) else None
    if tokens is None or turns is None:
        usage = parse_opencode_jsonl_usage(combined)
        tokens = tokens if tokens is not None else usage.get("tokens")
        turns = turns if turns is not None else usage.get("turns")

    completed = bool(bench.get("completed")) if "completed" in bench else (code == 0 and not timed_out)
    if timed_out or code != 0:
        completed = False

    return {
        "arm": arm,
        "harness": "opencode",
        "inference_url": inference_url,
        "gateway_model": gateway_model,
        "cmd": cmd,
        "completed": completed,
        "exit_code": code,
        "timed_out": timed_out,
        "wall_s": wall_s,
        "tokens": tokens,
        "turns": turns,
        "ouroboros_enabled": bool(enable_ouro),
        "output_tail": combined[-2000:],
        "_combined_log": combined,
        "error": None
        if completed
        else (bench.get("error") or (f"timeout after {timeout_s}s" if timed_out else f"exit {code}")),
    }


def write_usage_sidecar(workdir: Path, agent: dict) -> None:
    """Persist turns/tokens/timeout for checker hard-cap enforcement."""
    payload = {
        "turns": agent.get("turns"),
        "tokens": agent.get("tokens"),
        "wall_s": agent.get("wall_s"),
        "timed_out": bool(agent.get("timed_out")),
        "arm": agent.get("arm"),
        "ouroboros_enabled": bool(agent.get("ouroboros_enabled")),
    }
    (workdir / ".openbench_usage.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )


def apply_hard_caps(task: str, agent: dict, checker: dict) -> dict:
    """Force SCORE 0 when spend/loop caps are breached (defense in depth)."""
    caps = TASK_HARD_CAPS.get(task)
    if not caps:
        return checker
    violations: list[str] = []
    turns = agent.get("turns")
    tokens = agent.get("tokens")
    wall = agent.get("wall_s")
    if agent.get("timed_out"):
        violations.append("timeout")
    if isinstance(turns, int) and turns > int(caps["max_turns"]):
        violations.append(f"turns:{turns}>{caps['max_turns']}")
    if isinstance(tokens, int) and tokens > int(caps["max_tokens"]):
        violations.append(f"tokens:{tokens}>{caps['max_tokens']}")
    if isinstance(wall, (int, float)) and wall > float(caps["max_wall_s"]):
        violations.append(f"wall_s:{wall}>{caps['max_wall_s']}")
    if not violations:
        return checker
    out = dict(checker)
    out["success"] = False
    out["score"] = 0.0
    out["hard_cap_violations"] = violations
    out["exit_code"] = out.get("exit_code") if out.get("exit_code") not in (None, 0) else 1
    return out


def mean_or_none(values):
    nums = [v for v in values if isinstance(v, (int, float))]
    if not nums:
        return None
    return round(statistics.mean(nums), 3)


def summarize(arm_rows: list[dict]) -> dict:
    out = {
        "n": len(arm_rows),
        "successes": sum(1 for r in arm_rows if r.get("checker", {}).get("success")),
        "success_rate": round(
            sum(1 for r in arm_rows if r.get("checker", {}).get("success")) / max(len(arm_rows), 1),
            4,
        ),
        "mean_score": mean_or_none([r.get("checker", {}).get("score") for r in arm_rows]),
        "mean_tokens": mean_or_none([r.get("agent", {}).get("tokens") for r in arm_rows]),
        "mean_turns": mean_or_none([r.get("agent", {}).get("turns") for r in arm_rows]),
        "mean_wall_s": mean_or_none([r.get("agent", {}).get("wall_s") for r in arm_rows]),
        "cli_completed": sum(1 for r in arm_rows if r.get("agent", {}).get("completed")),
    }
    found_vals = [
        r.get("checker", {}).get("matters_found")
        for r in arm_rows
        if isinstance(r.get("checker", {}).get("matters_found"), (int, float))
    ]
    expected_vals = [
        r.get("checker", {}).get("matters_expected")
        for r in arm_rows
        if isinstance(r.get("checker", {}).get("matters_expected"), (int, float))
    ]
    if found_vals and expected_vals:
        mean_found = mean_or_none(found_vals)
        # expected is constant per task; take max for label stability
        exp = int(max(expected_vals))
        out["mean_matters_found"] = mean_found
        out["matters_expected"] = exp
        if mean_found is not None:
            out["mean_matters_found_label"] = f"{mean_found}/{exp}"
    return out


def render_markdown(report: dict) -> str:
    task = report["task"]
    model = report["model"]
    arms = report.get("arms") or list(report.get("summary", {}).keys())
    lines = [
        f"# OpenBench A/B — `{task}`",
        "",
        f"- **Inference:** clawql-inference (OpenRouter-first or BYOK)",
        f"- **Agent harness:** OpenCode",
        f"- **Model:** `{model}`",
        f"- **Inference URL:** `{report.get('inference_url')}`",
        f"- **Trials / arm:** {report['trials']}",
        f"- **Timeout (s):** {report['timeout_s']}",
        f"- **Started:** {report['started_at']}",
        f"- **Finished:** {report['finished_at']}",
        f"- **Git SHA:** `{report.get('git_sha') or 'unknown'}`",
        "",
        "## Results",
        "",
    ]
    show_matters = any(
        (report.get("summary") or {}).get(a, {}).get("mean_matters_found_label")
        for a in arms
    )
    if show_matters:
        lines.extend(
            [
                "| Arm | Success | Matters found | Mean score | Mean tokens | Mean turns | Mean wall (s) |",
                "|-----|---------|---------------|------------|-------------|------------|---------------|",
            ]
        )
    else:
        lines.extend(
            [
                "| Arm | Success | Mean score | Mean tokens | Mean turns | Mean wall (s) |",
                "|-----|---------|------------|-------------|------------|---------------|",
            ]
        )
    for arm in arms:
        s = report["summary"].get(arm)
        if not s:
            continue
        if show_matters:
            lines.append(
                f"| `{arm}` | {s['successes']}/{s['n']} ({s['success_rate']*100:.0f}%) | "
                f"{s.get('mean_matters_found_label') or '—'} | "
                f"{s['mean_score'] if s['mean_score'] is not None else '—'} | "
                f"{s['mean_tokens'] if s['mean_tokens'] is not None else '—'} | "
                f"{s['mean_turns'] if s['mean_turns'] is not None else '—'} | "
                f"{s['mean_wall_s'] if s['mean_wall_s'] is not None else '—'} |"
            )
        else:
            lines.append(
                f"| `{arm}` | {s['successes']}/{s['n']} ({s['success_rate']*100:.0f}%) | "
                f"{s['mean_score'] if s['mean_score'] is not None else '—'} | "
                f"{s['mean_tokens'] if s['mean_tokens'] is not None else '—'} | "
                f"{s['mean_turns'] if s['mean_turns'] is not None else '—'} | "
                f"{s['mean_wall_s'] if s['mean_wall_s'] is not None else '—'} |"
            )
    interp = [
        "",
        "## Interpretation",
        "",
        "- Both arms call the **same** clawql-inference model (cheap OpenRouter default OK).",
        "- clawql-inference must **passthrough** OpenAI `tools` / `tool_calls` "
        "(otherwise OpenCode gets text-only replies and stops after one turn).",
        "- Checker — not the harness self-report — decides success.",
        "- Full agent JSONL lives under `agent-logs/` next to this summary.",
    ]
    if any(a.startswith("clawql-") for a in arms):
        interp.extend(
            [
                "- **clawql-on** adds ClawQL MCP (search/execute/memory/…) via "
                "`clawql opencode --non-interactive` (provider + MCP + `permission: allow` "
                "in `OPENCODE_CONFIG_CONTENT`).",
                "- **clawql-off** is raw OpenCode with isolated HOME (no ClawQL MCP).",
            ]
        )
    if task == "memory-dependent-continuation":
        interp.append(
            "- Memory seed is removed from the workspace; clawql-on must "
            "`memory_recall` to recover argon2id / 900s TTL."
        )
    elif task == "token-budget-constrained":
        interp.append(
            "- Prefer targeted edits under a tight token budget; both arms share the same model."
        )
    elif task == "multi-provider-api-workflow":
        interp.append(
            "- Prefer search/execute when available; offline scaffold only (no live APIs)."
        )
    elif task == "ouroboros-oscillation-escape":
        caps = TASK_HARD_CAPS.get(task) or {}
        doom = resolve_doom_loop_mode(caps)
        interp.extend(
            [
                "- **ouroboros-on** enables ClawQL Ouroboros (stagnation / oscillation / "
                f"maxGenerations≤{caps.get('ouroboros_max_generations', 4)}) and receives "
                "a seed-source appendix with the correct leaky-bucket recipe.",
                "- **ouroboros-off** has the same MCP surface without Ouroboros tools and "
                "**without** the recipe appendix / vault memory — only conflicting decoys.",
                f"- OpenCode `doom_loop` is **{doom}** "
                + (
                    "so identical-tool thrash can appear; "
                    if doom == "allow"
                    else "(production guard on — strategy A↔B thrash still possible); "
                )
                + f"hard auto-fail caps: turns≤{caps.get('max_turns')}, "
                f"tokens≤{caps.get('max_tokens')}, wall≤{caps.get('max_wall_s')}s.",
            ]
        )
    elif task == "search-first-discovery":
        interp.extend(
            [
                "- Both arms require a real `\"tool\":\"clawql_search\"` tool_use "
                "(instruction text alone does not count).",
                "- Correct id is `security_advisories_list_global_advisories` (path form OK); "
                "decoy names a wrong op. Off has no search tool → fails.",
            ]
        )
    elif task == "execute-verify-loop":
        interp.extend(
            [
                "- Both arms require `clawql_search` + ≥2 `clawql_execute` tool_use rows "
                "with `dry_run:true` (guessed trail.json alone fails).",
                "- Off lacks ClawQL tools → fails even if it invents the artifact.",
            ]
        )
    elif task == "memory-roundtrip-ingest-recall":
        interp.extend(
            [
                "- Empty vault: **clawql-on** must `memory_ingest` then `memory_recall` the marker fact.",
                "- **clawql-off** has no memory tools — cannot complete the roundtrip.",
            ]
        )
    elif task == "audit-checkpoints":
        interp.append(
            "- Both arms graded for `audit` append/list evidence; off lacks the tool and fails."
        )
    elif task == "cache-scratch-handoff":
        interp.append(
            "- Both arms graded for `cache` set/get evidence; off lacks the tool and fails."
        )
    elif task == "policy-deny-execute":
        interp.extend(
            [
                "- **clawql-on** enables in-process Panguard with `execute` denied.",
                "- Passing requires log evidence of the policy block (off cannot produce it).",
            ]
        )
    elif task == "memory-injection-attempt":
        interp.extend(
            [
                "- **clawql-on** enables in-process Panguard with `memory_ingest` denied (B-4.3).",
                "- Passing requires log evidence of the ingest block + audit artifact (off cannot).",
            ]
        )
    elif task == "pageindex-section-qa":
        interp.extend(
            [
                "- Both arms require PageIndex build_tree + synthesize/traverse tool_use.",
                "- Correct code is buried under Rare cultivars; decoy is wrong.",
            ]
        )
    elif task == "hybrid-recall-source-pin":
        interp.extend(
            [
                "- Both arms require *real* PageIndex tool_use (invalid-tool attempts do not count).",
                "- Correct code fern-42 is buried in handbook.md; decoy rose-99 fails.",
            ]
        )
    elif task == "memory-recall-pageindex-pin":
        interp.extend(
            [
                "- Both arms require pageindex_build_tree + memory_recall(sources=[pageindex]).",
                "- synthesize-only paths fail; correct code cedar-31 is buried in handbook.md.",
            ]
        )
    elif task == "external-ingest-continue":
        interp.extend(
            [
                "- Empty vault: **clawql-on** must ingest_external_knowledge then memory_recall.",
                "- **clawql-off** lacks documents/ingest tools — filesystem copy alone fails.",
            ]
        )
    elif task == "codegraph-guided-edit":
        interp.append(
            "- Both arms graded for real codegraph index + query evidence; off lacks tools."
        )
    elif task == "codegraph-impact-edit":
        interp.append(
            "- Both arms graded for real codegraph + full rename impact set (7 files); off lacks tools."
        )
    elif task == "codegraph-feature-api-surface":
        interp.append(
            "- Both arms graded for real codegraph + full GET /widgets/:id wiring; off lacks tools."
        )
    elif task == "schedule-synthetic-dry-run":
        interp.append(
            "- Both arms graded for ≥2 real schedule tool_use + dry_run pass artifact."
        )
    elif task == "notify-mock-slack":
        interp.append(
            "- Both arms graded for real clawql_notify evidence; Slack upstream is stubbed."
        )
    elif task == "sandbox-trusted-compute":
        interp.append(
            "- Both arms graded for real sandbox_exec; off lacks the tool and fails."
        )
    elif task == "composed-safe-rollout":
        interp.append(
            "- Both arms graded for search + ≥2 dry_run execute + audit + memory_ingest."
        )
    elif task == "idp-safe-pipeline-lite":
        interp.append(
            "- Both arms graded for stubbed 7-stage IDP: search + dry_run×2 + audit + onyx + notify + ingest."
        )
    elif task == "idp-pipeline-resilience":
        caps = TASK_HARD_CAPS.get(task) or {}
        interp.extend(
            [
                "- **ouroboros-on** gets a seed appendix with fallback cite `quartz-21` and must "
                f"run `ouroboros_run_evolutionary_loop` (maxGenerations≤{caps.get('ouroboros_max_generations', 4)}) "
                "after the Onyx outage, then finish notify + ingest + pipeline.json.",
                "- **ouroboros-off** has ClawQL without Ouroboros / without the recipe appendix — "
                "only wrong decoy cite codes; expected fail under spend caps.",
            ]
        )
    elif task == "onyx-mock-cite":
        interp.append(
            "- Both arms graded for real knowledge_search_onyx; Onyx upstream is stubbed."
        )
    elif task == "memory-wikilink-hop":
        interp.append(
            "- Both arms graded for memory_recall with wikilink hop to Beta Fact (opal-33)."
        )
    elif task == "memory-conflict-pricing":
        interp.append(
            "- Both arms graded for memory_recall that surfaces BOTH prices and conflict=true."
        )
    elif task == "institutional-knowledge-enumerate":
        interp.append(
            "- Fair cell: identical prose corpus on disk for all arms (120 nested notes; "
            "escrow≥10 ∧ NC>18). Score = hits/5; false positives → 0.0. CLAWQL_* tags "
            "are vault-only (on-arm memory_recall advantage). On / no-memory require "
            "real memory_recall evidence; off uses filesystem only."
        )
        interp.append(
            "- **clawql-on** = same files + seeded vault + memory tools; "
            "**clawql-no-memory** = same files + ClawQL tools but no vault; "
            "**clawql-off** = same files, no ClawQL MCP."
        )
    interp.append("")
    lines.extend(interp)
    return "\n".join(lines)


def git_sha() -> str | None:
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=5,
        )
        out = (proc.stdout or "").strip()
        return out or None
    except Exception:  # noqa: BLE001
        return None


def probe_inference(url: str) -> bool:
    health = url.rstrip("/").removesuffix("/v1") + "/healthz"
    try:
        import urllib.request

        with urllib.request.urlopen(health, timeout=5) as res:  # noqa: S310
            return 200 <= getattr(res, "status", 200) < 300
    except Exception:  # noqa: BLE001
        return False


def write_agent_log(out_dir: Path | None, arm: str, trial: int, combined: str) -> str | None:
    """Persist full OpenCode / harness stdout for post-mortem (fake tool_code, etc.)."""
    if out_dir is None:
        return None
    logs = out_dir / "agent-logs"
    logs.mkdir(parents=True, exist_ok=True)
    path = logs / f"trial-{trial}-{arm}.log"
    path.write_text(combined or "", encoding="utf-8")
    return str(path)


def run_trial(
    task_dir: Path,
    arm: str,
    model: str,
    timeout_s: int,
    trial: int,
    inference_url: str,
    log_dir: Path | None = None,
) -> dict:
    instruction = (task_dir / "instruction.md").read_text(encoding="utf-8")
    tmp = Path(tempfile.mkdtemp(prefix=f"ab-{arm}-{trial}-"))
    vault = None
    task_name = task_dir.name
    caps = TASK_HARD_CAPS.get(task_name) or {}
    corr = openbench_correlation_id(arm, trial)
    seed_snapshot: Path | None = None
    try:
        materialize_workspace(task_dir, tmp)
        # B-7.1 fair cell: snapshot prose seed, copy into vault (with optional
        # CLAWQL_* enrichment), then restore the SAME seed into the workdir for
        # every arm. On = files + memory; off/no-memory = files only. Do NOT
        # hide the corpus from on-arm (that confounded earlier burns).
        seed_dir_src = tmp / ".openbench" / "memory-seed"
        if caps.get("require_institutional") and seed_dir_src.is_dir():
            seed_snapshot = Path(tempfile.mkdtemp(prefix="ik_seed_snap_"))
            shutil.copytree(seed_dir_src, seed_snapshot / "memory-seed")
        vault = seed_and_remove_memory(tmp, task_dir=task_dir)
        if seed_snapshot and (seed_snapshot / "memory-seed").is_dir():
            dest = tmp / ".openbench" / "memory-seed"
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(seed_snapshot / "memory-seed", dest)
        if vault is None and caps.get("empty_vault") and arm != "clawql-off":
            vault = empty_vault_home()
        if arm == "ouroboros-on":
            appendix = OUROBOROS_SEED_APPENDIX_BY_TASK.get(task_name)
            if appendix:
                instruction = instruction.rstrip() + "\n" + appendix
        if arm == "clawql-off":
            agent = run_arm_off(
                instruction, tmp, model, timeout_s, inference_url, correlation_id=corr
            )
            # B-7.1: force a genuine exhaustive try (Risk: early give-up).
            if (
                caps.get("require_institutional")
                and not agent.get("timed_out")
                and not (tmp / "matters.json").is_file()
            ):
                used = float(agent.get("wall_s") or 0.0)
                remaining = int(timeout_s) - int(used)
                if remaining >= 40:
                    cont_timeout = max(40, min(200, remaining))
                    agent2 = run_arm_off(
                        INSTITUTIONAL_OFF_NUDGE,
                        tmp,
                        model,
                        cont_timeout,
                        inference_url,
                        correlation_id=corr,
                    )
                    log1 = agent.pop("_combined_log", "") or ""
                    log2 = agent2.pop("_combined_log", "") or ""
                    merged = (log1 + "\n" + log2).strip()
                    turns1 = agent.get("turns")
                    agent = dict(agent2)
                    agent["arm"] = "clawql-off"
                    agent["_combined_log"] = merged
                    agent["wall_s"] = round(used + float(agent2.get("wall_s") or 0.0), 3)
                    try:
                        if turns1 is not None and agent2.get("turns") is not None:
                            agent["turns"] = int(turns1) + int(agent2.get("turns") or 0)
                    except (TypeError, ValueError):
                        pass
                    agent["output_tail"] = merged[-2000:]
            if vault:
                shutil.rmtree(vault, ignore_errors=True)
                vault = None
        else:
            ouro = None
            if arm == "ouroboros-on":
                ouro = True
            elif arm == "ouroboros-off":
                ouro = False
            # clawql-no-memory: same MCP surface as clawql-on, but wipe seed +
            # disable memory so wins cannot come from persistent vault state.
            disable_memory = bool(caps.get("disable_memory"))
            if arm == "clawql-no-memory":
                disable_memory = True
                if vault:
                    shutil.rmtree(vault, ignore_errors=True)
                    vault = None
            agent = run_arm_on(
                instruction,
                tmp,
                model,
                timeout_s,
                inference_url,
                vault,
                arm=arm,
                ouroboros=ouro,
                ouroboros_max_generations=caps.get("ouroboros_max_generations"),
                disable_memory=disable_memory,
                task_hard_caps=caps,
                require_search=bool(caps.get("require_search")),
                require_execute=bool(caps.get("require_execute")),
                require_memory_roundtrip=bool(caps.get("require_memory_roundtrip")),
                require_audit=bool(caps.get("require_audit")),
                require_cache=bool(caps.get("require_cache")),
                require_policy_block=bool(caps.get("require_policy_block")),
                require_pageindex=bool(caps.get("require_pageindex")),
                require_memory_recall_pageindex=bool(
                    caps.get("require_memory_recall_pageindex")
                ),
                panguard_block_tools=caps.get("panguard_block_tools"),
                enable_pageindex=bool(caps.get("enable_pageindex")),
                require_codegraph=bool(caps.get("require_codegraph")),
                enable_codegraph=bool(caps.get("enable_codegraph")),
                codegraph_impact=bool(caps.get("codegraph_impact")),
                codegraph_feature=bool(caps.get("codegraph_feature")),
                require_schedule=bool(caps.get("require_schedule")),
                enable_schedule=bool(caps.get("enable_schedule")),
                require_external_ingest=bool(caps.get("require_external_ingest")),
                enable_external_ingest=bool(caps.get("enable_external_ingest")),
                require_notify=bool(caps.get("require_notify")),
                enable_notify=bool(caps.get("enable_notify")),
                require_sandbox=bool(caps.get("require_sandbox")),
                enable_sandbox=bool(caps.get("enable_sandbox")),
                require_composed=bool(caps.get("require_composed")),
                enable_composed=bool(caps.get("enable_composed")),
                require_idp=bool(caps.get("require_idp")),
                enable_idp=bool(caps.get("enable_idp")),
                enable_idp_resilience=bool(caps.get("enable_idp_resilience")),
                require_onyx=bool(caps.get("require_onyx")),
                enable_onyx=bool(caps.get("enable_onyx")),
                require_wikilink=bool(caps.get("require_wikilink")),
                require_conflict=bool(caps.get("require_conflict")),
                require_institutional=bool(caps.get("require_institutional")),
                correlation_id=corr,
            )
        agent["correlation_id"] = corr
        # Prefer full captured stream; fall back to / merge harness dump.
        # Never *replace* combined with a longer dump — that can drop an earlier
        # session's tool_use rows (e.g. clawql_search) when a nudge rewrites the dump.
        combined = agent.pop("_combined_log", None) or ""
        dump = tmp / ".openbench_harness.jsonl"
        if dump.is_file():
            try:
                dump_text = dump.read_text(encoding="utf-8", errors="replace")
                if dump_text and dump_text not in combined:
                    combined = (combined + "\n" + dump_text) if combined else dump_text
            except OSError:
                pass
        if not combined:
            combined = agent.get("output_tail") or ""
        log_path = write_agent_log(log_dir, arm, trial, combined)
        if log_path:
            agent["log_path"] = log_path
        # Sidecars for checker hard caps + ouroboros evidence.
        write_usage_sidecar(tmp, agent)
        (tmp / ".openbench_agent.log").write_text(combined or "", encoding="utf-8")

        checker_env_extra = {}
        if caps:
            checker_env_extra["OPENBENCH_HARD_MAX_TURNS"] = str(caps["max_turns"])
            checker_env_extra["OPENBENCH_HARD_MAX_TOKENS"] = str(caps["max_tokens"])
        if arm == "ouroboros-on":
            checker_env_extra["OPENBENCH_REQUIRE_OUROBOROS"] = "1"
        if caps.get("require_search"):
            checker_env_extra["OPENBENCH_REQUIRE_SEARCH"] = "1"
        if caps.get("require_execute"):
            checker_env_extra["OPENBENCH_REQUIRE_EXECUTE"] = "1"
        if caps.get("require_memory_roundtrip"):
            # Both arms: off must fail without memory tools (no instruction leak win).
            checker_env_extra["OPENBENCH_REQUIRE_MEMORY_ROUNDTRIP"] = "1"
        if caps.get("require_audit"):
            checker_env_extra["OPENBENCH_REQUIRE_AUDIT"] = "1"
        if caps.get("require_cache"):
            checker_env_extra["OPENBENCH_REQUIRE_CACHE"] = "1"
        if caps.get("require_policy_block"):
            checker_env_extra["OPENBENCH_REQUIRE_POLICY_BLOCK"] = "1"
        if caps.get("require_pageindex"):
            checker_env_extra["OPENBENCH_REQUIRE_PAGEINDEX"] = "1"
        if caps.get("require_memory_recall_pageindex"):
            checker_env_extra["OPENBENCH_REQUIRE_MEMORY_RECALL_PAGEINDEX"] = "1"
        if caps.get("require_codegraph"):
            checker_env_extra["OPENBENCH_REQUIRE_CODEGRAPH"] = "1"
        if caps.get("require_schedule"):
            checker_env_extra["OPENBENCH_REQUIRE_SCHEDULE"] = "1"
        if caps.get("require_external_ingest"):
            checker_env_extra["OPENBENCH_REQUIRE_EXTERNAL_INGEST"] = "1"
        if caps.get("require_notify"):
            checker_env_extra["OPENBENCH_REQUIRE_NOTIFY"] = "1"
        if caps.get("require_sandbox"):
            checker_env_extra["OPENBENCH_REQUIRE_SANDBOX"] = "1"
        if caps.get("require_composed"):
            checker_env_extra["OPENBENCH_REQUIRE_COMPOSED"] = "1"
        if caps.get("require_idp"):
            checker_env_extra["OPENBENCH_REQUIRE_IDP"] = "1"
        if caps.get("require_onyx"):
            checker_env_extra["OPENBENCH_REQUIRE_ONYX"] = "1"
        if caps.get("require_wikilink"):
            checker_env_extra["OPENBENCH_REQUIRE_WIKILINK"] = "1"
        if caps.get("require_conflict"):
            checker_env_extra["OPENBENCH_REQUIRE_CONFLICT"] = "1"
        # Memory-tool evidence is required for MCP arms only. Off may score via
        # exhaustive reads of `.openbench/memory-seed/` (hardened B-7.1).
        if caps.get("require_institutional") and arm in (
            "clawql-on",
            "clawql-no-memory",
        ):
            checker_env_extra["OPENBENCH_REQUIRE_INSTITUTIONAL"] = "1"
        checker = run_checker(task_dir, tmp, env_extra=checker_env_extra)
        checker = apply_hard_caps(task_name, agent, checker)
        return {
            "trial": trial,
            "arm": arm,
            "agent": agent,
            "checker": checker,
            "workdir": str(tmp),
        }
    finally:
        if seed_snapshot:
            shutil.rmtree(seed_snapshot, ignore_errors=True)
        if vault:
            shutil.rmtree(vault, ignore_errors=True)
        if os.environ.get("CLAWQL_AB_KEEP_WORKDIR") != "1":
            shutil.rmtree(tmp, ignore_errors=True)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", required=True, choices=KNOWN_TASKS)
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help="clawql-inference model id (e.g. deepseek/deepseek-chat or openrouter/…)",
    )
    parser.add_argument(
        "--inference-url",
        default=DEFAULT_INFERENCE_URL,
        help="clawql-inference OpenAI-compat base (default http://127.0.0.1:8080/v1)",
    )
    parser.add_argument("--trials", type=int, default=1)
    parser.add_argument("--timeout", type=int, default=None, dest="timeout_s")
    parser.add_argument("--out", type=Path, required=True, help="JSON results path")
    parser.add_argument("--summary-md", type=Path, help="Markdown summary path")
    parser.add_argument(
        "--arms",
        default="clawql-on,clawql-off",
        help="Comma list: clawql-on,clawql-off,clawql-no-memory,ouroboros-on,ouroboros-off",
    )
    args = parser.parse_args(argv)

    inference_url = normalize_inference_url(args.inference_url)
    if not probe_inference(inference_url):
        print(
            f"ERROR: clawql-inference not reachable at {inference_url} "
            f"(expected /healthz). Start with:\n"
            f"  OPENROUTER_API_KEY=… clawql inference serve --port 8080\n"
            f"  # or DEEPSEEK_API_KEY=… (direct BYOK) when you skip OpenRouter",
            file=sys.stderr,
        )
        return 2

    task_dir = TASKS_DIR / args.task
    if not (task_dir / "checker.sh").is_file():
        print(f"ERROR: task not found: {task_dir}", file=sys.stderr)
        return 2

    caps = TASK_HARD_CAPS.get(args.task) or {}
    timeout_s = args.timeout_s
    if timeout_s is None:
        timeout_s = int(caps.get("default_timeout_s") or 300)
    # Never allow a timeout above the task hard wall cap (spend guard).
    if caps.get("max_wall_s") is not None:
        timeout_s = min(int(timeout_s), int(caps["max_wall_s"]))

    arms = [a.strip() for a in args.arms.split(",") if a.strip()]
    for arm in arms:
        if arm not in KNOWN_ARMS:
            print(f"ERROR: unknown arm {arm!r} (known: {', '.join(KNOWN_ARMS)})", file=sys.stderr)
            return 2

    if not shutil.which(resolve_opencode()) and not Path(resolve_opencode()).exists():
        print("ERROR: opencode CLI not found. Install OpenCode, then retry.", file=sys.stderr)
        return 2

    mcp_arms = [a for a in arms if a != "clawql-off"]
    if mcp_arms:
        clawql = resolve_clawql()
        probe = ["node", clawql, "--version"] if clawql.endswith(".mjs") else [clawql, "--version"]
        try:
            subprocess.run(probe, capture_output=True, text=True, timeout=15, check=False)
        except Exception as exc:  # noqa: BLE001
            print(f"ERROR: clawql probe failed: {exc}", file=sys.stderr)
            return 2

    gateway_model = normalize_model_id(args.model)
    started = datetime.now(timezone.utc).isoformat()
    def skipped_row(trial: int, arm: str, reason: str) -> dict:
        return {
            "trial": trial,
            "arm": arm,
            "agent": {
                "arm": arm,
                "harness": DEFAULT_HARNESS,
                "completed": False,
                "timed_out": False,
                "skipped": True,
                "skip_reason": reason,
                "wall_s": 0,
                "tokens": None,
                "turns": None,
                "error": reason,
            },
            "checker": {
                "success": False,
                "score": 0.0,
                "stdout": "",
                "stderr": reason,
            },
            "workdir": None,
        }

    rows: list[dict] = []
    abort_all = False
    abort_reason = ""
    for trial in range(1, args.trials + 1):
        skip_remaining = abort_all
        skip_reason = abort_reason
        for arm in arms:
            if skip_remaining:
                print(
                    f"==> trial {trial}/{args.trials} arm={arm} SKIPPED "
                    f"({skip_reason})",
                    flush=True,
                )
                rows.append(skipped_row(trial, arm, skip_reason))
                continue
            print(
                f"==> trial {trial}/{args.trials} arm={arm} "
                f"harness={DEFAULT_HARNESS} model={gateway_model}",
                flush=True,
            )
            row = run_trial(
                task_dir,
                arm,
                gateway_model,
                timeout_s,
                trial,
                inference_url,
                log_dir=args.out.parent,
            )
            # Keep JSON artifacts smaller — full text lives in agent-logs/.
            if "_combined_log" in row.get("agent", {}):
                del row["agent"]["_combined_log"]
            rows.append(row)
            chk = row["checker"]
            ag = row["agent"]
            print(
                f"    checker success={chk['success']} score={chk['score']} "
                f"tokens={ag.get('tokens')} turns={ag.get('turns')} wall_s={ag.get('wall_s')}",
                flush=True,
            )
            if credit_exhausted(ag):
                abort_all = True
                skip_remaining = True
                abort_reason = (
                    f"provider credits exhausted on {arm} (HTTP 402 / openrouter_credits). "
                    "Top up OPENROUTER_API_KEY (or use BYOK) before re-running."
                )
                skip_reason = abort_reason
                print(f"    !! {abort_reason} — aborting remaining arms/trials", flush=True)
                continue
            if is_infra_hang(ag):
                skip_remaining = True
                skip_reason = (
                    f"infra hang on {arm}: timed out with no turns/tools "
                    f"(likely OpenCode API/permission stall; see agent-logs + --print-logs)"
                )
                print(f"    !! {skip_reason} — skipping remaining arms this trial", flush=True)

    finished = datetime.now(timezone.utc).isoformat()
    by_arm = {arm: [r for r in rows if r["arm"] == arm] for arm in arms}
    report = {
        "schema": "clawql.openbench.ab.v1",
        "provider": gateway_model.split("/", 1)[0] if "/" in gateway_model else "unknown",
        "inference": "clawql-inference",
        "harness": DEFAULT_HARNESS,
        "inference_url": inference_url,
        "task": args.task,
        "model": gateway_model,
        "trials": args.trials,
        "timeout_s": timeout_s,
        "hard_caps": caps or None,
        "arms": arms,
        "started_at": started,
        "finished_at": finished,
        "git_sha": git_sha(),
        "summary": {arm: summarize(by_arm.get(arm, [])) for arm in arms},
        "trials_detail": rows,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    md = render_markdown(report)
    print(md)
    if args.summary_md:
        args.summary_md.parent.mkdir(parents=True, exist_ok=True)
        args.summary_md.write_text(md, encoding="utf-8")

    print(f"Wrote {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
