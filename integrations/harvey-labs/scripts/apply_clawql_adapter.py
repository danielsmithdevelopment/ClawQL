#!/usr/bin/env python3
"""Apply ClawQL adapter overlay into a harvey-labs checkout.

Harvey contract (non-negotiable):
  - Never modify harness/agent_loop.py or other Harvey core logic.
  - Default apply: copy OUR adapter files + minimal run.py marker hooks so
    ``clawql/`` / ``clawql-cc/`` resolve and ClawQL tools route correctly.
  - Do NOT rewrite Harvey-authored adapters (anthropic.py, judge.py, …)
    unless ``--openrouter-hooks`` is explicitly requested (ClawQL GHA only).

Usage:
  python integrations/harvey-labs/scripts/apply_clawql_adapter.py \\
      --harvey-labs /path/to/harvey-labs

  # ClawQL OpenRouter GHA / local OR routing only:
  python …/apply_clawql_adapter.py --harvey-labs … --openrouter-hooks
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

MARKER_BEGIN = "# --- clawql-lab-adapter begin ---"
MARKER_END = "# --- clawql-lab-adapter end ---"

CREATE_ADAPTER_HOOK = '''
{begin}
    if provider == "clawql":
        from harness.adapters.clawql import ClawQLAdapter

        # clawql/<model> or clawql/anthropic/<model>
        underlying = model_id
        if underlying.startswith("anthropic/"):
            underlying = underlying.split("/", 1)[1]
        return ClawQLAdapter(
            model=underlying,
            task_id=os.environ.get("CLAWQL_LAB_TASK_ID", "unknown"),
            documents_dir=Path(os.environ.get("CLAWQL_LAB_DOCUMENTS_DIR", ".")),
            temperature=temperature,
            reasoning_effort=reasoning_effort,
            arm=os.environ.get("CLAWQL_LAB_ARM", "clawql"),
        )

    if provider == "clawql-cc":
        from harness.adapters.clawql_chat import ClawQLChatAdapter

        # clawql-cc/<openrouter-model> — Nemotron Arm C / chat completions
        return ClawQLChatAdapter(
            model=model_id,
            task_id=os.environ.get("CLAWQL_LAB_TASK_ID", "unknown"),
            documents_dir=Path(os.environ.get("CLAWQL_LAB_DOCUMENTS_DIR", ".")),
            temperature=temperature,
            reasoning_effort=reasoning_effort,
            arm=os.environ.get("CLAWQL_LAB_ARM", "nemotron-clawql"),
        )

    if provider == "openrouter":
        from harness.adapters.openrouter_chat import OpenRouterChatAdapter

        # openrouter/<model> — Nemotron baseline (no ClawQL)
        return OpenRouterChatAdapter(
            model=model_id,
            temperature=temperature,
            reasoning_effort=reasoning_effort,
        )
{end}
'''.format(begin=MARKER_BEGIN, end=MARKER_END)


def copy_files(src_root: Path, dest_root: Path) -> None:
    """Copy ClawQL-authored overlay files only (never overwrite Harvey core)."""
    pairs = [
        (
            src_root / "harness" / "adapters" / "clawql.py",
            dest_root / "harness" / "adapters" / "clawql.py",
        ),
        (
            src_root / "harness" / "adapters" / "clawql_chat.py",
            dest_root / "harness" / "adapters" / "clawql_chat.py",
        ),
        (
            src_root / "harness" / "adapters" / "openrouter_chat.py",
            dest_root / "harness" / "adapters" / "openrouter_chat.py",
        ),
        (
            src_root / "harness" / "adapters" / "clawql_lab_session.py",
            dest_root / "harness" / "adapters" / "clawql_lab_session.py",
        ),
        (
            src_root / "harness" / "adapters" / "clawql_system_prompt.md",
            dest_root / "harness" / "adapters" / "clawql_system_prompt.md",
        ),
        (
            src_root / "harness" / "adapters" / "clawql_tools.json",
            dest_root / "harness" / "adapters" / "clawql_tools.json",
        ),
        (
            src_root / "harness" / "adapters" / "clawql_openrouter.py",
            dest_root / "harness" / "adapters" / "clawql_openrouter.py",
        ),
        (
            src_root / "harness" / "clawql_tools.py",
            dest_root / "harness" / "clawql_tools.py",
        ),
        (
            src_root / "evaluation" / "clawql_openrouter_judge.py",
            dest_root / "evaluation" / "clawql_openrouter_judge.py",
        ),
    ]
    for src, dest in pairs:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        print(f"copied {src.name} -> {dest}")


def _replace_block(text: str, begin: str, end: str, replacement: str) -> str:
    if begin in text and end in text:
        pre, rest = text.split(begin, 1)
        _, post = rest.split(end, 1)
        return pre + replacement.strip() + post
    return text


def patch_run_py(run_py: Path) -> None:
    """Minimal run.py hooks — register ClawQL providers + tool executor.

    Does not touch agent_loop.py. Does not change baseline ToolExecutor path
    except when the selected model is a ClawQL adapter.
    """
    text = run_py.read_text(encoding="utf-8")
    original = text

    if "from harness.clawql_tools import ClawQLToolExecutor" not in text:
        text = text.replace(
            "from harness.tools import ToolExecutor, get_all_tool_definitions",
            "from harness.tools import ToolExecutor, get_all_tool_definitions\n"
            "from harness.clawql_tools import ClawQLToolExecutor",
        )

    create_hook = CREATE_ADAPTER_HOOK.strip() + "\n"
    if MARKER_BEGIN in text:
        text = _replace_block(text, MARKER_BEGIN, MARKER_END, create_hook)
    else:
        anchor = '    provider, model_id = model.split("/", 1) if "/" in model else (None, model)\n'
        if anchor not in text:
            raise SystemExit("create_adapter anchor not found in run.py")
        text = text.replace(anchor, anchor + "\n" + create_hook + "\n", 1)

    main_begin = MARKER_BEGIN + "-main"
    main_end = MARKER_END + "-main"
    main_hook = (
        f"    {main_begin}\n"
        "    _prov = args.model.split(\"/\", 1)[0]\n"
        "    if _prov in {\"clawql\", \"clawql-cc\"}:\n"
        "        os.environ[\"CLAWQL_LAB_TASK_ID\"] = args.task\n"
        "        os.environ[\"CLAWQL_LAB_DOCUMENTS_DIR\"] = task[\"docs_dir\"]\n"
        f"    {main_end}\n"
    )
    if main_begin in text:
        text = _replace_block(text, main_begin, main_end, main_hook)
    else:
        anchor = '    print(f"Loading task: {args.task}")\n    task = load_task(task_name=args.task)\n'
        if anchor not in text:
            raise SystemExit("main task-load anchor not found in run.py")
        text = text.replace(anchor, anchor + "\n" + main_hook + "\n", 1)

    adapter_begin = MARKER_BEGIN + "-adapter"
    adapter_end = MARKER_END + "-adapter"
    adapter_block = f'''    {adapter_begin}
    print(f"Creating adapter for: {{args.model}}")
    adapter = create_adapter(
        model=args.model,
        temperature=args.temperature,
        reasoning_effort=args.reasoning_effort,
    )

    from harness.adapters.clawql_lab_session import is_clawql_lab_adapter
    if is_clawql_lab_adapter(adapter):
        _pre = os.environ.get("CLAWQL_LAB_PREINGEST_SCRIPT", "").strip()
        if _pre:
            import subprocess
            subprocess.run(["node", _pre], check=True, env=os.environ)
        adapter.pre_task_setup()
        os.environ["CLAWQL_LAB_OUTPUT_DIR"] = str(output_dir)
        tool_executor = ClawQLToolExecutor(
            clawql_adapter=adapter,
            sandbox=sandbox,
            shell_timeout=args.shell_timeout,
        )
        system_prompt_extra = adapter.system_prompt_extension()
    else:
        tool_executor = ToolExecutor(
            sandbox=sandbox,
            shell_timeout=args.shell_timeout,
        )
        system_prompt_extra = ""
    {adapter_end}
'''
    if adapter_begin in text:
        text = _replace_block(text, adapter_begin, adapter_end, adapter_block)
    else:
        old = '''    # Create adapter and tool executor
    print(f"Creating adapter for: {args.model}")
    adapter = create_adapter(
        model=args.model,
        temperature=args.temperature,
        reasoning_effort=args.reasoning_effort,
    )

    tool_executor = ToolExecutor(
        sandbox=sandbox,
        shell_timeout=args.shell_timeout,
    )
'''
        if old not in text:
            raise SystemExit("adapter/tool_executor block not found in run.py")
        text = text.replace(old, adapter_block + "\n", 1)

    if "system_prompt_extra" not in text.split("system_prompt = SYSTEM_PROMPT_PREAMBLE", 1)[-1][:400]:
        text = text.replace(
            "    system_prompt = SYSTEM_PROMPT_PREAMBLE\n",
            "    system_prompt = SYSTEM_PROMPT_PREAMBLE + system_prompt_extra\n",
            1,
        )

    cleanup_begin = MARKER_BEGIN + "-cleanup"
    cleanup_end = MARKER_END + "-cleanup"
    cleanup_block = f'''    {cleanup_begin}
    try:
        result = run_agent(
            adapter=adapter,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            tool_executor=tool_executor,
            tools=tools,
            max_turns=args.max_turns,
            transcript_path=str(results_dir / "transcript.jsonl"),
        )
    finally:
        sandbox.stop()
        from harness.adapters.clawql_lab_session import is_clawql_lab_adapter as _is_clawql
        if _is_clawql(adapter):
            try:
                adapter.post_task_cleanup()
            except Exception as cleanup_exc:  # noqa: BLE001
                print(f"ClawQL post_task_cleanup warning: {{cleanup_exc}}")
    {cleanup_end}
'''
    if cleanup_begin in text:
        text = _replace_block(text, cleanup_begin, cleanup_end, cleanup_block)
    else:
        old = '''    try:
        result = run_agent(
            adapter=adapter,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            tool_executor=tool_executor,
            tools=tools,
            max_turns=args.max_turns,
            transcript_path=str(results_dir / "transcript.jsonl"),
        )
    finally:
        sandbox.stop()
'''
        if old not in text:
            raise SystemExit("run_agent try/finally block not found in run.py")
        text = text.replace(old, cleanup_block + "\n", 1)

    if text != original:
        run_py.write_text(text, encoding="utf-8")
        print(f"patched {run_py} (ClawQL marker hooks only)")
    else:
        print(f"no changes needed for {run_py}")


def patch_openrouter_clients(harvey_labs: Path) -> None:
    """OPTIONAL — ClawQL GHA only. Mutates Harvey-authored anthropic.py / judge.py."""
    anth = harvey_labs / "harness" / "adapters" / "anthropic.py"
    text = anth.read_text(encoding="utf-8")
    begin, end = "# --- clawql-openrouter begin ---", "# --- clawql-openrouter end ---"
    block = f"""{begin}
        from harness.adapters.clawql_openrouter import (
            make_anthropic_client,
            maybe_rewrite_model,
            openrouter_max_tokens,
        )
        self.model = maybe_rewrite_model(model)
        self.max_tokens = openrouter_max_tokens(self.max_tokens)
        self.client = make_anthropic_client()
{end}
"""
    if begin in text:
        text = _replace_block(text, begin, end, block)
    else:
        old = "        self.max_tokens = max_tokens\n        self.client = anthropic.Anthropic()\n"
        if old not in text:
            raise SystemExit("anthropic.py client init anchor not found")
        text = text.replace(
            old,
            "        self.max_tokens = max_tokens\n" + block + "\n",
            1,
        )
    anth.write_text(text, encoding="utf-8")
    print(f"patched {anth} (--openrouter-hooks)")

    judge = harvey_labs / "evaluation" / "judge.py"
    jtext = judge.read_text(encoding="utf-8")
    jbegin, jend = "# --- clawql-openrouter-judge begin ---", "# --- clawql-openrouter-judge end ---"
    jblock = f"""        {jbegin}
            from harness.adapters.clawql_openrouter import (
                make_anthropic_client,
                maybe_rewrite_model,
            )
            self.model = maybe_rewrite_model(model)
            self.client = make_anthropic_client()
        {jend}
