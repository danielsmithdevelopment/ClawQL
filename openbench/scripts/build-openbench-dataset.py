#!/usr/bin/env python3
"""Build publish-ready OpenBenchTrace v1.0 JSONL + WORM batch manifest.

Reads OpenBench ``results.json`` (+ agent logs / call-store), applies write-time
redaction, validates against ``openbench/schema/openbench-trace.v1.json``, and
writes a durable pack ready for R2:

  dataset/
    traces/                 # one *.jsonl file per trial (single JSON line)
    call-store/calls.jsonl  # companion inference records (scrubbed)
    MANIFEST.json           # WORM batch manifest
    schema/openbench-trace.v1.json

Usage::

  python3 openbench/scripts/build-openbench-dataset.py \\
    --artifact-dir artifacts/openbench-ab/search-first-discovery \\
    --run-id 123 --require-presidio-or-local
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "openbench" / "schema" / "openbench-trace.v1.json"
SCHEMA_VERSION = "1.1"
REDACTION_POLICY_ID = "openbench-local-v1+presidio-when-enabled"
RTP_PROTOCOL_VERSION = "0.1"
RETRIEVAL_TOOLS = {
    "memory_recall",
    "clawql_memory_recall",
    "search",
    "clawql_search",
    "knowledge_search_onyx",
    "clawql_knowledge_search_onyx",
    "pageindex_traverse",
    "pageindex_get_content",
    "pageindex_synthesize",
    "clawql_pageindex_traverse",
    "clawql_pageindex_get_content",
    "clawql_pageindex_synthesize",
    "ingest_external_knowledge",
    "clawql_ingest_external_knowledge",
}
TIER1_HINTS = (
    "policy-deny",
    "audit-checkpoints",
    "cache-scratch",
    "schedule-synthetic",
    "notify-mock",
    "sandbox-trusted",
)

# Deterministic local redaction (always on). Presidio is preferred when enabled
# via CLAWQL_ENABLE_PRESIDIO=1 and a reachable analyzer — see clawql-api.
LOCAL_PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED_AWS_KEY]"),
    (
        "aws_secret",
        re.compile(r"(?i)(aws_secret_access_key|secret_access_key)\s*[:=]\s*\S+"),
        r"\1=[REDACTED]",
    ),
    (
        "openai_key",
        re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
        "[REDACTED_API_KEY]",
    ),
    (
        "openrouter_key",
        re.compile(r"\bsk-or-[A-Za-z0-9_-]{20,}\b"),
        "[REDACTED_API_KEY]",
    ),
    (
        "slack_token",
        re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
        "[REDACTED_SLACK_TOKEN]",
    ),
    (
        "github_pat",
        re.compile(r"\bghp_[A-Za-z0-9]{20,}\b"),
        "[REDACTED_GITHUB_PAT]",
    ),
    (
        "email",
        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
        "[REDACTED_EMAIL]",
    ),
    (
        "bearer",
        re.compile(r"(?i)(authorization:\s*bearer\s+)\S+"),
        r"\1[REDACTED]",
    ),
]


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def policy_hash() -> str:
    blob = REDACTION_POLICY_ID + "|" + "|".join(name for name, _, _ in LOCAL_PATTERNS)
    return sha256_text(blob)[:32]


def arm_bucket(arm_label: str) -> str:
    label = (arm_label or "").lower()
    if label.endswith("-on") or label in ("on", "clawql-on", "ouroboros-on"):
        return "on"
    if label.endswith("-off") or label in ("off", "clawql-off", "ouroboros-off"):
        return "off"
    if "off" in label:
        return "off"
    return "on"


def redact_text(text: str, fields: set[str]) -> str:
    out = text
    for name, pat, repl in LOCAL_PATTERNS:
        new_out, n = pat.subn(repl, out)
        if n:
            fields.add(name)
            out = new_out
    return out


def redact_value(value: Any, fields: set[str]) -> Any:
    if isinstance(value, str):
        return redact_text(value, fields)
    if isinstance(value, list):
        return [redact_value(v, fields) for v in value]
    if isinstance(value, dict):
        return {k: redact_value(v, fields) for k, v in value.items()}
    return value


def try_presidio_scrub_line(line: str) -> tuple[str, str]:
    """Optional Presidio via clawql export scrubber. Returns (line, engine)."""
    if os.environ.get("CLAWQL_ENABLE_PRESIDIO", "").strip() != "1":
        return line, "openbench-local-v1"
    script = """
