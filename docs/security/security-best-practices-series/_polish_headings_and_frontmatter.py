#!/usr/bin/env python3
"""Insert level/tags, fix glued ### headings (outside fenced code), small copy fixes."""
from __future__ import annotations

import re
from pathlib import Path

DIR = Path(__file__).resolve().parent

# part 1..20
LEVELS = (
    ["foundational"] * 5
    + ["intermediate"] * 10
    + ["advanced"] * 5
)

TAGS = [
    ["supply-chain", "containers", "cicd", "sbom", "signing"],
    ["containers", "hardening", "distroless", "golden-images"],
    ["kubernetes", "admission-control", "policy-as-code", "kyverno"],
    ["kubernetes", "rbac", "identity", "least-privilege", "agents"],
    ["zero-trust", "architecture", "agents", "mcp"],
    ["zero-trust", "cryptography", "secrets", "compliance"],
    ["kubernetes", "service-mesh", "mtls", "networking", "istio"],
    ["sandboxing", "containers", "runtime", "kata-containers", "gvisor"],
    ["mcp", "agents", "api-security", "runtime-protection"],
    ["privacy", "logging", "pii", "data-classification"],
    ["ml-security", "supply-chain", "model-integrity"],
    ["observability", "monitoring", "siem", "metrics"],
    ["incident-response", "automation", "soc", "runtime"],
    ["incident-response", "backups", "forensics", "business-continuity"],
    ["kubernetes", "gpu", "resource-guards", "denial-of-service"],
    ["devsecops", "workstations", "developer-security"],
    ["kubernetes", "deployment", "gitops", "production"],
    ["threat-modeling", "stride", "risk-management", "agents"],
    ["owasp", "agents", "llm-security", "risk-mapping"],
    ["governance", "compliance", "audit", "security-operations"],
]


def fix_non_fence_segment(s: str) -> str:
    # Glued ### after sentence end or closing paren
    for _ in range(25):
        n = re.sub(r"([.!?])(###\s)", r"\1\n\n\2", s)
        if n == s:
            break
        s = n
    s = re.sub(r"(\))(\###\s)", r"\1\n\n\2", s)
    # Paragraph break after sentence end when the next sentence starts with a common capitalized opener (glued prose)
    openers = (
        "This module",
        "A Zero Trust",
        "A sensible",
        "A common enterprise",
        "Even with",
        "Most container",
        "The software",
        "Building on",
        "With a secure",
        "With identity-level",
        "With network-level",
        "Detection without",
        "Even with layered",
        "Even with strong",
        "Mature programs",
        "No high-risk",
        "Traditional perimeter",
        "Agentic workloads",
        "The MCP interface",
        "Model weights represent",
        "Strong prevention",
        "Custom Prometheus",
        "Falco detects",
        "Automation augments",
        "All previous",
        "Defense-in-depth",
        "Harbor provides",
    )
    for op in openers:
        s = re.sub(rf"([.!?])({re.escape(op)})", r"\1\n\n\2", s)
    # Bold callouts glued to prior sentence (e.g. ...gateway.**Next module**)
    for label in (
        r"\*\*Next module",
        r"\*\*Next module \(final\)",
        r"\*\*Core conclusion",
        r"\*\*Core Verification Steps",
        r"\*\*Key Harbor configuration principles",
        r"\*\*Key Advantages",
        r"\*\*Key Capabilities",
        r"\*\*Example for the API gateway",
        r"\*\*Example CI Pipeline Snippet",
        r"\*\*Tools commonly used in hardened CI/CD pipelines",
        r"\*\*Typical CI pipeline step",
        r"\*\*AuthorizationPolicy examples",
        r"\*\*Why pipeline-level redaction",
        r"\*\*Core Policy: Require Signed Images",
        r"\*\*Helm Chart Defaults",
        r"\*\*Kyverno Enforcement Example",
    ):
        s = re.sub(rf"([.!?])({label})", r"\1\n\n\2", s)
    s = re.sub(r"(stack:)(The API gateway)", r"\1\n\n\2", s)
    s = re.sub(r"(signatures\.)(Harbor provides)", r"\1\n\n\2", s)
    return s


def fix_body_headings(body: str) -> str:
    parts = re.split(r"(```[\s\S]*?```)", body)
    out: list[str] = []
    for i, p in enumerate(parts):
        if i % 2 == 1:
            out.append(p)
        else:
            out.append(fix_non_fence_segment(p))
    return "".join(out)


def insert_level_tags(fm_lines: list[str], part: int) -> list[str]:
    level = LEVELS[part - 1]
    tags = TAGS[part - 1]
    out: list[str] = []
    inserted = False
    for line in fm_lines:
        out.append(line)
        if (
            not inserted
            and line.startswith("estimated_minutes:")
            and not line.startswith("estimated_minutes: #")
        ):
            out.append(f"level: {level}")
            out.append("tags:")
            for t in tags:
                out.append(f"  - {t}")
            inserted = True
    if not inserted:
        raise RuntimeError("estimated_minutes not found")
    return out


HOWTO_BAD = re.compile(
    r"Use it as \*\*self-paced\*\* study or as \*\*\s*\n\s*instructor-led\*\* training\. YAML, commands, and policy excerpts are \*\*\s*\n\s*illustrative\*\*; map them to your cloud, mesh, identity provider, and agent runtime—substitute your own names, namespaces, and tools while preserving the \*\*\s*\n\s*control intent\*\*\.",
    re.S,
)
HOWTO_GOOD = (
    "Use it as **self-paced** study or as **instructor-led** training. YAML, commands, and policy excerpts are **illustrative**; "
    "map them to your cloud, mesh, identity provider, and agent runtime—substitute your own names, namespaces, and tools while preserving the **control intent**."
)


def small_copy_fixes(body: str) -> str:
    body = body.replace(
        "This capstone guide explains how This module applies STRIDE",
        "This module explains how to apply STRIDE",
    )
    body = body.replace(
        "(Modules 4–6), This module extends",
        "(Modules 4–6), this module extends",
    )
    body = body.replace(
        "Building on Zero Trust fundamentals (Module 5), this guide covers",
        "Building on Zero Trust fundamentals (Module 5), this module covers",
    )
    return body


def main() -> None:
    for path in sorted(DIR.glob("[0-9][0-9]-*.md")):
        text = path.read_text(encoding="utf-8")
        if not text.startswith("---\n"):
            continue
        m = re.match(r"^---\n([\s\S]*?)\n---\n([\s\S]*)$", text)
        if not m:
            raise SystemExit(f"bad structure: {path}")
        fm_raw, body = m.group(1), m.group(2)
        # strip duplicate level/tags if re-run
        fm_lines: list[str] = []
        skip_tags = False
        for line in fm_raw.split("\n"):
            if line.startswith("level:"):
                continue
            if line.startswith("tags:"):
                skip_tags = True
                continue
            if skip_tags:
                if line.startswith("  - "):
                    continue
                skip_tags = False
            if skip_tags and line.strip() == "":
                continue
            fm_lines.append(line)
        part = int(next(x for x in fm_lines if x.startswith("part:")).split(":", 1)[1].strip())
        fm_new = insert_level_tags(fm_lines, part)
        body = small_copy_fixes(body)
        body = fix_body_headings(body)
        body = HOWTO_BAD.sub(HOWTO_GOOD, body)
        out = "---\n" + "\n".join(fm_new) + "\n---\n" + body
        path.write_text(out, encoding="utf-8")
        print("polished", path.name)


if __name__ == "__main__":
    main()
