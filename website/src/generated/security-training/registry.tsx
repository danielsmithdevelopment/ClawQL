import type { ComponentType } from 'react'

import Body4 from './bodies/agent-gateway-hardening-dns-rebinding.mdx'
import Body9 from './bodies/agent-identity-lifecycle-provisioning.mdx'
import Body8 from './bodies/authentication-session-management-scoped-tokens.mdx'
import Body19 from './bodies/automated-response-incident-recovery-picerl.mdx'
import Body2 from './bodies/clawhub-skill-vetting-safe-installation.mdx'
import Body1 from './bodies/cluster-admission-control-signing-policy.mdx'
import Body28 from './bodies/compliance-regulatory-mapping.mdx'
import Body0 from './bodies/container-image-security-pinning-distroless-golden-images.mdx'
import Body14 from './bodies/data-classification-pii-redaction-residency.mdx'
import Body20 from './bodies/development-deployment-security.mdx'
import Body27 from './bodies/disaster-recovery-business-continuity.mdx'
import Body5 from './bodies/egress-filtering-dns-dlp.mdx'
import Body16 from './bodies/gpu-resource-protection-isolation.mdx'
import Body29 from './bodies/human-operator-security-admin-controls.mdx'
import Body12 from './bodies/input-validation-protocol-hardening.mdx'
import Body6 from './bodies/least-privilege-scoped-kubernetes-identities.mdx'
import Body11 from './bodies/mcp-runtime-enforcement-panguard-atr.mdx'
import Body17 from './bodies/memory-context-poisoning-prevention.mdx'
import Body15 from './bodies/model-weight-integrity-verification.mdx'
import Body13 from './bodies/multi-agent-trust-orchestrator-security.mdx'
import Body22 from './bodies/owasp-agentic-top-10-mitigations.mdx'
import Body24 from './bodies/quarterly-security-review-checklist.mdx'
import Body23 from './bodies/red-teaming-adversarial-testing.mdx'
import Body10 from './bodies/sandboxing-kata-gvisor-seatbelt.mdx'
import Body7 from './bodies/secrets-at-rest-vault-hsm-audit.mdx'
import Body26 from './bodies/secure-multi-tenancy-isolation.mdx'
import Body18 from './bodies/security-monitoring-observability-siem.mdx'
import Body30 from './bodies/third-party-model-api-security.mdx'
import Body21 from './bodies/threat-modelling-stride-agentic-ai.mdx'
import Body25 from './bodies/vulnerability-management-patch-cryptography.mdx'
import Body31 from './bodies/where-to-start-prioritization-new-deployment.mdx'
import Body3 from './bodies/zero-trust-network-mtls-istio-rbac.mdx'

export type TrainingModuleMeta = {
  slug: string
  title: string
  description: string
  part: number
  totalParts: number
  prev: string | null
  next: string | null
}

