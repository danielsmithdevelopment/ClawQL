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
    FINISH_BEGIN,
    HELPER_BEGIN,
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
            self.assertIn("_clawql_output_has_files", once)
            self.assertIn("_clawql_truncate_tool_result", once)
            self.assertIn("import os", once)
            patch_agent_loop_deliverable_guard(path)
            twice = path.read_text(encoding="utf-8")
            self.assertEqual(once.count(HELPER_BEGIN), 1)
            self.assertEqual(twice.count(HELPER_BEGIN), 1)
            self.assertEqual(twice.count(FINISH_BEGIN), 1)
            self.assertEqual(twice.count(TRUNC_BEGIN), 1)

    def test_truncate_helper_caps_ls_r_dump(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "agent_loop.py"
            path.write_text(STOCK_LOOP, encoding="utf-8")
            patch_agent_loop_deliverable_guard(path)
            text = path.read_text(encoding="utf-8")
            self.assertIn("def _clawql_truncate_tool_result", text)
            # Extract helpers only (avoid importing harvey-labs harness package).
            begin = text.index("def _clawql_output_has_files")
            end = text.index("def run_agent")
            ns: dict = {"__name__": "clawql_helpers"}
            exec(text[begin:end], ns)
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
