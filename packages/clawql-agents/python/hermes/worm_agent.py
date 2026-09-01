"""Hermes AIAgent subclass with WORM instrumentation (ClawQL Phase 2).

Install alongside Hermes and set in hermes.yaml:

  agent:
    runtime_class: "<path>.worm_agent.WORMInstrumentedAgent"

Environment:
  WORM_HTTP_ENDPOINT — POST JSON entries (ClawQL audit HTTP or MinIO-compatible PUT path)
  WORM_HTTP_METHOD — default POST
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

try:
    import httpx
except ImportError:  # pragma: no cover
    httpx = None  # type: ignore

try:
    from hermes.agent import AIAgent
except ImportError:  # pragma: no cover — typecheck / pack without Hermes installed

    class AIAgent:  # type: ignore[no-redef]
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        def query_skill_library(self, query: str) -> list[dict[str, Any]]:
            return []

        def update_skill_library(self, skill: dict[str, Any]) -> None:
            return None

        async def delegate_to_subagent(self, subagent: str, task: str, **kwargs: Any) -> Any:
            return None

        def on_cron_trigger(self, job_name: str, schedule: str) -> None:
            return None

        async def shutdown(self) -> None:
            return None


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class WORMClient:
    """HTTP append-only writer for Hermes non-inference actions."""

    def __init__(self) -> None:
        self.endpoint = os.environ.get("WORM_HTTP_ENDPOINT", "").rstrip("/")
        self.method = os.environ.get("WORM_HTTP_METHOD", "POST").upper()

    def append(
        self,
        *,
        session_id: str,
        kind: str,
        detail: dict[str, Any],
        delegation_id: str | None = None,
    ) -> dict[str, Any]:
        entry = {
            "id": str(uuid.uuid4()),
            "ts": _utcnow(),
            "sessionId": session_id,
            "delegationId": delegation_id,
            "agent": "hermes",
            "kind": kind,
            "detail": detail,
        }
        if not self.endpoint or httpx is None:
            return entry
        try:
            with httpx.Client(timeout=10.0) as client:
                if self.method == "PUT":
                    key = f"{entry['ts']}-{kind.lower()}.json"
                    client.put(
                        f"{self.endpoint}/{key}",
                        content=json.dumps(entry).encode(),
                        headers={"Content-Type": "application/json"},
                    )
                else:
                    client.post(
                        self.endpoint,
                        json=entry,
                        headers={"Content-Type": "application/json"},
                    )
        except Exception:
            pass
        return entry


class WORMInstrumentedAgent(AIAgent):
    """Hermes runtime with WORM on skill / delegation / cron paths."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.worm = WORMClient()
        self._session_id = str(uuid.uuid4())
        self.worm.append(
            session_id=self._session_id,
            kind="SESSION_START",
            detail={},
        )

    @property
    def session_id(self) -> str:
        return self._session_id

    def query_skill_library(self, query: str) -> list[dict[str, Any]]:
        self.worm.append(
            session_id=self._session_id,
            kind="SKILL_QUERY",
            detail={"query": query},
        )
        return super().query_skill_library(query)

    def update_skill_library(self, skill: dict[str, Any]) -> None:
        self.worm.append(
            session_id=self._session_id,
            kind="SKILL_WRITE",
            detail={"skill_name": skill.get("name"), "version": skill.get("version")},
        )
        super().update_skill_library(skill)

    async def delegate_to_subagent(
        self,
        subagent: str,
        task: str,
        **kwargs: Any,
    ) -> Any:
        delegation_id = str(uuid.uuid4())
        self.worm.append(
            session_id=self._session_id,
            kind="DELEGATION",
            detail={"subagent": subagent, "task_preview": task[:500]},
            delegation_id=delegation_id,
        )
        result = await super().delegate_to_subagent(subagent, task, **kwargs)
        self.worm.append(
            session_id=self._session_id,
            kind="DELEGATION_RESULT",
            detail={"subagent": subagent, "success": result is not None},
            delegation_id=delegation_id,
        )
        return result

    def on_cron_trigger(self, job_name: str, schedule: str) -> None:
        self.worm.append(
            session_id=self._session_id,
            kind="CRON_TRIGGER",
            detail={"job": job_name, "schedule": schedule},
        )
        super().on_cron_trigger(job_name, schedule)

    async def shutdown(self) -> None:
        self.worm.append(
            session_id=self._session_id,
            kind="SESSION_END",
            detail={},
        )
        await super().shutdown()
