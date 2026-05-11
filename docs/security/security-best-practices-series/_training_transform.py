#!/usr/bin/env python3
"""
One-off script to add training framing + further reading to curriculum modules.
Run from repo root: python3 docs/security/security-best-practices-series/_training_transform.py
"""
from __future__ import annotations

import re
from pathlib import Path

DIR = Path(__file__).resolve().parent

SLUGS = [
    "supply-chain-pinning-mirror-registry",
    "golden-images-distroless-pipelines",
    "cluster-admission-control-signing-policy",
    "least-privilege-scoped-identities",
    "zero-trust-fundamentals",
    "advanced-zero-trust-vault-hsm-provenance",
    "rbac-mtls-istio-service-mesh",
    "sandboxing-kata-gvisor-tradeoffs",
    "mcp-runtime-protection-panguard-atr",
    "data-classification-pii-redaction-logs",
    "model-integrity-verifying-weights",
    "runtime-monitoring-observability",
    "automated-response-containment",
    "incident-response-recovery-picerl",
    "gpu-resource-protection",
    "workstation-local-development-security",
    "production-deployment-secure-full-stack",
    "threat-modeling-stride-agentic-ai",
    "owasp-agentic-top-10-mitigations",
    "quarterly-security-review-checklist",
]

TITLES = [
    "Supply Chain Security: Why Pinning Versions and Running Your Own Mirror Registry Matters",
    "Building Golden Images: Automated Scanning, Hardening, and Distroless Pipelines",
    "Cluster Admission Control: Enforcing Image Signing and Policy at Deploy Time",
    "Principle of Least Privilege: Scoped Identities and Limiting Blast Radius",
    "Zero Trust Fundamentals: Assume Compromise and Verify Everything",
    "Advanced Zero Trust: Multi-Sig Vault, HSM, Tamper-Proof Logging, and Cryptographic Provenance",
    "RBAC, mTLS, and Istio Service Mesh: Network-Level Zero Trust",
    "Sandboxing Options and Trade-offs: Kata, gVisor, Seatbelt, Docker, and Cloudflare Workers",
    "MCP Runtime Protection: Panguard, ATR Rules, and Agentic Threat Mitigation",
    "Data Classification and PII Redaction: Never Let Sensitive Data Hit Logs",
    "Model Integrity: Verifying Weights Before Inference",
    "Runtime Monitoring and Observability: Falco, Wazuh, Prometheus, and Merkle Metrics",
    "Automated Response and Containment: Falco + Talon Quarantine, Panguard Blocking",
    "Incident Response and Recovery: PICERL, WORM Audits, and Tested Backups",
    "GPU and Resource Protection: Preventing Rogue Agent Denial-of-Service",
    "Workstation and Local Development Security: Same Posture Everywhere",
    "Production Deployment: One-Command Secure Full Stack",
    "Threat Modeling with STRIDE for Agentic AI Systems",
    "OWASP Agentic Top 10: Mapping Risks to Architectural Controls",
    "Quarterly Security Review Checklist: Keeping Defense-in-Depth Alive",
]

MINUTES = [35, 35, 35, 30, 30, 40, 35, 35, 35, 30, 30, 35, 30, 35, 25, 30, 30, 35, 35, 40]

