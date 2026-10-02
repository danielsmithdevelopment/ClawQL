"""GLiNER Fast Decision sidecar — ClawQL-owned HTTP shape.

Modes:
  CLAWQL_GLINER_SIDECAR_MODE=mock (default) — token-overlap heuristic, no weights
  CLAWQL_GLINER_SIDECAR_MODE=gliner2 — load gliner2 when installed (optional)

Endpoint: POST /v1/fast-decision/classify
Health:   GET  /healthz
"""

from __future__ import annotations

import os
import re
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

MODE = os.environ.get("CLAWQL_GLINER_SIDECAR_MODE", "mock").strip().lower()
MODEL_ID = os.environ.get(
    "CLAWQL_FAST_DECISION_GLINER_MODEL", "fastino/gliner2.5-base-v1"
).strip()
HOST = os.environ.get("CLAWQL_GLINER_SIDECAR_HOST", "0.0.0.0")
PORT = int(os.environ.get("CLAWQL_GLINER_SIDECAR_PORT", "8080"))

app = FastAPI(title="clawql-gliner-sidecar", version="0.1.0")

_gliner_model = None


class Label(BaseModel):
    id: str
    description: str = ""


class ClassifyRequest(BaseModel):
    useSiteId: str
    text: str
    labels: list[Label]
    model: str = Field(default="")


class Score(BaseModel):
    id: str
    confidence: float


class ClassifyResponse(BaseModel):
    scores: list[Score]
    backend: str


def _tokenize(s: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9_]+", s.lower()) if t}


def mock_scores(text: str, labels: list[Label]) -> list[Score]:
    q = _tokenize(text)
    out: list[Score] = []
    for lab in labels:
        blob = _tokenize(f"{lab.id} {lab.description}")
        if not q:
            conf = 0.5
        elif not blob:
            conf = 0.0
        else:
            hits = len(q & blob)
            conf = min(1.0, hits / max(1, len(q)))
        out.append(Score(id=lab.id, confidence=round(conf, 4)))
    out.sort(key=lambda s: s.confidence, reverse=True)
    return out


def gliner2_scores(text: str, labels: list[Label]) -> list[Score]:
    """Score labels with Fastino GLiNER2 closed-category classification.

    Uses ``create_schema().classification(..., multi_label=True)`` so every
    candidate gets a calibrated confidence. Entity-extract alone often returns
    empty spans for Fast Decision use-site labels (skill ids, schema fields),
    which produced all-zero rankings and false calibration.
    """
    global _gliner_model
    try:
        from gliner2 import AutoExtractor  # type: ignore
    except ImportError as e:
        raise RuntimeError(
            "gliner2 mode requires `pip install gliner2 peft` (and torch). "
            "Use CLAWQL_GLINER_SIDECAR_MODE=mock for CI/local without weights."
        ) from e

    if _gliner_model is None:
        _gliner_model = AutoExtractor.from_pretrained(MODEL_ID)

    if not labels:
        return []

    # Prefer id→description map so classify returns scores keyed by candidate id.
    label_map: dict[str, str] = {
        lab.id: (lab.description.strip() or lab.id) for lab in labels
    }
    schema = _gliner_model.create_schema()
    schema.classification("choice", label_map, multi_label=True, cls_threshold=0.0)
    raw = _gliner_model.extract(
        text,
        schema,
        threshold=0.0,
        format_results=False,
        include_confidence=True,
    )
    by_id: dict[str, float] = {lab.id: 0.0 for lab in labels}
    choice = (raw or {}).get("choice")
    # format_results=False → list[(label, confidence)] or single (label, conf)
    items: list[tuple[str, float]] = []
    if isinstance(choice, list):
        for item in choice:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                items.append((str(item[0]), float(item[1])))
            elif isinstance(item, dict):
                items.append(
                    (
                        str(item.get("label") or item.get("id") or ""),
                        float(item.get("confidence") or item.get("score") or 0.0),
                    )
                )
    elif isinstance(choice, (list, tuple)) and len(choice) == 2 and not isinstance(
        choice[0], (list, tuple, dict)
    ):
        items.append((str(choice[0]), float(choice[1])))
    elif isinstance(choice, dict):
        items.append(
            (
                str(choice.get("label") or choice.get("id") or ""),
                float(choice.get("confidence") or choice.get("score") or 0.0),
            )
        )

    for name, conf in items:
        if name in by_id:
            by_id[name] = max(by_id[name], conf)
        else:
            # Model may echo description keys when label_descriptions used.
            for lab_id, desc in label_map.items():
                if name == desc:
                    by_id[lab_id] = max(by_id[lab_id], conf)

    out: list[Score] = [
        Score(id=lab.id, confidence=round(float(by_id.get(lab.id, 0.0)), 4))
        for lab in labels
    ]
    out.sort(key=lambda s: s.confidence, reverse=True)
    return out


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {
        "ok": True,
        "mode": MODE,
        "model": MODEL_ID,
        "backend": "gliner2" if MODE == "gliner2" else "mock",
    }


@app.post("/v1/fast-decision/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest) -> ClassifyResponse:
    model = req.model.strip() or MODEL_ID
    if MODE == "gliner2":
        scores = gliner2_scores(req.text, req.labels)
        return ClassifyResponse(scores=scores, backend=f"gliner2:{model}")
    scores = mock_scores(req.text, req.labels)
    return ClassifyResponse(scores=scores, backend="mock")


def main() -> None:
    import uvicorn

    uvicorn.run(
        "app:app",
        host=HOST,
        port=PORT,
        log_level=os.environ.get("CLAWQL_GLINER_SIDECAR_LOG", "info"),
    )


if __name__ == "__main__":
    main()
