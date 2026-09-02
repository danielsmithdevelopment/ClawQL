"""ClawQL IDP extraction provider for ExtractBench.

Pipeline:
  1. ``inspect_pdf`` — classify TextBased vs Scanned/Mixed and optionally extract Markdown
  2. Route:
     - ``local_markdown`` → use inspector Markdown (cheap)
     - otherwise → ``execute`` Docling ``docling_convert_source`` (layout + tables)
  3. Schema-guided mapping:
     - Arm A (``schema_map_mode=llm``): OpenAI-compatible model (e.g. self-hosted Qwen3.6 35B)
       over the extracted text — *not* a VLM over page images, so long docs are not
       attention-truncated
     - Arm B (``schema_map_mode=structural``): deterministic table/label mapping, no LLM

Register via ``integrations/extractbench/scripts/apply_clawql_provider.py``.
"""

from __future__ import annotations

import base64
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from extract_bench.inference.providers.base import (
    Provider,
    ProviderConfigError,
    ProviderPermanentError,
    ProviderTransientError,
)
from extract_bench.inference.providers.registry import register_provider
from extract_bench.schemas.extract_output import ExtractOutput, FieldCitation
from extract_bench.schemas.pipeline import PipelineSpec
from extract_bench.schemas.pipeline_io import (
    InferenceRequest,
    InferenceResult,
    RawInferenceResult,
)
from extract_bench.schemas.product import ProductType

from .mcp_client import ClawQLMcpClient
from .ontology_sync import (
    ontology_sync_enabled,
    run_ontology_pipeline,
    t1_completeness_metrics,
)
from .schema_map import (
    SCHEMA_MAP_SYSTEM_PROMPT,
    chunk_text_for_mapping,
    merge_extraction_chunks,
    null_template_from_schema,
    parse_json_object,
    prepare_schema,
    structural_map_from_content,
)


def _page_count(path: Path) -> int:
    try:
        from pypdf import PdfReader

        return len(PdfReader(str(path)).pages)
    except Exception:  # noqa: BLE001 — best-effort for cost accounting
        return 0


def _citations_from_payload(payload: Any) -> list[FieldCitation]:
    """Best-effort FieldCitation list from LangExtract-like or custom evidence."""
    citations: list[FieldCitation] = []
    if not isinstance(payload, dict):
        return citations
    evidence = payload.get("evidence") or payload.get("field_citations") or []
    if not isinstance(evidence, list):
        return citations
    for item in evidence:
        if not isinstance(item, dict):
            continue
        field_path = item.get("field_path") or item.get("path") or item.get("field")
        page = item.get("page") or item.get("page_number")
        if not field_path or not isinstance(page, int) or page < 1:
            continue
        bbox = item.get("bbox")
        if bbox is not None and not (
            isinstance(bbox, list) and len(bbox) == 4 and all(isinstance(x, (int, float)) for x in bbox)
        ):
            bbox = None
        citations.append(
            FieldCitation(
                field_path=str(field_path),
                page=page,
                bbox=list(bbox) if bbox is not None else None,
                reference_text=item.get("reference_text") or item.get("text"),
                confidence=item.get("confidence"),
                source=item.get("source") or "clawql_idp",
            )
        )
    return citations