OBJECTIVES: list[list[str]] = [
    [
        "Explain why the software supply chain is a primary risk for agentic AI and tool-calling platforms.",
        "Contrast unsafe practices (public registries, floating tags, loose semver) with production-grade alternatives.",
        "Describe digest pinning, private mirrors, SBOM storage, and container signing in CI/CD.",
        "List secret-scanning practices that reduce credential leakage into repositories.",
    ],
    [
        "Explain why minimal (e.g. distroless) images and read-only root filesystems reduce container blast radius.",
        "Outline a typical build → scan → SBOM → sign → promote pipeline.",
        "Relate admission-time policies to image provenance and non-root execution.",
    ],
    [
        "Describe the role of admission controllers in preventing mis-scoped workloads from running.",
        "Explain image signature verification and digest requirements at deploy time.",
        "Identify policy engines (e.g. Kyverno, OPA/Gatekeeper) and when each fits.",
    ],
    [
        "Apply least privilege to Kubernetes identities (ServiceAccounts, Roles, bindings).",
        "Map tool-calling and agent sessions to scoped credentials and short-lived tokens.",
        "Explain blast-radius containment when a single workload or agent is compromised.",
    ],
    [
        "State Zero Trust principles in the context of autonomous agents and external tools.",
        "Contrast perimeter-only models with continuous verification and default deny.",
        "Prioritize capability restriction over prompt-only defenses.",
    ],
    [
        "Compare static vs dynamic secrets and justify short TTLs for machine identities.",
        "Describe tamper-evident logging goals and cryptographic provenance at a high level.",
        "Relate signing and integrity checks to models and large binaries, not only container images.",
    ],
    [
        "Explain mutual TLS and service identity for east-west traffic in Kubernetes.",
        "Describe egress control patterns (mesh gateways, firewall rules, DNS allowlists).",
        "Connect network segmentation to lateral movement containment.",
    ],
    [
        "Compare isolation technologies (VM-backed runtimes, user-space kernels, OS sandboxes).",
        "Choose sandbox tiers appropriate to risk (MCP/tool execution vs batch jobs).",
        "Discuss performance vs isolation trade-offs with stakeholders.",
    ],
    [
        "Explain synchronous policy enforcement for tool and API calls in agent architectures.",
        "Relate session-scoped authorization to OAuth-style claims and API gateways.",
        "Identify abuse cases specific to multi-step agent workflows.",
    ],
    [
        "Distinguish data classification from redaction and logging policy.",
        "Design redaction-before-write pipelines for SIEM and long-term retention.",
        "Balance privacy obligations with forensic usefulness.",
    ],
    [
        "Explain why model artifacts need integrity checks beyond container image scanning.",
        "Describe init-container or sidecar verification patterns for weights and manifests.",
        "Align model supply chain with broader artifact signing practices.",
    ],
    [
        "Layer host-level detection, SIEM correlation, metrics, and tracing for AI platforms.",
        "Plan alert ownership, tuning, and separation of observability from GPU inference paths.",
        "Interpret integrity-oriented metrics (e.g. audit completeness) as security signals.",
    ],
    [
        "Map alert confidence to automated vs manual response actions.",
        "Describe pod isolation / quarantine patterns that preserve evidence.",
        "Place synchronous gateway blocking alongside host-based detection.",
    ],
    [
        "Use a structured incident lifecycle (e.g. prepare → identify → contain → recover).",
        "Plan immutable audit storage and tested restore for critical datasets.",
        "Align runbooks with AI-specific failure modes (model, tools, data pipelines).",
    ],
    [
        "Apply quotas, limits, and scheduling policies to protect shared GPU pools.",
        "Detect and mitigate resource exhaustion from runaway agents or jobs.",
        "Coordinate platform and ML owner responsibilities.",
    ],
    [
        "Extend production security expectations to developer laptops and CI runners.",
        "List minimum controls (disk encryption, MFA, signed commits) for high-impact repos.",
        "Reduce “works on my machine” gaps that become production incidents.",
    ],
    [
        "Assemble a repeatable secure rollout checklist for complex stacks.",
        "Order dependencies (identity, mesh, observability, data plane) to avoid gaps.",
        "Verify controls after deploy with targeted tests, not only green dashboards.",
    ],
    [
        "Apply STRIDE categories to agent identity, tools, memory, and orchestration.",
        "Operate a living threat model tied to architecture changes.",
        "Gate high-risk changes with documented threat–control mapping.",
    ],
    [
        "Navigate the OWASP Agentic risk list and map items to layered controls.",
        "Explain why multiple compensating controls beat single-point prompt filters.",
        "Communicate residual risk to product and compliance stakeholders.",
    ],
    [
        "Run a periodic defense-in-depth review across supply chain, runtime, and data.",
        "Assign accountable owners per control domain.",
        "Capture evidence suitable for audits and customer security questionnaires.",
    ],
]

