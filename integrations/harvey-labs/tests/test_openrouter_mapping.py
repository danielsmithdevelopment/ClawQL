"""Unit tests for OpenRouter model mapping (Anthropic + Nemotron Arm C)."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

INTEGRATION = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(INTEGRATION / "harness" / "adapters"))

from clawql_openrouter import (  # noqa: E402
    resolve_openrouter_chat_model,
    resolve_openrouter_model,
)
from clawql_lab_session import is_clawql_lab_adapter  # noqa: E402


class OpenRouterMappingTests(unittest.TestCase):
    def test_opus_48_maps(self) -> None:
        self.assertEqual(
            resolve_openrouter_model("claude-opus-4-8"),
            "anthropic/claude-opus-4.8",
        )

    def test_nemotron_aliases(self) -> None:
        self.assertEqual(
            resolve_openrouter_chat_model("nvidia/nemotron-3.5-lightning"),
            "nvidia/nemotron-3.5-lightning:free",
        )
        self.assertEqual(
            resolve_openrouter_chat_model("nemotron-3.5-lightning"),
            "nvidia/nemotron-3.5-lightning:free",
        )

    def test_nemotron_env_override(self) -> None:
        prev = os.environ.get("CLAWQL_LAB_NEMOTRON_MODEL")
        os.environ["CLAWQL_LAB_NEMOTRON_MODEL"] = "nvidia/nemotron-3.5-lightning"
        try:
            self.assertEqual(
                resolve_openrouter_chat_model("nemotron"),
                "nvidia/nemotron-3.5-lightning",
            )
        finally:
            if prev is None:
                os.environ.pop("CLAWQL_LAB_NEMOTRON_MODEL", None)
            else:
                os.environ["CLAWQL_LAB_NEMOTRON_MODEL"] = prev


class AdapterDetectTests(unittest.TestCase):
    def test_is_clawql_lab_adapter_by_class_name(self) -> None:
        class ClawQLAdapter:
            pass

        class ClawQLChatAdapter:
            pass

        class Other:
            pass

        self.assertTrue(is_clawql_lab_adapter(ClawQLAdapter()))
        self.assertTrue(is_clawql_lab_adapter(ClawQLChatAdapter()))
        self.assertFalse(is_clawql_lab_adapter(Other()))


if __name__ == "__main__":
    unittest.main()