@register_provider("clawql_idp")
class ClawQLIDPProvider(Provider):
    """ClawQL IDP route + schema map for ExtractBench EXTRACT product type."""

    def __init__(self, provider_name: str, base_config: dict[str, Any] | None = None):
        super().__init__(provider_name, base_config)

        self._mcp_url = (
            self.base_config.get("mcp_url")
            or os.environ.get("CLAWQL_MCP_URL")
            or ""
        ).rstrip("/")
        if not self._mcp_url:
            raise ProviderConfigError(
                "clawql_idp requires CLAWQL_MCP_URL (or mcp_url in config), "
                "e.g. http://127.0.0.1:8080/mcp"
            )

        self._schema_map_mode = str(
            self.base_config.get("schema_map_mode")
            or os.environ.get("CLAWQL_EXTRACTBENCH_SCHEMA_MAP", "llm")
        ).lower()
        if self._schema_map_mode not in ("llm", "structural"):
            raise ProviderConfigError(
                "schema_map_mode must be 'llm' or 'structural', "
                f"got {self._schema_map_mode!r}"
            )

        self._model = str(
            self.base_config.get("model")
            or os.environ.get("CLAWQL_EXTRACTBENCH_MODEL", "qwen3.6-35b-a3b-fp8")
        )
        self._endpoint_env_var = str(
            self.base_config.get("endpoint_env_var") or "QWEN35_SERVER_URL"
        )
        self._server_url = (
            self.base_config.get("server_url")
            or os.environ.get(self._endpoint_env_var)
            or os.environ.get("CLAWQL_EXTRACTBENCH_LLM_URL")
            or ""
        ).rstrip("/")
        if self._schema_map_mode == "llm" and not self._server_url:
            raise ProviderConfigError(
                "clawql_idp llm mode requires server_url or "
                f"{self._endpoint_env_var} / CLAWQL_EXTRACTBENCH_LLM_URL "
                "(OpenAI-compatible base, e.g. http://127.0.0.1:8000)"
            )

        self._api_key = (
            os.environ.get(str(self.base_config.get("api_key_env", "VLLM_API_KEY")), "")
            or os.environ.get("OPENAI_API_KEY", "")
            or "dummy"
        )
        self._timeout_s = float(self.base_config.get("timeout_s", self.base_config.get("timeout", 1800)))
        self._max_tokens = int(self.base_config.get("max_tokens", 65536))
        self._temperature = float(self.base_config.get("temperature", 0.0))
        self._chunk_chars = int(self.base_config.get("chunk_chars", 120_000))
        self._structured_output = bool(self.base_config.get("structured_output", True))
        self._additional_properties_false = bool(
            self.base_config.get("additional_properties_false", True)
        )
        # Infra-only cost estimate (self-hosted model = $0 tokens). Override via config.
        self._cost_per_page_usd = float(
            self.base_config.get(
                "cost_per_page_usd",
                os.environ.get("CLAWQL_EXTRACTBENCH_COST_PER_PAGE", "0.0"),
            )
            or 0.0
        )
        self._force_docling = bool(self.base_config.get("force_docling", False))
        self._ontology_sync = ontology_sync_enabled(self.base_config)
        self._ontology_limit = int(self.base_config.get("ontology_recall_limit", 10_000))
        self._mcp = ClawQLMcpClient(self._mcp_url, timeout_s=self._timeout_s)

    def _inspect_pdf(self, file_path: Path) -> dict[str, Any]:
        try:
            return self._mcp.call_tool(
                "inspect_pdf",
                {
                    "path": str(file_path.resolve()),
                    "mode": "full",
                    "include_markdown": True,
                },
            )
        except Exception as exc:  # noqa: BLE001
            msg = str(exc).lower()
            if any(k in msg for k in ("timeout", "503", "502", "504", "connection", "429")):
                raise ProviderTransientError(f"inspect_pdf transient failure: {exc}") from exc
            raise ProviderPermanentError(f"inspect_pdf failed: {exc}") from exc

    def _docling_convert(self, file_path: Path) -> dict[str, Any]:
        b64 = base64.b64encode(file_path.read_bytes()).decode("ascii")
        try:
            return self._mcp.call_tool(
                "execute",
                {
                    "operationId": "docling_convert_source",
                    "args": {
                        "sources": [
                            {
                                "kind": "file",
                                "base64_string": b64,
                                "filename": file_path.name,
                            }
                        ],
                        "options": {
                            "to_formats": ["md", "json"],
                            "do_ocr": True,
                            "do_table_structure": True,
                        },
                    },
                },
            )
        except Exception as exc:  # noqa: BLE001
            msg = str(exc).lower()
            if any(k in msg for k in ("timeout", "503", "502", "504", "connection", "429")):
                raise ProviderTransientError(f"docling convert transient failure: {exc}") from exc
            raise ProviderPermanentError(f"docling convert failed: {exc}") from exc

    @staticmethod
    def _extract_markdown_and_json(docling_result: Any) -> tuple[str, dict[str, Any] | None]:
        """Pull markdown + optional layout JSON from Docling execute payloads."""
        if isinstance(docling_result, str):
            return docling_result, None
        if not isinstance(docling_result, dict):
            return str(docling_result), None

        # Common shapes: {document:{md_content,json_content}}, {md_content}, nested data.
        candidates = [docling_result]
        for key in ("data", "result", "document", "body"):
            nested = docling_result.get(key)
            if isinstance(nested, dict):
                candidates.append(nested)
            elif isinstance(nested, list):
                for item in nested:
                    if isinstance(item, dict):
                        candidates.append(item)

        markdown = ""
        layout: dict[str, Any] | None = None
        for node in candidates:
            for md_key in ("md_content", "markdown", "text", "md"):
                value = node.get(md_key)
                if isinstance(value, str) and len(value) > len(markdown):
                    markdown = value
            for json_key in ("json_content", "json", "layout", "docling_json"):
                value = node.get(json_key)
                if isinstance(value, dict):
                    layout = value
                elif isinstance(value, str) and value.strip().startswith("{"):
                    try:
                        layout = json.loads(value)
                    except json.JSONDecodeError:
                        pass
        if not markdown and layout is None:
            # Last resort: stringify whole result for the LLM mapper.
            markdown = json.dumps(docling_result)[:500_000]
        return markdown, layout

    def _map_with_llm(
        self,
        *,
        content: str,
        schema: dict[str, Any],
        route: str,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise ProviderConfigError(
                "openai package is required for clawql_idp llm schema mapping"
            ) from exc

        prepared = prepare_schema(schema, close_objects=self._additional_properties_false)
        client = OpenAI(
            api_key=self._api_key,
            base_url=f"{self._server_url}/v1",
            timeout=self._timeout_s,
            max_retries=0,
        )

        chunks = chunk_text_for_mapping(content, max_chars=self._chunk_chars)
        pieces: list[dict[str, Any]] = []
        usage_total = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        for idx, chunk in enumerate(chunks):
            user = (
                f"Document route: {route}\n"
                f"Chunk {idx + 1}/{len(chunks)} of extracted content.\n\n"
                "Extract every field according to the JSON schema. "
                "For array/list fields, include every row present in THIS chunk "
                "(other chunks are merged later). Use null for missing fields.\n\n"
                f"JSON schema:\n{json.dumps(prepared, indent=2)}\n\n"
                f"Extracted document content:\n{chunk}"
            )
            response_format: dict[str, Any]
            if self._structured_output:
                response_format = {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "extraction",
                        "schema": prepared,
                        "strict": False,
                    },
                }
            else:
                response_format = {"type": "json_object"}

            kwargs: dict[str, Any] = {
                "model": self._model,
                "temperature": self._temperature,
                "max_tokens": self._max_tokens,
                "messages": [
                    {"role": "system", "content": SCHEMA_MAP_SYSTEM_PROMPT},
                    {"role": "user", "content": user},
                ],
                "response_format": response_format,
            }
            try:
                completion = client.chat.completions.create(**kwargs)
            except Exception as exc:  # noqa: BLE001
                msg = str(exc).lower()
                if any(k in msg for k in ("timeout", "503", "502", "504", "connection", "429", "rate")):
                    raise ProviderTransientError(f"schema map LLM transient: {exc}") from exc
                # Fallback: some servers reject json_schema; retry with json_object.
                if self._structured_output and (
                    "response_format" in msg or "json_schema" in msg or "guided" in msg
                ):
                    kwargs["response_format"] = {"type": "json_object"}
                    try:
                        completion = client.chat.completions.create(**kwargs)
                    except Exception as exc2:  # noqa: BLE001
                        raise ProviderPermanentError(f"schema map LLM failed: {exc2}") from exc2
                else:
                    raise ProviderPermanentError(f"schema map LLM failed: {exc}") from exc

            message = completion.choices[0].message.content if completion.choices else None
            if not message:
                raise ProviderPermanentError("schema map LLM returned empty content")
            parsed = parse_json_object(message)
            if isinstance(parsed, list):
                parsed = {"items": parsed}
            if not isinstance(parsed, dict):
                raise ProviderPermanentError("schema map LLM did not return a JSON object")
            pieces.append(parsed)
            usage = getattr(completion, "usage", None)
            if usage is not None:
                usage_total["prompt_tokens"] += int(getattr(usage, "prompt_tokens", 0) or 0)
                usage_total["completion_tokens"] += int(
                    getattr(usage, "completion_tokens", 0) or 0
                )
                usage_total["total_tokens"] += int(getattr(usage, "total_tokens", 0) or 0)

        base = null_template_from_schema(prepared)
        merged = merge_extraction_chunks(base, pieces, prepared)
        meta = {
            "chunks": len(chunks),
            "usage": usage_total,
            "model": self._model,
            "server_url": self._server_url,
        }
        return merged, meta

    def run_inference(self, pipeline: PipelineSpec, request: InferenceRequest) -> RawInferenceResult:
        if request.product_type != ProductType.EXTRACT:
            raise ProviderPermanentError(
                f"ClawQLIDPProvider only supports EXTRACT, got {request.product_type}"
            )
        if not request.schema_override:
            raise ProviderPermanentError(
                "schema_override is required for EXTRACT product type"
            )

        started_at = datetime.now()
        file_path = Path(request.source_file_path)
        if not file_path.exists():
            raise ProviderPermanentError(f"File not found: {file_path}")

        pages = _page_count(file_path)
        inspect: dict[str, Any] | None = None
        route = "docling_ocr"
        markdown = ""
        layout_json: dict[str, Any] | None = None
        used_docling = False

        try:
            if not self._force_docling:
                inspect = self._inspect_pdf(file_path)
                if isinstance(inspect, dict):
                    route = str(inspect.get("route") or route)
                    md = inspect.get("markdown")
                    if isinstance(md, str):
                        markdown = md
                    if inspect.get("ok") is False:
                        # Fall through to Docling rather than failing hard.
                        route = "docling_ocr"

            if self._force_docling or route != "local_markdown" or not markdown.strip():
                docling_raw = self._docling_convert(file_path)
                used_docling = True
                markdown, layout_json = self._extract_markdown_and_json(docling_raw)
                route = route if route != "local_markdown" else "docling_ocr"
                inspect_docling = docling_raw
            else:
                inspect_docling = None

            if not markdown.strip() and layout_json is None:
                raise ProviderPermanentError(
                    "ClawQL IDP produced empty extraction (no markdown/layout)"
                )

            content_for_map = markdown
            if layout_json is not None and self._schema_map_mode == "llm":
                # Append a compact JSON appendix so nested tables remain visible.
                content_for_map = (
                    markdown
                    + "\n\n<!-- docling_json -->\n"
                    + json.dumps(layout_json)[:200_000]
                )

            map_meta: dict[str, Any] = {}
            if self._schema_map_mode == "structural":
                extracted = structural_map_from_content(
                    markdown=markdown,
                    layout_json=layout_json,
                    schema=request.schema_override,
                )
                map_meta = {"mode": "structural"}
            else:
                extracted, map_meta = self._map_with_llm(
                    content=content_for_map,
                    schema=request.schema_override,
                    route=route,
                )
                map_meta["mode"] = "llm"

            if not isinstance(extracted, dict) or extracted == {}:
                raise ProviderPermanentError("schema mapping produced empty extraction")

            ontology_meta: dict[str, Any] | None = None
            if self._ontology_sync and isinstance(extracted, dict):
                try:
                    ontology_result = run_ontology_pipeline(
                        json_schema=request.schema_override,
                        extracted=extracted,
                        document_id=str(request.example_id or file_path.stem),
                        limit=self._ontology_limit,
                    )
                    ontology_meta = {
                        "pipeline": ontology_result,
                        "t1": t1_completeness_metrics(ontology_result, request.schema_override),
                    }
                except Exception as exc:  # noqa: BLE001 — optional enrichment; do not fail EXTRACT
                    ontology_meta = {"error": str(exc)}

            cost_usd = self._cost_per_page_usd * pages if pages > 0 else self._cost_per_page_usd
            raw_output: dict[str, Any] = {
                "extracted_data": extracted,
                "route": route,
                "used_docling": used_docling,
                "inspect_pdf": inspect,
                "docling": inspect_docling if used_docling else None,
                "schema_map": map_meta,
                "ontology": ontology_meta,
                "num_pages": pages or None,
                "cost_usd": cost_usd,
                "cost_per_page_usd": self._cost_per_page_usd if pages else None,
                "_config": {
                    "schema_map_mode": self._schema_map_mode,
                    "model": self._model if self._schema_map_mode == "llm" else None,
                    "mcp_url": self._mcp_url,
                    "force_docling": self._force_docling,
                    "ontology_sync": self._ontology_sync,
                },
            }

            completed_at = datetime.now()
            latency_ms = int((completed_at - started_at).total_seconds() * 1000)
            return RawInferenceResult(
                request=request,
                pipeline=pipeline,
                pipeline_name=pipeline.pipeline_name,
                product_type=request.product_type,
                raw_output=raw_output,
                started_at=started_at,
                completed_at=completed_at,
                latency_in_ms=latency_ms,
            )
        except (ProviderPermanentError, ProviderTransientError, ProviderConfigError):
            raise
        except Exception as exc:  # noqa: BLE001
            raise ProviderPermanentError(f"Unexpected clawql_idp error: {exc}") from exc

    def normalize(self, raw_result: RawInferenceResult) -> InferenceResult:
        if raw_result.product_type != ProductType.EXTRACT:
            raise ProviderPermanentError(
                f"ClawQLIDPProvider only supports EXTRACT, got {raw_result.product_type}"
            )
        extracted = raw_result.raw_output.get("extracted_data")
        if not isinstance(extracted, (dict, list)) or extracted == {} or extracted == []:
            raise ProviderPermanentError("normalize: missing extracted_data")

        # Page-level citations from markdown markers when present.
        citations = _citations_from_payload(raw_result.raw_output)
        if not citations and isinstance(extracted, dict):
            citations = _page_citations_from_markdown_markers(
                extracted,
                str((raw_result.raw_output.get("inspect_pdf") or {}).get("markdown") or ""),
            )

        output = ExtractOutput(
            task_type="extract",
            example_id=raw_result.request.example_id,
            pipeline_name=raw_result.pipeline_name,
            extracted_data=extracted,
            field_citations=citations,
        )
        return InferenceResult(
            request=raw_result.request,
            pipeline_name=raw_result.pipeline_name,
            product_type=raw_result.product_type,
            raw_output=raw_result.raw_output,
            output=output,
            started_at=raw_result.started_at,
            completed_at=raw_result.completed_at,
            latency_in_ms=raw_result.latency_in_ms,
        )


