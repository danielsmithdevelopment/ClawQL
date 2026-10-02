#!/usr/bin/env python3
"""Shared fair-test helpers: frontier model, finalize-answer, majority vote."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from collections import Counter
from typing import Any

# Locked shared frontier for Track A (Vectify + qrewrite) and Track B (agent loop).
# Must stay identical across tracks so combine rules measure method, not model.
FRONTIER_MODEL = "anthropic/claude-sonnet-4.6"
INDEX_MODEL_DEFAULT = "openai/gpt-4o-mini"
DEFAULT_TRIALS = 3

FINALIZE_SYSTEM = (
    "You extract a short graded answer from evidence. "
    "Return a single JSON object only, no markdown, with keys: "
    "answer (string), not_found (boolean). "
    "If the evidence does not contain the answer, set not_found=true and answer=\"\". "
    "Otherwise set not_found=false and put the exact short answer in answer "
    "(prefer the document's own wording for headings and terms)."
)


def resolve_frontier_model(explicit: str | None = None) -> str:
    return (
        explicit
        or os.environ.get("VECTIFY_FAIR_MODEL")
        or os.environ.get("PAGEINDEX_AB_AGENT_MODEL")
        or FRONTIER_MODEL
    )


def openrouter_chat(
    *,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0,
    timeout: int = 120,
) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY or OPENAI_API_KEY required")

    use_or = bool(os.environ.get("OPENROUTER_API_KEY"))
    base = "https://openrouter.ai/api/v1" if use_or else "https://api.openai.com/v1"
    model_id = model
    if use_or and model_id.startswith("openrouter/"):
        model_id = model_id[len("openrouter/") :]

    payload = {
        "model": model_id,
        "messages": messages,
        "temperature": temperature,
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://clawql.com",
            "X-Title": "ClawQL pageindex-ab vectify-fair",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        raise RuntimeError(f"chat HTTP {e.code}: {detail}") from e
    return str(body["choices"][0]["message"]["content"] or "")


def parse_answer_json(content: str) -> dict[str, Any]:
    text = (content or "").strip()
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return {"answer": text.split("\n", 1)[0][:240], "not_found": False, "parse_ok": False}
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return {"answer": text.split("\n", 1)[0][:240], "not_found": False, "parse_ok": False}
    return {
        "answer": str(data.get("answer") or ""),
        "not_found": bool(data.get("not_found")),
        "parse_ok": True,
        "raw_json": data,
    }


def finalize_answer(
    *,
    question: str,
    evidence: str,
    model: str,
    question_type: str | None = None,
) -> dict[str, Any]:
    """Same final-answer step for every arm — returns answer/not_found JSON fields."""
    hint = ""
    if question_type == "not_in_document":
        hint = (
            "This question may be unanswerable from the document; "
            "prefer not_found=true unless the answer is clearly present.\n"
        )
    elif question_type in ("section_lookup", "buried_detail"):
        hint = "Prefer the exact section heading text from the evidence.\n"

    user = (
        f"{hint}"
        f"Question:\n{question}\n\n"
        f"Evidence:\n{evidence[:24000]}\n\n"
        'Return JSON: {"answer":"...","not_found":false}'
    )
    raw = openrouter_chat(
        model=model,
        messages=[
            {"role": "system", "content": FINALIZE_SYSTEM},
            {"role": "user", "content": user},
        ],
        temperature=0,
    )
    parsed = parse_answer_json(raw)
    parsed["finalize_raw"] = raw[:4000]
    parsed["finalize_model"] = model
    return parsed


def majority_bool(votes: list[bool]) -> bool:
    if not votes:
        return False
    # majority; ties (even) → False (conservative)
    return sum(1 for v in votes if v) > len(votes) / 2


def majority_row(
    trial_grades: list[dict[str, Any]],
    *,
    key_field: str = "answer_only_correct",
) -> dict[str, Any]:
    """Collapse per-trial grade rows for one question into a majority row."""
    if not trial_grades:
        raise ValueError("empty trial_grades")
    votes = [bool(g.get(key_field)) for g in trial_grades]
    base = dict(trial_grades[0])
    base[key_field] = majority_bool(votes)
    base["strict_correct"] = base[key_field]
    base["text_match"] = base[key_field]
    base["trials"] = len(votes)
    base["trial_votes"] = votes
    base["majority"] = True
    # most common answer text among correct trials, else among all
    answers = [g.get("answer") for g in trial_grades if g.get("answer") is not None]
    if answers:
        base["majority_answer"] = Counter(map(str, answers)).most_common(1)[0][0]
    return base
