"""OpenRouter chat-completions adapter for Harvey LAB (no ClawQL).

Used for the Nemotron **baseline** arm (same model as Arm C, without vault/MCP).
Model IDs: ``openrouter/nvidia/nemotron-3.5-lightning`` (or ``:free``).
"""

from __future__ import annotations

import random
import time

import openai

from harness.adapters.base import ModelAdapter, ModelResponse, ToolCall
from harness.adapters.clawql_openrouter import (
    make_openrouter_openai_client,
    resolve_openrouter_chat_model,
)

_MAX_RETRIES = 5


class OpenRouterChatAdapter(ModelAdapter):
    """Plain OpenRouter Chat Completions — six harness tools only."""

    def __init__(
        self,
        model: str,
        temperature: float = 0.0,
        max_tokens: int = 128000,
        reasoning_effort: str | None = None,
    ):
        resolved = resolve_openrouter_chat_model(model)
        super().__init__(resolved, temperature, reasoning_effort)
        self.max_tokens = max_tokens
        self.client = make_openrouter_openai_client()

    def chat(self, messages: list[dict], tools: list[dict]) -> ModelResponse:
        kwargs: dict = dict(
            model=self.model,
            messages=messages,
            tools=[self._translate_tool(t) for t in tools],
            max_tokens=self.max_tokens,
        )
        if self.reasoning_effort and self.reasoning_effort.lower() != "none":
            kwargs["extra_body"] = {
                "chat_template_kwargs": {"enable_thinking": True}
            }
        else:
            kwargs["temperature"] = self.temperature

        response = None
        for attempt in range(_MAX_RETRIES):
            try:
                response = self.client.chat.completions.create(**kwargs)
                break
            except (
                openai.RateLimitError,
                openai.APITimeoutError,
                openai.InternalServerError,
            ):
                if attempt == _MAX_RETRIES - 1:
                    raise
                time.sleep(min(30, 2**attempt) + random.uniform(0, 1))

        assert response is not None
        message_obj = response.choices[0].message
        message = message_obj.model_dump(exclude_none=True)
        tool_calls = [
            ToolCall(
                id=tc.id,
                name=tc.function.name,
                arguments=tc.function.arguments or "{}",
            )
            for tc in (message_obj.tool_calls or [])
        ]
        usage = response.usage
        return ModelResponse(
            message=message,
            tool_calls=tool_calls,
            text=message_obj.content or "",
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
        )

    def make_tool_result_messages(self, results: list[tuple[str, str]]) -> list[dict]:
        return [
            {
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": result,
            }
            for tool_call_id, result in results
        ]

    def make_system_message(self, content: str) -> dict:
        return {"role": "system", "content": content}

    def make_user_message(self, content: str) -> dict:
        return {"role": "user", "content": content}

    def _translate_tool(self, tool: dict) -> dict:
        return {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["parameters"],
            },
        }
