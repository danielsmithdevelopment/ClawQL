"""ClawQL chat-completions adapter for Harvey LAB (OpenRouter / Nemotron).

Nemotron 3.5 Lightning and other OpenAI-compatible models cannot use the
Anthropic Messages API. This adapter speaks Chat Completions via OpenRouter
while sharing the same vault pre-ingest / MCP tools / cleanup as ClawQLAdapter.

Model IDs: ``clawql-cc/nvidia/nemotron-3.5-lightning`` (or ``:free``).
"""

from __future__ import annotations

import random
import time
from pathlib import Path

import openai

from harness.adapters.base import ModelAdapter, ModelResponse, ToolCall
from harness.adapters.clawql_lab_session import ClawQLLabSession
from harness.adapters.clawql_openrouter import (
    make_openrouter_openai_client,
    resolve_openrouter_chat_model,
)

_MAX_RETRIES = 5


class ClawQLChatAdapter(ModelAdapter):
    """OpenRouter chat-completions + ClawQL vault/MCP lifecycle."""

    def __init__(
        self,
        model: str,
        task_id: str,
        documents_dir: Path,
        temperature: float = 0.0,
        max_tokens: int = 128000,
        reasoning_effort: str | None = None,
        arm: str = "nemotron-clawql",
    ):
        resolved = resolve_openrouter_chat_model(model)
        super().__init__(resolved, temperature, reasoning_effort)
        self.max_tokens = max_tokens
        self.task_id = task_id
        self.documents_dir = Path(documents_dir)
        self.arm = arm
        self.client = make_openrouter_openai_client()
        self._lab = ClawQLLabSession(
            task_id=task_id,
            documents_dir=documents_dir,
            model=self.model,
            arm=arm,
        )
        self.vault_path = self._lab.vault_path

    def pre_task_setup(self) -> None:
        self._lab.pre_task_setup()

    def post_task_cleanup(self) -> None:
        self._lab.post_task_cleanup()

    def system_prompt_extension(self) -> str:
        return self._lab.system_prompt_extension()

    def clawql_tool_definitions(self) -> list[dict]:
        return self._lab.clawql_tool_definitions()

    def execute_clawql_tool(self, tool_name: str, arguments: str | dict) -> str:
        return self._lab.execute_clawql_tool(tool_name, arguments)

    def chat(self, messages: list[dict], tools: list[dict]) -> ModelResponse:
        merged = self._lab.merge_tools(tools)
        kwargs: dict = dict(
            model=self.model,
            messages=messages,
            tools=[self._translate_tool(t) for t in merged],
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
