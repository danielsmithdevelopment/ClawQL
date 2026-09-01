"""Minimal Streamable HTTP MCP client for ClawQL (ExtractBench provider)."""

from __future__ import annotations

import json
import os
import uuid
from typing import Any

import requests


def unwrap_mcp_tool_result(result: Any) -> Any:
    """Parse MCP ``tools/call`` result into a Python object.

    ClawQL document tools return ``{content: [{type: text, text: "<json>"}]}``.
    """
    if not isinstance(result, dict):
        return result
    if "content" in result and isinstance(result["content"], list):
        texts: list[str] = []
        for block in result["content"]:
            if isinstance(block, dict) and block.get("type") == "text":
                texts.append(str(block.get("text") or ""))
        joined = "\n".join(t for t in texts if t).strip()
        if not joined:
            return result
        try:
            return json.loads(joined)
        except json.JSONDecodeError:
            return {"text": joined, "raw": result}
    return result


class ClawQLMcpClient:
    """JSON-RPC client against ``clawql-mcp-http`` Streamable HTTP ``/mcp``."""

    def __init__(
        self,
        mcp_url: str | None = None,
        *,
        timeout_s: float = 600.0,
        protocol_version: str | None = None,
        client_name: str = "extractbench-clawql-idp",
    ):
        self.mcp_url = (mcp_url or os.environ.get("CLAWQL_MCP_URL") or "").rstrip("/")
        if not self.mcp_url:
            raise ValueError(
                "CLAWQL_MCP_URL is required (e.g. http://127.0.0.1:8080/mcp)"
            )
        self.timeout_s = float(timeout_s)
        self._protocol_version = protocol_version or os.environ.get(
            "CLAWQL_MCP_PROTOCOL_VERSION", "2025-11-25"
        )
        self._client_name = client_name
        self._rpc_id = 0
        self._session_headers: dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        self._initialized = False

    def _next_id(self) -> str:
        self._rpc_id += 1
        return f"eb-{self._rpc_id}-{uuid.uuid4().hex[:8]}"

    @staticmethod
    def _parse_http_body(resp: requests.Response) -> dict[str, Any]:
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

    def ensure_session(self) -> None:
        if self._initialized:
            return
        self._session_headers["mcp-protocol-version"] = self._protocol_version
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": self._protocol_version,
                "capabilities": {},
                "clientInfo": {"name": self._client_name, "version": "0.1.0"},
            },
        }
        resp = requests.post(
            self.mcp_url,
            json=payload,
            headers=self._session_headers,
            timeout=min(60.0, self.timeout_s),
        )
        resp.raise_for_status()
        sid = resp.headers.get("mcp-session-id") or resp.headers.get("Mcp-Session-Id")
        if sid:
            self._session_headers["mcp-session-id"] = sid
        body = self._parse_http_body(resp)
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
                self.mcp_url,
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
        self._initialized = True

    def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        self.ensure_session()
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        }
        resp = requests.post(
            self.mcp_url,
            json=payload,
            headers=self._session_headers,
            timeout=self.timeout_s,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:1000]}")
        data = self._parse_http_body(resp)
        if isinstance(data, dict) and data.get("error"):
            raise RuntimeError(json.dumps(data["error"]))
        result = data.get("result", data) if isinstance(data, dict) else {"raw": data}
        return unwrap_mcp_tool_result(result)
