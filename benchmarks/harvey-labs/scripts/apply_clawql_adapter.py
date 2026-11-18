#!/usr/bin/env python3
"""Apply ClawQL adapter overlay into a harvey-labs checkout.

Layout-aware:
  - v1.4 (lab_core/):   lab_core/harness/run.py + lab_core/evaluation/
  - legacy (harness/):  harness/run.py  + evaluation/

Harvey contract (non-negotiable):
  - Never modify harness/agent_loop.py or Harvey core logic.
  - Default apply: copy OUR adapter files + minimal run.py marker hooks so
    ``clawql/`` / ``clawql-cc/`` / ``openrouter/`` resolve and ClawQL tools
    route correctly.
  - Do NOT rewrite Harvey-authored adapters (anthropic.py, judge.py, ...)
    unless ``--openrouter-hooks`` is explicitly requested (ClawQL GHA/smoke).

Usage:
  python apply_clawql_adapter.py --harvey-labs /path/to/harvey-labs
  python apply_clawql_adapter.py --harvey-labs /path --openrouter-hooks
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

MARKER_BEGIN = "# --- clawql-lab-adapter begin ---"
MARKER_END = "# --- clawql-lab-adapter end ---"


class Layout:
    def __init__(self, pkg_root: str, file_pkg: str):
        # file_pkg = "" (legacy) or "lab_core" (v1.4) for on-disk paths
        # pkg_root = "" or "lab_core." for dotted Python imports in run.py
        self.file_pkg = file_pkg
        self.pkg_root = pkg_root

    @property
    def harness(self) -> str:
        return f"{self.file_pkg}/harness" if self.file_pkg else "harness"

    @property
    def evaluation(self) -> str:
        return f"{self.file_pkg}/evaluation" if self.file_pkg else "evaluation"

    def dotted(self, mod: str) -> str:
        # mod like "adapters.clawql" under harness, or "judge" under evaluation
        return mod  # caller supplies the full dotted target


def detect_layout(root: Path) -> Layout:
    if (root / "lab_core" / "harness" / "run.py").exists():
        return Layout(pkg_root="lab_core.", file_pkg="lab_core")
    if (root / "harness" / "run.py").exists():
        return Layout(pkg_root="", file_pkg="")
    raise SystemExit(f"Not a harvey-labs checkout (no harness/run.py): {root}")


def rewrite_overlay_imports(text: str, lay: Layout) -> str:
    """Rewrite `from harness.` / `from evaluation.` overlays to the package root."""
    if lay.pkg_root:
        out = re.sub(r"^(\s*)from harness\.", rf"\1from {lay.pkg_root}harness.", text, flags=re.M)
        out = re.sub(r"^(\s*)from evaluation\.", rf"\1from {lay.pkg_root}evaluation.", out, flags=re.M)
        out = re.sub(r"^(\s*)import harness\b", rf"\1import {lay.pkg_root}harness", out, flags=re.M)
        return out
    return text


def _replace_block(text: str, begin: str, end: str, replacement: str) -> str:
    if begin in text and end in text:
        pre, rest = text.split(begin, 1)
        _, post = rest.split(end, 1)
        return pre + replacement.strip() + post
    return text


def build_create_adapter_hook(lay: Layout) -> str:
    B, E = MARKER_BEGIN, MARKER_END
    return f"""
{B}
    if provider == "clawql":
        from {lay.pkg_root}harness.adapters.clawql import ClawQLAdapter

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
        from {lay.pkg_root}harness.adapters.clawql_chat import ClawQLChatAdapter

        return ClawQLChatAdapter(
            model=model_id,
            task_id=os.environ.get("CLAWQL_LAB_TASK_ID", "unknown"),
            documents_dir=Path(os.environ.get("CLAWQL_LAB_DOCUMENTS_DIR", ".")),
            temperature=temperature,
            reasoning_effort=reasoning_effort,
            arm=os.environ.get("CLAWQL_LAB_ARM", "nemotron-clawql"),
        )

    if provider == "openrouter":
        from {lay.pkg_root}harness.adapters.openrouter_chat import OpenRouterChatAdapter

        return OpenRouterChatAdapter(
            model=model_id,
            temperature=temperature,
            reasoning_effort=reasoning_effort,
        )
{E}
"""


def copy_files(integration_root: Path, harvey_labs: Path, lay: Layout) -> None:
    src_adapters = integration_root / "harness" / "adapters"
    src_eval = integration_root / "evaluation"
    dst_adapters = harvey_labs / lay.harness / "adapters"
    dst_eval = harvey_labs / lay.evaluation

    rel_pairs = [
        (src_adapters / "clawql.py", dst_adapters / "clawql.py"),
        (src_adapters / "clawql_chat.py", dst_adapters / "clawql_chat.py"),
        (src_adapters / "openrouter_chat.py", dst_adapters / "openrouter_chat.py"),
        (src_adapters / "clawql_lab_session.py", dst_adapters / "clawql_lab_session.py"),
        (src_adapters / "clawql_system_prompt.md", dst_adapters / "clawql_system_prompt.md"),
        (src_adapters / "clawql_tools.json", dst_adapters / "clawql_tools.json"),
        (src_adapters / "clawql_openrouter.py", dst_adapters / "clawql_openrouter.py"),
        (integration_root / "harness" / "clawql_tools.py", harvey_labs / lay.harness / "clawql_tools.py"),
        (src_eval / "clawql_openrouter_judge.py", dst_eval / "clawql_openrouter_judge.py"),
    ]
    for src, dest in rel_pairs:
        if not src.exists():
            print(f"SKIP (missing source): {src}", file=sys.stderr)
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        if src.suffix == ".py":
            text = rewrite_overlay_imports(src.read_text(encoding="utf-8"), lay)
            dest.write_text(text, encoding="utf-8")
        else:
            shutil.copy2(src, dest)
        print(f"copied {src.name} -> {dest}")


def patch_run_py(run_py: Path, lay: Layout) -> None:
    text = run_py.read_text(encoding="utf-8")
    original = text

    # Import ClawQLToolExecutor next to the ToolExecutor import.
    anchor = (
        f"from {lay.pkg_root}harness.tools import ToolExecutor, get_all_tool_definitions"
    )
    ins = f"from {lay.pkg_root}harness.clawql_tools import ClawQLToolExecutor"
    if anchor in text and ins not in text:
        text = text.replace(anchor, anchor + "\n" + ins, 1)

    # create_adapter provider branches.
    create_hook = build_create_adapter_hook(lay).strip()
    if MARKER_BEGIN in text:
        text = _replace_block(text, MARKER_BEGIN, MARKER_END, create_hook)
    else:
        anchor = '    provider, model_id = model.split("/", 1) if "/" in model else (None, model)\n'
        if anchor not in text:
            raise SystemExit("create_adapter anchor not found in run.py")
        text = text.replace(anchor, anchor + "\n" + create_hook + "\n", 1)

    # Main: expose task id + documents dir for the ClawQL lab session.
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

    # Adapter + tool executor (ClawQL vs stock).
    adapter_begin = MARKER_BEGIN + "-adapter"
    adapter_end = MARKER_END + "-adapter"
    adapter_block = f"""    {adapter_begin}
    print(f"Creating adapter for: {{args.model}}")
    adapter = create_adapter(
        model=args.model,
        temperature=args.temperature,
        reasoning_effort=args.reasoning_effort,
    )

    from {lay.pkg_root}harness.adapters.clawql_lab_session import is_clawql_lab_adapter
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
            enable_finish=args.enable_finish,
            max_result_chars=args.max_result_chars,
        )
        system_prompt_extra = adapter.system_prompt_extension()
    else:
        tool_executor = ToolExecutor(
            sandbox=sandbox,
            shell_timeout=args.shell_timeout,
            enable_finish=args.enable_finish,
            max_result_chars=args.max_result_chars,
        )
        system_prompt_extra = ""
    {adapter_end}
