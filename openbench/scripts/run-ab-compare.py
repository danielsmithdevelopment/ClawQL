#!/usr/bin/env python3
"""One-off A/B: clawql-on vs clawql-off through clawql-inference.

Architecture (same model for both arms)::

  coding agent (OpenCode)
        │  OPENAI-compatible
        ▼
  clawql inference serve   ←── OPENROUTER_API_KEY and/or BYOK keys
        │
        ├── openrouter/* (OpenRouter-first — existing aggregator key)
        └── direct BYOK: deepseek, groq, openai, …

clawql-on  = OpenCode via ``clawql opencode --non-interactive`` + ClawQL MCP
clawql-off = raw OpenCode pointed at the same inference URL (no ClawQL MCP)

Requires:

  - ``opencode`` on PATH
  - ``clawql`` / ``bin/clawql.mjs`` for the on-arm
  - A running ``clawql inference serve`` (or let Actions start it)
  - ``OPENROUTER_API_KEY`` (day-one) and/or vendor BYOK key(s)

Example::

  # terminal 1 — OpenRouter-first (existing aggregator key)
  OPENROUTER_API_KEY=sk-or-… \\
    clawql inference serve --port 8080

  # terminal 2
  python3 openbench/scripts/run-ab-compare.py \\
    --task memory-dependent-continuation \\
    --model openrouter/google/gemini-2.5-flash-lite \\
    --inference-url http://127.0.0.1:8080/v1 \\
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
KNOWN_TASKS = (
    "memory-dependent-continuation",
    "token-budget-constrained",
    "multi-provider-api-workflow",
)
DEFAULT_HARNESS = "opencode"
DEFAULT_MODEL = os.environ.get(
    "OPENBENCH_MODEL", "openrouter/google/gemini-2.5-flash-lite"
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


def seed_and_remove_memory(workdir: Path) -> str | None:
    seed = workdir / ".openbench" / "memory-seed.md"
    if not seed.is_file():
        return None
    vault = Path(tempfile.mkdtemp(prefix="clawql_ab_vault_"))
    memory_dir = vault / "Memory"
    memory_dir.mkdir(parents=True, exist_ok=True)
    (memory_dir / "Prior Auth Decisions.md").write_text(
        seed.read_text(encoding="utf-8"), encoding="utf-8"
    )
    try:
        seed.unlink()
        openbench_dir = seed.parent
        if openbench_dir.is_dir() and not any(openbench_dir.iterdir()):
            openbench_dir.rmdir()
    except OSError:
        pass
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


def run_checker(task_dir: Path, workdir: Path) -> dict:
    checker = task_dir / "checker.sh"
    env = dict(os.environ)
    env["TASK_DIR"] = str(task_dir)
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
    return {
        "exit_code": code,
        "success": code == 0,
        "score": score,
        "output_tail": out[-1500:],
    }


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


def opencode_config_for_inference(inference_url: str, gateway_model: str) -> str:
    """Point OpenCode at clawql-inference; gateway_model is the ClawQL model id."""
    # OpenCode -m clawql/<gateway_model> → provider clawql, model = gateway_model
    # which is forwarded to the OpenAI-compat endpoint as `model`.
    return json.dumps(
        {
            # Headless CI: never pause on ask (doom_loop / external_directory defaults).
            "permission": {"*": "allow"},
            "provider": {
                "clawql": {
                    "npm": "@ai-sdk/openai-compatible",
                    "name": "ClawQL Inference",
                    "options": {
                        "baseURL": inference_url,
                        "apiKey": os.environ.get("CLAWQL_INFERENCE_CLIENT_KEY", "clawql-openbench"),
                    },
                    "models": {gateway_model: {}},
                }
            },
        }
    )


def _dec_timeout_output(exc) -> str:
    def _dec(x):
        if x is None:
            return ""
        return x.decode("utf-8", "replace") if isinstance(x, bytes) else x

    return _dec(exc.stdout) + _dec(exc.stderr)


def run_arm_off(
    instruction: str, workdir: Path, model: str, timeout_s: int, inference_url: str
) -> dict:
    """Raw OpenCode → clawql-inference (OpenRouter and/or BYOK; no ClawQL MCP)."""
    exe = resolve_opencode()
    gateway_model = normalize_model_id(model)
    opencode_model = f"clawql/{gateway_model}"
    cmd = [
        exe,
        "run",
        "--dir",
        str(workdir),
        "-m",
        opencode_model,
        "--auto",
        "--format",
        "json",
        "--title",
        "clawql-openbench-off",
        instruction,
    ]
    env = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith("CLAWQL_") or k in ("CLAWQL_INFERENCE_CLIENT_KEY",)
    }
    env["OPENCODE_CONFIG_CONTENT"] = opencode_config_for_inference(inference_url, gateway_model)
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


def run_arm_on(
    instruction: str,
    workdir: Path,
    model: str,
    timeout_s: int,
    inference_url: str,
    vault: str | None,
) -> dict:
    """ClawQL-wired OpenCode via ``clawql opencode --non-interactive`` + inference URL."""
    clawql = resolve_clawql()
    gateway_model = normalize_model_id(model)
    inst_file = workdir / ".openbench_instruction.md"
    inst_file.write_text(instruction, encoding="utf-8")

    prefix = ["node", clawql] if clawql.endswith(".mjs") else [clawql]
    cmd = [
        *prefix,
        "opencode",
        "--non-interactive",
        "--model",
        f"clawql/{gateway_model}",
        "--task-file",
        str(inst_file),
        "--workdir",
        str(workdir),
        "--timeout",
        str(int(timeout_s)),
        "--inference-url",
        inference_url,
    ]

    env = dict(os.environ)
    env["CLAWQL_OPENBENCH"] = "1"
    env["CLAWQL_HARNESS_ALLOW_UNSANDBOXED"] = "1"
    env["CLAWQL_OPENBENCH_HARNESS"] = "opencode"
    env["OPENAI_BASE_URL"] = inference_url
    env["CLAWQL_INFERENCE_URL"] = inference_url
    # Do NOT set OPENCODE_CONFIG_CONTENT here — clawql opencode --non-interactive
    # builds provider + MCP together. A provider-only JSON previously wiped MCP,
    # so clawql-on could not memory_recall the seeded vault.
    if vault:
        env["CLAWQL_HOME"] = vault
        env["CLAWQL_OBSIDIAN_VAULT_PATH"] = vault
        env["CLAWQL_ENABLE_MEMORY"] = "1"
        env["CLAWQL_BUNDLED_OFFLINE"] = "1"

    t0 = time.monotonic()
    timed_out = False
    combined = ""
    code = 1
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
        "arm": "clawql-on",
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
        "output_tail": combined[-2000:],
        "_combined_log": combined,
        "error": None
        if completed
        else (bench.get("error") or (f"timeout after {timeout_s}s" if timed_out else f"exit {code}")),
    }


def mean_or_none(values):
    nums = [v for v in values if isinstance(v, (int, float))]
    if not nums:
        return None
    return round(statistics.mean(nums), 3)


def summarize(arm_rows: list[dict]) -> dict:
    return {
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
        "| Arm | Success | Mean score | Mean tokens | Mean turns | Mean wall (s) |",
        "|-----|---------|------------|-------------|------------|---------------|",
    ]
    for arm in arms:
        s = report["summary"].get(arm)
        if not s:
            continue
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
        "- **clawql-on** adds ClawQL MCP (search/execute/memory/…) via "
        "`clawql opencode --non-interactive` (provider + MCP + `permission: allow` "
        "in `OPENCODE_CONFIG_CONTENT`).",
        "- **clawql-off** is raw OpenCode with isolated HOME (no ClawQL MCP).",
        "- clawql-inference must **passthrough** OpenAI `tools` / `tool_calls` "
        "(otherwise OpenCode gets text-only replies and stops after one turn).",
        "- Checker — not the harness self-report — decides success.",
        "- Full agent JSONL lives under `agent-logs/` next to this summary.",
    ]
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
    try:
        materialize_workspace(task_dir, tmp)
        vault = seed_and_remove_memory(tmp)
        if arm == "clawql-off":
            agent = run_arm_off(instruction, tmp, model, timeout_s, inference_url)
            if vault:
                shutil.rmtree(vault, ignore_errors=True)
                vault = None
        else:
            agent = run_arm_on(instruction, tmp, model, timeout_s, inference_url, vault)
        # Prefer full captured stream from arm helpers when present.
        combined = agent.pop("_combined_log", None) or agent.get("output_tail") or ""
        log_path = write_agent_log(log_dir, arm, trial, combined)
        if log_path:
            agent["log_path"] = log_path
        checker = run_checker(task_dir, tmp)
        return {
            "trial": trial,
            "arm": arm,
            "agent": agent,
            "checker": checker,
            "workdir": str(tmp),
        }
    finally:
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
    parser.add_argument("--timeout", type=int, default=300, dest="timeout_s")
    parser.add_argument("--out", type=Path, required=True, help="JSON results path")
    parser.add_argument("--summary-md", type=Path, help="Markdown summary path")
    parser.add_argument("--arms", default="clawql-on,clawql-off")
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

    arms = [a.strip() for a in args.arms.split(",") if a.strip()]
    for arm in arms:
        if arm not in ("clawql-on", "clawql-off"):
            print(f"ERROR: unknown arm {arm!r}", file=sys.stderr)
            return 2

    if not shutil.which(resolve_opencode()) and not Path(resolve_opencode()).exists():
        print("ERROR: opencode CLI not found. Install OpenCode, then retry.", file=sys.stderr)
        return 2

    if "clawql-on" in arms:
        clawql = resolve_clawql()
        probe = ["node", clawql, "--version"] if clawql.endswith(".mjs") else [clawql, "--version"]
        try:
            subprocess.run(probe, capture_output=True, text=True, timeout=15, check=False)
        except Exception as exc:  # noqa: BLE001
            print(f"ERROR: clawql probe failed: {exc}", file=sys.stderr)
            return 2

    gateway_model = normalize_model_id(args.model)
    started = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []
    for trial in range(1, args.trials + 1):
        for arm in arms:
            print(
                f"==> trial {trial}/{args.trials} arm={arm} "
                f"harness={DEFAULT_HARNESS} model={gateway_model}",
                flush=True,
            )
            row = run_trial(
                task_dir,
                arm,
                gateway_model,
                args.timeout_s,
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
        "timeout_s": args.timeout_s,
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
