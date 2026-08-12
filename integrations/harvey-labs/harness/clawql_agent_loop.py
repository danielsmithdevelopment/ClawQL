"""Patch harvey-labs agent_loop.py with ClawQL LAB guards.

1. Deliverable guard — nudge when ``/workspace/output/`` is empty.
2. Tool-result truncation — cap oversized bash/grep/read dumps so one
   ``ls -R`` cannot pin ~170k tokens into every subsequent turn (task 014).
"""

from __future__ import annotations

from pathlib import Path

HELPER_BEGIN = "# --- clawql-deliverable-guard begin ---"
HELPER_END = "# --- clawql-deliverable-guard end ---"
FINISH_BEGIN = "# --- clawql-deliverable-finish begin ---"
FINISH_END = "# --- clawql-deliverable-finish end ---"
TRUNC_BEGIN = "# --- clawql-tool-result-trunc begin ---"
TRUNC_END = "# --- clawql-tool-result-trunc end ---"

HELPER_BLOCK = f"""{HELPER_BEGIN}
def _clawql_output_has_files() -> bool:
    \"\"\"True when the sandbox has any graded deliverable under /workspace/output.\"\"\"
    import os
    from pathlib import Path

    host = os.environ.get("CLAWQL_LAB_OUTPUT_DIR", "").strip()
    if not host:
        return False
    root = Path(host)
    if not root.exists():
        return False
    return any(p.is_file() for p in root.rglob("*"))


def _clawql_max_tool_result_chars() -> int:
    \"\"\"Max chars kept from a single tool result in the agent message history.\"\"\"
    import os

    raw = os.environ.get("CLAWQL_LAB_MAX_TOOL_RESULT_CHARS", "24000").strip()
    try:
        n = int(raw)
    except ValueError:
        n = 24000
    return max(4000, n)


def _clawql_truncate_tool_result(tool_name: str, result: str) -> str:
    \"\"\"Prevent one huge tool dump from dominating the remaining context.\"\"\"
    if not isinstance(result, str):
        result = str(result)
    limit = _clawql_max_tool_result_chars()
    if len(result) <= limit:
        return result
    omitted = len(result) - limit
    head = result[:limit]
    return (
        head
        + f"\\n\\n…[ClawQL truncated tool result for {{tool_name}}: "
        + f"kept {{limit}} of {{limit + omitted}} chars; "
        + "re-run with a narrower path/glob/head if you need more]\\n"
    )


_CLAWQL_DELIVERABLE_NUDGE = (
    "STOP — your answer is not graded yet.\\n\\n"
    "The judge only reads files under `/workspace/output/`. "
    "You have not written a deliverable there.\\n\\n"
    "Use the `write` tool NOW to create a markdown file under "
    "`/workspace/output/` (e.g. `matters-enumeration.md` or `response.md`). "
    "Attempt EVERY rubric criterion with the best evidence you have. "
    "Partial answers that cover all criteria score higher than empty output "
    "or a single guessed matter. Cite document paths under "
    "`/workspace/documents/matters/<matter-id>/...` when available.\\n\\n"
    "Do not reply with chat text only."
)
{HELPER_END}
"""

FINISH_BLOCK = f"""            {FINISH_BEGIN}
            # If no tool calls, the agent is done — unless ClawQL overlay detects
            # an empty /workspace/output and we have not nudged yet.
            if not response.tool_calls:
                _clawql_guard_on = (
                    os.environ.get("CLAWQL_LAB_DELIVERABLE_GUARD", "1") != "0"
                    and bool(os.environ.get("CLAWQL_LAB_OUTPUT_DIR", "").strip())
                )
                if (
                    _clawql_guard_on
                    and not _clawql_nudge_state["nudged"]
                    and not _clawql_output_has_files()
                    and turn_count < max_turns
                ):
                    _clawql_nudge_state["nudged"] = True
                    print(
                        "ClawQL deliverable guard: nudging agent to write /workspace/output/"
                    )
                    messages.append(
                        adapter.make_user_message(_CLAWQL_DELIVERABLE_NUDGE)
                    )
                    continue
                break
            {FINISH_END}
"""