"""
    if adapter_begin in text:
        text = _replace_block(text, adapter_begin, adapter_end, adapter_block)
    else:
        old_legacy = f"""    # Create adapter and tool executor
    print(f"Creating adapter for: {{args.model}}")
    adapter = create_adapter(
        model=args.model,
        temperature=args.temperature,
        reasoning_effort=args.reasoning_effort,
    )

    tool_executor = ToolExecutor(
        sandbox=sandbox,
        shell_timeout=args.shell_timeout,
    )
"""
        old_v14 = f"""    # Create adapter and tool executor
    print(f"Creating adapter for: {{args.model}}")
    adapter = create_adapter(
        model=args.model,
        temperature=args.temperature,
        reasoning_effort=args.reasoning_effort,
    )

    tool_executor = ToolExecutor(
        sandbox=sandbox,
        shell_timeout=args.shell_timeout,
        enable_finish=args.enable_finish,
        max_result_chars=args.max_result_chars,
    )
"""
        matched = next((c for c in (old_legacy, old_v14) if c in text), None)
        if matched is None:
            raise SystemExit("adapter/tool_executor block not found in run.py")
        text = text.replace(matched, adapter_block, 1)

    # System prompt extension injection (works for both layouts).
    if "system_prompt_extra:" not in text and "if system_prompt_extra" not in text:
        anchor = '    user_prompt = task["instructions"]\n'
        if anchor in text:
            text = text.replace(
                anchor,
                "    if system_prompt_extra:\n"
                "        system_prompt += system_prompt_extra\n"
                + anchor,
                1,
            )

    # Post-task cleanup around run_agent.
    cleanup_begin = MARKER_BEGIN + "-cleanup"
    cleanup_end = MARKER_END + "-cleanup"
    cleanup_block = f"""    {cleanup_begin}
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
        from {lay.pkg_root}harness.adapters.clawql_lab_session import is_clawql_lab_adapter as _is_clawql
        if _is_clawql(adapter):
            try:
                adapter.post_task_cleanup()
            except Exception as cleanup_exc:  # noqa: BLE001
                print(f"ClawQL post_task_cleanup warning: {{cleanup_exc}}")
    {cleanup_end}
