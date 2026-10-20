#!/usr/bin/env python3
"""
Run AgentDojo with a ClawQL-inspired tools executor defense.

Publishes AgentDojo's own metrics:
  - targeted ASR = 1 - mean(security_results)
  - utility under attack = mean(utility_results)

Requires an LLM API key (OPENAI_API_KEY or ANTHROPIC_API_KEY). Without credentials
this exits with status wired_awaiting_llm_credentials — never invents scores.

Usage:
  MAI_AGENTDOJO=1 python3 run_benchmark.py
  MAI_AGENTDOJO=1 MAI_AGENTDOJO_SUITE=workspace MAI_AGENTDOJO_MODEL=gpt-4o-mini-2024-07-18 \\
    MAI_AGENTDOJO_ATTACK=important_instructions python3 run_benchmark.py
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT_DEFAULT = (
    ROOT
    / "docs/benchmarks/security-suite/multi-attack-injection/results-agentdojo.json"
)
LOGDIR_DEFAULT = Path(
    os.environ.get("MAI_AGENTDOJO_LOGDIR", "/tmp/mai-agentdojo-runs")
)


def has_llm_credentials() -> tuple[bool, str | None]:
    if os.environ.get("OPENAI_API_KEY"):
        return True, "openai"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return True, "anthropic"
    if os.environ.get("TOGETHER_API_KEY"):
        return True, "together"
    if os.environ.get("OPENAI_COMPATIBLE_API_KEY") and os.environ.get(
        "OPENAI_COMPATIBLE_BASE_URL"
    ):
        return True, "openai-compatible"
    return False, None


def pick_model(provider: str | None) -> str:
    override = os.environ.get("MAI_AGENTDOJO_MODEL")
    if override:
        return override
    if provider == "anthropic":
        return "claude-3-5-sonnet-20241022"
    if provider == "together":
        return "mistralai/Mixtral-8x7B-Instruct-v0.1"
    # Default OpenAI mini — cheaper smoke of full suites
    return "gpt-4o-mini-2024-07-18"


def summarize_suite(results: dict) -> dict:
    util_vals = list(results["utility_results"].values())
    sec_vals = list(results["security_results"].values())
    utility = sum(util_vals) / len(util_vals) if util_vals else None
    security = sum(sec_vals) / len(sec_vals) if sec_vals else None
    asr = (1.0 - security) if security is not None else None
    return {
        "n_pairs": len(util_vals),
        "utility_under_attack": utility,
        "average_security": security,
        "targeted_asr": asr,
    }


def build_clawql_pipeline(model: str, provider: str):
    from agentdojo.agent_pipeline.agent_pipeline import (
        AgentPipeline,
        get_llm,
        load_system_message,
    )
    from agentdojo.agent_pipeline.basic_elements import InitQuery, SystemMessage
    from agentdojo.agent_pipeline.tool_execution import ToolsExecutionLoop
    from agentdojo.models import MODEL_PROVIDERS, ModelsEnum

    from clawql_tools_executor import ClawQLToolsExecutor

    if provider == "openai-compatible":
        # Handled via env in get_llm for openai-compatible ModelsEnum if present;
        # fall back to OpenAI client against compatible base.
        from agentdojo.agent_pipeline.llms.openai_llm import OpenAILLM
        import openai

        client = openai.OpenAI(
            api_key=os.environ["OPENAI_COMPATIBLE_API_KEY"],
            base_url=os.environ["OPENAI_COMPATIBLE_BASE_URL"],
        )
        model_id = os.environ.get("MAI_AGENTDOJO_MODEL_ID") or model
        llm = OpenAILLM(client, model_id)
        llm_name = model_id
    else:
        enum = ModelsEnum(model)
        llm = get_llm(MODEL_PROVIDERS[enum], model, None, "tool")
        llm_name = model

    executor = ClawQLToolsExecutor()
    tools_loop = ToolsExecutionLoop([executor, llm])
    pipeline = AgentPipeline(
        [
            SystemMessage(load_system_message(None)),
            InitQuery(),
            llm,
            tools_loop,
        ]
    )
    pipeline.name = f"{llm_name}-clawql_data_flow"
    return pipeline, executor


def write_report(out: Path, report: dict) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    out = Path(os.environ.get("MAI_AGENTDOJO_OUT", str(OUT_DEFAULT)))
    suite_name = os.environ.get("MAI_AGENTDOJO_SUITE", "workspace")
    attack_name = os.environ.get("MAI_AGENTDOJO_ATTACK", "important_instructions")
    version = os.environ.get("MAI_AGENTDOJO_VERSION", "v1.2.2")
    force = os.environ.get("MAI_AGENTDOJO_FORCE", "0") == "1"
    # Optional subset for faster first run
    user_tasks_env = os.environ.get("MAI_AGENTDOJO_USER_TASKS", "").strip()
    inj_tasks_env = os.environ.get("MAI_AGENTDOJO_INJECTION_TASKS", "").strip()
    user_tasks = tuple(t for t in user_tasks_env.split(",") if t) or ()
    injection_tasks = tuple(t for t in inj_tasks_env.split(",") if t) or ()

    base = {
        "kind": "multi_attack_injection_agentdojo_v1",
        "upstream": {
            "name": "AgentDojo",
            "url": "https://github.com/ethz-spylab/agentdojo",
            "benchmark_version": version,
        },
        "defense": {
            "id": "clawql_data_flow",
            "name": "ClawQL untrusted-read taint → external/destructive sink block",
            "implements": "scripts/benchmarks/multi-attack-injection/agentdojo/clawql_tools_executor.py",
            "note": "AgentDojo FunctionsRuntime arm — not the ClawQL MCP product path. Same mechanism shape as the scripted board.",
        },
        "config": {
            "suite": suite_name,
            "attack": attack_name,
            "user_tasks": list(user_tasks) if user_tasks else "all",
            "injection_tasks": list(injection_tasks) if injection_tasks else "all",
        },
    }

    ok, provider = has_llm_credentials()
    if not ok:
        report = {
            **base,
            "status": "wired_awaiting_llm_credentials",
            "measuredAt": None,
            "priority": "agentdojo",
            "must_report": {
                "agentdojo_asr": None,
                "agentdojo_utility_under_attack": None,
                "note": "Set OPENAI_API_KEY (or ANTHROPIC_API_KEY / TOGETHER_API_KEY) then re-run MAI_AGENTDOJO=1.",
            },
            "also_report": {
                "clawql_attacks_effectuated": None,
                "clawql_poison_residue": None,
                "clawql_benign": None,
                "note": "Filled after AgentDojo pairs run; ClawQL blocked_calls counted from defense executor.",
            },
            "how_to_run": (
                "OPENAI_API_KEY=… MAI_AGENTDOJO=1 npm run benchmark:multi-attack-injection:agentdojo"
            ),
            "note": "Defense + runner wired. No LLM credentials in this environment — refusing to invent ASR/utility.",
        }
        write_report(out, report)
        print(json.dumps({"out": str(out), "status": report["status"]}, indent=2))
        return 3

    if os.environ.get("MAI_AGENTDOJO") != "1":
        report = {
            **base,
            "status": "ready_set_MAI_AGENTDOJO",
            "measuredAt": None,
            "must_report": {
                "agentdojo_asr": None,
                "agentdojo_utility_under_attack": None,
            },
            "note": "Credentials present. Set MAI_AGENTDOJO=1 to execute the live AgentDojo run.",
        }
        write_report(out, report)
        print(json.dumps({"out": str(out), "status": report["status"]}, indent=2))
        return 0

    model = pick_model(provider)
    logdir = LOGDIR_DEFAULT
    logdir.mkdir(parents=True, exist_ok=True)

    try:
        from agentdojo.attacks.attack_registry import load_attack
        from agentdojo.benchmark import benchmark_suite_with_injections
        from agentdojo.task_suite.load_suites import get_suite

        suite = get_suite(version, suite_name)
        pipeline, executor = build_clawql_pipeline(model, provider or "openai")
        attacker = load_attack(attack_name, suite, pipeline)

        results = benchmark_suite_with_injections(
            pipeline,
            suite,
            attacker,
            user_tasks=user_tasks or None,
            injection_tasks=injection_tasks or None,
            logdir=logdir,
            force_rerun=force,
            benchmark_version=version,
        )
        summary = summarize_suite(results)
        blocked = len(executor.blocked_calls)

        report = {
            **base,
            "status": "measured",
            "measuredAt": datetime.now(timezone.utc).isoformat(),
            "model": {"id": model, "provider": provider},
            "logdir": str(logdir),
            "must_report": {
                "agentdojo_asr": summary["targeted_asr"],
                "agentdojo_utility_under_attack": summary["utility_under_attack"],
                "agentdojo_average_security": summary["average_security"],
                "n_pairs": summary["n_pairs"],
                "definition": {
                    "asr": "1 - mean(security_results) — AgentDojo targeted attack success rate",
                    "utility_under_attack": "mean(utility_results) — AgentDojo task success under attack",
                },
            },
            "also_report": {
                "clawql_sink_blocks": blocked,
                "clawql_blocked_sample": executor.blocked_calls[:20],
                "clawql_attacks_effectuated": None,
                "clawql_poison_residue": None,
                "clawql_benign": None,
                "note": "clawql_sink_blocks = times the ClawQL executor blocked an external/destructive tool after untrusted read. Map to attacks_effectuated when publishing the board cell.",
            },
            "suites": {suite_name: summary},
        }
        write_report(out, report)
        print(
            json.dumps(
                {
                    "out": str(out),
                    "status": "measured",
                    "agentdojo_asr": summary["targeted_asr"],
                    "agentdojo_utility_under_attack": summary["utility_under_attack"],
                    "clawql_sink_blocks": blocked,
                },
                indent=2,
            )
        )
        return 0
    except Exception as e:
        report = {
            **base,
            "status": "error",
            "measuredAt": datetime.now(timezone.utc).isoformat(),
            "model": {"id": model, "provider": provider},
            "must_report": {
                "agentdojo_asr": None,
                "agentdojo_utility_under_attack": None,
            },
            "error": str(e),
            "traceback": traceback.format_exc()[-4000:],
            "note": "Live run failed — no invented scores.",
        }
        write_report(out, report)
        print(json.dumps({"out": str(out), "status": "error", "error": str(e)}, indent=2))
        return 1


if __name__ == "__main__":
    # Allow importing sibling module when invoked as a script
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
