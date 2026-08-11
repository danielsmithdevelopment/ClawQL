"""ClawQL adapter for Harvey LAB (Anthropic / OpenRouter Anthropic path).

Extends the standard Anthropic adapter with task-scoped vault pre-ingest,
ClawQL MCP tools, and post-task cleanup.

Model IDs: ``clawql/claude-sonnet-4-6``, ``clawql/claude-opus-4-8``.
Requires a running ClawQL MCP HTTP server (see scripts/start-clawql-for-lab.sh).

For Nemotron / OpenAI-compatible models use ``clawql-cc/...``
(see ``clawql_chat.py``).
"""

from __future__ import annotations

from pathlib import Path

from harness.adapters.anthropic import AnthropicAdapter
from harness.adapters.base import ModelResponse
from harness.adapters.clawql_lab_session import ClawQLLabSession
from harness.adapters.clawql_openrouter import (
    make_anthropic_client,
    maybe_rewrite_model,
)


class ClawQLAdapter(AnthropicAdapter):
    """Anthropic adapter + ClawQL MCP tools and vault lifecycle hooks."""

    def __init__(
        self,
        model: str,
        task_id: str,
        documents_dir: Path,
        temperature: float = 0.0,
        reasoning_effort: str | None = None,
        arm: str = "clawql",
    ):
        super().__init__(
            model=maybe_rewrite_model(model),
            temperature=temperature,
            reasoning_effort=reasoning_effort,
        )
        self.client = make_anthropic_client()
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
