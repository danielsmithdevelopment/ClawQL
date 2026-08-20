"""Thin MCP HTTP proxy for Harvey LAB ClawQL arms.

Vault pre-ingest, DuckDB ingest, and memory_recall enrichment run in Node/Effect
(`integrations/harvey-labs/scripts/lab-pre-ingest.mjs`, packages/clawql-data,
packages/clawql-memory) — not here.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any

import requests

CLAWQL_MCP_URL = os.environ.get("CLAWQL_MCP_URL", "http://localhost:8080/mcp")

_CLAWQL_TOOL_JSON_CHARS = int(
    os.environ.get("CLAWQL_LAB_CLAWQL_TOOL_JSON_CHARS", "100000")
)

CLAWQL_TOOL_SPECS: list[dict[str, Any]] = [
    {
        "name": "clawql_memory_recall",
        "description": (
            "Retrieve matter context from the ClawQL vault/ontology. "
            "Use schema='legal.Matter' + filters title contains "
            "HSR_SECOND_REQUEST ONLY when the task explicitly asks about "
            "second requests / second-request compliance."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer"},
                "schema": {"type": "string"},
                "filters": {"type": "object"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "clawql_memory_ingest",
        "description": "Persist a finding into the ClawQL vault.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "insights": {"type": "string"},
                "content": {"type": "string"},
                "toolOutputs": {"type": "string"},
                "wikilinks": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["title"],
        },
    },
    {
        "name": "clawql_search",
        "description": "Discover operations across indexed APIs.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}},
            "required": ["query"],
        },
    },
    {
        "name": "clawql_execute",
        "description": "Execute a discovered API operation.",
        "parameters": {
            "type": "object",
            "properties": {"operationId": {"type": "string"}, "arguments": {"type": "object"}},
            "required": ["operationId"],
        },
    },
    {
        "name": "clawql_audit",
        "description": "Append an audit / RTP lineage entry.",
        "parameters": {
            "type": "object",
            "properties": {"type": {"type": "string"}, "payload": {"type": "object"}},
            "required": ["type"],
        },
    },
    {
        "name": "clawql_sql",
        "description": (
            "Read-only SQL via ClawQL MCP data_query (clawql-data engine plugin). "
            "Tables: matters, matter_documents, open_facts. "
            "Semantic bools may be NULL (unknown), not false."
        ),
        "parameters": {
            "type": "object",
            "properties": {"sql": {"type": "string"}},
            "required": ["sql"],
        },
    },
]

_TOOL_NAME_TO_MCP = {
    "clawql_memory_recall": "memory_recall",
    "clawql_memory_ingest": "memory_ingest",
    "clawql_ingest_external_knowledge": "ingest_external_knowledge",
    "clawql_search": "search",
    "clawql_execute": "execute",
    "clawql_audit": "audit",
    "clawql_sql": "data_query",
    "clawql_duckdb_query": "data_query",
}


def _mcp_tool_text(result: object) -> str:
    if isinstance(result, dict):
        content = result.get("content")
        if isinstance(content, list) and content:
            first = content[0]
            if isinstance(first, dict) and first.get("type") == "text":
                return str(first.get("text") or "")
        return json.dumps(result, indent=2, default=str)
    return json.dumps(result, indent=2, default=str)


def is_clawql_lab_adapter(adapter: Any) -> bool:
    return getattr(adapter, "__class__", type(None)).__name__ in {
        "ClawQLAdapter",
        "ClawQLChatAdapter",
    }


class ClawQLLabSession:
    """MCP tool proxy for LAB arms. No vault/DuckDB logic — see lab-pre-ingest.mjs."""

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
        self.vault_path = Path(
            os.environ.get("CLAWQL_OBSIDIAN_VAULT_PATH", "")
        ).expanduser()
        self._clawql_tools = list(CLAWQL_TOOL_SPECS)
        self._rpc_id = 0
        self._session_headers: dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        self._protocol_version = os.environ.get(
            "CLAWQL_MCP_PROTOCOL_VERSION", "2025-11-25"
        )

    def pre_task_setup(self) -> None:
        self._ensure_mcp_session()
        try:
            self._call_clawql_mcp(
                "audit",
                {
                    "operation": "append",
                    "category": "lab_run",
                    "action": "LAB_RUN_START",
                    "summary": (
                        f"harvey-lab-v1 arm={self.arm} model={self.model} "
                        f"task={self.task_id}"
                    ),
                    "correlationId": f"harvey-lab:{self.task_id}:{self.arm}",
                },
            )
        except Exception as exc:  # noqa: BLE001
            print(f"ClawQL audit LAB_RUN_START warning: {exc}")

    def post_task_cleanup(self) -> None:
        return

    def system_prompt_extension(self) -> str:
        path = Path(__file__).with_name("clawql_system_prompt.md")
        if path.exists():
            return "\n\n" + path.read_text(encoding="utf-8")
        return ""

    def clawql_tool_definitions(self) -> list[dict]:
        return list(self._clawql_tools)

    def merge_tools(self, tools: list[dict]) -> list[dict]:
        merged = list(tools) + self._clawql_tools
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
                arguments = json.loads(arguments)
            except json.JSONDecodeError:
                return f"Error: invalid JSON arguments: {arguments}"
        mcp_name = _TOOL_NAME_TO_MCP.get(tool_name, tool_name.removeprefix("clawql_"))
        args = dict(arguments or {})
        if tool_name in {"clawql_sql", "clawql_duckdb_query"} or mcp_name in {
            "sql",
            "data_query",
        }:
            sql = str(args.get("sql") or args.get("query") or "")
            try:
                result = self._call_clawql_mcp("data_query", {"sql": sql})
                return _mcp_tool_text(result)
            except Exception as exc:  # noqa: BLE001
                return json.dumps({"ok": False, "error": str(exc)})
        if mcp_name == "memory_ingest" and "content" in args and "toolOutputs" not in args:
            args["toolOutputs"] = args.pop("content")
        if mcp_name == "memory_ingest" and "type" not in args:
            args["type"] = "context"
        try:
            result = self._call_clawql_mcp(mcp_name, args)
            dumped = json.dumps(result, indent=2, default=str)
            if len(dumped) > _CLAWQL_TOOL_JSON_CHARS:
                dumped = (
                    dumped[:_CLAWQL_TOOL_JSON_CHARS]
                    + "\n…[ClawQL tool JSON truncated]"
                )
            return dumped
        except Exception as exc:  # noqa: BLE001
            return f"Error calling ClawQL MCP tool {mcp_name}: {exc}"

    def _parse_mcp_http_body(self, resp: requests.Response) -> dict:
        ctype = (resp.headers.get("content-type") or "").lower()
        text = resp.text or ""
        if "text/event-stream" in ctype or text.startswith("event:"):
            for line in text.splitlines():
                if line.startswith("data:"):
                    payload = line[len("data:") :].strip()
                    if payload:
                        return json.loads(payload)
            return {"raw": text}
        if not text.strip():
            return {}
        return resp.json()

    def _ensure_mcp_session(self) -> None:
        self._session_headers["mcp-protocol-version"] = self._protocol_version
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": self._protocol_version,
                "capabilities": {},
                "clientInfo": {"name": "harvey-lab-clawql-adapter", "version": "0.3.0"},
            },
        }
        resp = requests.post(
            CLAWQL_MCP_URL,
            json=payload,
            headers=self._session_headers,
            timeout=60,
        )
        resp.raise_for_status()
        sid = resp.headers.get("mcp-session-id") or resp.headers.get("Mcp-Session-Id")
        if sid:
            self._session_headers["mcp-session-id"] = sid
        body = self._parse_mcp_http_body(resp)
        negotiated = (
            (body.get("result") or {}).get("protocolVersion")
            if isinstance(body, dict)
            else None
        )
        if negotiated:
            self._protocol_version = negotiated
            self._session_headers["mcp-protocol-version"] = negotiated
        try:
            requests.post(
                CLAWQL_MCP_URL,
                json={
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized",
                    "params": {},
                },
                headers=self._session_headers,
                timeout=30,
            )
        except requests.RequestException:
            pass

    def _next_id(self) -> str:
        self._rpc_id += 1
        return f"lab-{self._rpc_id}-{uuid.uuid4().hex[:8]}"

    def _call_clawql_mcp(
        self, tool_name: str, arguments: dict, *, timeout: int | None = None
    ) -> dict:
        if "mcp-protocol-version" not in self._session_headers:
            self._ensure_mcp_session()
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": dict(arguments)},
        }
        resp = requests.post(
            CLAWQL_MCP_URL,
            json=payload,
            headers=self._session_headers,
            timeout=timeout if timeout is not None else 180,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:1000]}")
        data = self._parse_mcp_http_body(resp)
        if isinstance(data, dict) and data.get("error"):
            raise RuntimeError(json.dumps(data["error"]))
        return data.get("result", data) if isinstance(data, dict) else {"raw": data}
