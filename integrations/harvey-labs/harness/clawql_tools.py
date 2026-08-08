"""ToolExecutor wrapper that routes clawql_* tools to the ClawQL adapter."""

from __future__ import annotations

from harness.adapters.clawql import ClawQLAdapter, _TOOL_NAME_TO_MCP
from harness.tools import ToolExecutor


class ClawQLToolExecutor(ToolExecutor):
    """Sandbox tools + ClawQL MCP tools."""

    def __init__(self, clawql_adapter: ClawQLAdapter, **kwargs):
        super().__init__(**kwargs)
        self.clawql_adapter = clawql_adapter
        self.clawql_calls: int = 0

    def execute(self, tool_name: str, arguments: str | dict) -> str:
        if tool_name in _TOOL_NAME_TO_MCP or tool_name.startswith("clawql_"):
            self.clawql_calls += 1
            return self.clawql_adapter.execute_clawql_tool(tool_name, arguments)
        return super().execute(tool_name, arguments)

    def get_metrics(self) -> dict:
        metrics = super().get_metrics()
        metrics["clawql_calls"] = self.clawql_calls
        return metrics
