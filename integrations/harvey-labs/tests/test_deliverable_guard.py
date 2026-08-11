"""Unit tests for ClawQL deliverable-guard agent_loop patch."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

INTEGRATION = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(INTEGRATION / "harness"))

from clawql_agent_loop import (  # noqa: E402
    FINISH_BEGIN,
    HELPER_BEGIN,
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
            for tc in response.tool_calls:
                tool_executor.execute(tc.name, tc.arguments)
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
            self.assertIn("_clawql_output_has_files", once)
            self.assertIn("import os", once)
            patch_agent_loop_deliverable_guard(path)
            twice = path.read_text(encoding="utf-8")
            self.assertEqual(once.count(HELPER_BEGIN), 1)
            self.assertEqual(twice.count(HELPER_BEGIN), 1)
            self.assertEqual(twice.count(FINISH_BEGIN), 1)


if __name__ == "__main__":
    unittest.main()
