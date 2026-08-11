"""OpenRouter Chat Completions judge for Harvey LAB (Arm C without Anthropic).

Harvey's stock ``Judge`` routes Claude via Anthropic Messages and GPT via the
OpenAI Responses API. Arm C (Nemotron) only needs ``OPENROUTER_API_KEY``; this
judge uses OpenRouter's OpenAI-compatible Chat Completions endpoint so scoring
works before Anthropic credentials are available.

Not a substitute for the publishable Sonnet judge on Opus A/B — re-judge with
``claude-sonnet-4-6`` once ``ANTHROPIC_API_KEY`` (or Claude-on-OpenRouter) works.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from harness.adapters.clawql_openrouter import (
    make_openrouter_openai_client,
    resolve_openrouter_chat_model,
)

PROMPTS_DIR = Path(__file__).parent / "prompts"

_VERDICT_SCHEMA_HINT = (
    'Respond with a single JSON object only, no markdown fences, of the form '
    '{"verdict":"pass"|"fail","reasoning":"..."}.'
)


class OpenRouterChatJudge:
    """Drop-in judge for OpenRouter chat models (Nemotron, GPT, etc.)."""

    def __init__(self, model: str = "openai/gpt-4o-mini"):
        self.model = resolve_openrouter_chat_model(model)
        self.provider = "openrouter"
        self.client = make_openrouter_openai_client()

    def evaluate(
        self,
        prompt_template: str,
        variables: dict,
        temperature: float = 0.0,
        _retries: int = 2,
    ) -> dict:
        prompt = prompt_template.format(**variables)
        return self._evaluate_chat(prompt, temperature, _retries)

    def evaluate_from_file(self, prompt_name: str, variables: dict) -> dict:
        path = PROMPTS_DIR / f"{prompt_name}.txt"
        template = path.read_text(encoding="utf-8")
        return self.evaluate(prompt_template=template, variables=variables)

    def _evaluate_chat(self, prompt: str, temperature: float, _retries: int) -> dict:
        last_err: Exception | None = None
        user_content = f"{prompt}\n\n{_VERDICT_SCHEMA_HINT}"
        for attempt in range(_retries):
            kwargs: dict = {
                "model": self.model,
                "messages": [{"role": "user", "content": user_content}],
                "temperature": temperature,
                "max_tokens": 4096,
            }
            if attempt < _retries - 1:
                kwargs["response_format"] = {"type": "json_object"}
            try:
                response = self.client.chat.completions.create(**kwargs)
            except Exception as e:  # noqa: BLE001 — retry then surface
                last_err = e
                continue
            text = (response.choices[0].message.content or "") if response.choices else ""
            try:
                return self._parse_json(text)
            except (ValueError, json.JSONDecodeError) as e:
                last_err = e
        raise ValueError(
            f"OpenRouter judge returned unparseable response after {_retries} "
            f"attempts: {last_err}"
        )

    @staticmethod
    def _parse_json(text: str) -> dict:
        match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except json.JSONDecodeError:
                pass
        for i, ch in enumerate(text):
            if ch == "{":
                depth = 0
                for j in range(i, len(text)):
                    if text[j] == "{":
                        depth += 1
                    elif text[j] == "}":
                        depth -= 1
                        if depth == 0:
                            return json.loads(text[i : j + 1])
        raise ValueError(f"No JSON found in judge response: {text[:200]}")