READING: list[list[tuple[str, str]]] = [
    [
        ("NIST SP 800-218 (SSDF)", "https://csrc.nist.gov/publications/detail/sp/800-218/final"),
        ("SLSA supply-chain levels", "https://slsa.dev/spec/"),
        ("OpenSSF Scorecard", "https://scorecard.dev/"),
        ("Sigstore / Cosign", "https://docs.sigstore.dev/cosign/overview/"),
        ("CycloneDX (SBOM)", "https://cyclonedx.org/"),
        ("SPDX", "https://spdx.dev/"),
        ("Trivy (scanner)", "https://trivy.dev/latest/"),
        ("OSV-Scanner", "https://google.github.io/osv-scanner/"),
        ("CNCF Harbor", "https://goharbor.io/docs/"),
    ],
    [
        ("Google distroless", "https://github.com/GoogleContainerTools/distroless"),
        ("Chainguard Images (overview)", "https://www.chainguard.dev/chainguard-images"),
        ("NSA / CISA Kubernetes Hardening Guide", "https://media.defense.gov/2022/Mar/23/2002965772/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220315.PDF"),
        ("CIS Kubernetes Benchmark", "https://www.cisecurity.org/benchmark/kubernetes"),
        ("Kyverno policies", "https://kyverno.io/docs/"),
    ],
    [
        ("Kyverno verifyImages", "https://kyverno.io/docs/writing-policies/verify-images/"),
        ("OPA Gatekeeper", "https://open-policy-agent.github.io/gatekeeper/website/docs/"),
        ("Kubernetes admission control overview", "https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/"),
        ("Ratify (artifact ratification)", "https://ratify.dev/"),
    ],
    [
        ("Kubernetes RBAC good practices", "https://kubernetes.io/docs/concepts/security/rbac-good-practices/"),
        ("NIST SP 800-207 (Zero Trust)", "https://csrc.nist.gov/publications/detail/sp/800-207/final"),
        ("OWASP API Security Top 10", "https://owasp.org/www-project-api-security/"),
    ],
    [
        ("NIST SP 800-207 (Zero Trust Architecture)", "https://csrc.nist.gov/publications/detail/sp/800-207/final"),
        ("NIST AI RMF Playbook", "https://www.nist.gov/itl/ai-risk-management-framework"),
        ("ENISA Multilayer Framework for Good Cybersecurity Practices for AI", "https://www.enisa.europa.eu/publications/multilayer-framework-for-good-cybersecurity-practices-for-ai"),
    ],
    [
        ("HashiCorp Vault security model", "https://developer.hashicorp.com/vault/docs/internals/security"),
        ("NIST SP 800-57 (key management)", "https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final"),
        ("WORM / immutability (SNIA overview)", "https://www.snia.org/education/what-is-worm-storage"),
    ],
    [
        ("Istio security (mTLS)", "https://istio.io/latest/docs/concepts/security/"),
        ("Kubernetes NetworkPolicies", "https://kubernetes.io/docs/concepts/services-networking/network-policies/"),
        ("NIST SP 800-204B (micro-segmentation with service mesh)", "https://csrc.nist.gov/publications/detail/sp/800-204b/final"),
    ],
    [
        ("Kata Containers", "https://katacontainers.io/docs/"),
        ("gVisor", "https://gvisor.dev/docs/"),
        ("NIST Application Container Security Guide", "https://csrc.nist.gov/publications/detail/sp/800-190/final"),
    ],
    [
        ("Model Context Protocol (MCP) specification", "https://modelcontextprotocol.io/specification/draft"),
        ("OWASP Top 10 for Agentic Applications (2026)", "https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/"),
        ("OWASP API Security Top 10", "https://owasp.org/www-project-api-security/"),
    ],
    [
        ("Microsoft Presidio", "https://microsoft.github.io/presidio/"),
        ("Fluent Bit", "https://docs.fluentbit.io/manual/"),
        ("NIST Privacy Framework", "https://www.nist.gov/privacy-framework"),
    ],
    [
        ("NIST AI RMF (integrity / measurement)", "https://www.nist.gov/itl/ai-risk-management-framework"),
        ("Sigstore blob signing", "https://docs.sigstore.dev/cosign/signing/overview/"),
        ("OWASP Top 10 for LLM Applications", "https://owasp.org/www-project-top-10-for-large-language-model-applications/"),
    ],
    [
        ("Falco", "https://falco.org/docs/"),
        ("OpenTelemetry", "https://opentelemetry.io/docs/"),
        ("Prometheus docs", "https://prometheus.io/docs/introduction/overview/"),
        ("Wazuh", "https://documentation.wazuh.com/current/"),
    ],
    [
        ("Falco Talon (response)", "https://docs.falco.org/projects/talon/"),
        ("MITRE D3FEND (response techniques)", "https://d3fend.mitre.org/"),
        ("NIST SP 800-61 (incident handling)", "https://csrc.nist.gov/publications/detail/sp/800-61/rev-2/final"),
    ],
    [
        ("NIST SP 800-61 Rev. 2 (Computer Security Incident Handling)", "https://csrc.nist.gov/publications/detail/sp/800-61/rev-2/final"),
        ("FIRST PICERL / CSIRT frameworks", "https://www.first.org/"),
        ("NIST SP 800-34 (contingency planning)", "https://csrc.nist.gov/publications/detail/sp/800-34/rev-1/final"),
    ],
    [
        ("Kubernetes ResourceQuota / LimitRange", "https://kubernetes.io/docs/concepts/policy/resource-quotas/"),
        ("NVIDIA GPU Operator / scheduling (vendor)", "https://docs.nvidia.com/datacenter/cloud-native/"),
        ("OWASP Top 10 for LLM (availability / DoS themes)", "https://owasp.org/www-project-top-10-for-large-language-model-applications/"),
    ],
    [
        ("CIS Workbench (benchmarks for workstations)", "https://www.cisecurity.org/cis-benchmarks"),
        ("NIST SP 800-63 (digital identity)", "https://pages.nist.gov/800-63-4/"),
        ("Sigstore Git signing (keyless)", "https://docs.sigstore.dev/signing/git-support/"),
    ],
    [
        ("Helm best practices", "https://helm.sh/docs/chart_best_practices/"),
        ("Kubernetes production checklist (SIG)", "https://github.com/kubernetes/sig-security/tree/main/sig-security-external-audit"),
        ("CIS Kubernetes Benchmark", "https://www.cisecurity.org/benchmark/kubernetes"),
    ],
    [
        ("Microsoft STRIDE / threat modeling", "https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats"),
        ("OWASP Threat Dragon", "https://owasp.org/www-project-threat-dragon/"),
        ("MITRE ATLAS (AI threats)", "https://atlas.mitre.org/"),
    ],
    [
        ("OWASP Top 10 for Agentic Applications (2026)", "https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/"),
        ("OWASP Top 10 for LLM Applications", "https://owasp.org/www-project-top-10-for-large-language-model-applications/"),
        ("NIST AI RMF", "https://www.nist.gov/itl/ai-risk-management-framework"),
    ],
    [
        ("NIST CSF 2.0", "https://www.nist.gov/cyberframework"),
        ("CIS Controls", "https://www.cisecurity.org/controls"),
        ("ISO/IEC 27001 (ISMS overview)", "https://www.iso.org/standard/27001"),
    ],
]


