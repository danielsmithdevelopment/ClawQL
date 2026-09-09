"""ToolExecutor wrapper that routes clawql_* tools to the ClawQL LAB session."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Protocol

from harness.adapters.clawql_lab_session import _TOOL_NAME_TO_MCP
from harness.tools import ToolExecutor

_WRITE_NUDGE = (
    "\n\n[ClawQL LAB] NEXT REQUIRED ACTION: call harness `write` with path "
    "`/workspace/output/response.md` using these results (matter ids, client names, "
    "proof docs). If the ask is frequency/rate/share: state **k of N (~p%)** and list "
    "**every** id in N (query the full population first if you only have the subset). "
    "Do not run more ls/find/bash exploration until that file exists."
)

_MISSING_FILE_NUDGE = (
    "\n\n[ClawQL LAB] `/workspace/output/response.md` is still missing. "
    "Write it NOW from the best evidence you have — partial credit beats empty output."
)


class _ClawQLToolHost(Protocol):
    def execute_clawql_tool(self, tool_name: str, arguments: str | dict) -> str: ...


def _response_md_missing() -> bool:
    out = os.environ.get("CLAWQL_LAB_OUTPUT_DIR", "").strip()
    if not out:
        # Harness sandbox path used by Harvey LAB
        return not Path("/workspace/output/response.md").exists()
    return not (Path(out) / "response.md").exists()


def _sql_returned_rows(payload: str) -> bool:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return '"ok": true' in payload or '"ok":true' in payload
    if not isinstance(data, dict) or data.get("ok") is not True:
        return False
    rows = data.get("rows")
    if isinstance(rows, list) and len(rows) > 0:
        return True
    # Some engines use rowCount / data
    if isinstance(data.get("rowCount"), int) and data["rowCount"] > 0:
        return True
    result_rows = data.get("result")
    if isinstance(result_rows, list) and len(result_rows) > 0:
        return True
    return False


class ClawQLToolExecutor(ToolExecutor):
    """Sandbox tools + ClawQL MCP tools."""

    def __init__(self, clawql_adapter: _ClawQLToolHost, **kwargs: Any):
        super().__init__(**kwargs)
        self.clawql_adapter = clawql_adapter
        self.clawql_calls: int = 0
        self._sql_successes: int = 0

    def execute(self, tool_name: str, arguments: str | dict) -> str:
        if tool_name in _TOOL_NAME_TO_MCP or tool_name.startswith("clawql_"):
            self.clawql_calls += 1
            result = self.clawql_adapter.execute_clawql_tool(tool_name, arguments)
            if tool_name in {"clawql_sql", "clawql_duckdb_query"} and _sql_returned_rows(result):
                self._sql_successes += 1
                if _response_md_missing():
                    return result + _WRITE_NUDGE
            elif self.clawql_calls >= 2 and _response_md_missing():
                return result + _MISSING_FILE_NUDGE
            return result
        return super().execute(tool_name, arguments)

    def get_metrics(self) -> dict:
        metrics = super().get_metrics()
        metrics["clawql_calls"] = self.clawql_calls
        metrics["clawql_sql_successes"] = self._sql_successes
        return metrics