"""
    if jbegin in jtext:
        text_begin = jtext.find(jbegin)
        text_end = jtext.find(jend)
        if text_begin != -1 and text_end != -1:
            line_begin = jtext.rfind("\n", 0, text_begin) + 1
            line_end = jtext.find("\n", text_end)
            if line_end == -1:
                line_end = len(jtext)
            else:
                line_end += 1
            jtext = jtext[:line_begin] + jblock + jtext[line_end:]
    else:
        old = '        if self.provider == "anthropic":\n            self.client = anthropic.Anthropic(max_retries=1)\n'
        if old not in jtext:
            raise SystemExit("judge.py anthropic client anchor not found")
        jtext = jtext.replace(
            old,
            '        if self.provider == "anthropic":\n' + jblock,
            1,
        )
    judge.write_text(jtext, encoding="utf-8")
    print(f"patched {judge} (--openrouter-hooks)")


def patch_run_eval_judge_factory(harvey_labs: Path) -> None:
    """OPTIONAL — ClawQL GHA only. Mutates Harvey-authored run_eval.py."""
    run_eval = harvey_labs / "evaluation" / "run_eval.py"
    text = run_eval.read_text(encoding="utf-8")
    begin = "# --- clawql-judge-factory begin ---"
    end = "# --- clawql-judge-factory end ---"
    factory = f"""{begin}
