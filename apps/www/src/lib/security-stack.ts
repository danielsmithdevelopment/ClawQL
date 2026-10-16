/**
 * Defense-in-depth stack for clawql.com/security.
 * Source visual: public/security/clawql-security-stack.jpg
 */

export type SecurityStackLayer = {
  n: number
  title: string
  body: string
  tags: readonly string[]
}

export type SecurityStackPhase = {
  id: string
  label: string
  layers: readonly SecurityStackLayer[]
}

export const securityStackHeadline = 'Defense in depth — every layer assumes the one before it can fail.'

export const securityStackSummary =
  'ClawQL’s security stack runs from supply chain through tool-call gates, containment, redaction, detection, and tamper-evident audit. Hardware attestation underneath is optional when the operator itself cannot be trusted.'

export const securityStackPhases: readonly SecurityStackPhase[] = [
  {
    id: 'before',
    label: 'Before it runs',
    layers: [
      {
        n: 1,
        title: 'Supply chain',
        body: 'Code, containers and node images: verify, sign, admit.',
        tags: [
          'Trivy',
          'Syft',
          'Cosign',
          'Kyverno',
          'Packer',
          'Ansible CIS hardening',
          'Approved AMIs',
          'gdp-ts compile-time proofs',
        ],
      },
      {
        n: 2,
        title: 'Model weights',
        body: 'Checked against a signed manifest on every start.',
        tags: ['SHA-256 manifest', 'Cosign signature', 'Init-container check'],
      },
      {
        n: 3,
        title: 'Identity & scope',
        body: 'Short-lived or single-use credentials, scoped identity.',
        tags: [
          'HashiCorp Vault',
          'Single-use tokens',
          'Response wrapping',
          'AWS secrets engine',
          'EKS Pod Identity',
          'IRSA',
          'STS session policies',
          'IdP-signed scope tokens',
          'Kubernetes RBAC',
          'Istio mTLS (SPIFFE)',
          'Istio AuthorizationPolicy',
        ],
      },
    ],
  },
  {
    id: 'tool-call',
    label: 'Every tool call',
    layers: [
      {
        n: 4,
        title: 'Tool-call gate',
        body: 'Known attacks blocked before the call runs.',
        tags: ['Panguard', 'Agent Threat Rules (ATR)'],
      },
      {
        n: 5,
        title: 'Information-flow policy',
        body: 'Data flows only where its label allows.',
        tags: ['OpenAPPA', 'Deny-by-default rules'],
      },
    ],
  },
  {
    id: 'runtime',
    label: 'While it runs',
    layers: [
      {
        n: 6,
        title: 'Containment',
        body: 'Isolated compute; only declared network paths.',
        tags: [
          'Kata Containers',
          'Agent Substrate microVMs',
          'gVisor',
          'Tetragon in-kernel blocking',
          'Security groups',
          'NetworkPolicy via CNI',
          'Calico or Cilium',
          'Egress gateway',
        ],
      },
      {
        n: 7,
        title: 'Data redaction',
        body: 'Personal data removed before logs or events leave.',
        tags: ['Microsoft Presidio', 'Fluent Bit log pipeline', 'Event payload redaction'],
      },
      {
        n: 8,
        title: 'Detect & respond',
        body: 'Sees what code actually does, then quarantines.',
        tags: ['Falco', 'gVisor engine', 'In-guest sensors', 'Falco Talon'],
      },
    ],
  },
  {
    id: 'always',
    label: 'Always',
    layers: [
      {
        n: 9,
        title: 'Tamper-evident audit',
        body: 'Write-once; any edit breaks the chain.',
        tags: ['WORM log', 'Hash chain', 'Merkle roots'],
      },
    ],
  },
] as const

export const securityStackAgentsNote = {
  title: 'Your agents',
  body: 'hold capabilities, never credentials',
} as const

export const securityStackHardware = {
  title: 'Hardware foundation (optional)',
  body: 'Watchdog off the host; attested execution.',
  tags: ['NVIDIA Sentry on BlueField-4', 'clawql-tee'] as const,
} as const