def neutralize_body(s: str) -> str:
    """Vendor-neutral language; keep technical names where they are proper nouns for tools."""
    reps: list[tuple[str, str]] = [
        (
            "unacceptable for ClawQL deployments",
            "unacceptable for production deployments that include LLM agents, tools, and sensitive data",
        ),
        (
            "This guide explains why relying on public registries is unacceptable",
            "This module explains why relying on public registries without controls is unacceptable",
        ),
        (
            "ClawQL designates Harbor as the single source of truth for all artifacts",
            "A common enterprise pattern is to designate a private registry (for example Harbor, ECR with pull-through cache, or ACR) as the single source of truth for all artifacts",
        ),
        (
            "All ClawQL components are configured to pull exclusively from your internal Harbor instance.",
            "All production workloads should be configured to pull exclusively from that internal registry.",
        ),
        (
            "The clawql-full-stack umbrella chart and Kubernetes Operator enforce these rules",
            "Helm umbrella charts, GitOps, or an in-cluster operator often enforce equivalent rules",
        ),
        ("harbor.clawql.internal", "registry.internal.example"),
        (
            "Tools used in the ClawQL pipeline",
            "Tools commonly used in hardened CI/CD pipelines",
        ),
        ("ClawQL uses a two-layer defense", "Strong pipelines often use a two-layer defense"),
        ("### Practical ClawQL Implementation Summary", "### Practical implementation checklist"),
        (
            "These controls are already built into the official ClawQL Helm charts and Kubernetes Operator.",
            "Automate as many of these controls as possible in your charts, operators, or policy-as-code repos.",
        ),
        ("In an MCP-based agentic system like ClawQL", "In an MCP-based or tool-calling agentic system"),
        ("ClawQL shifts to a full Zero Trust posture", "organizations typically shift to a full Zero Trust posture"),
        (
            "This guide introduces the core philosophy that underpins the entire architecture",
            "This module introduces the core philosophy that underpins resilient architectures",
        ),
        ("ClawQL’s Zero Trust model treats", "A Zero Trust model for agentic systems treats"),
        ("Instead of trying to filter natural language, ClawQL restricts", "Instead of trying to filter natural language, effective platforms restrict"),
        ("### Core Zero Trust Controls in ClawQL", "### Core Zero Trust controls to implement"),
        ("ClawQL invests equally in containment", "Well-designed platforms invest equally in containment"),
        ("ClawQL applies PoLP at multiple layers", "Apply least privilege at multiple layers"),
        ("Every ClawQL component runs with its own", "Every component should run with its own"),
        ("No ClawQL pod ever runs with", "No production pod should run with"),
        ("The Operator manages these bindings", "Your GitOps or operator pattern should manage these bindings"),
        ("Any change to the clawql-full-stack Helm chart", "Any change to production Helm charts for the control plane"),
        ("All production Helm upgrades are signed and verified.", "Treat production Helm upgrades as signed, reviewed changes."),
        ("The most powerful least-privilege control in ClawQL is", "One of the most powerful least-privilege controls in agent stacks is"),
        ("Panguard AI and the intelligent MCP gateway enforce", "A synchronous MCP gateway or policy proxy can enforce"),
        ("ClawQL follows the PICERL framework", "Teams often follow the PICERL framework"),
        ("ClawQL deploys a full open-source observability suite", "Reference architectures often deploy a full observability suite"),
        ("ClawQL requires", "Runbooks should require"),
        ("ClawQL treats the threat model", "Mature programs treat the threat model"),
        ("ClawQL applies STRIDE specifically", "This module applies STRIDE specifically"),
        ("No production change is approved without", "No high-risk production change should ship without"),
        ("ClawQL mitigates the OWASP Agentic Top 10", "Defense in depth mitigates the OWASP Agentic Top 10"),
        ("ClawQL was designed from the ground up with these risks in mind.", "These risks apply to any autonomous agent architecture."),
        ("This guide maps each major risk", "This module maps each major risk"),
        ("Completing this checklist keeps ClawQL’s security posture", "Completing this checklist keeps your organization’s security posture"),
    ]
    for a, b in reps:
        s = s.replace(a, b)
    s = s.replace("**ClawQL Mitigation**", "**Example control patterns**")
    s = s.replace("**Next in the series**", "**Next module**")
    s = s.replace("**Next (Final) in the series**", "**Next module (final)**")
    s = re.sub(
        r"every subsequent guide in the series",
        "every subsequent module in this curriculum",
        s,
        flags=re.I,
    )
    s = re.sub(
        r"the following guides\.",
        "the following modules.",
        s,
        flags=re.I,
    )
    s = re.sub(r"in the series\.", "in this curriculum.", s, flags=re.I)
    s = re.sub(r"in the series ", "in this curriculum ", s, flags=re.I)
    s = re.sub(r"Guide (\d+)", r"Module \1", s)
    s = re.sub(r"Guides (\d+)–(\d+)", r"Modules \1–\2", s)
    s = re.sub(r"Guides (\d+)–(\d+)", r"Modules \1–\2", s)
    s = re.sub(r"\(Guide (\d+)\)", r"(Module \1)", s)
    s = re.sub(r"\(Guides (\d+) and (\d+)\)", r"(Modules \1 and \2)", s)
    s = re.sub(r"\(Guides (\d+)–(\d+)\)", r"(Modules \1–\2)", s)
    return s


