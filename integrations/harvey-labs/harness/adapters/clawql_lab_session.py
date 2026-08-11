"""Shared vault / MCP / tool wiring for Harvey LAB ClawQL adapters.

Used by the Anthropic ClawQL adapter and the OpenRouter chat-completions
adapter (Nemotron / other OpenAI-compatible models).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Any
from zipfile import ZipFile

import requests

try:
    from harness.adapters.clawql_vault import resolve_task_vault, vault_root
except ImportError:  # unit tests import adapters/ as a flat path
    from clawql_vault import resolve_task_vault, vault_root

CLAWQL_MCP_URL = os.environ.get("CLAWQL_MCP_URL", "http://localhost:8080/mcp")
CLAWQL_VAULT_ROOT = vault_root()

MAX_EXTRACT_CHARS = int(os.environ.get("CLAWQL_LAB_MAX_EXTRACT_CHARS", "12000"))
MAX_DOCS_PER_MATTER = int(os.environ.get("CLAWQL_LAB_MAX_DOCS_PER_MATTER", "8"))
MAX_MATTERS = int(os.environ.get("CLAWQL_LAB_MAX_MATTERS", "0"))
INGEST_CACHE_NAME = ".clawql-lab-ingest-complete"

CLAWQL_TOOL_SPECS: list[dict[str, Any]] = [
    {
        "name": "clawql_memory_recall",
        "description": (
            "Retrieve matter context from the ClawQL vault. Prefer this over "
            "reading all documents sequentially when enumerating matters or "
            "finding documents that match criteria. Returns ranked note snippets."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language or keywords to search in vault notes",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max notes to return (default 10)",
                },
                "schema": {
                    "type": "string",
                    "description": "Optional ontology schema (e.g. legal.Matter)",
                },
                "filters": {
                    "type": "object",
                    "description": "Optional structured ontology filters",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "clawql_memory_ingest",
        "description": (
            "Persist a finding or intermediate note into the ClawQL vault for "
            "later recall within this task. Prefer `insights` for the summary "
            "and put long extracts in `toolOutputs` (or `content`, which maps "
            "to toolOutputs)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "insights": {"type": "string"},
                "content": {
                    "type": "string",
                    "description": "Long body text (mapped to toolOutputs)",
                },
                "toolOutputs": {"type": "string"},
                "wikilinks": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": ["title"],
        },
    },
    {
        "name": "clawql_search",
        "description": "Discover operations across indexed APIs (usually unused on LAB).",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "clawql_execute",
        "description": "Execute a discovered API operation (usually unused on LAB).",
        "parameters": {
            "type": "object",
            "properties": {
                "operationId": {"type": "string"},
                "arguments": {"type": "object"},
            },
            "required": ["operationId"],
        },
    },
    {
        "name": "clawql_audit",
        "description": "Append an audit / RTP lineage entry for this LAB run.",
        "parameters": {
            "type": "object",
            "properties": {
                "type": {"type": "string"},
                "payload": {"type": "object"},
            },
            "required": ["type"],
        },
    },
]

_TOOL_NAME_TO_MCP = {
    "clawql_memory_recall": "memory_recall",
    "clawql_memory_ingest": "memory_ingest",
    "clawql_search": "search",
    "clawql_execute": "execute",
    "clawql_audit": "audit",
}


def _docx_to_text(path: Path, max_chars: int = MAX_EXTRACT_CHARS) -> str:
    try:
        with ZipFile(path) as zf:
            xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
    except Exception as exc:  # noqa: BLE001
        return f"(failed to extract {path.name}: {exc})"
    text = re.sub(r"<w:tab[^/]*/>", "\t", xml)
    text = re.sub(r"</w:p>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > max_chars:
        return text[:max_chars] + "\n…[truncated]"
    return text


def _plain_text(path: Path, max_chars: int = MAX_EXTRACT_CHARS) -> str:
    try:
        raw = path.read_text(encoding="utf-8", errors="ignore")
    except Exception as exc:  # noqa: BLE001
        return f"(failed to read {path.name}: {exc})"
    if len(raw) > max_chars:
        return raw[:max_chars] + "\n…[truncated]"
    return raw


def _priority_docs(matter_dir: Path) -> list[Path]:
    files = [p for p in matter_dir.rglob("*") if p.is_file()]
    scored: list[tuple[int, Path]] = []
    for p in files:
        name = p.name.lower()
        score = 0
        if "closing" in name:
            score += 50
        if "engagement" in name:
            score += 40
        if "second-request" in name or "second_request" in name:
            score += 80
        if "hsr" in name:
            score += 30
        if name.endswith((".docx", ".md", ".txt")):
            score += 5
        if name.endswith((".xlsx", ".pptx", ".pdf")):
            score -= 10
        if score > 0:
            scored.append((score, p))
    scored.sort(key=lambda t: (-t[0], str(t[1])))
    return [p for _, p in scored[:MAX_DOCS_PER_MATTER]]


def is_clawql_lab_adapter(adapter: Any) -> bool:
    """True for Anthropic or chat-completions ClawQL LAB adapters."""
    return getattr(adapter, "__class__", type(None)).__name__ in {
        "ClawQLAdapter",
        "ClawQLChatAdapter",
    }


class ClawQLLabSession:
    """Task-scoped vault lifecycle + MCP tool execution for LAB arms."""

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
        self.vault_path = resolve_task_vault(task_id, CLAWQL_VAULT_ROOT)
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
        self._prepare_vault()
        self._ensure_mcp_session()
        self._ingest_documents()
        try:
            self._call_clawql_mcp(
                "audit",
                {
                    "operation": "append",
                    "category": "lab_run",
                    "action": "LAB_RUN_START",
                    "summary": (
                        f"harvey-lab-v1 arm={self.arm} model={self.model} "
                        f"task={self.task_id} consent=community_model"
                    ),
                    "correlationId": f"harvey-lab:{self.task_id}:{self.arm}",
                },
            )
        except Exception as exc:  # noqa: BLE001
            print(f"ClawQL audit LAB_RUN_START warning: {exc}")

    def post_task_cleanup(self) -> None:
        if self.vault_path.exists():
            shutil.rmtree(self.vault_path, ignore_errors=True)

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
        unique: list[dict] = []
        for t in merged:
            name = t.get("name")
            if not name or name in seen:
                continue
            seen.add(name)
            unique.append(t)
        return unique

    def execute_clawql_tool(self, tool_name: str, arguments: str | dict) -> str:
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except json.JSONDecodeError:
                return f"Error: invalid JSON arguments: {arguments}"
        mcp_name = _TOOL_NAME_TO_MCP.get(tool_name, tool_name.removeprefix("clawql_"))
        args = dict(arguments or {})
        if mcp_name == "memory_ingest" and "content" in args and "toolOutputs" not in args:
            args["toolOutputs"] = args.pop("content")
        if mcp_name == "memory_ingest" and "type" not in args:
            args["type"] = "context"
        try:
            result = self._call_clawql_mcp(mcp_name, args)
            return json.dumps(result, indent=2, default=str)[:20000]
        except Exception as exc:  # noqa: BLE001
            return f"Error calling ClawQL MCP tool {mcp_name}: {exc}"

    def _prepare_vault(self) -> None:
        if self.vault_path.exists():
            shutil.rmtree(self.vault_path, ignore_errors=True)
        self.vault_path.mkdir(parents=True, exist_ok=True)
        (self.vault_path / "Memory").mkdir(parents=True, exist_ok=True)
        os.environ["CLAWQL_OBSIDIAN_VAULT_PATH"] = str(self.vault_path)

    def _ingest_documents(self) -> None:
        cache_marker = self.vault_path / INGEST_CACHE_NAME
        if cache_marker.exists():
            return

        matters_root = self.documents_dir / "matters"
        if matters_root.is_dir():
            self._ingest_firm_knowledge_dms(matters_root)
        else:
            self._ingest_flat_documents(self.documents_dir)

        cache_marker.write_text(
            json.dumps(
                {
                    "task_id": self.task_id,
                    "documents_dir": str(self.documents_dir),
                    "ingested_at": time.time(),
                }
            ),
            encoding="utf-8",
        )

    def _ingest_firm_knowledge_dms(self, matters_root: Path) -> None:
        matter_dirs = sorted(p for p in matters_root.iterdir() if p.is_dir())
        if MAX_MATTERS > 0:
            matter_dirs = matter_dirs[:MAX_MATTERS]
        print(
            f"ClawQL pre-ingest: {len(matter_dirs)} matters "
            f"(cap={MAX_MATTERS or 'none'}) from {matters_root}"
        )
        for matter_dir in matter_dirs:
            matter_id = matter_dir.name
            docs = _priority_docs(matter_dir)
            sections: list[str] = [
                f"# Matter {matter_id}",
                "",
                f"LAB task: {self.task_id}",
                f"Matter path: matters/{matter_id}",
                "",
                "## Document inventory",
            ]
            all_files = sorted(
                str(p.relative_to(matters_root.parent))
                for p in matter_dir.rglob("*")
                if p.is_file()
            )
            for rel in all_files[:80]:
                sections.append(f"- `{rel}`")
            if len(all_files) > 80:
                sections.append(f"- … ({len(all_files) - 80} more)")
            sections.append("")
            sections.append("## Extracted key documents")
            for doc in docs:
                rel = doc.relative_to(matters_root.parent)
                sections.append(f"### {rel}")
                if doc.suffix.lower() == ".docx":
                    sections.append(_docx_to_text(doc))
                elif doc.suffix.lower() in {".md", ".txt"}:
                    sections.append(_plain_text(doc))
                else:
                    sections.append(f"(binary skipped in seed: {doc.suffix})")
                sections.append("")

            content = "\n".join(sections)
            self._call_clawql_mcp(
                "memory_ingest",
                {
                    "title": f"[LAB:{self.task_id}] Matter {matter_id}",
                    "type": "entity",
                    "insights": (
                        f"Firm-knowledge DMS matter {matter_id} seeded for "
                        f"LAB task {self.task_id}"
                    ),
                    "toolOutputs": content,
                    "wikilinks": [
                        f"LAB:{self.task_id}",
                        f"Matter:{matter_id}",
                        "HarveyLAB",
                    ],
                    "sessionId": f"harvey-lab:{self.task_id}",
                    "append": True,
                },
            )

    def _ingest_flat_documents(self, docs_dir: Path) -> None:
        for doc in sorted(docs_dir.rglob("*")):
            if not doc.is_file():
                continue
            if doc.suffix.lower() == ".docx":
                body = _docx_to_text(doc)
            elif doc.suffix.lower() in {".md", ".txt", ".json", ".csv"}:
                body = _plain_text(doc)
            else:
                continue
            self._call_clawql_mcp(
                "memory_ingest",
                {
                    "title": f"[LAB:{self.task_id}] {doc.name}",
                    "type": "entity",
                    "insights": f"Matter document from LAB task {self.task_id}",
                    "toolOutputs": body,
                    "wikilinks": [f"LAB:{self.task_id}", "HarveyLAB"],
                    "sessionId": f"harvey-lab:{self.task_id}",
                    "append": True,
                },
            )

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
                "clientInfo": {"name": "harvey-lab-clawql-adapter", "version": "0.2.0"},
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

    def _call_clawql_mcp(self, tool_name: str, arguments: dict) -> dict:
        if "mcp-protocol-version" not in self._session_headers:
            self._ensure_mcp_session()

        args = dict(arguments)
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": args},
        }
        resp = requests.post(
            CLAWQL_MCP_URL,
            json=payload,
            headers=self._session_headers,
            timeout=180,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:1000]}")
        data = self._parse_mcp_http_body(resp)
        if isinstance(data, dict) and data.get("error"):
            raise RuntimeError(json.dumps(data["error"]))
        return data.get("result", data) if isinstance(data, dict) else {"raw": data}