TRUNC_BLOCK = f"""                {TRUNC_BEGIN}
                if os.environ.get("CLAWQL_LAB_TRUNCATE_TOOL_RESULTS", "1") != "0":
                    result = _clawql_truncate_tool_result(tc.name, result)
                {TRUNC_END}
"""


def _replace_marked_block(text: str, begin: str, end: str, replacement: str) -> str:
    if begin in text and end in text:
        pre, rest = text.split(begin, 1)
        _, post = rest.split(end, 1)
        return pre + replacement.strip() + "\n" + post.lstrip("\n")
    return text


def patch_agent_loop_deliverable_guard(agent_loop_path: Path) -> None:
    """Idempotently patch harvey-labs ``harness/agent_loop.py``."""
    text = agent_loop_path.read_text(encoding="utf-8")
    original = text

    if "\nimport os\n" not in text and not text.startswith("import os\n"):
        text = text.replace("import time\n", "import os\nimport time\n", 1)

    if HELPER_BEGIN in text:
        text = _replace_marked_block(text, HELPER_BEGIN, HELPER_END, HELPER_BLOCK)
    else:
        anchor = "def run_agent(\n"
        if anchor not in text:
            raise SystemExit("agent_loop.py run_agent anchor not found")
        text = text.replace(anchor, HELPER_BLOCK + "\n\n" + anchor, 1)

    # Ensure nudge state init inside run_agent (once per run).
    state_begin = "# --- clawql-deliverable-state begin ---"
    state_end = "# --- clawql-deliverable-state end ---"
    state_block = f"""    {state_begin}
    _clawql_nudge_state = {{"nudged": False}}
    {state_end}
"""
    if state_begin in text:
        text = _replace_marked_block(text, state_begin, state_end, state_block)
    else:
        anchor = "    total_input_tokens = 0\n"
        if anchor not in text:
            raise SystemExit("agent_loop.py token counter anchor not found")
        text = text.replace(anchor, state_block + "\n" + anchor, 1)

    if FINISH_BEGIN in text:
        text = _replace_marked_block(text, FINISH_BEGIN, FINISH_END, FINISH_BLOCK)
    else:
        old = (
            "            # If no tool calls, the agent is done\n"
            "            if not response.tool_calls:\n"
            "                break\n"
        )
        if old not in text:
            raise SystemExit("agent_loop.py finish-on-no-tools branch not found")
        text = text.replace(old, FINISH_BLOCK + "\n", 1)

    # Truncate oversized tool results before they enter message history.
    if TRUNC_BEGIN in text:
        text = _replace_marked_block(text, TRUNC_BEGIN, TRUNC_END, TRUNC_BLOCK)
    else:
        old_exec = (
            "            for tc in response.tool_calls:\n"
            "                result = tool_executor.execute(tc.name, tc.arguments)\n"
        )
        if old_exec not in text:
            # Already-patched loops may indent differently; try looser match.
            alt = (
                "            for tc in response.tool_calls:\n"
                "                result = tool_executor.execute(tc.name, tc.arguments)\n\n"
            )
            if alt not in text and "tool_executor.execute(tc.name, tc.arguments)" not in text:
                raise SystemExit("agent_loop.py tool execute loop not found")
        if "tool_executor.execute(tc.name, tc.arguments)" in text and TRUNC_BEGIN not in text:
            text = text.replace(
                "                result = tool_executor.execute(tc.name, tc.arguments)\n",
                "                result = tool_executor.execute(tc.name, tc.arguments)\n"
                + TRUNC_BLOCK
                + "\n",
                1,
            )

    if text != original:
        agent_loop_path.write_text(text, encoding="utf-8")
        print(f"patched {agent_loop_path} (deliverable guard + tool truncation)")
    else:
        print(f"no changes needed for {agent_loop_path} (deliverable guard)")
