"""Harvey LAB ClawQL session — delegates all MCP I/O to Node (lab-mcp-proxy.mjs)."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

_CFG = json.loads(
    (Path(__file__).with_name("clawql_tools.json")).read_text(encoding="utf-8")
)
CLAWQL_TOOL_SPECS: list[dict[str, Any]] = _CFG["tools"]
_TOOL_NAME_TO_MCP: dict[str, str] = _CFG["mcp_map"]


def _node_proxy() -> list[str]:
    script = os.environ.get("CLAWQL_LAB_MCP_PROXY", "").strip()
    if not script:
        script = str(
            Path(__file__).resolve().parents[2] / "scripts" / "lab-mcp-proxy.mjs"
        )
    return ["node", script]


def is_clawql_lab_adapter(adapter: Any) -> bool:
    return getattr(adapter, "__class__", type(None)).__name__ in {
        "ClawQLAdapter",
        "ClawQLChatAdapter",
    }


class ClawQLLabSession:
    """Tool definitions for Harvey + subprocess to Node MCP proxy."""

    def __init__(
        self,
        task_id: str,
        documents_dir: Path,
        model: str,
        arm: str = "clawql",
    ):
        self.task_id = task_id
        self.documents_dir = Path(documents_dir)
        self.model = model
        self.arm = arm
        os.environ.setdefault("CLAWQL_LAB_TASK_ID", task_id)
        os.environ.setdefault("CLAWQL_LAB_ARM", arm)
        os.environ.setdefault("CLAWQL_LAB_MODEL", model)
        self.vault_path = Path(
            os.environ.get("CLAWQL_OBSIDIAN_VAULT_PATH", "")
        ).expanduser()

    def pre_task_setup(self) -> None:
        subprocess.run(
            _node_proxy() + ["--audit-start"],
            check=False,
            env=os.environ,
        )

    def post_task_cleanup(self) -> None:
        return

    def system_prompt_extension(self) -> str:
        path = Path(__file__).with_name("clawql_system_prompt.md")
        if path.exists():
            return "\n\n" + path.read_text(encoding="utf-8")
        return ""

    def clawql_tool_definitions(self) -> list[dict]:
        return list(CLAWQL_TOOL_SPECS)

    def merge_tools(self, tools: list[dict]) -> list[dict]:
        merged = list(tools) + self.clawql_tool_definitions()
        seen: set[str] = set()
        out: list[dict] = []
        for t in merged:
            name = t.get("name")
            if not name or name in seen:
                continue
            seen.add(name)
            out.append(t)
        return out

    def execute_clawql_tool(self, tool_name: str, arguments: str | dict) -> str:
        if isinstance(arguments, str):
            try:
                payload = json.loads(arguments) if arguments.strip() else {}
            except json.JSONDecodeError:
                return f"Error: invalid JSON arguments: {arguments}"
        else:
            payload = dict(arguments or {})
        proc = subprocess.run(
            _node_proxy() + [tool_name],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            env=os.environ,
        )
        if proc.stdout:
            return proc.stdout
        return proc.stderr or f"Error: lab-mcp-proxy exit {proc.returncode}"
