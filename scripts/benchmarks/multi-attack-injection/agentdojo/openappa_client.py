"""
Thin PROTOCOL=1 OpenAPPA /hook client for the AgentDojo stacked defense.

Mirrors packages/clawql-api/src/openappa (opencode adapter, mcp__<server>__<tool>)
without pulling the TypeScript Effect stack into the Python harness.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Literal
from uuid import uuid4

PROTOCOL = 1
ADAPTER = "opencode"

OpenAppaStatus = Literal["allow", "blocked", "mandate_required"]


@dataclass(frozen=True)
class OpenAppaVerdict:
    allow: bool
    status: OpenAppaStatus
    reason: str
    decision: str
    raw: dict[str, Any]


class OpenAppaClientError(RuntimeError):
    """Transport / protocol failure — stacked arm fails closed."""


class OpenAppaClient:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        mcp_server: str | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        self.base_url = (
            base_url or os.environ.get("CLAWQL_OPENAPPA_URL") or "http://127.0.0.1:8789"
        ).rstrip("/")
        self.mcp_server = (
            mcp_server or os.environ.get("CLAWQL_OPENAPPA_MCP_SERVER") or "agentdojo"
        ).strip() or "agentdojo"
        raw_timeout = timeout_ms
        if raw_timeout is None:
            raw_timeout = int(os.environ.get("CLAWQL_OPENAPPA_TIMEOUT_MS") or "2000")
        self.timeout_s = max(0.05, raw_timeout / 1000.0)
        self._started_roots: set[str] = set()

    def wire_tool(self, tool_name: str) -> str:
        if tool_name.startswith("mcp__") or "/" in tool_name:
            return tool_name
        return f"mcp__{self.mcp_server}__{tool_name}"

    def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/hook",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            # Undeclared tools often return HTTP 409 with a refuse decision body.
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError as je:
                raise OpenAppaClientError(
                    f"OpenAPPA /hook HTTP {e.code}: {raw[:400]}"
                ) from je
            if isinstance(payload, dict) and "decision" in payload:
                return payload
            raise OpenAppaClientError(
                f"OpenAPPA /hook HTTP {e.code}: {raw[:400]}"
            ) from e
        except OpenAppaClientError:
            raise
        except Exception as e:
            raise OpenAppaClientError(f"OpenAPPA /hook failed: {e}") from e
        if not isinstance(payload, dict) or "decision" not in payload:
            raise OpenAppaClientError(
                f"OpenAPPA /hook returned non-decision body: {payload!r}"
            )
        return payload

    def ensure_session(self, root_id: str) -> None:
        if root_id in self._started_roots:
            return
        decision = self._post(
            {
                "protocol": PROTOCOL,
                "adapter": ADAPTER,
                "event": "session_start",
                "root_id": root_id,
            }
        )
        name = str(decision.get("decision") or "")
        if name not in ("ack", "context"):
            raise OpenAppaClientError(
                f"OpenAPPA session_start unexpected decision: {name}"
            )
        self._started_roots.add(root_id)

    def tool_call(
        self,
        *,
        root_id: str,
        tool: str,
        arguments: dict[str, Any],
        call_id: str | None = None,
    ) -> OpenAppaVerdict:
        self.ensure_session(root_id)
        cid = call_id or str(uuid4())
        decision = self._post(
            {
                "protocol": PROTOCOL,
                "adapter": ADAPTER,
                "event": "tool_call",
                "root_id": root_id,
                "tool": self.wire_tool(tool),
                "arguments": arguments,
                "call_id": cid,
            }
        )
        return self._verdict_from_tool_call(decision)

    def tool_result(
        self,
        *,
        root_id: str,
        tool: str,
        arguments: dict[str, Any],
        call_id: str,
        outcome: dict[str, Any],
    ) -> dict[str, Any]:
        self.ensure_session(root_id)
        return self._post(
            {
                "protocol": PROTOCOL,
                "adapter": ADAPTER,
                "event": "tool_result",
                "root_id": root_id,
                "tool": self.wire_tool(tool),
                "arguments": arguments,
                "call_id": call_id,
                "outcome": outcome,
            }
        )

    @staticmethod
    def _feedback(decision: dict[str, Any]) -> str:
        for key in ("feedback", "reason", "detail"):
            val = decision.get(key)
            if isinstance(val, str) and val.strip():
                klass = decision.get("class")
                if key == "detail" and isinstance(klass, str) and klass:
                    return f"{val.strip()} ({klass})"
                return val.strip()
        return f"OpenAPPA decision: {decision.get('decision')}"

    def _verdict_from_tool_call(self, decision: dict[str, Any]) -> OpenAppaVerdict:
        name = str(decision.get("decision") or "")
        feedback = self._feedback(decision)
        if name in ("allow_call", "pass_control"):
            return OpenAppaVerdict(
                allow=True,
                status="allow",
                reason=f"OpenAPPA {name}",
                decision=name,
                raw=decision,
            )
        if name == "refuse":
            return OpenAppaVerdict(
                allow=False,
                status="blocked",
                reason=f"OpenAPPA policy blocked tool: {feedback}",
                decision=name,
                raw=decision,
            )
        if name in ("deny_call", "block"):
            text = feedback.lower()
            mandate = "requires attention" in text or "human-approval" in text
            return OpenAppaVerdict(
                allow=False,
                status="mandate_required" if mandate else "blocked",
                reason=f"OpenAPPA policy blocked tool: {feedback}",
                decision=name,
                raw=decision,
            )
        # Unknown → fail closed
        return OpenAppaVerdict(
            allow=False,
            status="blocked",
            reason=f"OpenAPPA unexpected decision: {name} ({feedback})",
            decision=name or "unknown",
            raw=decision,
        )


def openappa_enabled_for_defense(defense_id: str) -> bool:
    return defense_id.strip() in (
        "clawql_data_flow_openappa",
        "clawql_stack",
        "openappa",
    )


def require_openappa_client(defense_id: str) -> OpenAppaClient | None:
    if not openappa_enabled_for_defense(defense_id):
        return None
    client = OpenAppaClient()
    # Fail fast if sidecar is down before spending OpenRouter tokens.
    probe_root = f"agentdojo-probe-{uuid4()}"
    client.ensure_session(probe_root)
    return client