def build_header(part: int, prev_slug: str | None, next_slug: str | None, minutes: int) -> str:
    prev_line = (
        f"- Prior module: [{TITLES[part - 2]}]({part - 1:02d}-{prev_slug}.md)"
        if part > 1 and prev_slug
        else "- None (this is the first module)."
    )
    obj = OBJECTIVES[part - 1]
    obj_txt = "\n".join(f"{i}. {t}" for i, t in enumerate(obj, start=1))
    lab = ""
    if part <= 19:
        lab = "\n\n**Suggested discussion / lab:** Pick one diagram in your environment (build, deploy, runtime) and mark where this module’s controls apply; note gaps versus the checklist in the body."
    return f"""## How to use this module

Use it as **self-paced** study or as **instructor-led** training. YAML, commands, and policy excerpts are **illustrative**; map them to your cloud, mesh, identity provider, and agent runtime—substitute your own names, namespaces, and tools while preserving the **control intent**.

**Estimated time:** ~{minutes} minutes reading; add time for linked standards and team discussion.

## Learning objectives

By the end of this module, you should be able to:

{obj_txt}

## Prerequisites

{prev_line}
{lab}

---

"""


def build_reading(part: int) -> str:
    rows = "\n".join(f"- [{t}]({u})" for t, u in READING[part - 1])
    return f"""

## Further reading (vendor-neutral)

These resources are independent of any single product; use them to deepen the topic for audits, architecture reviews, or procurement discussions.

{rows}

## Commercial training use

You may reuse this curriculum internally or in **paid consulting / training** engagements. Keep examples aligned to the customer’s actual stack; substitute your own runbooks, tool names, and compliance frameworks (SOC 2, ISO 27001, sector regulators) where cited examples use a reference architecture only.

---
"""