import { createRequire } from 'node:module';
import fs from 'node:fs';
const line = fs.readFileSync(0, 'utf8').trim();
try {
  const mod = await import(new URL('./packages/clawql-inference/dist/export/pii.js', import.meta.url));
  const out = await mod.scrubExportLine(line, 'presidio');
  JSON.parse(out);
  process.stdout.write(out);
} catch {
  process.stdout.write(line);
}
"""
    import subprocess

    try:
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            input=line.encode("utf-8"),
            capture_output=True,
            cwd=str(ROOT),
            timeout=60,
            check=False,
        )
        if proc.returncode == 0 and proc.stdout:
            out = proc.stdout.decode("utf-8").strip()
            json.loads(out)  # must remain valid JSON
            if out != line:
                return out, "presidio+openbench-local-v1"
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        pass
    return line, "openbench-local-v1"


def load_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def validate_trace(trace: dict[str, Any], schema: dict[str, Any]) -> None:
    try:
        import jsonschema
    except ImportError as exc:
        raise SystemExit(
            "jsonschema is required: pip install jsonschema"
        ) from exc
    jsonschema.validate(instance=trace, schema=schema)


def extract_tool_calls(log_text: str) -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line in log_text.splitlines():
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
        if not isinstance(tool, str) or not tool or tool == "invalid":
            continue
        state = part.get("state") if isinstance(part.get("state"), dict) else {}
        key = f"{tool}:{json.dumps(state.get('input'), sort_keys=True, default=str)[:200]}"
        if key in seen:
            continue
        seen.add(key)
        entry: dict[str, Any] = {"tool": tool}
        if "input" in state:
            entry["input"] = state.get("input")
        if "output" in state:
            entry["output"] = state.get("output")
        tools.append(entry)
    return tools


def read_log(path: Any) -> str:
    if not path:
        return ""
    p = Path(str(path))
    if not p.is_file():
        return ""
    return p.read_text(encoding="utf-8", errors="replace")


def score_to_verdict(score: float | None) -> str:
    if score is None:
        return "fail"
    if score >= 0.99:
        return "pass"
    if score <= 0.01:
        return "fail"
    return "partial"


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str, separators=(",", ":"))


def sha256_canonical(value: Any) -> str:
    return sha256_text(canonical_json(value))


def b64url(data: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def issue_consent_token(*, run_id: str, task_id: str, issued_at: str) -> dict[str, Any]:
    """HS256 JWT with community_model + dataset_licensing scopes (RTP-compatible)."""
    import hmac

    scopes = ["community_model", "dataset_licensing"]
    issuer = "clawql-openbench-gateway"
    subject = f"openbench:run:{run_id}:task:{task_id}"
    pre = os.environ.get("CLAWQL_OPENBENCH_CONSENT_TOKEN", "").strip()
    if pre:
        return {
            "token": pre,
            "scopes": scopes,
            "issuedAt": issued_at,
            "issuer": issuer,
            "subject": subject,
        }
    secret = (
        os.environ.get("CLAWQL_RTP_CONSENT_SECRET", "").strip()
        or os.environ.get("CLAWQL_OPENBENCH_CONSENT_SECRET", "").strip()
        or f"clawql-openbench-consent-dev:{os.environ.get('GITHUB_RUN_ID', run_id)}:{os.environ.get('GITHUB_SHA', 'dev')}"
    )
    iat = int(datetime.fromisoformat(issued_at.replace("Z", "+00:00")).timestamp())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": issuer,
        "sub": subject,
        "scope": " ".join(scopes),
        "iat": iat,
        "exp": iat + 60 * 60 * 24 * 90,
        "run_id": run_id,
        "task_id": task_id,
        "purpose": "openbench_trace_dataset",
    }
    signing_input = f"{b64url(json.dumps(header, separators=(',', ':')).encode())}.{b64url(json.dumps(payload, separators=(',', ':')).encode())}"
    sig = hmac.new(secret.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
    return {
        "token": f"{signing_input}.{b64url(sig)}",
        "scopes": scopes,
        "issuedAt": issued_at,
        "issuer": issuer,
        "subject": subject,
    }


def seal_turn(partial: dict[str, Any], prev: str | None) -> dict[str, Any]:
    body = {
        "kind": partial["kind"],
        "turnIndex": partial["turnIndex"],
        "intent": partial.get("intent"),
        "retrieval": partial.get("retrieval"),
        "reasoning": partial.get("reasoning"),
        "execution": partial.get("execution"),
        "delta": partial.get("delta"),
        "verdict": partial.get("verdict"),
    }
    turn_hash = sha256_canonical({"prev": prev or "genesis", "node": body})
    out = dict(partial)
    out["prevTurnHash"] = prev
    out["turnHash"] = turn_hash
    return out


def resolve_evaluator_tier(task_id: str, grader_id: str) -> int:
    hay = f"{task_id} {grader_id}".lower()
    if "semantic" in hay or "llm-judge" in hay or "tier-2" in hay:
        return 2
    if "human" in hay or "tier-3" in hay:
        return 3
    if any(h in hay for h in TIER1_HINTS):
        return 1
    if "checker.sh" in grader_id or grader_id.startswith("openbench/"):
        return 1
    return 2


def is_retrieval_tool(name: str) -> bool:
    n = name.lower().removeprefix("tool:")
    if n in RETRIEVAL_TOOLS:
        return True
    return any(x in n for x in ("memory_recall", "search", "pageindex", "onyx", "knowledge"))


def project_rtp(
    *,
    run_id: str,
    task_id: str,
    messages: list[dict[str, Any]],
    tool_calls: list[dict[str, Any]],
    verdict: str,
    score: float,
    grader_id: str,
    collected_at: str,
) -> dict[str, Any]:
    consent = issue_consent_token(run_id=run_id, task_id=task_id, issued_at=collected_at)
    turns: list[dict[str, Any]] = []
    prev: str | None = None
    turn_index = 0
    state_hash = sha256_canonical({"messages": [], "tools": []})

    raw_prompt = ""
    for m in messages:
        if m.get("role") == "user" and m.get("content") is not None:
            content = m["content"]
            raw_prompt = content if isinstance(content, str) else json.dumps(content)
            break
    goal_line = next(
        (ln.strip() for ln in raw_prompt.splitlines() if ln.strip() and not ln.strip().startswith("#")),
        "",
    )
    parsed_goal = (
        goal_line
        if goal_line and len(goal_line) <= 240
        else (f"{goal_line[:237]}..." if goal_line else f"complete openbench task {task_id}")
    )
    intent = seal_turn(
        {
            "kind": "intent",
            "turnIndex": turn_index,
            "intent": {
                "rawPrompt": raw_prompt or f"(task:{task_id})",
                "parsedGoal": parsed_goal,
            },
        },
        prev,
    )
    turn_index += 1
    turns.append(intent)
    prev = intent["turnHash"]
    state_hash = sha256_canonical({"after": "intent", "prompt": intent["intent"]["rawPrompt"]})

    assistant_bits = [
        (m["content"] if isinstance(m.get("content"), str) else json.dumps(m.get("content") or ""))
        for m in messages
        if m.get("role") == "assistant" and m.get("content")
    ]

    for call in tool_calls:
        tool_name = str(call.get("tool") or "unknown")
        if is_retrieval_tool(tool_name):
            inp = call.get("input")
            if isinstance(inp, str):
                queries = [inp]
            elif isinstance(inp, dict):
                queries = []
                for key in ("query", "q", "prompt", "text", "title"):
                    if isinstance(inp.get(key), str) and inp[key]:
                        queries = [inp[key]]
                        break
                if not queries:
                    queries = [json.dumps(inp)[:500]]
            elif inp is None:
                queries = []
            else:
                queries = [str(inp)]
            node = seal_turn(
                {
                    "kind": "retrieval",
                    "turnIndex": turn_index,
                    "retrieval": {"queries": queries, "sources": [tool_name], "tool": tool_name},
                },
                prev,
            )
            turn_index += 1
            turns.append(node)
            prev = node["turnHash"]
        else:
            seed = [s[:800] for s in assistant_bits[-2:]] if assistant_bits else [f"select tool {tool_name}"]
            node = seal_turn(
                {
                    "kind": "reasoning",
                    "turnIndex": turn_index,
                    "reasoning": {"seedChain": seed, "selectedTool": tool_name},
                },
                prev,
            )
            turn_index += 1
            turns.append(node)
            prev = node["turnHash"]

        before = state_hash
        execution = seal_turn(
            {
                "kind": "execution",
                "turnIndex": turn_index,
                "execution": {
                    "toolName": tool_name,
                    "payload": call.get("input"),
                    "output": call.get("output"),
                },
            },
            prev,
        )
        turn_index += 1
        turns.append(execution)
        prev = execution["turnHash"]
        state_hash = sha256_canonical(
            {
                "before": before,
                "tool": tool_name,
                "input": call.get("input"),
                "output": call.get("output"),
            }
        )
        delta = seal_turn(
            {
                "kind": "delta",
                "turnIndex": turn_index,
                "delta": {"stateBeforeHash": before, "stateAfterHash": state_hash},
            },
            prev,
        )
        turn_index += 1
        turns.append(delta)
        prev = delta["turnHash"]

    if not tool_calls and assistant_bits:
        reasoning = seal_turn(
            {
                "kind": "reasoning",
                "turnIndex": turn_index,
                "reasoning": {"seedChain": [s[:800] for s in assistant_bits[:3]]},
            },
            prev,
        )
        turn_index += 1
        turns.append(reasoning)
        prev = reasoning["turnHash"]

    verdict_payload = {
        "outcome": verdict,
        "evaluatorTier": resolve_evaluator_tier(task_id, grader_id),
        "source": "grader",
        "graderId": grader_id,
        "score": score,
    }
    verdict_node = seal_turn(
        {"kind": "verdict", "turnIndex": turn_index, "verdict": verdict_payload},
        prev,
    )
    turns.append(verdict_node)
    return {
        "protocol": "rtp",
        "protocolVersion": RTP_PROTOCOL_VERSION,
        "consentToken": consent,
        "turnSequence": turns,
        "verdict": verdict_payload,
    }


def build_messages(instruction: str, log_text: str, call_records: list[dict]) -> list[dict]:
    messages: list[dict[str, Any]] = []
    if instruction.strip():
        messages.append({"role": "user", "content": instruction.strip()})
    # Prefer structured inference call-store messages when present.
    for rec in call_records:
        for m in rec.get("messages") or []:
            if isinstance(m, dict) and m.get("role"):
                messages.append(
                    {"role": m.get("role"), "content": m.get("content")}
                )
        resp = rec.get("response")
        if isinstance(resp, str) and resp.strip():
            messages.append({"role": "assistant", "content": resp})
    if len(messages) <= 1 and log_text.strip():
        # Fallback: keep a truncated agent log as assistant context for FT.
        messages.append(
            {
                "role": "assistant",
                "content": log_text[-12000:],
            }
        )
    return messages


def load_call_store(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            rows.append(obj)
    return rows


def build_dataset(
    artifact_dir: Path,
    *,
    run_id: str,
    task: str | None,
    model: str | None,
    phase: float,
    clawql_version: str,
    require_sink_ready: bool,
) -> dict[str, Any]:
    artifact_dir = artifact_dir.resolve()
    results_path = artifact_dir / "results.json"
    if not results_path.is_file():
        raise FileNotFoundError(f"missing results.json under {artifact_dir}")

    results = json.loads(results_path.read_text(encoding="utf-8"))
    task_id = task or str(results.get("task") or artifact_dir.name)
    model_id = model or str(results.get("model") or "unknown")
    harness = str(results.get("harness") or "opencode")
    hard_caps = results.get("hard_caps") or {}

    call_store_src = Path(
        os.environ.get(
            "CLAWQL_INFERENCE_STORE_PATH",
            str(artifact_dir / "call-store" / "calls.jsonl"),
        )
    )
    if not call_store_src.is_file():
        alt = artifact_dir / "call-store" / "calls.jsonl"
        if alt.is_file():
            call_store_src = alt

    call_records = load_call_store(call_store_src)
    schema = load_schema()
    manifest_id = f"ob-manifest-{run_id}-{task_id}"
    collected_at = datetime.now(timezone.utc).isoformat()
    redaction_hash = policy_hash()

    out_dir = artifact_dir / "dataset"
    traces_dir = out_dir / "traces"
    schema_dir = out_dir / "schema"
    call_out_dir = out_dir / "call-store"
    traces_dir.mkdir(parents=True, exist_ok=True)
    schema_dir.mkdir(parents=True, exist_ok=True)
    call_out_dir.mkdir(parents=True, exist_ok=True)

    # Scrub companion call-store at write time.
    scrubbed_calls: list[str] = []
    call_fields: set[str] = set()
    presidio_engine = "openbench-local-v1"
    for rec in call_records:
        fields: set[str] = set()
        redacted_obj = redact_value(rec, fields)
        line = json.dumps(redacted_obj, ensure_ascii=False, separators=(",", ":"))
        line, engine = try_presidio_scrub_line(line)
        if "presidio" in engine:
            presidio_engine = engine
        # Re-apply local patterns after Presidio (belt and suspenders).
        line = redact_text(line, fields)
        call_fields |= fields
        scrubbed_calls.append(line)

    (call_out_dir / "calls.jsonl").write_text(
        ("\n".join(scrubbed_calls) + ("\n" if scrubbed_calls else "")),
        encoding="utf-8",
    )

    trials = results.get("trials_detail") or []
    if not trials:
        raise RuntimeError("results.json has no trials_detail — refusing empty dataset")

    written: list[dict[str, Any]] = []
    for trial in trials:
        if not isinstance(trial, dict):
            continue
        arm_label = str(trial.get("arm") or "")
        arm = arm_bucket(arm_label)
        agent = trial.get("agent") or {}
        checker = trial.get("checker") or {}
        trial_n = int(trial.get("trial") or 1)
        score_raw = checker.get("score")
        try:
            score = float(score_raw) if score_raw is not None else 0.0
        except (TypeError, ValueError):
            score = 0.0
        success = bool(checker.get("success")) if "success" in checker else score >= 0.99
        log_text = read_log(agent.get("log_path"))
        if not log_text and agent.get("output_tail"):
            log_text = str(agent.get("output_tail"))

        instruction = ""
        workdir = trial.get("workdir")
        if workdir:
            inst = Path(str(workdir)) / ".openbench_instruction.md"
            if inst.is_file():
                instruction = inst.read_text(encoding="utf-8", errors="replace")

        # Call-store is shared across arms today; attach ids as batch context only.
        call_ids = [str(r.get("id")) for r in call_records if r.get("id")]
        messages = build_messages(instruction, log_text, [])
        tool_calls = extract_tool_calls(log_text)
        verdict = score_to_verdict(score)
        grader_id = f"openbench/{task_id}/checker.sh"
        rtp = project_rtp(
            run_id=str(run_id),
            task_id=task_id,
            messages=messages,
            tool_calls=tool_calls,
            verdict=verdict,
            score=score,
            grader_id=grader_id,
            collected_at=collected_at,
        )

        pre = {
            "schema_version": SCHEMA_VERSION,
            "trace_id": str(uuid.uuid4()),
            "run_id": str(run_id),
            "task_id": task_id,
            "arm": arm,
            "arm_label": arm_label,
            "phase": phase,
            "model": model_id,
            "harness": harness,
            "clawql_version": clawql_version,
            "messages": messages,
            "tool_calls": tool_calls,
            "verdict": verdict,
            "verdict_source": "grader",
            "score": score,
            "grader_id": grader_id,
            "turns": agent.get("turns"),
            "elapsed_ms": int(round(float(agent.get("wall_s") or 0) * 1000))
            if agent.get("wall_s") is not None
            else None,
            "total_tokens": agent.get("tokens"),
            "hit_turn_cap": bool(agent.get("timed_out"))
            and hard_caps.get("max_turns") is not None,
            "hit_time_cap": bool(agent.get("timed_out")),
            "hit_token_cap": False,
            "presidio_version": presidio_engine,
            "redaction_policy_hash": redaction_hash,
            "pii_fields_redacted": [],
            "content_hash": "",
            "redacted_hash": "",
            "manifest_id": manifest_id,
            "collected_at": collected_at,
            "suitable_for_training": bool(
                agent.get("completed") and success and not agent.get("timed_out")
            ),
            "inference_call_ids": call_ids[:200],
            "rtp": rtp,
        }

        # content_hash over pre-redaction canonical JSON (without hashes filled)
        pre_for_hash = {k: v for k, v in pre.items() if k not in ("content_hash", "redacted_hash", "pii_fields_redacted")}
        content_hash = sha256_text(
            json.dumps(pre_for_hash, sort_keys=True, ensure_ascii=False, default=str)
        )
        fields: set[str] = set()
        redacted = redact_value(pre, fields)
        redacted["content_hash"] = content_hash
        redacted["pii_fields_redacted"] = sorted(fields | call_fields)
        redacted["presidio_version"] = presidio_engine
        # Second-pass local + optional Presidio on the full record line
        line = json.dumps(redacted, ensure_ascii=False, separators=(",", ":"))
        line, engine = try_presidio_scrub_line(line)
        if "presidio" in engine:
            redacted["presidio_version"] = engine
            presidio_engine = engine
        line = redact_text(line, fields)
        redacted = json.loads(line)
        redacted["redacted_hash"] = sha256_text(line)
        redacted["pii_fields_redacted"] = sorted(
            set(redacted.get("pii_fields_redacted") or []) | fields
        )

        validate_trace(redacted, schema)

        fname = f"{task_id}-{arm}-{trial_n:03d}.jsonl"
        (traces_dir / fname).write_text(line + "\n", encoding="utf-8")
        written.append(
            {
                "file": f"traces/{fname}",
                "trace_id": redacted["trace_id"],
                "arm": arm,
                "trial": trial_n,
                "verdict": redacted["verdict"],
                "score": redacted["score"],
                "content_hash": redacted["content_hash"],
                "redacted_hash": redacted["redacted_hash"],
            }
        )

    schema_dest = schema_dir / "openbench-trace.v1.json"
    schema_dest.write_text(SCHEMA_PATH.read_text(encoding="utf-8"), encoding="utf-8")

    manifest = {
        "schema": "clawql.openbench.worm-manifest.v1",
        "manifest_id": manifest_id,
        "schema_version": SCHEMA_VERSION,
        "created_at": collected_at,
        "github_run_id": str(run_id),
        "task_id": task_id,
        "model": model_id,
        "clawql_version": clawql_version,
        "redaction": {
            "policy_id": REDACTION_POLICY_ID,
            "policy_hash": redaction_hash,
            "presidio_version": presidio_engine,
            "presidio_enabled_env": os.environ.get("CLAWQL_ENABLE_PRESIDIO", "0"),
        },
        "counts": {
            "traces": len(written),
            "call_store_records": len(scrubbed_calls),
            "suitable_for_training": sum(
                1
                for w in written
                if any(
                    json.loads((traces_dir / Path(w["file"]).name).read_text()).get(
                        "suitable_for_training"
                    )
                    for _ in [0]
                )
            ),
        },
        "traces": written,
        "call_store": {
            "path": "call-store/calls.jsonl",
            "sha256": sha256_bytes((call_out_dir / "calls.jsonl").read_bytes())
            if (call_out_dir / "calls.jsonl").is_file()
            else None,
            "records": len(scrubbed_calls),
        },
        "batch_content_hash": sha256_text(
            json.dumps(written, sort_keys=True, ensure_ascii=False)
        ),
        "note": (
            "Corpus of record for fine-tune / future public release. "
            "GitHub Actions artifacts are a 90-day warm cache only."
        ),
    }
    # Recompute suitable count simply
    suitable = 0
    for w in written:
        obj = json.loads((traces_dir / Path(w["file"]).name).read_text(encoding="utf-8"))
        if obj.get("suitable_for_training"):
            suitable += 1
    manifest["counts"]["suitable_for_training"] = suitable

    (out_dir / "MANIFEST.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )

    # Also refresh session labels for convenience
    labels_path = artifact_dir / "trace-session-labels.json"
    labels_path.write_text(
        json.dumps(
            {
                "schema": "clawql.openbench.trace-session-labels.v2",
                "manifest_id": manifest_id,
                "task": task_id,
                "run_id": run_id,
                "traces": written,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    if require_sink_ready and not written:
        raise RuntimeError("dataset build produced zero traces")

    print(
        f"built dataset: traces={len(written)} suitable={suitable} "
        f"call_store={len(scrubbed_calls)} manifest={manifest_id}"
    )
    return manifest


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--artifact-dir", type=Path, required=True)
    p.add_argument("--run-id", required=True)
    p.add_argument("--task", default=None)
    p.add_argument("--model", default=None)
    p.add_argument("--phase", type=float, default=float(os.environ.get("OPENBENCH_PHASE", "1")))
    p.add_argument(
        "--clawql-version",
        default=os.environ.get("GITHUB_SHA") or "unknown",
    )
    p.add_argument(
        "--require-nonempty",
        action="store_true",
        help="Fail if no traces were produced",
    )
    args = p.parse_args(argv)
    build_dataset(
        args.artifact_dir,
        run_id=args.run_id,
        task=args.task,
        model=args.model,
        phase=args.phase,
        clawql_version=args.clawql_version,
        require_sink_ready=args.require_nonempty,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