export const trainingModules: TrainingModuleMeta[] = [
  {
    slug: 'container-image-security-pinning-distroless-golden-images',
    title:
      'Container Image Security: Pinning, Distroless Pipelines, Mirror Registries, and Golden Images',
    description:
      'Digest pinning, distroless golden images, private mirror registries, and CI scanning from source to registry.',
    part: 1,
    totalParts: 32,
    prev: null,
    next: 'cluster-admission-control-signing-policy',
  },
  {
    slug: 'cluster-admission-control-signing-policy',
    title:
      'Cluster Admission Control: Image Signing, Kyverno, and Blocking Unsigned Workloads',
    description:
      'Cosign verification and Kyverno admission policies that block unsigned or policy-violating workloads.',
    part: 2,
    totalParts: 32,
    prev: 'container-image-security-pinning-distroless-golden-images',
    next: 'clawhub-skill-vetting-safe-installation',
  },
  {
    slug: 'clawhub-skill-vetting-safe-installation',
    title:
      'ClawHub Skill Vetting and Safe Installation: Signature Verification, Sandbox Testing, and Allowlisting',
    description:
      'Vet third-party skills with manifest signing, static analysis, sandbox observation, and hash pinning.',
    part: 3,
    totalParts: 32,
    prev: 'cluster-admission-control-signing-policy',
    next: 'zero-trust-network-mtls-istio-rbac',
  },
  {
    slug: 'zero-trust-network-mtls-istio-rbac',
    title:
      'Zero Trust Network Architecture: mTLS, Istio, RBAC, and Workload Identity',
    description:
      'SPIFFE workload identity, STRICT mTLS, default-deny networking, and L7 AuthorizationPolicy.',
    part: 4,
    totalParts: 32,
    prev: 'clawhub-skill-vetting-safe-installation',
    next: 'agent-gateway-hardening-dns-rebinding',
  },
  {
    slug: 'agent-gateway-hardening-dns-rebinding',
    title:
      'Agent Gateway Hardening: Binding, Firewall Rules, DNS Rebinding Defense, and Safe Remote Access',
    description:
      'Localhost binding, VPN-only access, Host/Origin validation, and listening-port drift detection.',
    part: 5,
    totalParts: 32,
    prev: 'zero-trust-network-mtls-istio-rbac',
    next: 'egress-filtering-dns-dlp',
  },
  {
    slug: 'egress-filtering-dns-dlp',
    title: 'Egress Filtering, DNS Controls, and Data Loss Prevention',
    description:
      'ServiceEntry allowlists, SSRF prevention, DNS tunneling heuristics, and tool-call DLP.',
    part: 6,
    totalParts: 32,
    prev: 'agent-gateway-hardening-dns-rebinding',
    next: 'least-privilege-scoped-kubernetes-identities',
  },
  {
    slug: 'least-privilege-scoped-kubernetes-identities',
    title:
      'Least Privilege and Scoped Kubernetes Identities: ServiceAccounts, IRSA, and Workload Identity',
    description:
      'One ServiceAccount per workload, scoped RBAC, and cloud workload identity federation.',
    part: 7,
    totalParts: 32,
    prev: 'egress-filtering-dns-dlp',
    next: 'secrets-at-rest-vault-hsm-audit',
  },
  {
    slug: 'secrets-at-rest-vault-hsm-audit',
    title:
      'Secrets at Rest: Vault Integration, HSM Backing, and Tamper-Proof Audit Logging',
    description:
      'Dynamic secrets, HSM unseal, gateway token exchange, and WORM Vault audit logs.',
    part: 8,
    totalParts: 32,
    prev: 'least-privilege-scoped-kubernetes-identities',
    next: 'authentication-session-management-scoped-tokens',
  },
  {
    slug: 'authentication-session-management-scoped-tokens',
    title:
      'Authentication and Session Management: Per-Request Scoped Tokens, OAuth/OIDC, Rotation, and Replay Prevention',
    description:
      'Tool-scoped tokens, OAuth for external APIs, nonce replay prevention, and device pairing.',
    part: 9,
    totalParts: 32,
    prev: 'secrets-at-rest-vault-hsm-audit',
    next: 'agent-identity-lifecycle-provisioning',
  },
  {
    slug: 'agent-identity-lifecycle-provisioning',
    title:
      'Agent Identity Lifecycle: Provisioning, Scope Governance, and Decommissioning',
    description:
      'Joiner-mover-leaver for agents: approval workflows, scope trials, orphan detection, and forensic shutdown.',
    part: 10,
    totalParts: 32,
    prev: 'authentication-session-management-scoped-tokens',
    next: 'sandboxing-kata-gvisor-seatbelt',
  },
  {
    slug: 'sandboxing-kata-gvisor-seatbelt',
    title:
      'Sandboxing Agent Workloads: Kata Containers, gVisor, and macOS Seatbelt',
    description:
      'Choose Kata, gVisor, or seccomp baselines by workload trust and performance requirements.',
    part: 11,
    totalParts: 32,
    prev: 'agent-identity-lifecycle-provisioning',
    next: 'mcp-runtime-enforcement-panguard-atr',
  },
  {
    slug: 'mcp-runtime-enforcement-panguard-atr',
    title:
      'MCP Runtime Enforcement: Panguard, ATR Rules, Schema Validation, and Injection Defense',
    description:
      'Enforce policy at the structured tool-call layer with ATR, schema validation, and HITL deny-on-timeout.',
    part: 12,
    totalParts: 32,
    prev: 'sandboxing-kata-gvisor-seatbelt',
    next: 'input-validation-protocol-hardening',
  },
  {
    slug: 'input-validation-protocol-hardening',
    title:
      'Input Validation and Protocol Hardening: SSRF Prevention, Token Limits, Encoding Defense, and Replay Prevention',
    description:
      'Harden the MCP input boundary before Panguard: JSON safety, SSRF, token budgets, and tool manifest integrity.',
    part: 13,
    totalParts: 32,
    prev: 'mcp-runtime-enforcement-panguard-atr',
    next: 'multi-agent-trust-orchestrator-security',
  },
  {
    slug: 'multi-agent-trust-orchestrator-security',
    title:
      'Multi-Agent Trust Hierarchies and Orchestrator Security: Delegation, Result Integrity, and Blast Radius Isolation',
    description:
      'Signed instructions and results, downward-only ATR delegation, and pipeline-level risk scoring.',
    part: 14,
    totalParts: 32,
    prev: 'input-validation-protocol-hardening',
    next: 'data-classification-pii-redaction-residency',
  },
  {
    slug: 'data-classification-pii-redaction-residency',
    title:
      'Data Classification and PII Redaction: Tagging, Anonymisation, and Residency Controls',
    description:
      'Four-level taxonomy, Presidio at write boundaries, and classification-gated recall.',
    part: 15,
    totalParts: 32,
    prev: 'multi-agent-trust-orchestrator-security',
    next: 'model-weight-integrity-verification',
  },
  {
    slug: 'model-weight-integrity-verification',
    title: 'Model Weight Integrity: Verifying Authenticity Before Every Load',
    description:
      'Signed weight manifests, per-load hash verification, honest limits of backdoor detection, and multi-provider weight promotion.',
    part: 16,
    totalParts: 32,
    prev: 'data-classification-pii-redaction-residency',
    next: 'gpu-resource-protection-isolation',
  },
  {
    slug: 'gpu-resource-protection-isolation',
    title:
      'GPU and Resource Protection: Isolation, Quotas, and Side-Channel Defences',
    description:
      'MIG isolation, namespace GPU quotas, and monitoring for unexpected GPU consumers.',
    part: 17,
    totalParts: 32,
    prev: 'model-weight-integrity-verification',
    next: 'memory-context-poisoning-prevention',
  },
  {
    slug: 'memory-context-poisoning-prevention',
    title:
      'Memory and Context Poisoning Prevention: Redaction at Source and Immutable Agent Memory',
    description:
      'Merkle integrity, WORM storage, per-subject encryption, and poisoning detection at write time.',
    part: 18,
    totalParts: 32,
    prev: 'gpu-resource-protection-isolation',
    next: 'security-monitoring-observability-siem',
  },
  {
    slug: 'security-monitoring-observability-siem',
    title:
      'Security Monitoring and Observability Architecture: Falco, Wazuh, SIEM Integration, and Telemetry Design',
    description:
      'Canonical security event schema, SIEM correlation, cardinality-safe metrics, and NOC dashboards.',
    part: 19,
    totalParts: 32,
    prev: 'memory-context-poisoning-prevention',
    next: 'automated-response-incident-recovery-picerl',
  },
  {
    slug: 'automated-response-incident-recovery-picerl',
    title:
      'Automated Response and Incident Recovery: Talon, Quarantine, PICERL, and WORM Audits',
    description:
      'Automated quarantine, circuit breakers, PICERL lifecycle, and forensic preservation before revocation.',
    part: 20,
    totalParts: 32,
    prev: 'security-monitoring-observability-siem',
    next: 'development-deployment-security',
  },
  {
    slug: 'development-deployment-security',
    title:
      'Development and Deployment Security: Workstation Hardening, Local Dev, and Secure Production Deployment',
    description:
      'Harden developer laptops and enforce secure-by-default production deploys with staging parity.',
    part: 21,
    totalParts: 32,
    prev: 'automated-response-incident-recovery-picerl',
    next: 'threat-modelling-stride-agentic-ai',
  },
  {
    slug: 'threat-modelling-stride-agentic-ai',
    title:
      'Threat Modelling for Agentic AI: STRIDE, Attack Trees, and Living Threat Models',
    description:
      'Extend STRIDE for agentic threats and maintain a living threat model in version control.',
    part: 22,
    totalParts: 32,
    prev: 'development-deployment-security',
    next: 'owasp-agentic-top-10-mitigations',
  },
  {
    slug: 'owasp-agentic-top-10-mitigations',
    title: 'OWASP Agentic Top 10: Mitigations and Control Mapping',
    description:
      'Map ASI01–ASI10 to deployed ClawQL controls with test evidence from the adversarial suite.',
    part: 23,
    totalParts: 32,
    prev: 'threat-modelling-stride-agentic-ai',
    next: 'red-teaming-adversarial-testing',
  },
  {
    slug: 'red-teaming-adversarial-testing',
    title:
      'Red Teaming and Adversarial Testing Methodology: Proving the Controls Work',
    description:
      'YAML attack library in CI, purple-team exercises, and MCP-scoped external pen tests.',
    part: 24,
    totalParts: 32,
    prev: 'owasp-agentic-top-10-mitigations',
    next: 'quarterly-security-review-checklist',
  },
  {
    slug: 'quarterly-security-review-checklist',
    title:
      'Quarterly Security Review Checklist: Metrics, Rotations, and Continuous Posture Verification',
    description:
      'Evidence-driven quarterly review: rotations, allowlists, restore tests, and signed reports.',
    part: 25,
    totalParts: 32,
    prev: 'red-teaming-adversarial-testing',
    next: 'vulnerability-management-patch-cryptography',
  },
  {
    slug: 'vulnerability-management-patch-cryptography',
    title: 'Vulnerability Management, Patch Cadence, and Cryptographic Agility',
    description:
      'Reachability-based triage, session-drain rolling updates, and planned algorithm migrations.',
    part: 26,
    totalParts: 32,
    prev: 'quarterly-security-review-checklist',
    next: 'secure-multi-tenancy-isolation',
  },
  {
    slug: 'secure-multi-tenancy-isolation',
    title:
      'Secure Multi-Tenancy: Namespace Isolation, Per-Tenant Vault Paths, and Audit Segregation',
    description:
      'Tenant-scoped Vault paths, memory partitions, and per-tenant WORM audit destinations.',
    part: 27,
    totalParts: 32,
    prev: 'vulnerability-management-patch-cryptography',
    next: 'disaster-recovery-business-continuity',
  },
  {
    slug: 'disaster-recovery-business-continuity',
    title:
      'Disaster Recovery and Business Continuity: RTO/RPO, Session Recovery, and Cross-Region Failover',
    description:
      'Per-tier RTO/RPO, agent checkpoints, active/passive failover, and session recovery decision tree.',
    part: 28,
    totalParts: 32,
    prev: 'secure-multi-tenancy-isolation',
    next: 'compliance-regulatory-mapping',
  },
  {
    slug: 'compliance-regulatory-mapping',
    title:
      'Compliance and Regulatory Mapping: GDPR, HIPAA, SOC 2 Type II, and EU AI Act',
    description:
      'Map controls to GDPR, HIPAA, SOC 2, and EU AI Act with cryptographic erasure and evidence packages.',
    part: 29,
    totalParts: 32,
    prev: 'disaster-recovery-business-continuity',
    next: 'human-operator-security-admin-controls',
  },
  {
    slug: 'human-operator-security-admin-controls',
    title:
      'Human Operator Security: Admin Controls, Separation of Duties, Break-Glass Access, and External API Hygiene',
    description:
      'Mutually exclusive admin roles, 4-eyes changes, break-glass with audit, and webhook hardening.',
    part: 30,
    totalParts: 32,
    prev: 'compliance-regulatory-mapping',
    next: 'third-party-model-api-security',
  },
  {
    slug: 'third-party-model-api-security',
    title:
      'Third-Party Model API Security: Securing Calls to External LLM Providers',
    description:
      'API key hygiene, classification-gated outbound prompts, provider retention policies, multi-provider routing, and WORM audit for external LLM calls.',
    part: 31,
    totalParts: 32,
    prev: 'human-operator-security-admin-controls',
    next: 'where-to-start-prioritization-new-deployment',
  },
  {
    slug: 'where-to-start-prioritization-new-deployment',
    title: 'Where to Start: Prioritization for a New Deployment',
    description:
      'Sequencing guide for new deployments — the five controls to implement first, second tier before scaling, and why partial coverage is worse than focused depth.',
    part: 32,
    totalParts: 32,
    prev: 'third-party-model-api-security',
    next: null,
  },
]

