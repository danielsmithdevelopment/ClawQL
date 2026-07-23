#!/usr/bin/env python3
"""One-off A/B harness compare: clawql-on vs clawql-off on the same OpenBench task.

Runs N trials of each arm against ``openbench/tasks/<task>/``, grades with
``checker.sh``, and writes:

  - JSON results (``--out``)
  - Markdown summary (stdout + optional ``--summary-md`` for GitHub Step Summary)

Does not require a full OpenBench checkout. Requires:

  - ``claude`` on PATH (Claude Code CLI)
  - ``clawql`` on PATH for the on-arm (repo ``bin/clawql.mjs`` after build)
  - ``ANTHROPIC_API_KEY`` in the environment

Example::

  python3 openbench/scripts/run-ab-compare.py \\
    --task memory-dependent-continuation \\
    --model claude-sonnet-4-5 \\
    --trials 1 \\
    --timeout 300 \\
    --out /tmp/ab-results.json \\
    --summary-md /tmp/ab-summary.md
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
    """Move ``.openbench/memory-seed.md`` into a temp vault; remove from workdir.

    Returns vault path or None. Both arms remove the seed so clawql-off cannot
    cheat by reading the file; only clawql-on points CLAWQL_OBSIDIAN_VAULT_PATH
    at the vault.
    """
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


def parse_claude_json_usage(stdout: str) -> dict:
    """Best-effort Claude Code ``--output-format json`` usage."""
    text = (stdout or "").strip()
    obj = None
    try:
        cand = json.loads(text)
        if isinstance(cand, dict):
            obj = cand
    except json.JSONDecodeError:
        for line in reversed(text.splitlines()):
            line = line.strip()
            if not line:
                continue
            try:
                cand = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(cand, dict):
                obj = cand
                break
    if not isinstance(obj, dict):
        return {"tokens": None, "turns": None, "completed_cli": None}

    turns = obj.get("num_turns")
    turns = int(turns) if isinstance(turns, (int, float)) else None
    is_error = obj.get("is_error")
    completed_cli = (not is_error) if isinstance(is_error, bool) else None

    input_tokens = 0
    output_tokens = 0
    found = False
    model_usage = obj.get("modelUsage")
    if isinstance(model_usage, dict):
        for m in model_usage.values():
            if not isinstance(m, dict):
                continue
            inp = m.get("inputTokens")
            out = m.get("outputTokens")
            if isinstance(inp, (int, float)) and isinstance(out, (int, float)):
                input_tokens += int(inp)
                output_tokens += int(out)
                found = True
    if not found and isinstance(obj.get("usage"), dict):
        u = obj["usage"]
        inp = u.get("input_tokens")
        out = u.get("output_tokens")
        if isinstance(inp, (int, float)) and isinstance(out, (int, float)):
            input_tokens = int(inp)
            output_tokens = int(out)
            found = True

    return {
        "tokens": (input_tokens + output_tokens) if found else None,
        "turns": turns,
        "completed_cli": completed_cli,
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


def resolve_claude() -> str:
    for name in ("claude", "claude-code"):
        path = shutil.which(name)
        if path:
            return path
    return "claude"


def run_arm_off(instruction: str, workdir: Path, model: str, timeout_s: int) -> dict:
    """Raw Claude Code — no ClawQL MCP, no vault env."""
    exe = resolve_claude()
    cmd = [
        exe,
        "-p",
        "--bare",
        "--output-format",
        "json",
        "--dangerously-skip-permissions",
        "--disallowedTools",
        "Agent",
        "Task",
        "--no-session-persistence",
        "--model",
        model,
        instruction,
    ]
    env = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith("CLAWQL_") and k not in ("CLAUDECODE",)
    }
    # Keep API key; drop vault/memory hints.
    env.pop("CLAWQL_OBSIDIAN_VAULT_PATH", None)
    env["ANTHROPIC_API_KEY"] = os.environ.get("ANTHROPIC_API_KEY", "")
    env["DISABLE_AUTOUPDATER"] = "1"
    if os.environ.get("IS_SANDBOX"):
        env["IS_SANDBOX"] = os.environ["IS_SANDBOX"]
    # Isolated HOME so user ~/.claude is never touched.
    iso = tempfile.mkdtemp(prefix="claude_off_home_")
    env["HOME"] = iso
    env["CLAUDE_CONFIG_DIR"] = str(Path(iso) / ".claude")

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

        def _dec(x):
            if x is None:
                return ""
            return x.decode("utf-8", "replace") if isinstance(x, bytes) else x

        stdout = _dec(exc.stdout)
        combined = stdout + _dec(exc.stderr)
        code = 124
    finally:
        shutil.rmtree(iso, ignore_errors=True)

    wall_s = round(time.monotonic() - t0, 3)
    usage = parse_claude_json_usage(stdout)
    completed = (not timed_out) and code == 0 and usage.get("completed_cli") is not False
    return {
        "arm": "clawql-off",
        "cmd": cmd,
        "completed": completed,
        "exit_code": code,
        "timed_out": timed_out,
        "wall_s": wall_s,
        "tokens": usage.get("tokens"),
        "turns": usage.get("turns"),
        "output_tail": combined[-2000:],
        "error": None if completed else (f"timeout after {timeout_s}s" if timed_out else f"exit {code}"),
    }


def run_arm_on(instruction: str, workdir: Path, model: str, timeout_s: int, vault: str | None) -> dict:
    """ClawQL-wired Claude via ``clawql claude --non-interactive``."""
    clawql = resolve_clawql()
    inst_file = workdir / ".openbench_instruction.md"
    inst_file.write_text(instruction, encoding="utf-8")

    if clawql.endswith(".mjs"):
        cmd = [
            "node",
            clawql,
            "claude",
            "--non-interactive",
            "--model",
            model,
            "--task-file",
            str(inst_file),
            "--workdir",
            str(workdir),
            "--timeout",
            str(int(timeout_s)),
        ]
    else:
        cmd = [
            clawql,
            "claude",
            "--non-interactive",
            "--model",
            model,
            "--task-file",
            str(inst_file),
            "--workdir",
            str(workdir),
            "--timeout",
            str(int(timeout_s)),
        ]

    env = dict(os.environ)
    env["CLAWQL_OPENBENCH"] = "1"
    env["CLAWQL_HARNESS_ALLOW_UNSANDBOXED"] = "1"
    env["DISABLE_AUTOUPDATER"] = "1"
    if vault:
        env["CLAWQL_OBSIDIAN_VAULT_PATH"] = vault
        env["CLAWQL_ENABLE_MEMORY"] = "1"

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

        def _dec(x):
            if x is None:
                return ""
            return x.decode("utf-8", "replace") if isinstance(x, bytes) else x

        combined = _dec(exc.stdout) + _dec(exc.stderr)
        code = 124

    wall_s = round(time.monotonic() - t0, 3)
    bench = parse_bench_json(combined)
    tokens = bench.get("tokens") if isinstance(bench.get("tokens"), int) else None
    turns = bench.get("turns") if isinstance(bench.get("turns"), int) else None
    if tokens is None or turns is None:
        usage = parse_claude_json_usage(combined)
        tokens = tokens if tokens is not None else usage.get("tokens")
        turns = turns if turns is not None else usage.get("turns")

    completed = bool(bench.get("completed")) if "completed" in bench else (code == 0 and not timed_out)
    if timed_out or code != 0:
        completed = False

    return {
        "arm": "clawql-on",
        "cmd": cmd,
        "completed": completed,
        "exit_code": code,
        "timed_out": timed_out,
        "wall_s": wall_s,
        "tokens": tokens,
        "turns": turns,
        "output_tail": combined[-2000:],
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
    on_s = report["summary"]["clawql-on"]
    off_s = report["summary"]["clawql-off"]
    lines = [
        f"# OpenBench A/B — `{task}`",
        "",
        f"- **Model:** `{model}`",
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
    for arm, s in (("clawql-on", on_s), ("clawql-off", off_s)):
        lines.append(
            f"| `{arm}` | {s['successes']}/{s['n']} ({s['success_rate']*100:.0f}%) | "
            f"{s['mean_score'] if s['mean_score'] is not None else '—'} | "
            f"{s['mean_tokens'] if s['mean_tokens'] is not None else '—'} | "
            f"{s['mean_turns'] if s['mean_turns'] is not None else '—'} | "
            f"{s['mean_wall_s'] if s['mean_wall_s'] is not None else '—'} |"
        )
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "- **clawql-on** runs `clawql claude --non-interactive` with MCP pre-wired "
            "(and vault memory seeded for memory tasks).",
            "- **clawql-off** runs raw `claude -p --bare` with the same model/instruction; "
            "memory seed is removed from the workspace for both arms so file cheating is impossible.",
            "- Checker — not the harness self-report — decides success.",
            "",
        ]
    )
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


def run_trial(task_dir: Path, arm: str, model: str, timeout_s: int, trial: int) -> dict:
    instruction = (task_dir / "instruction.md").read_text(encoding="utf-8")
    tmp = Path(tempfile.mkdtemp(prefix=f"ab-{arm}-{trial}-"))
    vault = None
    try:
        materialize_workspace(task_dir, tmp)
        vault = seed_and_remove_memory(tmp)
        if arm == "clawql-off":
            # Off arm must not see the vault either.
            agent = run_arm_off(instruction, tmp, model, timeout_s)
            if vault:
                shutil.rmtree(vault, ignore_errors=True)
                vault = None
        else:
            agent = run_arm_on(instruction, tmp, model, timeout_s, vault)
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
        # Keep workdirs only when CLAWQL_AB_KEEP_WORKDIR=1 for debugging.
        if os.environ.get("CLAWQL_AB_KEEP_WORKDIR") != "1":
            shutil.rmtree(tmp, ignore_errors=True)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--task",
        required=True,
        choices=KNOWN_TASKS,
    )
    parser.add_argument("--model", default=os.environ.get("OPENBENCH_MODEL", "claude-sonnet-4-5"))
    parser.add_argument("--trials", type=int, default=1)
    parser.add_argument("--timeout", type=int, default=300, dest="timeout_s")
    parser.add_argument("--out", type=Path, required=True, help="JSON results path")
    parser.add_argument("--summary-md", type=Path, help="Markdown summary path (GitHub Step Summary)")
    parser.add_argument(
        "--arms",
        default="clawql-on,clawql-off",
        help="Comma-separated arms to run (default: both)",
    )
    args = parser.parse_args(argv)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY is required", file=sys.stderr)
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

    # Preflight binaries
    if "clawql-off" in arms or "clawql-on" in arms:
        claude = resolve_claude()
        if not shutil.which(claude) and not Path(claude).exists():
            print(f"ERROR: Claude Code CLI not found ({claude})", file=sys.stderr)
            return 2
    if "clawql-on" in arms:
        clawql = resolve_clawql()
        probe = ["node", clawql, "--version"] if clawql.endswith(".mjs") else [clawql, "--version"]
        try:
            subprocess.run(probe, capture_output=True, text=True, timeout=15, check=False)
        except Exception as exc:  # noqa: BLE001
            print(f"ERROR: clawql probe failed: {exc}", file=sys.stderr)
            return 2

    started = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []
    for trial in range(1, args.trials + 1):
        for arm in arms:
            print(f"==> trial {trial}/{args.trials} arm={arm}", flush=True)
            row = run_trial(task_dir, arm, args.model, args.timeout_s, trial)
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
        "task": args.task,
        "model": args.model,
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
