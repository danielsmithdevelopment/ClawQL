"""Patch harvey-labs agent_loop.py with ClawQL LAB guards.

1. Deliverable guard — nudge when ``/workspace/output/`` is empty (clean stop).
2. Turn-ceiling force-write — nudge ~3 turns before ``max_turns`` if still no
   deliverable (task 018: bash/grep until wall; guard never fired).
3. Require-recall nudge — once at loop start, steer firm-knowledge toward
   ``clawql_memory_recall`` before bash/grep (ClawQL arm must use ClawQL).
4. Tool-result truncation — cap oversized bash/grep/read dumps so one
   ``ls -R`` cannot pin ~170k tokens into every subsequent turn (task 014).
5. Deliverable grounding Wonder — after a file exists, one kind-gated nudge.
   Kinds: enumeration | single_answer | frequency | comparison | timeline.
"""

from __future__ import annotations

from pathlib import Path

HELPER_BEGIN = "# --- clawql-deliverable-guard begin ---"
HELPER_END = "# --- clawql-deliverable-guard end ---"
FINISH_BEGIN = "# --- clawql-deliverable-finish begin ---"
FINISH_END = "# --- clawql-deliverable-finish end ---"
TRUNC_BEGIN = "# --- clawql-tool-result-trunc begin ---"
TRUNC_END = "# --- clawql-tool-result-trunc end ---"
CEILING_BEGIN = "# --- clawql-turn-ceiling begin ---"
CEILING_END = "# --- clawql-turn-ceiling end ---"
RECALL_BEGIN = "# --- clawql-require-recall begin ---"
RECALL_END = "# --- clawql-require-recall end ---"

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


def _clawql_ceiling_lead_turns() -> int:
    import os

    raw = os.environ.get("CLAWQL_LAB_CEILING_LEAD_TURNS", "3").strip()
    try:
        n = int(raw)
    except ValueError:
        n = 3
    return max(1, n)


def _clawql_infer_task_kind(messages) -> str:
    \"\"\"Heuristic task kind from the user prompt.

    Priority when signals conflict: frequency > timeline > comparison >
    single_answer > enumeration. Prefer single_answer over enumeration when
    only those two fire — Wonder-verifying a wrong list is expensive (task 008).
    \"\"\"
    import os
    import re

    forced = os.environ.get("CLAWQL_LAB_TASK_KIND", "").strip().lower()
    if forced in {{
        "enumeration",
        "single_answer",
        "frequency",
        "comparison",
        "timeline",
        "other",
    }}:
        return forced

    blob = " ".join(_clawql_message_text(m) for m in (messages or [])).lower()
    freq_hits = len(
        re.findall(
            r"\\b(how often|what share|what percentage|how many of|in how many|"
            r"what fraction|how frequently|what proportion|market practice)\\b|"
            r"\\bacross\\b",
            blob,
        )
    )
    timeline_hits = len(
        re.findall(r"\\b(when did|chronological|over time|timeline)\\b", blob)
    )
    comparison_hits = len(
        re.findall(r"\\b(compare|which is larger|rank|versus)\\b|\\bvs\\b", blob)
    )
    enum_hits = len(
        re.findall(
            r"\\b(every|enumerate|enumeration|all matters|list (all|every)|"
            r"which matters|each matter|set of matters|find all)\\b",
            blob,
        )
    )
    single_hits = len(
        re.findall(
            r"\\b(most recent|latest|first|what's our|what is our|"
            r"which matter|identify the|model (filing|document)|single)\\b",
            blob,
        )
    )
    if freq_hits > 0:
        return "frequency"
    if timeline_hits > 0:
        return "timeline"
    if comparison_hits > 0:
        return "comparison"
    if enum_hits > single_hits and enum_hits > 0:
        return "enumeration"
    if single_hits > 0:
        return "single_answer"
    return "single_answer"


_CLAWQL_DELIVERABLE_NUDGE = (
    "STOP — your answer is not graded yet.\\n\\n"
    "The judge only reads files under `/workspace/output/`. "
    "You have not written a deliverable there.\\n\\n"
    "Use the `write` tool NOW to create a markdown file under "
    "`/workspace/output/` (e.g. `matters-enumeration.md` or `response.md`). "
    "Attempt EVERY rubric criterion with the best evidence you have. "
    "Partial answers that cover all criteria score higher than empty output "
    "or a single guessed matter. If the answer is zero / none / 0 of N after "
    "a complete search, write that — it scores full marks when correct. "
    "Cite document paths under "
    "`/workspace/documents/matters/<matter-id>/...` when available.\\n\\n"
    "Do not reply with chat text only."
)

_CLAWQL_CEILING_FORCE_NUDGE = (
    "TURN CEILING — write your deliverable NOW.\\n\\n"
    "You are approaching the turn limit and `/workspace/output/` still has "
    "no files. Write your best answer with whatever you have found, including "
    "if the answer is zero or none. An empty deliverable scores 0%. A correct "
    "'none found' / '0 of N' answer scores full marks.\\n\\n"
    "Use the `write` tool under `/workspace/output/` immediately. Do not keep "
    "searching for positive hits after you have covered the relevant corpus."
)

