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
    global _gliner_model
    try:
        from gliner import GLiNER  # type: ignore
    except ImportError as e:
        raise RuntimeError(
            "gliner2 mode requires `pip install gliner` (and torch). "
            "Use CLAWQL_GLINER_SIDECAR_MODE=mock for CI/local without weights."
        ) from e

    if _gliner_model is None:
        _gliner_model = GLiNER.from_pretrained(MODEL_ID)

    label_names = [lab.description or lab.id for lab in labels]
    entities = _gliner_model.predict_entities(text, label_names, threshold=0.0)
    by_desc: dict[str, float] = {n: 0.0 for n in label_names}
    for ent in entities or []:
        label = ent.get("label") or ent.get("type")
        score = float(ent.get("score", 0.0))
        if label in by_desc:
            by_desc[label] = max(by_desc[label], score)

    out: list[Score] = []
    for lab in labels:
        key = lab.description or lab.id
        out.append(Score(id=lab.id, confidence=round(by_desc.get(key, 0.0), 4)))
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