def main() -> None:
    for part in range(1, 21):
        slug = SLUGS[part - 1]
        path = DIR / f"{part:02d}-{slug}.md"
        text = path.read_text(encoding="utf-8")
        if text.startswith("---\n"):
            end = text.index("\n---\n", 3) + 5
            fm_raw = text[3 : end - 5].strip()
            body = text[end:]
        else:
            raise SystemExit(f"no frontmatter: {path}")

        body = body.lstrip("\n")

        fm_lines = []
        for line in fm_raw.split("\n"):
            if line.startswith("series:"):
                fm_lines.append('series: "Agentic AI Security Curriculum"')
                continue
            if line.startswith("title:") and part == 19:
                fm_lines.append(
                    'title: "OWASP Agentic Top 10: Mapping Risks to Architectural Controls"'
                )
                continue
            if line.startswith("title:"):
                fm_lines.append(line)
                continue
            if line.startswith("description:"):
                # refreshed below
                continue
            fm_lines.append(line)
        # insert new keys after series
        insertions = [
            'course_type: "instructor-ready / self-study"',
            'audience: "Security architects, platform engineers, and teams adopting AI agents"',
            f'estimated_minutes: {MINUTES[part - 1]}',
        ]
        out_fm: list[str] = []
        for line in fm_lines:
            out_fm.append(line)
            if line.startswith('series: "Agentic AI Security Curriculum"'):
                out_fm.extend(insertions)
        # description: first sentence neutral
        desc = (
            OBJECTIVES[part - 1][0][:220] + "…"
            if len(OBJECTIVES[part - 1][0]) > 220
            else OBJECTIVES[part - 1][0]
        )
        out_fm.append(f'description: "{desc}"')

        prev_slug = SLUGS[part - 2] if part > 1 else None
        body = neutralize_body(body)
        # subtitle line
        body = re.sub(
            r"\*Part (\d+) of the ClawQL Security Best Practices Series · May 2026\*",
            r"*Module \1 of 20 · Agentic AI Security Curriculum · May 2026*",
            body,
            count=1,
        )
        # H1 for part 19
        if part == 19:
            body = body.replace(
                "# OWASP Agentic Top 10 and How ClawQL Mitigates Each One\n",
                "# OWASP Agentic Top 10: Mapping Risks to Architectural Controls\n",
                1,
            )

        header = build_header(part, prev_slug, SLUGS[part] if part < 20 else None, MINUTES[part - 1])
        # insert header after first line (# title)
        m = re.match(r"^(#[^\n]+)(\n\n\*Module[^\n]+\*\n)", body, re.M)
        if not m:
            raise SystemExit(f"unexpected body start {path}: {body[:200]!r}")
        rest = body[m.end() :]
        new_body = m.group(1) + "\n" + m.group(2) + header + rest.lstrip("\n")

        new_body = new_body.rstrip() + build_reading(part)

        out = "---\n" + "\n".join(out_fm) + "\n---\n" + new_body + "\n"
        path.write_text(out, encoding="utf-8")
        print("updated", path.name)


if __name__ == "__main__":
    main()