_CLAWQL_REQUIRE_RECALL_NUDGE = (
    "Begin by using `clawql_memory_recall` to search the matter vault for "
    "relevant entities. The vault contains indexed matter records that are "
    "faster and more complete than bash/grep over raw files. After recall "
    "(even if empty — empty is information), you may use targeted bash/grep "
    "to verify, then `write` your deliverable under `/workspace/output/`."
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

_CLAWQL_GROUNDING_WONDER_FREQUENCY = (
    "WONDER (frequency / survey grounding) — corpus coverage is the stop "
    "condition, not verifying a positive hit list.\\n\\n"
    "(1) Did you search the complete corpus (or the full filtered subset the "
    "prompt defines)?\\n"
    "(2) If you found zero matches after covering that set, **0 of N / none** "
    "is a complete answer — do not keep hunting for positive evidence.\\n"
    "(3) Confirm any ontology / matter flags in the prompt appear in evidence "
    "(do not invent flags).\\n"
    "(4) If the count or share is wrong, `write` an updated deliverable, then "
    "stop. One Wonder pass only."
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
                    if _kind == "enumeration":
                        _wonder = _CLAWQL_GROUNDING_WONDER_ENUM
                    elif _kind == "frequency":
                        _wonder = _CLAWQL_GROUNDING_WONDER_FREQUENCY
                    else:
                        _wonder = _CLAWQL_GROUNDING_WONDER_SINGLE
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

CEILING_BLOCK = f"""            {CEILING_BEGIN}
            # Force-write before turn ceiling when still no deliverable (task 018).
            _clawql_ceiling_on = (
                os.environ.get("CLAWQL_LAB_DELIVERABLE_GUARD", "1") != "0"
                and bool(os.environ.get("CLAWQL_LAB_OUTPUT_DIR", "").strip())
            )
            if (
                _clawql_ceiling_on
                and not _clawql_nudge_state.get("ceiling", False)
                and turn_count >= max(1, max_turns - _clawql_ceiling_lead_turns())
                and not _clawql_output_has_files()
            ):
                _clawql_nudge_state["ceiling"] = True
                print(
                    f"ClawQL turn-ceiling force-write: turn {{turn_count}}/{{max_turns}} "
                    "with empty /workspace/output/"
                )
                messages.append(
                    adapter.make_user_message(_CLAWQL_CEILING_FORCE_NUDGE)
                )
            {CEILING_END}
"""

RECALL_BLOCK = f"""            {RECALL_BEGIN}
            # Steer ClawQL arm toward memory_recall before bash-only hunting.
            if (
                os.environ.get("CLAWQL_LAB_REQUIRE_RECALL", "1") != "0"
                and not _clawql_nudge_state.get("recall", False)
                and turn_count == 1
            ):
                _clawql_nudge_state["recall"] = True
                print("ClawQL require-recall: nudging clawql_memory_recall before bash/grep")
                messages.append(
                    adapter.make_user_message(_CLAWQL_REQUIRE_RECALL_NUDGE)
                )
            {RECALL_END}
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
    _clawql_nudge_state = {{
        "nudged": False,
        "grounded": False,
        "ceiling": False,
        "recall": False,
    }}
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

    # Turn-ceiling + require-recall: inject at start of each turn (before chat).
    turn_anchor = "            turn_count = turn + 1\n            response = adapter.chat(messages, tools)\n"
    turn_patched = (
        "            turn_count = turn + 1\n"
        + RECALL_BLOCK
        + "\n"
        + CEILING_BLOCK
        + "\n"
        + "            response = adapter.chat(messages, tools)\n"
    )
    if CEILING_BEGIN in text:
        text = _replace_marked_block(text, CEILING_BEGIN, CEILING_END, CEILING_BLOCK)
    if RECALL_BEGIN in text:
        text = _replace_marked_block(text, RECALL_BEGIN, RECALL_END, RECALL_BLOCK)
    if CEILING_BEGIN not in text or RECALL_BEGIN not in text:
        if turn_anchor not in text:
            # Tolerate already-split chat line after a partial prior patch.
            alt = "            turn_count = turn + 1\n"
            chat = "            response = adapter.chat(messages, tools)\n"
            if alt in text and chat in text and CEILING_BEGIN not in text:
                text = text.replace(
                    alt,
                    alt + RECALL_BLOCK + "\n" + CEILING_BLOCK + "\n",
                    1,
                )
            elif turn_anchor not in text and CEILING_BEGIN not in text:
                raise SystemExit(
                    "agent_loop.py turn_count/chat anchor not found for ceiling patch"
                )
        else:
            text = text.replace(turn_anchor, turn_patched, 1)

    if text != original:
        agent_loop_path.write_text(text, encoding="utf-8")
        print(
            f"patched {agent_loop_path} "
            "(deliverable guard + ceiling force-write + require-recall + "
            "truncation + kind-gated Wonder incl. frequency)"
        )
    else:
        print(f"no changes needed for {agent_loop_path} (deliverable guard)")
