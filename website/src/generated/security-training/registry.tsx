import type { ComponentType } from 'react'

import Body5 from './bodies/advanced-zero-trust-vault-hsm-provenance.mdx'
import Body12 from './bodies/automated-response-containment.mdx'
import Body2 from './bodies/cluster-admission-control-signing-policy.mdx'
import Body9 from './bodies/data-classification-pii-redaction-logs.mdx'
import Body1 from './bodies/golden-images-distroless-pipelines.mdx'
import Body14 from './bodies/gpu-resource-protection.mdx'
import Body13 from './bodies/incident-response-recovery-picerl.mdx'
import Body3 from './bodies/least-privilege-scoped-identities.mdx'
import Body8 from './bodies/mcp-runtime-protection-panguard-atr.mdx'
import Body10 from './bodies/model-integrity-verifying-weights.mdx'
import Body18 from './bodies/owasp-agentic-top-10-mitigations.mdx'
import Body16 from './bodies/production-deployment-secure-full-stack.mdx'
import Body19 from './bodies/quarterly-security-review-checklist.mdx'
import Body6 from './bodies/rbac-mtls-istio-service-mesh.mdx'
import Body11 from './bodies/runtime-monitoring-observability.mdx'
import Body7 from './bodies/sandboxing-kata-gvisor-tradeoffs.mdx'
import Body0 from './bodies/supply-chain-pinning-mirror-registry.mdx'
import Body17 from './bodies/threat-modeling-stride-agentic-ai.mdx'
import Body15 from './bodies/workstation-local-development-security.mdx'
import Body4 from './bodies/zero-trust-fundamentals.mdx'

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
    slug: 'supply-chain-pinning-mirror-registry',
    title:
      'Supply Chain Security: Why Pinning Versions and Running Your Own Mirror Registry Matters',
    description:
      'Explain why the software supply chain is a primary risk for agentic AI and tool-calling platforms.',
    part: 1,
    totalParts: 20,
    prev: null,
    next: 'golden-images-distroless-pipelines',
  },
  {
    slug: 'golden-images-distroless-pipelines',
    title:
      'Building Golden Images: Automated Scanning, Hardening, and Distroless Pipelines',
    description:
      'Explain why minimal (e.g. distroless) images and read-only root filesystems reduce container blast radius.',
    part: 2,
    totalParts: 20,
    prev: 'supply-chain-pinning-mirror-registry',
    next: 'cluster-admission-control-signing-policy',
  },
  {
    slug: 'cluster-admission-control-signing-policy',
    title:
      'Cluster Admission Control: Enforcing Image Signing and Policy at Deploy Time',
    description:
      'Describe the role of admission controllers in preventing mis-scoped workloads from running.',
    part: 3,
    totalParts: 20,
    prev: 'golden-images-distroless-pipelines',
    next: 'least-privilege-scoped-identities',
  },
  {
    slug: 'least-privilege-scoped-identities',
    title:
      'Principle of Least Privilege: Scoped Identities and Limiting Blast Radius',
    description:
      'Apply least privilege to Kubernetes identities (ServiceAccounts, Roles, bindings).',
    part: 4,
    totalParts: 20,
    prev: 'cluster-admission-control-signing-policy',
    next: 'zero-trust-fundamentals',
  },
  {
    slug: 'zero-trust-fundamentals',
    title: 'Zero Trust Fundamentals: Assume Compromise and Verify Everything',
    description:
      'State Zero Trust principles in the context of autonomous agents and external tools.',
    part: 5,
    totalParts: 20,
    prev: 'least-privilege-scoped-identities',
    next: 'advanced-zero-trust-vault-hsm-provenance',
  },
  {
    slug: 'advanced-zero-trust-vault-hsm-provenance',
    title:
      'Advanced Zero Trust: Multi-Sig Vault, HSM, Tamper-Proof Logging, and Cryptographic Provenance',
    description:
      'Compare static vs dynamic secrets and justify short TTLs for machine identities.',
    part: 6,
    totalParts: 20,
    prev: 'zero-trust-fundamentals',
    next: 'rbac-mtls-istio-service-mesh',
  },
  {
    slug: 'rbac-mtls-istio-service-mesh',
    title: 'RBAC, mTLS, and Istio Service Mesh: Network-Level Zero Trust',
    description:
      'Explain mutual TLS and service identity for east-west traffic in Kubernetes.',
    part: 7,
    totalParts: 20,
    prev: 'advanced-zero-trust-vault-hsm-provenance',
    next: 'sandboxing-kata-gvisor-tradeoffs',
  },
  {
    slug: 'sandboxing-kata-gvisor-tradeoffs',
    title:
      'Sandboxing Options and Trade-offs: Kata, gVisor, Seatbelt, Docker, and Cloudflare Workers',
    description:
      'Compare isolation technologies (VM-backed runtimes, user-space kernels, OS sandboxes).',
    part: 8,
    totalParts: 20,
    prev: 'rbac-mtls-istio-service-mesh',
    next: 'mcp-runtime-protection-panguard-atr',
  },
  {
    slug: 'mcp-runtime-protection-panguard-atr',
    title:
      'MCP Runtime Protection: Panguard, ATR Rules, and Agentic Threat Mitigation',
    description:
      'Explain synchronous policy enforcement for tool and API calls in agent architectures.',
    part: 9,
    totalParts: 20,
    prev: 'sandboxing-kata-gvisor-tradeoffs',
    next: 'data-classification-pii-redaction-logs',
  },
  {
    slug: 'data-classification-pii-redaction-logs',
    title:
      'Data Classification and PII Redaction: Never Let Sensitive Data Hit Logs',
    description:
      'Distinguish data classification from redaction and logging policy.',
    part: 10,
    totalParts: 20,
    prev: 'mcp-runtime-protection-panguard-atr',
    next: 'model-integrity-verifying-weights',
  },
  {
    slug: 'model-integrity-verifying-weights',
    title: 'Model Integrity: Verifying Weights Before Inference',
    description:
      'Explain why model artifacts need integrity checks beyond container image scanning.',
    part: 11,
    totalParts: 20,
    prev: 'data-classification-pii-redaction-logs',
    next: 'runtime-monitoring-observability',
  },
  {
    slug: 'runtime-monitoring-observability',
    title:
      'Runtime Monitoring and Observability: Falco, Wazuh, Prometheus, and Merkle Metrics',
    description:
      'Layer host-level detection, SIEM correlation, metrics, and tracing for AI platforms.',
    part: 12,
    totalParts: 20,
    prev: 'model-integrity-verifying-weights',
    next: 'automated-response-containment',
  },
  {
    slug: 'automated-response-containment',
    title:
      'Automated Response and Containment: Falco + Talon Quarantine, Panguard Blocking',
    description:
      'Map alert confidence to automated vs manual response actions.',
    part: 13,
    totalParts: 20,
    prev: 'runtime-monitoring-observability',
    next: 'incident-response-recovery-picerl',
  },
  {
    slug: 'incident-response-recovery-picerl',
    title:
      'Incident Response and Recovery: PICERL, WORM Audits, and Tested Backups',
    description:
      'Use a structured incident lifecycle (e.g. prepare → identify → contain → recover).',
    part: 14,
    totalParts: 20,
    prev: 'automated-response-containment',
    next: 'gpu-resource-protection',
  },
  {
    slug: 'gpu-resource-protection',
    title:
      'GPU and Resource Protection: Preventing Rogue Agent Denial-of-Service',
    description:
      'Apply quotas, limits, and scheduling policies to protect shared GPU pools.',
    part: 15,
    totalParts: 20,
    prev: 'incident-response-recovery-picerl',
    next: 'workstation-local-development-security',
  },
  {
    slug: 'workstation-local-development-security',
    title:
      'Workstation and Local Development Security: Same Posture Everywhere',
    description:
      'Extend production security expectations to developer laptops and CI runners.',
    part: 16,
    totalParts: 20,
    prev: 'gpu-resource-protection',
    next: 'production-deployment-secure-full-stack',
  },
  {
    slug: 'production-deployment-secure-full-stack',
    title: 'Production Deployment: One-Command Secure Full Stack',
    description:
      'Assemble a repeatable secure rollout checklist for complex stacks.',
    part: 17,
    totalParts: 20,
    prev: 'workstation-local-development-security',
    next: 'threat-modeling-stride-agentic-ai',
  },
  {
    slug: 'threat-modeling-stride-agentic-ai',
    title: 'Threat Modeling with STRIDE for Agentic AI Systems',
    description:
      'Apply STRIDE categories to agent identity, tools, memory, and orchestration.',
    part: 18,
    totalParts: 20,
    prev: 'production-deployment-secure-full-stack',
    next: 'owasp-agentic-top-10-mitigations',
  },
  {
    slug: 'owasp-agentic-top-10-mitigations',
    title: 'OWASP Agentic Top 10: Mapping Risks to Architectural Controls',
    description:
      'Navigate the OWASP Agentic risk list and map items to layered controls.',
    part: 19,
    totalParts: 20,
    prev: 'threat-modeling-stride-agentic-ai',
    next: 'quarterly-security-review-checklist',
  },
  {
    slug: 'quarterly-security-review-checklist',
    title:
      'Quarterly Security Review Checklist: Keeping Defense-in-Depth Alive',
    description:
      'Run a periodic defense-in-depth review across supply chain, runtime, and data.',
    part: 20,
    totalParts: 20,
    prev: 'owasp-agentic-top-10-mitigations',
    next: null,
  },
]

export const trainingBodies: Record<string, ComponentType> = {
  'supply-chain-pinning-mirror-registry': Body0,
  'golden-images-distroless-pipelines': Body1,
  'cluster-admission-control-signing-policy': Body2,
  'least-privilege-scoped-identities': Body3,
  'zero-trust-fundamentals': Body4,
  'advanced-zero-trust-vault-hsm-provenance': Body5,
  'rbac-mtls-istio-service-mesh': Body6,
  'sandboxing-kata-gvisor-tradeoffs': Body7,
  'mcp-runtime-protection-panguard-atr': Body8,
  'data-classification-pii-redaction-logs': Body9,
  'model-integrity-verifying-weights': Body10,
  'runtime-monitoring-observability': Body11,
  'automated-response-containment': Body12,
  'incident-response-recovery-picerl': Body13,
  'gpu-resource-protection': Body14,
  'workstation-local-development-security': Body15,
  'production-deployment-secure-full-stack': Body16,
  'threat-modeling-stride-agentic-ai': Body17,
  'owasp-agentic-top-10-mitigations': Body18,
  'quarterly-security-review-checklist': Body19,
}

export function getTrainingMeta(slug: string): TrainingModuleMeta | undefined {
  return trainingModules.find((m) => m.slug === slug)
}
