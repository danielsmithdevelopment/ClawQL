"""Unit tests for OpenRouter model mapping (Anthropic + Nemotron Arm C)."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

INTEGRATION = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(INTEGRATION / "harness" / "adapters"))

from clawql_openrouter import (  # noqa: E402
    openrouter_max_tokens,
    resolve_openrouter_chat_model,
    resolve_openrouter_model,
    should_use_openrouter_chat_judge,
)
from clawql_lab_session import is_clawql_lab_adapter  # noqa: E402


class OpenRouterMappingTests(unittest.TestCase):
    def test_opus_48_maps(self) -> None:
        self.assertEqual(
            resolve_openrouter_model("claude-opus-4-8"),
            "anthropic/claude-opus-4.8",
        )

    def test_openrouter_max_tokens_cap(self) -> None:
        prev_use = os.environ.get("CLAWQL_LAB_USE_OPENROUTER")
        prev_key = os.environ.get("OPENROUTER_API_KEY")
        prev_cap = os.environ.get("CLAWQL_LAB_OPENROUTER_MAX_TOKENS")
        os.environ["CLAWQL_LAB_USE_OPENROUTER"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        os.environ["CLAWQL_LAB_OPENROUTER_MAX_TOKENS"] = "32768"
        try:
            self.assertEqual(openrouter_max_tokens(128000), 32768)
            self.assertEqual(openrouter_max_tokens(16000), 16000)
        finally:
            for key, val in (
                ("CLAWQL_LAB_USE_OPENROUTER", prev_use),
                ("OPENROUTER_API_KEY", prev_key),
                ("CLAWQL_LAB_OPENROUTER_MAX_TOKENS", prev_cap),
            ):
                if val is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = val
        # Direct Anthropic path: no cap
        os.environ.pop("CLAWQL_LAB_USE_OPENROUTER", None)
        os.environ.pop("OPENROUTER_API_KEY", None)
        self.assertEqual(openrouter_max_tokens(128000), 128000)

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

    def test_chat_judge_routing(self) -> None:
        self.assertFalse(should_use_openrouter_chat_judge("claude-sonnet-4-6"))
        self.assertTrue(should_use_openrouter_chat_judge("openai/gpt-5.4-mini"))
        self.assertTrue(
            should_use_openrouter_chat_judge("nvidia/nemotron-3.5-lightning:free")
        )
        prev = os.environ.get("CLAWQL_LAB_JUDGE_VIA_OPENROUTER")
        os.environ["CLAWQL_LAB_JUDGE_VIA_OPENROUTER"] = "1"
        try:
            # Env forces OpenRouter path even for Claude short ids.
            self.assertTrue(should_use_openrouter_chat_judge("claude-sonnet-4-6"))
        finally:
            if prev is None:
                os.environ.pop("CLAWQL_LAB_JUDGE_VIA_OPENROUTER", None)
            else:
                os.environ["CLAWQL_LAB_JUDGE_VIA_OPENROUTER"] = prev


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
