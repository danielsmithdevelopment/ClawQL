"""OpenBench adapter for ClawQL-wired harnesses.

Track A: run the same OpenBench tasks through ``clawql <harness> --non-interactive``,
which pre-wires ClawQL MCP (search/execute/memory/…) before launching the agent.

Headless invocation::

    CLAWQL_OPENBENCH=1 clawql claude --non-interactive \\
        --model <cli-model> --task-file <instruction> --workdir <dir> --timeout <secs>

The ClawQL CLI emits ``CLAWQL_BENCH_JSON: {...}`` plus optional ``CLAWQL_TOKENS`` /
``CLAWQL_TURNS`` lines. When the child harness supports JSON usage (Claude Code,
Codex, OpenCode), those fields are filled; otherwise tokens may be ``None``.

Copy this file into an OpenBench checkout as ``obench/adapters/clawql.py``, or
point ``PYTHONPATH`` at this directory and pass ``--candidate`` with
``candidates/clawql-claude.toml``.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

NAME = "clawql"

# Which underlying agent CLI ClawQL should launch. Override with CLAWQL_OPENBENCH_HARNESS.
# Default is OpenAI Codex (no Anthropic dependency for the primary A/B path).
_DEFAULT_HARNESS = os.environ.get("CLAWQL_OPENBENCH_HARNESS", "codex").strip() or "codex"

# Canonical OpenBench model pin -> CLI model id for the default (codex) harness.
MODELS = {
    "gpt-5.5-medium": "gpt-5.5",
    "gpt-5.5": "gpt-5.5",
    "gpt-5.6-sol": "gpt-5.6-sol",
    # Optional Claude pins when CLAWQL_OPENBENCH_HARNESS=claude is set explicitly.
    "claude-opus-4-8": "claude-opus-4-8",
}


def _empty_token_usage():
    return {
        "tokens_input_uncached": None,
        "tokens_cache_read": None,
        "tokens_cache_write": None,
        "tokens_output": None,
        "tokens_reasoning": None,
        "usage_raw": None,
        "token_basis": None,
    }


def _doctor_auth(probes):
    """Doctor AUTH probe: clawql on PATH + preferred harness binary present."""
    if not probes.which("clawql"):
        return False, "clawql not on PATH (npm i -g clawql-mcp)"
    harness = _DEFAULT_HARNESS
    if harness == "claude" and not (probes.which("claude") or probes.which("claude-code")):
        return False, "claude / claude-code not on PATH"
    if harness == "codex" and not probes.which("codex"):
        return False, "codex not on PATH"
    if harness == "opencode" and not probes.which("opencode"):
        return False, "opencode not on PATH"
    return True, f"clawql + {harness}"


DOCTOR = {"cli": "clawql", "auth": _doctor_auth}


def _resolve_clawql():
    return shutil.which("clawql") or "clawql"


def version():
    """Return clawql version string, or None on failure."""
    exe = _resolve_clawql()
    try:
        proc = subprocess.run(
            [exe, "--version"],
            capture_output=True,
            text=True,
            timeout=8,
            stdin=subprocess.DEVNULL,
        )
    except Exception:  # noqa: BLE001
        return None
    out = (proc.stdout or proc.stderr or "").strip()
    if not out:
        # Older CLIs may not implement --version; fall back to npm package id.
        try:
            pkg = subprocess.run(
                ["npm", "ls", "-g", "clawql-mcp", "--depth=0"],
                capture_output=True,
                text=True,
                timeout=8,
                stdin=subprocess.DEVNULL,
            )
            out = (pkg.stdout or "").strip() or "clawql"
        except Exception:  # noqa: BLE001
            out = "clawql"
    path = exe if os.path.isabs(exe) else shutil.which("clawql")
    return f"{out} ({path})" if path else out


def _unsupported(model):
    return {
        "completed": False,
        "error": f"unsupported-model: {model!r} (have {list(MODELS)})",
        "output_tail": "",
        "tokens": None,
        "turns": None,
        "cmd": None,
        **_empty_token_usage(),
    }


def _seed_memory_vault(workdir: str) -> str | None:
    """Seed a disposable Obsidian vault for memory-dependent tasks.

    When the task workspace contains ``.openbench/memory-seed.md``, move its
    contents into a temp vault and **remove the seed from the workdir** so the
    agent cannot read the answer as a plain file — it must use memory_recall
    (or equivalent). Returns the vault path (caller should clean up) or None.
    """
    seed = Path(workdir) / ".openbench" / "memory-seed.md"
    if not seed.is_file():
        return None
    vault = tempfile.mkdtemp(prefix="clawql_obench_vault_")
    memory_dir = Path(vault) / "Memory"
    memory_dir.mkdir(parents=True, exist_ok=True)
    dest = memory_dir / "Prior Auth Decisions.md"
    dest.write_text(seed.read_text(encoding="utf-8"), encoding="utf-8")
    # Deny file-based leakage of the prior decision.
    try:
        seed.unlink()
        openbench_dir = seed.parent
        if openbench_dir.is_dir() and not any(openbench_dir.iterdir()):
            openbench_dir.rmdir()
    except OSError:
        pass
    return vault


def _parse_bench_json(combined: str) -> dict:
    """Extract the last CLAWQL_BENCH_JSON payload from stdout/stderr."""
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


def _parse_scalar_markers(combined: str):
    tokens = None
    turns = None
    for line in (combined or "").splitlines():
        if line.startswith("CLAWQL_TOKENS:"):
            try:
                tokens = int(line.split(":", 1)[1].strip())
            except ValueError:
                pass
        if line.startswith("CLAWQL_TURNS:"):
            try:
                turns = int(line.split(":", 1)[1].strip())
            except ValueError:
                pass
    return tokens, turns


def _err_tail(exc, limit=2000):
    def _dec(x):
        if x is None:
            return ""
        return x.decode("utf-8", "replace") if isinstance(x, bytes) else x

    text = _dec(exc.stdout) + _dec(exc.stderr)
    return text if limit is None else text[-limit:]


def run(instruction: str, workdir: str, model: str, timeout_s: int) -> dict:
    if model not in MODELS:
        return _unsupported(model)

    exe = _resolve_clawql()
    harness = _DEFAULT_HARNESS
    cli_model = MODELS[model]

    inst_file = os.path.join(workdir, ".openbench_instruction.md")
    with open(inst_file, "w", encoding="utf-8") as f:
        f.write(instruction)

    vault = _seed_memory_vault(workdir)
    env = os.environ.copy()
    env["CLAWQL_OPENBENCH"] = "1"
    env["CLAWQL_HARNESS_ALLOW_UNSANDBOXED"] = "1"
    if vault:
        env["CLAWQL_OBSIDIAN_VAULT_PATH"] = vault
        env["CLAWQL_ENABLE_MEMORY"] = "1"

    cmd = [
        exe,
        harness,
        "--non-interactive",
        "--model",
        cli_model,
        "--task-file",
        inst_file,
        "--workdir",
        workdir,
        "--timeout",
        str(int(timeout_s)),
    ]
    inference_url = os.environ.get("CLAWQL_INFERENCE_URL") or os.environ.get("OPENBENCH_INFERENCE_URL")
    if inference_url:
        cmd.extend(["--inference-url", inference_url])

    try:
        try:
            proc = subprocess.run(
                cmd,
                cwd=workdir,
                capture_output=True,
                text=True,
                timeout=timeout_s + 30,
                stdin=subprocess.DEVNULL,
                env=env,
            )
        except subprocess.TimeoutExpired as e:
            full_output = _err_tail(e, limit=None)
            return {
                "completed": False,
                "error": f"timeout after {timeout_s}s",
                "output_tail": full_output[-2000:],
                "full_output": full_output,
                "tokens": None,
                "turns": None,
                "cmd": cmd,
                **_empty_token_usage(),
            }
    finally:
        if vault:
            shutil.rmtree(vault, ignore_errors=True)

    combined = (proc.stdout or "") + (proc.stderr or "")
    bench = _parse_bench_json(combined)
    tokens, turns = _parse_scalar_markers(combined)
    if tokens is None and isinstance(bench.get("tokens"), int):
        tokens = bench["tokens"]
    if turns is None and isinstance(bench.get("turns"), int):
        turns = bench["turns"]

    token_usage = _empty_token_usage()
    if isinstance(bench.get("tokens_input_uncached"), int):
        token_usage["tokens_input_uncached"] = bench["tokens_input_uncached"]
    if isinstance(bench.get("tokens_output"), int):
        token_usage["tokens_output"] = bench["tokens_output"]
    if isinstance(bench.get("token_basis"), str):
        token_usage["token_basis"] = bench["token_basis"]
    elif tokens is not None:
        token_usage["token_basis"] = "harness_reported"
    if tokens is not None or turns is not None:
        token_usage["usage_raw"] = {"clawql_bench": bench}

    completed = bool(bench.get("completed")) if "completed" in bench else proc.returncode == 0
    if proc.returncode != 0:
        completed = False

    return {
        "completed": completed,
        "error": None if completed else (bench.get("error") or f"exit {proc.returncode}"),
        "output_tail": combined[-2000:],
        "full_output": combined,
        "tokens": tokens,
        "turns": turns,
        "cmd": cmd,
        **token_usage,
    }
