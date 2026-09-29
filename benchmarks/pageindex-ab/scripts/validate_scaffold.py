#!/usr/bin/env python3
"""Validate pageindex-ab scaffold: schemas load, smoke fixtures grade, arms config OK."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
SMOKE = ROOT / "fixtures" / "contaminated-smoke"


def must_exist(path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"missing: {path}")


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    for rel in (
        "README.md",
        "arms/arms.json",
        "schema/answer-contract.schema.json",
        "schema/question.schema.json",
        "schema/manifest.schema.json",
        "fixtures/contaminated-smoke/README.md",
        "fixtures/contaminated-smoke/sample-keys.jsonl",
        "fixtures/contaminated-smoke/sample-answers.jsonl",
        "fixtures/contaminated-smoke/sample-paired-scores.jsonl",
        "fixtures/contaminated-smoke/sample-trace-ok.json",
        "fixtures/contaminated-smoke/sample-trace-violation.json",
    ):
        must_exist(ROOT / rel)

    arms = load_json(ROOT / "arms" / "arms.json")
    assert isinstance(arms, dict)
    conf = arms.get("confirmatory_arms") or []
    assert len(conf) == 8, f"expected 8 confirmatory arms, got {len(conf)}"
    ids = {a["id"] for a in conf}
    for needed in ("H-idf", "H-idf-pi", "H-bm25", "H-bm25-pi-cg"):
        assert needed in ids, needed
    assert arms.get("philosophy", {}).get("latency_gates") is False
    assert arms.get("philosophy", {}).get("token_cost_gates") is False
    assert len(arms.get("confirmatory_contrasts") or []) >= 4

    for name in ("answer-contract", "question", "manifest"):
        load_json(ROOT / "schema" / f"{name}.schema.json")

    r = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS / "grade_tier1.py"),
            "--answers",
            str(SMOKE / "sample-answers.jsonl"),
            "--keys",
            str(SMOKE / "sample-keys.jsonl"),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    grade = json.loads(r.stdout)
    assert grade["summary"]["n"] >= 3
    assert grade["summary"]["strict_accuracy"] > 0

    r2 = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS / "bootstrap_paired.py"),
            "--scores",
            str(SMOKE / "sample-paired-scores.jsonl"),
            "--n-resamples",
            "1000",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    assert "mean_delta_a_minus_b" in json.loads(r2.stdout)

    r3 = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS / "mcnemar_paired.py"),
            "--scores",
            str(SMOKE / "sample-paired-scores.jsonl"),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    assert "p_two_sided" in json.loads(r3.stdout)

    ok = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS / "check_arm_conformance.py"),
            "--arm",
            "D-pageindex",
            "--trace",
            str(SMOKE / "sample-trace-ok.json"),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert ok.returncode == 0, ok.stdout + ok.stderr

    bad = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS / "check_arm_conformance.py"),
            "--arm",
            "D-pageindex",
            "--trace",
            str(SMOKE / "sample-trace-violation.json"),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert bad.returncode == 2, bad.stdout + bad.stderr

    whole = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS / "check_arm_conformance.py"),
            "--arm",
            "D-whole-doc",
            "--trace",
            str(SMOKE / "sample-trace-ok.json"),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert whole.returncode == 2, whole.stdout + whole.stderr

    print(
        json.dumps(
            {
                "ok": True,
                "spec_version": arms.get("spec_version"),
                "confirmatory_arms": len(conf),
                "strict_accuracy_smoke": grade["summary"]["strict_accuracy"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