export const trainingBodies: Record<string, ComponentType> = {
  'container-image-security-pinning-distroless-golden-images': Body0,
  'cluster-admission-control-signing-policy': Body1,
  'clawhub-skill-vetting-safe-installation': Body2,
  'zero-trust-network-mtls-istio-rbac': Body3,
  'agent-gateway-hardening-dns-rebinding': Body4,
  'egress-filtering-dns-dlp': Body5,
  'least-privilege-scoped-kubernetes-identities': Body6,
  'secrets-at-rest-vault-hsm-audit': Body7,
  'authentication-session-management-scoped-tokens': Body8,
  'agent-identity-lifecycle-provisioning': Body9,
  'sandboxing-kata-gvisor-seatbelt': Body10,
  'mcp-runtime-enforcement-panguard-atr': Body11,
  'input-validation-protocol-hardening': Body12,
  'multi-agent-trust-orchestrator-security': Body13,
  'data-classification-pii-redaction-residency': Body14,
  'model-weight-integrity-verification': Body15,
  'gpu-resource-protection-isolation': Body16,
  'memory-context-poisoning-prevention': Body17,
  'security-monitoring-observability-siem': Body18,
  'automated-response-incident-recovery-picerl': Body19,
  'development-deployment-security': Body20,
  'threat-modelling-stride-agentic-ai': Body21,
  'owasp-agentic-top-10-mitigations': Body22,
  'red-teaming-adversarial-testing': Body23,
  'quarterly-security-review-checklist': Body24,
  'vulnerability-management-patch-cryptography': Body25,
  'secure-multi-tenancy-isolation': Body26,
  'disaster-recovery-business-continuity': Body27,
  'compliance-regulatory-mapping': Body28,
  'human-operator-security-admin-controls': Body29,
  'third-party-model-api-security': Body30,
  'where-to-start-prioritization-new-deployment': Body31,
}

export function getTrainingMeta(slug: string): TrainingModuleMeta | undefined {
  return trainingModules.find((m) => m.slug === slug)
}
