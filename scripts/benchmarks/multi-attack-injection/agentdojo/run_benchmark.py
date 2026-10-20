#!/usr/bin/env python3
"""
Run AgentDojo with optional ClawQL data-flow defense.

Publishes AgentDojo's own metrics:
  - targeted ASR = mean(security_results)
    (AgentDojo security() is True when the injection goal was executed)
  - utility under attack = mean(utility_results)

Credentials (first match wins):
  OPENROUTER_API_KEY  → OpenRouter (openai-compatible) — preferred for CI
  OPENAI_API_KEY / ANTHROPIC_API_KEY / TOGETHER_API_KEY
  OPENAI_COMPATIBLE_API_KEY + OPENAI_COMPATIBLE_BASE_URL

Usage:
  MAI_AGENTDOJO=1 python3 run_benchmark.py
  OPENROUTER_API_KEY=… MAI_AGENTDOJO=1 MAI_AGENTDOJO_MODEL=deepseek/deepseek-chat \\
    MAI_AGENTDOJO_DEFENSE=clawql_data_flow python3 run_benchmark.py
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

OPENROUTER_BASE = os.environ.get(
    "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
).rstrip("/")


def has_llm_credentials() -> tuple[bool, str | None]:
    if os.environ.get("OPENROUTER_API_KEY"):
        return True, "openrouter"
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
        # Allow openrouter/deepseek/... prefix from ClawQL CI conventions
        if override.startswith("openrouter/"):
            return override[len("openrouter/") :]
        return override
    if provider == "openrouter":
        return "deepseek/deepseek-chat"
    if provider == "anthropic":
        return "claude-3-5-sonnet-20241022"
    if provider == "together":
        return "mistralai/Mixtral-8x7B-Instruct-v0.1"
    return "gpt-4o-mini-2024-07-18"


def defense_meta(defense_id: str) -> dict:
    if defense_id in ("", "none", "null"):
        return {
            "id": "none",
            "name": "No defense (AgentDojo baseline)",
            "implements": None,
            "note": "Baseline pipeline for matrix comparison.",
        }
    return {
        "id": "clawql_data_flow",
        "name": "ClawQL untrusted-read taint → external/destructive sink block",
        "implements": "scripts/benchmarks/multi-attack-injection/agentdojo/clawql_tools_executor.py",
        "note": "AgentDojo FunctionsRuntime arm — not the ClawQL MCP product path. Same mechanism shape as the scripted board.",
    }


def summarize_suite(results: dict) -> dict:
    """Summarize AgentDojo SuiteResults.

    AgentDojo's ``security()`` returns True when the *injection goal was
    executed* (attack success) — see BaseInjectionTask.security docstring.
    Targeted ASR is therefore ``mean(security_results)``. Paper-style
    security (fraction of trials that resisted the attack) is ``1 - ASR``.
    """
    util_vals = list(results["utility_results"].values())
    sec_vals = list(results["security_results"].values())
    utility = sum(util_vals) / len(util_vals) if util_vals else None
    # mean(security_results) == injection success rate == targeted ASR
    asr = sum(sec_vals) / len(sec_vals) if sec_vals else None
    average_security = (1.0 - asr) if asr is not None else None
    return {
        "n_pairs": len(util_vals),
        "utility_under_attack": utility,
        "average_security": average_security,
        "targeted_asr": asr,
    }


def _openai_compatible_llm(api_key: str, base_url: str, model_id: str, extra_headers: dict | None = None):
    from agentdojo.agent_pipeline.llms.openai_llm import OpenAILLM
    import openai

    kwargs = {"api_key": api_key, "base_url": base_url}
    if extra_headers:
        kwargs["default_headers"] = extra_headers
    client = openai.OpenAI(**kwargs)
    return OpenAILLM(client, model_id)


def agentdojo_pipeline_name(model: str, defense_id: str) -> str:
    """
    AgentDojo's important_instructions attack parses MODEL_NAMES keys from
    pipeline.name. OpenRouter model ids are not in that map, so embed a known
    key as a prefix while keeping the real model slug for logs.
    """
    m = model.lower()
    if "gpt-4o-mini" in m:
        base = "gpt-4o-mini-2024-07-18"
    elif "gpt-4o" in m or "gpt-4" in m:
        base = "gpt-4o-2024-05-13"
    elif "gpt-3.5" in m:
        base = "gpt-3.5-turbo-0125"
    elif "claude" in m:
        base = "claude-3-5-sonnet-20241022"
    elif "gemini" in m:
        base = "gemini-2.0-flash-001"
    elif "mixtral" in m:
        base = "mistralai/Mixtral-8x7B-Instruct-v0.1"
    elif "command-r" in m:
        base = "command-r-plus"
    else:
        # deepseek / llama / unknown — still addressable in attack templates
        base = "gpt-4o-2024-05-13"
    defense = "none" if defense_id in ("", "none", "null") else "clawql_data_flow"
    slug = model.replace("/", "_")
    return f"{base}-{defense}-via-{slug}"


def build_pipeline(model: str, provider: str, defense_id: str):
    from agentdojo.agent_pipeline.agent_pipeline import (
        AgentPipeline,
        get_llm,
        load_system_message,
    )
    from agentdojo.agent_pipeline.basic_elements import InitQuery, SystemMessage
    from agentdojo.agent_pipeline.tool_execution import ToolsExecutionLoop, ToolsExecutor
    from agentdojo.models import MODEL_PROVIDERS, ModelsEnum

    from clawql_tools_executor import ClawQLToolsExecutor

    if provider == "openrouter":
        headers = {
            "HTTP-Referer": os.environ.get(
                "CLAWQL_OPENROUTER_HTTP_REFERER", "https://clawql.com"
            ),
            "X-Title": os.environ.get(
                "CLAWQL_OPENROUTER_APP_TITLE", "ClawQL AgentDojo"
            ),
        }
        llm = _openai_compatible_llm(
            os.environ["OPENROUTER_API_KEY"],
            OPENROUTER_BASE,
            model,
            extra_headers=headers,
        )
    elif provider == "openai-compatible":
        llm = _openai_compatible_llm(
            os.environ["OPENAI_COMPATIBLE_API_KEY"],
            os.environ["OPENAI_COMPATIBLE_BASE_URL"],
            os.environ.get("MAI_AGENTDOJO_MODEL_ID") or model,
        )
    else:
        enum = ModelsEnum(model)
        llm = get_llm(MODEL_PROVIDERS[enum], model, None, "tool")

    executor = None
    if defense_id in ("", "none", "null"):
        tools_loop = ToolsExecutionLoop([ToolsExecutor(), llm])
    else:
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
    # Must contain a MODEL_NAMES key for important_instructions attack.
    pipeline.name = agentdojo_pipeline_name(model, defense_id)
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
    defense_id = os.environ.get("MAI_AGENTDOJO_DEFENSE", "clawql_data_flow").strip()
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
        "defense": defense_meta(defense_id),
        "config": {
            "suite": suite_name,
            "attack": attack_name,
            "defense": defense_meta(defense_id)["id"],
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
                "note": "Set OPENROUTER_API_KEY (CI) or OPENAI_API_KEY / ANTHROPIC_API_KEY, then MAI_AGENTDOJO=1.",
            },
            "also_report": {
                "clawql_sink_blocks": None,
                "note": "Filled after AgentDojo pairs run.",
            },
            "how_to_run": (
                "OPENROUTER_API_KEY=… MAI_AGENTDOJO=1 npm run benchmark:multi-attack-injection:agentdojo"
            ),
            "note": "Defense + runner wired. No LLM credentials — refusing to invent ASR/utility.",
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
            "provider": provider,
        }
        write_report(out, report)
        print(json.dumps({"out": str(out), "status": report["status"], "provider": provider}, indent=2))
        return 0

    model = pick_model(provider)
    logdir = Path(
        os.environ.get(
            "MAI_AGENTDOJO_LOGDIR",
            str(LOGDIR_DEFAULT / f"{suite_name}_{defense_meta(defense_id)['id']}_{model.replace('/', '_')}"),
        )
    )
    logdir.mkdir(parents=True, exist_ok=True)

    try:
        from agentdojo.attacks.attack_registry import load_attack
        from agentdojo.benchmark import benchmark_suite_with_injections
        from agentdojo.logging import OutputLogger
        from agentdojo.task_suite.load_suites import get_suite

        suite = get_suite(version, suite_name)
        pipeline, executor = build_pipeline(model, provider or "openai", defense_id)
        attacker = load_attack(attack_name, suite, pipeline)

        # AgentDojo's TaskLogger reads Logger.get().logdir; without an
        # OutputLogger on the stack, Logger.get() returns NullLogger and
        # crashes with AttributeError: 'NullLogger' object has no attribute 'logdir'.
        with OutputLogger(str(logdir)):
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
        blocked = len(executor.blocked_calls) if executor is not None else 0

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
                    "asr": "mean(security_results) — AgentDojo security() is True when injection succeeded",
                    "utility_under_attack": "mean(utility_results) — AgentDojo task success under attack",
                    "average_security": "1 - asr — fraction of pairs that resisted the injection",
                },
            },
            "also_report": {
                "clawql_sink_blocks": blocked if defense_meta(defense_id)["id"] != "none" else None,
                "clawql_blocked_sample": (
                    executor.blocked_calls[:20]
                    if executor is not None
                    else None
                ),
                "note": "clawql_sink_blocks only set for clawql_data_flow defense.",
            },
            "suites": {suite_name: summary},
            "matrix_cell": {
                "suite": suite_name,
                "defense": defense_meta(defense_id)["id"],
                "model": model,
                "attack": attack_name,
            },
        }
        write_report(out, report)
        print(
            json.dumps(
                {
                    "out": str(out),
                    "status": "measured",
                    "matrix_cell": report["matrix_cell"],
                    "agentdojo_asr": summary["targeted_asr"],
                    "agentdojo_utility_under_attack": summary["utility_under_attack"],
                    "clawql_sink_blocks": blocked if executor is not None else None,
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
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