def _clawql_make_judge(model: str):
    from harness.adapters.clawql_openrouter import make_lab_judge
    return make_lab_judge(model)
{end}
"""
    if begin in text:
        text = _replace_block(text, begin, end, factory)
    else:
        anchor = "from evaluation.judge import Judge\n"
        if anchor not in text:
            raise SystemExit("run_eval.py Judge import anchor not found")
        text = text.replace(anchor, anchor + "\n" + factory + "\n", 1)

    text = text.replace(
        "judge = Judge(model=args.judge_model)",
        "judge = _clawql_make_judge(args.judge_model)",
    )
    text = text.replace(
        "judge = Judge(model=judge_model)",
        "judge = _clawql_make_judge(judge_model)",
    )
    run_eval.write_text(text, encoding="utf-8")
    print(f"patched {run_eval} (--openrouter-hooks)")


def assert_no_agent_loop_patch(harvey_labs: Path) -> None:
    agent_loop = harvey_labs / "harness" / "agent_loop.py"
    if not agent_loop.exists():
        return
    text = agent_loop.read_text(encoding="utf-8")
    if "clawql" in text.lower() or MARKER_BEGIN in text:
        raise SystemExit(
            "REFUSING: agent_loop.py contains ClawQL markers — Harvey core must stay stock. "
            "Restore from upstream harvey-labs and re-apply."
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Apply ClawQL overlay into harvey-labs (Harvey core untouched)."
    )
    parser.add_argument(
        "--harvey-labs",
        type=Path,
        required=True,
        help="Path to harvey-labs checkout",
    )
    parser.add_argument(
        "--integration-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Path to integrations/harvey-labs in ClawQL",
    )
    parser.add_argument(
        "--openrouter-hooks",
        action="store_true",
        help=(
            "Also patch Harvey-authored anthropic.py / judge.py / run_eval.py "
            "for ClawQL OpenRouter GHA. Off by default — Harvey should not need this."
        ),
    )
    args = parser.parse_args()
    if not (args.harvey_labs / "harness" / "run.py").exists():
        print("Not a harvey-labs checkout:", args.harvey_labs, file=sys.stderr)
        return 1

    copy_files(args.integration_root, args.harvey_labs)
    patch_run_py(args.harvey_labs / "harness" / "run.py")
    assert_no_agent_loop_patch(args.harvey_labs)

    if args.openrouter_hooks:
        patch_openrouter_clients(args.harvey_labs)
        patch_run_eval_judge_factory(args.harvey_labs)
    else:
        print(
            "skip openrouter hooks (default) — Harvey-authored anthropic.py / "
            "judge.py / run_eval.py left stock"
        )

    print("OK: overlay applied. agent_loop.py untouched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