_PAGE_MARKER_RE = re.compile(r"<!--\s*Page\s+(\d+)\s*-->", re.IGNORECASE)


def _page_citations_from_markdown_markers(
    extracted: dict[str, Any],
    markdown: str,
) -> list[FieldCitation]:
    """Attach coarse page citations when markdown carries ``<!-- Page N -->`` markers.

    Only emits citations for scalar string values that appear uniquely on one page.
    """
    if not markdown or not _PAGE_MARKER_RE.search(markdown):
        return []
    parts = _PAGE_MARKER_RE.split(markdown)
    # split → [pre, page1, text1, page2, text2, ...]
    page_texts: dict[int, str] = {}
    i = 1
    while i + 1 < len(parts):
        try:
            page_num = int(parts[i])
        except ValueError:
            i += 2
            continue
        page_texts[page_num] = parts[i + 1]
        i += 2

    citations: list[FieldCitation] = []

    def walk(node: Any, path: str) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                child = f"{path}.{key}" if path else str(key)
                walk(value, child)
        elif isinstance(node, list):
            for idx, value in enumerate(node):
                walk(value, f"{path}[{idx}]")
        elif isinstance(node, str) and node.strip():
            needle = node.strip()
            if len(needle) < 4:
                return
            hits = [p for p, text in page_texts.items() if needle in text]
            if len(hits) == 1:
                citations.append(
                    FieldCitation(
                        field_path=path,
                        page=hits[0],
                        bbox=None,
                        reference_text=needle[:200],
                        source="clawql_idp_page_marker",
                    )
                )

    walk(extracted, "")
    return citations
