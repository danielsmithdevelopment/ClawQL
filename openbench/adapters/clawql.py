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
# Default is OpenCode (pairs with clawql-inference OpenRouter-first or direct BYOK).
_DEFAULT_HARNESS = os.environ.get("CLAWQL_OPENBENCH_HARNESS", "opencode").strip() or "opencode"

# Canonical OpenBench model pin -> CLI model id for the default (opencode) harness.
MODELS = {
    "deepseek/deepseek-chat": "clawql/deepseek/deepseek-chat",
    "clawql/cheap-chat": "clawql/deepseek/deepseek-chat",
    "groq/llama-3.3-70b-versatile": "clawql/groq/llama-3.3-70b-versatile",
    "openrouter/google/gemini-2.5-flash-lite": "clawql/openrouter/google/gemini-2.5-flash-lite",
    "openrouter/deepseek/deepseek-chat": "clawql/openrouter/deepseek/deepseek-chat",
    "openrouter/qwen/qwen3.6-plus": "clawql/openrouter/qwen/qwen3.6-plus",
    "gpt-5.5-medium": "gpt-5.5",
    "gpt-5.5": "gpt-5.5",
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
    if harness == "opencode" and not probes.which("opencode"):
        return False, "opencode not on PATH"
    if harness == "codex" and not probes.which("codex"):
        return False, "codex not on PATH"
    if harness == "claude" and not (probes.which("claude") or probes.which("claude-code")):
        return False, "claude / claude-code not on PATH"
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


def _seed_note_filename(content: str) -> str:
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            title = stripped[2:].strip().replace("/", "-")
            if title:
                return f"{title}.md"
    return "OpenBench Seed.md"


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
    content = seed.read_text(encoding="utf-8")
    vault = tempfile.mkdtemp(prefix="clawql_obench_vault_")
    memory_dir = Path(vault) / "Memory"
    memory_dir.mkdir(parents=True, exist_ok=True)
    dest = memory_dir / _seed_note_filename(content)
    dest.write_text(content, encoding="utf-8")
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


def _recalled_without_writes(combined: str) -> bool:
    """Cheap models often stop after memory_recall and paste code in chat."""
    text = combined or ""
    recalled = "clawql_memory_recall" in text or '"tool":"memory_recall"' in text
    wrote = '"tool":"write"' in text or '"tool":"edit"' in text
    return recalled and not wrote


_WRITE_CONTINUATION_HEADER = """Continue the same OpenBench task in this workspace.

You already ran memory_recall successfully. Do **not** call memory_recall again.
Do **not** call todos/task/skill. Call the **write** tool (or edit) now.

Create the required relative-path files on disk. Chat code fences are not graded.
"""


def _build_write_continuation(vault: str | None) -> str:
    parts = [_WRITE_CONTINUATION_HEADER]
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


def _run_harness_once(
    *,
    exe: str,
    harness: str,
    cli_model: str,
    task_file: str,
    workdir: str,
    timeout_s: int,
    env: dict,
    inference_url: str | None,
) -> tuple[subprocess.CompletedProcess | None, list[str], str | None]:
    """Returns (proc, cmd, timeout_error_output)."""
    cmd = [
        exe,
        harness,
        "--non-interactive",
        "--model",
        cli_model,
        "--task-file",
        task_file,
        "--workdir",
        workdir,
        "--timeout",
        str(int(timeout_s)),
    ]
    if inference_url:
        cmd.extend(["--inference-url", inference_url])
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
        return proc, cmd, None
    except subprocess.TimeoutExpired as e:
        return None, cmd, _err_tail(e, limit=None)


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

    inference_url = os.environ.get("CLAWQL_INFERENCE_URL") or os.environ.get("OPENBENCH_INFERENCE_URL")
    combined = ""
    cmd: list[str] = []
    proc: subprocess.CompletedProcess | None = None

    try:
        proc, cmd, timed_out = _run_harness_once(
            exe=exe,
            harness=harness,
            cli_model=cli_model,
            task_file=inst_file,
            workdir=workdir,
            timeout_s=timeout_s,
            env=env,
            inference_url=inference_url,
        )
        if timed_out is not None:
            return {
                "completed": False,
                "error": f"timeout after {timeout_s}s",
                "output_tail": timed_out[-2000:],
                "full_output": timed_out,
                "tokens": None,
                "turns": None,
                "cmd": cmd,
                **_empty_token_usage(),
            }

        assert proc is not None
        combined = (proc.stdout or "") + (proc.stderr or "")

        # One continuation when vault recall succeeded but the model never wrote files.
        if vault and _recalled_without_writes(combined):
            cont_file = os.path.join(workdir, ".openbench_continuation.md")
            with open(cont_file, "w", encoding="utf-8") as f:
                f.write(_build_write_continuation(vault))
            cont_timeout = max(60, min(timeout_s, 180))
            proc2, cmd2, timed_out2 = _run_harness_once(
                exe=exe,
                harness=harness,
                cli_model=cli_model,
                task_file=cont_file,
                workdir=workdir,
                timeout_s=cont_timeout,
                env=env,
                inference_url=inference_url,
            )
            cmd = cmd2
            if timed_out2 is not None:
                combined = combined + "\n" + timed_out2
                return {
                    "completed": False,
                    "error": f"timeout after continuation ({cont_timeout}s)",
                    "output_tail": combined[-2000:],
                    "full_output": combined,
                    "tokens": None,
                    "turns": None,
                    "cmd": cmd,
                    **_empty_token_usage(),
                }
            assert proc2 is not None
            proc = proc2
            combined = combined + "\n" + (proc2.stdout or "") + (proc2.stderr or "")
    finally:
        if vault:
            shutil.rmtree(vault, ignore_errors=True)

    assert proc is not None
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
