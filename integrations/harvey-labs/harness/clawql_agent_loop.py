"""Patch harvey-labs agent_loop.py with ClawQL LAB guards.

1. Deliverable guard — nudge when ``/workspace/output/`` is empty.
2. Tool-result truncation — cap oversized bash/grep/read dumps so one
   ``ls -R`` cannot pin ~170k tokens into every subsequent turn (task 014).
3. Deliverable grounding Wonder — after a file exists, one nudge to verify
   claims against source documents. Wonder text is **task-kind gated**:
   single-answer tasks get a 1–2 grep budget; enumeration gets fuller checks.
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


def _clawql_message_text(msg) -> str:
    if msg is None:
        return ""
    if isinstance(msg, str):
        return msg
    if isinstance(msg, dict):
        content = msg.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, str):
                    parts.append(block)
                elif isinstance(block, dict):
                    parts.append(str(block.get("text") or block.get("content") or ""))
            return "\\n".join(parts)
        return str(msg.get("text") or "")
    return str(getattr(msg, "content", "") or getattr(msg, "text", "") or "")


def _clawql_infer_task_kind(messages) -> str:
    \"\"\"Heuristic task kind from the user prompt (enumeration vs single_answer).

    Prefer single_answer when mixed — Wonder-verifying a wrong list is the
    expensive failure mode (batch-2 task 008).
    \"\"\"
    import os
    import re

    forced = os.environ.get("CLAWQL_LAB_TASK_KIND", "").strip().lower()
    if forced in {{"enumeration", "single_answer", "comparison", "timeline"}}:
        return forced

    blob = " ".join(_clawql_message_text(m) for m in (messages or [])).lower()
    enum_hits = len(
        re.findall(
            r"\\b(every|enumerate|enumeration|all matters|list (all|every)|"
            r"which matters|each matter|set of matters)\\b",
            blob,
        )
    )
    single_hits = len(
        re.findall(
            r"\\b(most recent|latest|first|what's our|what is our|"
            r"which matter|model (filing|document)|single)\\b",
            blob,
        )
    )
    if enum_hits > single_hits and enum_hits > 0:
        return "enumeration"
    return "single_answer"


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

_CLAWQL_GROUNDING_WONDER_ENUM = (
    "WONDER (enumeration grounding) — before you finish:\\n\\n"
    "Findings start **guilty until proven by document evidence**. "
    "For each matter in your `/workspace/output/` file, run a targeted `grep` "
    "against the **cited** document path under `/workspace/documents/`.\\n\\n"
    "If a claim is not found in source text, remove it or mark unconfirmed. "
    "Do not invent ontology title flags (e.g. COVENANT-LITE)."
)

_CLAWQL_GROUNDING_WONDER_SINGLE = (
    "WONDER (single-answer grounding) — budget: **at most 1–2 targeted greps**.\\n\\n"
    "This task wants one answer (most recent / latest / specific), not a list. "
    "If your deliverable enumerates many matters, that is a **framing error** — "
    "rewrite to the single best-supported matter (or mark unresolved). "
    "Do **not** verify a whole candidate list.\\n\\n"
    "HSR filing ≠ HSR second request. Partial grep hits after fallback are "
    "**unresolved**, not confirmed — do not Wonder-prove a weak match.\\n\\n"
    "Then `write` an updated deliverable if needed."
)
{HELPER_END}
"""

FINISH_BLOCK = f"""            {FINISH_BEGIN}
            # If no tool calls, the agent is done — unless ClawQL overlay detects
            # an empty /workspace/output and we have not nudged yet, or we still
            # owe one deliverable-grounding Wonder pass (kind-gated).
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
                _clawql_wonder_on = (
                    os.environ.get("CLAWQL_LAB_GROUNDING_WONDER", "1") != "0"
                    and bool(os.environ.get("CLAWQL_LAB_OUTPUT_DIR", "").strip())
                )
                if (
                    _clawql_wonder_on
                    and not _clawql_nudge_state.get("grounded", False)
                    and _clawql_output_has_files()
                    and turn_count < max_turns
                ):
                    _clawql_nudge_state["grounded"] = True
                    _kind = _clawql_infer_task_kind(messages)
                    _wonder = (
                        _CLAWQL_GROUNDING_WONDER_ENUM
                        if _kind == "enumeration"
                        else _CLAWQL_GROUNDING_WONDER_SINGLE
                    )
                    print(
                        f"ClawQL grounding Wonder (kind={{_kind}}): "
                        "nudging agent to verify deliverable vs docs"
                    )
                    messages.append(adapter.make_user_message(_wonder))
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
    _clawql_nudge_state = {{"nudged": False, "grounded": False}}
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
        if "tool_executor.execute(tc.name, tc.arguments)" not in text:
            raise SystemExit("agent_loop.py tool execute loop not found")
        if TRUNC_BEGIN not in text:
            text = text.replace(
                "                result = tool_executor.execute(tc.name, tc.arguments)\n",
                "                result = tool_executor.execute(tc.name, tc.arguments)\n"
                + TRUNC_BLOCK
                + "\n",
                1,
            )

    if text != original:
        agent_loop_path.write_text(text, encoding="utf-8")
        print(
            f"patched {agent_loop_path} "
            "(deliverable guard + truncation + kind-gated Wonder)"
        )
    else:
        print(f"no changes needed for {agent_loop_path} (deliverable guard)")
