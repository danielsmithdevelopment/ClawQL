#!/usr/bin/env python3
"""GW-17 — Official OpenAI Python SDK against ClawQL POST /v1/decisions.

Expects CLAWQL_DECISIONS_BASE_URL (e.g. http://127.0.0.1:PORT/v1) and a
running gateway. Exit 0 on pass.
"""

from __future__ import annotations

import os
import sys

try:
    from openai import OpenAI, APIStatusError
except ImportError as exc:  # pragma: no cover
    print("openai package required: pip install openai>=1.0", file=sys.stderr)
    raise SystemExit(2) from exc


def main() -> int:
    base = os.environ.get("CLAWQL_DECISIONS_BASE_URL", "").rstrip("/")
    if not base:
        print("CLAWQL_DECISIONS_BASE_URL is required", file=sys.stderr)
        return 2

    client = OpenAI(
        api_key="sk-clawql-test",
        base_url=base,
        max_retries=0,
        timeout=30.0,
    )

    # Refusal (fail-closed)
    closed = client.decisions.create(
        model="clawql",
        input="I was charged twice for my order.",
        questions=[
            {
                "type": "choice",
                "name": "department",
                "instructions": "Which department should handle this complaint?",
                "choices": [
                    {"value": "billing", "description": "Payments"},
                    {"value": "other", "description": "Other"},
                ],
            }
        ],
    )
    assert closed.answers[0].type == "refusal", closed.answers[0]

    # Predicate + choice with opt-in
    open_ans = client.decisions.create(
        model="clawql-auto",
        input="The package arrived with a deep crack.",
        questions=[
            {
                "type": "predicate",
                "name": "visible_damage",
                "instructions": "Does the product have visible damage?",
            },
            {
                "type": "choice",
                "name": "department",
                "instructions": "Which department?",
                "choices": [
                    {"value": "shipping", "description": "Delivery"},
                    {"value": "billing", "description": "Payments"},
                ],
            },
        ],
        extra_headers={"x-clawql-allow-uncalibrated": "1"},
    )
    assert open_ans.answers[0].type == "predicate"
    assert open_ans.answers[1].type == "choice"

    # Score refusal then opt-in
    score_closed = client.decisions.create(
        model="clawql",
        input="Export fails in Safari.",
        questions=[
            {
                "type": "score",
                "name": "severity",
                "instructions": "How severe?",
                "levels": [
                    {"label": "Cosmetic", "description": "Appearance only."},
                    {"label": "Fully blocked", "description": "No workaround."},
                ],
            }
        ],
    )
    assert score_closed.answers[0].type == "refusal"

    score_open = client.decisions.create(
        model="clawql",
        input="Export fails in Safari.",
        questions=[
            {
                "type": "score",
                "name": "severity",
                "instructions": "How severe?",
                "levels": [
                    {"label": "Cosmetic", "description": "Appearance only."},
                    {"label": "Fully blocked", "description": "No workaround."},
                ],
            }
        ],
        extra_headers={"x-clawql-allow-uncalibrated": "1"},
    )
    assert score_open.answers[0].type == "score"

    # Unknown model → SDK exception
    try:
        client.decisions.create(
            model="gpt-4o",
            input="hello",
            questions=[
                {"type": "predicate", "name": "ok", "instructions": "Is this ok?"}
            ],
        )
        raise AssertionError("expected APIStatusError for unknown model")
    except APIStatusError as err:
        assert err.status_code == 400, err.status_code

    print("GW-17 OpenAI Python SDK conformance: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
