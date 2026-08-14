"""Unit tests for ClawQL deliverable-guard + tool-result truncation patches."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

INTEGRATION = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(INTEGRATION / "harness"))

from clawql_agent_loop import (  # noqa: E402
    CEILING_BEGIN,
    FINISH_BEGIN,
    HELPER_BEGIN,
    RECALL_BEGIN,
    TRUNC_BEGIN,
    patch_agent_loop_deliverable_guard,
)

STOCK_LOOP = '''import time
import json
from pathlib import Path

from harness.adapters.base import ModelAdapter, ModelResponse
from harness.tools import ToolExecutor, get_all_tool_definitions


def run_agent(
    adapter: ModelAdapter,
    system_prompt: str,
    user_prompt: str,
    tool_executor: ToolExecutor,
    tools: list[dict] | None = None,
    max_turns: int = 200,
    transcript_path: str | None = None,
) -> dict:
    messages = []
    turn_count = 0
    response = None
    total_input_tokens = 0
    try:
        for turn in range(max_turns):
            turn_count = turn + 1
            response = adapter.chat(messages, tools)
            messages.append(response.message)
            # If no tool calls, the agent is done
            if not response.tool_calls:
                break
            tool_results = []
            for tc in response.tool_calls:
                result = tool_executor.execute(tc.name, tc.arguments)

                if transcript_file:
                    _log_tool(transcript_file, turn_count, tc.name, tc.arguments, result)

                tool_results.append((tc, result))
    finally:
        pass
    return {"turn_count": turn_count}
'''


def _exec_helpers(patched_text: str) -> dict:
    begin = patched_text.index("def _clawql_output_has_files")
    end = patched_text.index("def run_agent")
    ns: dict = {"__name__": "clawql_helpers"}
    exec(patched_text[begin:end], ns)
    return ns


class DeliverableGuardPatchTests(unittest.TestCase):
    def test_patch_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "agent_loop.py"
            path.write_text(STOCK_LOOP, encoding="utf-8")
            patch_agent_loop_deliverable_guard(path)
            once = path.read_text(encoding="utf-8")
            self.assertIn(HELPER_BEGIN, once)
            self.assertIn(FINISH_BEGIN, once)
            self.assertIn(TRUNC_BEGIN, once)
            self.assertIn(CEILING_BEGIN, once)
            self.assertIn(RECALL_BEGIN, once)
            self.assertIn("_clawql_output_has_files", once)
            self.assertIn("_clawql_truncate_tool_result", once)
            self.assertIn("_CLAWQL_GROUNDING_WONDER_SINGLE", once)
            self.assertIn("_CLAWQL_GROUNDING_WONDER_ENUM", once)
            self.assertIn("_CLAWQL_GROUNDING_WONDER_FREQUENCY", once)
            self.assertIn("_CLAWQL_CEILING_FORCE_NUDGE", once)
            self.assertIn("_CLAWQL_REQUIRE_RECALL_NUDGE", once)
            self.assertIn("_clawql_infer_task_kind", once)
            self.assertIn("grounded", once)
            self.assertIn("ceiling", once)
            self.assertIn("recall", once)
            self.assertIn("import os", once)
            patch_agent_loop_deliverable_guard(path)
            twice = path.read_text(encoding="utf-8")
            self.assertEqual(once.count(HELPER_BEGIN), 1)
            self.assertEqual(twice.count(HELPER_BEGIN), 1)
            self.assertEqual(twice.count(FINISH_BEGIN), 1)
            self.assertEqual(twice.count(TRUNC_BEGIN), 1)
            self.assertEqual(twice.count(CEILING_BEGIN), 1)
            self.assertEqual(twice.count(RECALL_BEGIN), 1)
            self.assertEqual(twice.count("def _clawql_truncate_tool_result"), 1)
            self.assertEqual(twice.count("_CLAWQL_GROUNDING_WONDER_SINGLE ="), 1)
            self.assertEqual(twice.count("_CLAWQL_GROUNDING_WONDER_FREQUENCY ="), 1)
            self.assertIn("CLAWQL_LAB_GROUNDING_WONDER", twice)
            self.assertIn("CLAWQL_LAB_REQUIRE_RECALL", twice)
            self.assertIn("CLAWQL_LAB_CEILING_LEAD_TURNS", twice)

    def test_infer_task_kind_prefers_single_answer_for_filing_prompt(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "agent_loop.py"
            path.write_text(STOCK_LOOP, encoding="utf-8")
            patch_agent_loop_deliverable_guard(path)
            ns = _exec_helpers(path.read_text(encoding="utf-8"))
            filing = [
                {
                    "role": "user",
                    "content": (
                        "what's our most recent antitrust & competition matter "
                        "where we made an HSR filing?"
                    ),
                }
            ]
            self.assertEqual(ns["_clawql_infer_task_kind"](filing), "single_answer")
            enum = [
                {
                    "role": "user",
                    "content": "Enumerate every matter that received an HSR second request.",
                }
            ]
            self.assertEqual(ns["_clawql_infer_task_kind"](enum), "enumeration")

    def test_infer_task_kind_frequency_for_springing_lien_style_prompt(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "agent_loop.py"
            path.write_text(STOCK_LOOP, encoding="utf-8")
            patch_agent_loop_deliverable_guard(path)
            ns = _exec_helpers(path.read_text(encoding="utf-8"))
            freq = [
                {
                    "role": "user",
                    "content": (
                        "Across our Banking & Finance credit facilities, how often "
                        "do springing liens appear? What share of matters include one?"
                    ),
                }
            ]
            self.assertEqual(ns["_clawql_infer_task_kind"](freq), "frequency")
            os.environ["CLAWQL_LAB_TASK_KIND"] = "frequency"
            try:
                self.assertEqual(ns["_clawql_infer_task_kind"]([]), "frequency")
            finally:
                os.environ.pop("CLAWQL_LAB_TASK_KIND", None)

    def test_truncate_helper_caps_ls_r_dump(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "agent_loop.py"
            path.write_text(STOCK_LOOP, encoding="utf-8")
            patch_agent_loop_deliverable_guard(path)
            text = path.read_text(encoding="utf-8")
            self.assertIn("def _clawql_truncate_tool_result", text)
            ns = _exec_helpers(text)
            os.environ["CLAWQL_LAB_MAX_TOOL_RESULT_CHARS"] = "4000"
            huge = "matter-id\n" * 50000
            out = ns["_clawql_truncate_tool_result"]("bash", huge)
            self.assertLessEqual(len(out), 4300)
            self.assertIn("ClawQL truncated tool result", out)
            self.assertIn("bash", out)
            # Floor is 4000 chars — values below that are raised.
            os.environ["CLAWQL_LAB_MAX_TOOL_RESULT_CHARS"] = "100"
            self.assertEqual(ns["_clawql_max_tool_result_chars"](), 4000)


if __name__ == "__main__":
    unittest.main()
