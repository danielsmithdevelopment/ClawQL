#!/usr/bin/env python3
"""Apply ClawQL adapter files + run.py wiring into a harvey-labs checkout.

Usage:
  python integrations/harvey-labs/scripts/apply_clawql_adapter.py \\
      --harvey-labs /path/to/harvey-labs
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
        if "/" in underlying:
            _p, underlying = underlying.split("/", 1)
        return ClawQLAdapter(
            model=underlying,
            task_id=os.environ.get("CLAWQL_LAB_TASK_ID", "unknown"),
            documents_dir=Path(os.environ.get("CLAWQL_LAB_DOCUMENTS_DIR", ".")),
            temperature=temperature,
            reasoning_effort=reasoning_effort,
        )
{end}
'''.format(begin=MARKER_BEGIN, end=MARKER_END)

MAIN_HOOK = '''
{begin}
    clawql_adapter = None
    if args.model.startswith("clawql/") or args.model.split("/", 1)[0] == "clawql":
        os.environ["CLAWQL_LAB_TASK_ID"] = args.task
        os.environ["CLAWQL_LAB_DOCUMENTS_DIR"] = task["docs_dir"]
{end}
'''.format(begin=MARKER_BEGIN + "-main", end=MARKER_END + "-main")


def copy_files(src_root: Path, dest_root: Path) -> None:
    pairs = [
        (
            src_root / "harness" / "adapters" / "clawql.py",
            dest_root / "harness" / "adapters" / "clawql.py",
        ),
        (
            src_root / "harness" / "adapters" / "clawql_system_prompt.md",
            dest_root / "harness" / "adapters" / "clawql_system_prompt.md",
        ),
        (
            src_root / "harness" / "adapters" / "clawql_vault.py",
            dest_root / "harness" / "adapters" / "clawql_vault.py",
        ),
        (
            src_root / "harness" / "clawql_tools.py",
            dest_root / "harness" / "clawql_tools.py",
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
    text = run_py.read_text(encoding="utf-8")
    original = text

    # Ensure imports we need are present (os/Path already used in run.py).
    if "from harness.clawql_tools import ClawQLToolExecutor" not in text:
        text = text.replace(
            "from harness.tools import ToolExecutor, get_all_tool_definitions",
            "from harness.tools import ToolExecutor, get_all_tool_definitions\n"
            "from harness.clawql_tools import ClawQLToolExecutor",
        )

    # Inject clawql provider into create_adapter after provider split.
    create_hook = CREATE_ADAPTER_HOOK.strip() + "\n"
    if MARKER_BEGIN in text:
        text = _replace_block(text, MARKER_BEGIN, MARKER_END, create_hook)
    else:
        anchor = '    provider, model_id = model.split("/", 1) if "/" in model else (None, model)\n'
        if anchor not in text:
            raise SystemExit("create_adapter anchor not found in run.py")
        text = text.replace(anchor, anchor + "\n" + create_hook + "\n", 1)

    # After task load, set env for ClawQLAdapter factory.
    main_begin = MARKER_BEGIN + "-main"
    main_end = MARKER_END + "-main"
    main_hook = (
        f"    {main_begin}\n"
        "    if args.model.startswith(\"clawql/\") or args.model.split(\"/\", 1)[0] == \"clawql\":\n"
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

    # Replace adapter create + tool executor block for clawql models.
    adapter_begin = MARKER_BEGIN + "-adapter"
    adapter_end = MARKER_END + "-adapter"
    adapter_block = f'''    {adapter_begin}
    print(f"Creating adapter for: {{args.model}}")
    adapter = create_adapter(
        model=args.model,
        temperature=args.temperature,
        reasoning_effort=args.reasoning_effort,
    )

    if isinstance(adapter, object) and adapter.__class__.__name__ == "ClawQLAdapter":
        from harness.adapters.clawql import ClawQLAdapter as _ClawQLAdapter
        assert isinstance(adapter, _ClawQLAdapter)
        adapter.pre_task_setup()
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

    # Append system prompt extension for ClawQL.
    if "system_prompt_extra" not in text.split("system_prompt = SYSTEM_PROMPT_PREAMBLE", 1)[-1][:400]:
        text = text.replace(
            "    system_prompt = SYSTEM_PROMPT_PREAMBLE\n",
            "    system_prompt = SYSTEM_PROMPT_PREAMBLE + system_prompt_extra\n",
            1,
        )

    # Cleanup after run.
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
        if adapter.__class__.__name__ == "ClawQLAdapter":
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
        print(f"patched {run_py}")
    else:
        print(f"no changes needed for {run_py}")


def main() -> int:
    parser = argparse.ArgumentParser()
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
    args = parser.parse_args()
    if not (args.harvey_labs / "harness" / "run.py").exists():
        print("Not a harvey-labs checkout:", args.harvey_labs, file=sys.stderr)
        return 1
    copy_files(args.integration_root, args.harvey_labs)
    patch_run_py(args.harvey_labs / "harness" / "run.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