"""
    if cleanup_begin in text:
        text = _replace_block(text, cleanup_begin, cleanup_end, cleanup_block)
    else:
        old = """    try:
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
"""
        if old not in text:
            raise SystemExit("run_agent try/finally block not found in run.py")
        text = text.replace(old, cleanup_block + "\n", 1)

    if "import os\n" not in text.split("#")[0] and "\nimport os\n" not in text and "import os" not in text:
        # ensure `os` is available for the main hook
        text = "import os\n" + text

    if text != original:
        run_py.write_text(text, encoding="utf-8")
        print(f"patched {run_py} (layout={lay.file_pkg or 'legacy'})")
    else:
        print(f"no changes needed for {run_py}")


def patch_openrouter_clients(harvey_labs: Path, lay: Layout) -> None:
    anth = harvey_labs / lay.harness / "adapters" / "anthropic.py"
    text = anth.read_text(encoding="utf-8")
    begin, end = "# --- clawql-openrouter begin ---", "# --- clawql-openrouter end ---"
    block = f"""{begin}
        from {lay.pkg_root}harness.adapters.clawql_openrouter import (
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
        text = text.replace(old, "        self.max_tokens = max_tokens\n" + block + "\n", 1)
    anth.write_text(text, encoding="utf-8")
    print(f"patched {anth} (--openrouter-hooks)")

    judge = harvey_labs / lay.evaluation / "judge.py"
    jtext = judge.read_text(encoding="utf-8")
    jbegin, jend = ("# --- clawql-openrouter-judge begin ---",
                    "# --- clawql-openrouter-judge end ---")
    jblock = f"""        {jbegin}
            from {lay.pkg_root}harness.adapters.clawql_openrouter import (
                make_anthropic_client,
                maybe_rewrite_model,
            )
            self.model = maybe_rewrite_model(model)
            self.client = make_anthropic_client()
        {jend}
"""
    if jbegin in jtext:
        tb = jtext.find(jbegin)
        te = jtext.find(jend)
        if tb != -1 and te != -1:
            lb = jtext.rfind("\n", 0, tb) + 1
            le = jtext.find("\n", te)
            if le == -1:
                le = len(jtext)
            else:
                le += 1
            jtext = jtext[:lb] + jblock + jtext[le:]
    else:
        old = '        if self.provider == "anthropic":\n            self.client = anthropic.Anthropic(max_retries=1)\n'
        if old not in jtext:
            raise SystemExit("judge.py anthropic client anchor not found")
        jtext = jtext.replace(old, '        if self.provider == "anthropic":\n' + jblock, 1)
    judge.write_text(jtext, encoding="utf-8")
    print(f"patched {judge} (--openrouter-hooks)")


def patch_run_eval_judge_factory(harvey_labs: Path, lay: Layout) -> None:
    run_eval = harvey_labs / lay.evaluation / "run_eval.py"
    text = run_eval.read_text(encoding="utf-8")
    begin = "# --- clawql-judge-factory begin ---"
    end = "# --- clawql-judge-factory end ---"
    factory = f"""{begin}
def _clawql_make_judge(model: str):
    from {lay.pkg_root}harness.adapters.clawql_openrouter import make_lab_judge
    return make_lab_judge(model)
{end}
"""
    if begin in text:
        text = _replace_block(text, begin, end, factory)
    else:
        anchor = f"from {lay.pkg_root}evaluation.judge import Judge\n"
        if anchor not in text:
            raise SystemExit("run_eval.py Judge import anchor not found")
        text = text.replace(anchor, anchor + "\n" + factory + "\n", 1)

    text = text.replace("judge = Judge(model=args.judge_model)",
                        "judge = _clawql_make_judge(args.judge_model)")
    text = text.replace("judge = Judge(model=judge_model)",
                        "judge = _clawql_make_judge(judge_model)")
    run_eval.write_text(text, encoding="utf-8")
    print(f"patched {run_eval} (--openrouter-hooks)")


def assert_no_agent_loop_patch(harvey_labs: Path, lay: Layout) -> None:
    agent_loop = harvey_labs / lay.harness / "agent_loop.py"
    if not agent_loop.exists():
        return
    text = agent_loop.read_text(encoding="utf-8")
    if "clawql" in text.lower() or MARKER_BEGIN in text:
        raise SystemExit(
            "REFUSING: agent_loop.py contains ClawQL markers — Harvey core must stay stock. "
            "Restore from upstream harvey-labs and re-apply."
        )


def main() -> int:
    p = argparse.ArgumentParser(
        description="Apply ClawQL overlay into harvey-labs (Harvey core untouched).")
    p.add_argument("--harvey-labs", type=Path, required=True)
    p.add_argument("--integration-root", type=Path,
                   default=Path(__file__).resolve().parents[1])
    p.add_argument("--openrouter-hooks", action="store_true",
                   help="Also patch Harvey-authored anthropic/judge/run_eval (ClawQL GHA/smoke).")
    args = p.parse_args()

    lay = detect_layout(args.harvey_labs)
    print(f"layout: {lay.file_pkg or 'legacy'}  (harvey-labs={args.harvey_labs})")

    copy_files(args.integration_root, args.harvey_labs, lay)
    patch_run_py(args.harvey_labs / lay.harness / "run.py", lay)
    assert_no_agent_loop_patch(args.harvey_labs, lay)

    if args.openrouter_hooks:
        patch_openrouter_clients(args.harvey_labs, lay)
        patch_run_eval_judge_factory(args.harvey_labs, lay)
    else:
        print("skip openrouter hooks (default) — Harvey-authored adapters left stock")

    print("OK: overlay applied. agent_loop.py untouched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
