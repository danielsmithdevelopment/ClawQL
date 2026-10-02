"""ClawQL chat-completions adapter for Harvey LAB (OpenRouter / Nemotron).

Nemotron 3.5 Lightning and other OpenAI-compatible models cannot use the
Anthropic Messages API. This adapter speaks Chat Completions via OpenRouter
while sharing the same vault pre-ingest / MCP tools / cleanup as ClawQLAdapter.

Model IDs: ``clawql-cc/nvidia/nemotron-3.5-lightning`` (or ``:free``).
"""

from __future__ import annotations

from pathlib import Path

from harness.adapters.base import ModelResponse
from harness.adapters.clawql_lab_session import ClawQLLabSession
from harness.adapters.openrouter_chat import OpenRouterChatAdapter


class ClawQLChatAdapter(OpenRouterChatAdapter):
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
        super().__init__(
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            reasoning_effort=reasoning_effort,
        )
        self.task_id = task_id
        self.documents_dir = Path(documents_dir)
        self.arm = arm
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
        return super().chat(messages, self._lab.merge_tools(tools))
