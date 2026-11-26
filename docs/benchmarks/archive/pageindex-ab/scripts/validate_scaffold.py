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
    extra = arms.get("extra_merge_arms") or []
    extra_ids = {a["id"] for a in extra}
    for needed in ("H-idf-pi-union", "H-idf-pi-gated"):
        assert needed in extra_ids, f"missing extra merge arm {needed}"
    must_exist(SCRIPTS / "run_displacement_check.mjs")
    must_exist(SCRIPTS / "retrieval_helpers.mjs")

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

    # Pilot keys + docs present
    pilot_keys = ROOT / "fixtures" / "contaminated-smoke" / "pilot-keys.jsonl"
    must_exist(pilot_keys)
    must_exist(ROOT / "fixtures" / "contaminated-smoke" / "docs" / "well-structured-agency-rulebook.md")
    must_exist(ROOT / "scripts" / "run_retrieval_pilot.mjs")
    must_exist(ROOT / "scripts" / "build_freeze_candidate.py")
    must_exist(ROOT / "scripts" / "build_hard_candidate.py")
    must_exist(ROOT / "scripts" / "run_agent_factorial.mjs")

    # Build freeze-candidate if missing, then check counts
    fc = ROOT / "corpus" / "freeze-candidate"
    if not (fc / "keys.jsonl").exists():
        subprocess.run(
            [sys.executable, str(SCRIPTS / "build_freeze_candidate.py")],
            check=True,
        )
    must_exist(fc / "candidate-manifest.json")
    must_exist(fc / "keys.jsonl")
    docs = list((fc / "docs").glob("*.md"))
    repos = [p for p in (fc / "code").iterdir() if p.is_dir()] if (fc / "code").exists() else []
    assert len(docs) == 24, f"expected 24 freeze-candidate docs, got {len(docs)}"
    assert len(repos) == 8, f"expected 8 repos, got {len(repos)}"
    fc_keys = sum(1 for line in (fc / "keys.jsonl").open(encoding="utf-8") if line.strip())
    assert fc_keys >= 192, f"expected >=192 keys, got {fc_keys}"

    print(
        json.dumps(
            {
                "ok": True,
                "spec_version": arms.get("spec_version"),
                "confirmatory_arms": len(conf),
                "strict_accuracy_smoke": grade["summary"]["strict_accuracy"],
                "pilot_keys": sum(1 for _ in pilot_keys.open(encoding="utf-8") if _.strip()),
                "freeze_candidate_docs": len(docs),
                "freeze_candidate_repos": len(repos),
                "freeze_candidate_keys": fc_keys,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
