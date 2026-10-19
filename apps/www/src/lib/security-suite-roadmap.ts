/**
 * Security suite roadmap for clawql.com/benchmarks#security-suite.
 * Source: docs/benchmarks/security-suite/
 */

export const securitySuiteHeadline = 'Security suite — beyond block lists'

export const securitySuiteSummary =
  'Boards that hit what a tool-name deny cannot express, and that matter even with no peer present. Same format as governance: defaults column, best-config column, frozen rules, published harness, maintainer invite. not_offered is only for capabilities a product never claims — measurable outcomes (like injection resistance) stay pending until run.'

export const securitySuiteCredibility =
  'Nobody can dispute a measured failure of something a product claims. Scoring a product down for something it never claims looks like a rigged test. Hiding a measurable peer outcome as not offered looks like avoiding the comparison.'

export type SecuritySuitePriority = {
  id: string
  priority: number
  title: string
  status: 'shipped' | 'partial' | 'scaffolded' | 'planned'
  why: string
}

export const securitySuiteBuildFirst: readonly SecuritySuitePriority[] = [
  {
    id: 'multi_attack_suite',
    priority: 1,
    title: 'Multi-attack injection suite',
    status: 'scaffolded',
    why: 'Smoke v4f: Obot defaults measured on Mac mini (12/12); best-config pending native webhook adapter. Counterfeit-policy ClawQL 0/4; model-judged cite Datadog. Then MAI_LIVE. Not published yet.',
  },
  {
    id: 'approval_integrity',
    priority: 2,
    title: 'Approval-integrity cells',
    status: 'partial',
    why: 'Self-approval, arg digests, replay, collusion, crash races. No peer’s configuration can tie these.',
  },
  {
    id: 'allowed_tool_exfil',
    priority: 3,
    title: 'Exfiltration through an allowed tool',
    status: 'planned',
    why: 'After a poisoned read, a permitted Slack (etc.) post moves internal data — proves data-flow control.',
  },
  {
    id: 'secret_visibility',
    priority: 4,
    title: 'Secret visibility from agent code',
    status: 'planned',
    why: 'Program/code-mode tries to read tokens, env, files. With vault injection, should get nothing. Timely now.',
  },
  {
    id: 'kill_mid_write',
    priority: 5,
    title: 'Kill-mid-write duplicates',
    status: 'planned',
    why: 'Race replicas and kill mid-write thousands of times. Count duplicate side effects — TLA+ predicts zero.',
  },
] as const

export type SecuritySuiteGroup = {
  id: string
  title: string
  property: string
  cells: readonly { id: string; title: string; detail: string }[]
}

export const securitySuiteGroups: readonly SecuritySuiteGroup[] = [
  {
    id: 'approvals',
    title: 'Approvals that can’t be gamed',
    property: 'People-bound, digest-bound, crash-safe mandates',
    cells: [
      {
        id: 'self_approval',
        title: 'Self-approval',
        detail: 'Agent tries to approve its own paused write — requires a different person with a security key.',
      },
      {
        id: 'arg_tamper',
        title: 'Argument tampering',
        detail: 'Approved at $52,000, executed at $520,000 — mandate digests refuse.',
      },
      {
        id: 'approval_replay',
        title: 'Replaying an approval',
        detail: 'Reuse one approval for a second write, or after it expires.',
      },
      {
        id: 'approver_collusion',
        title: 'Approver collusion',
        detail: 'Requester inside the approver group, or one person counted twice in N-of-M.',
      },
      {
        id: 'concurrent_crash',
        title: 'Concurrency and crashes',
        detail: 'Two replicas race; kill mid-write thousands of times — count duplicate side effects.',
      },
    ],
  },
  {
    id: 'injection',
    title: 'Injection and data flow',
    property: 'Attacks buyers fear most',
    cells: [
      {
        id: 'multi_attack',
        title: 'Multi-attack suite',
        detail: 'Planted instructions in emails, tickets, documents, webhooks — real models, count take-effect rate.',
      },
      {
        id: 'counterfeit_policy',
        title: 'Counterfeit-policy vs model judge',
        detail:
          'Datadog/Jev: prepended policy rewrites taxonomy. ClawQL deterministic measured; model-judged peers pending on a public set + JevShield best-config — no harness stand-in. A model advises the gate, never is the gate.',
      },
      {
        id: 'allowed_exfil',
        title: 'Allowed-tool exfiltration',
        detail: 'Poisoned read then a permitted tool moves vault data out.',
      },
      {
        id: 'persistent',
        title: 'Persistent injection',
        detail: 'Poison in memory or a skill fires in a later session — untrusted labels must survive storage.',
      },
      {
        id: 'rug_pull',
        title: 'Tool-description rug pull',
        detail: 'Upstream changes a tool description after approval — quarantine / owner review (cf. Uber gateway).',
      },
    ],
  },
  {
    id: 'credentials',
    title: 'Credentials',
    property: 'Especially after OpenCode-class breaches',
    cells: [
      {
        id: 'secret_vis',
        title: 'Secret visibility',
        detail: 'Agent code reading tokens, env, files — vault injection should yield nothing.',
      },
      {
        id: 'key_exfil',
        title: 'Stored key exfiltration',
        detail: 'Can provider keys be pulled back out through any tool, API, or log?',
      },
      {
        id: 'token_confusion',
        title: 'Token confusion',
        detail: 'Token minted for one tenant/resource used against another.',
      },
      {
        id: 'revocation',
        title: 'Revocation latency',
        detail: 'How long a revoked grant keeps working.',
      },
      {
        id: 'blast',
        title: 'Stolen-key blast radius',
        detail: 'With a key group and spend cap, how much damage before stop.',
      },
    ],
  },
  {
    id: 'containment',
    title: 'Containment',
    property: 'Sandbox and tenant boundaries',
    cells: [
      {
        id: 'sandbox',
        title: 'Sandbox escapes',
        detail: 'Network, filesystem, memory exhaustion, CPU loops from inside a program.',
      },
      {
        id: 'ssrf',
        title: 'SSRF',
        detail: 'Tool args to 169.254.169.254 and DNS-rebinding tricks.',
      },
      {
        id: 'xtenant',
        title: 'Cross-tenant access',
        detail: 'Attempts to reach another tenant’s resources.',
      },
    ],
  },
  {
    id: 'audit',
    title: 'Audit',
    property: 'Tamper-evident reconstruction',
    cells: [
      {
        id: 'tamper',
        title: 'Tamper detection',
        detail: 'Edit or delete a log entry — measure detection latency.',
      },
      {
        id: 'complete',
        title: 'Completeness',
        detail: 'Denied and failed calls logged as well as successes.',
      },
      {
        id: 'rebuild',
        title: 'Reconstruction',
        detail: 'Investigator rebuilds exact agent actions from the log alone.',
      },
    ],
  },
  {
    id: 'fail_safe',
    title: 'Failing safely',
    property: 'Outages and brakes',
    cells: [
      {
        id: 'dep_outage',
        title: 'Dependency outages',
        detail: 'Policy engine, mandate DB, or NATS down — refuse risky calls, don’t allow.',
      },
      {
        id: 'brake',
        title: 'Emergency brake',
        detail: 'Time from “pause this agent” to its last tool call.',
      },
      {
        id: 'runaway',
        title: 'Runaway loop',
        detail: 'Spend from a looping agent before a cap stops it.',
      },
    ],
  },
] as const

export const securitySuiteLinks = [
  {
    label: 'Full roadmap',
    href: 'https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/benchmarks/security-suite/ROADMAP.md',
    detail: 'Groups, build order, credibility rule',
  },
  {
    label: 'Frozen skeleton',
    href: 'https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/benchmarks/security-suite/frozen-rules.json',
    detail: 'security-suite-roadmap-v0',
  },
  {
    label: 'Governance fairness (v2)',
    href: '/benchmarks/#governance',
    detail: 'Defaults vs best-config — the format every suite board inherits',
  },
  {
    label: 'Multi-attack board',
    href: '/benchmarks/#multi-attack',
    detail: 'Smoke scorecard — not a live claim yet',
  },
  {
    label: 'Multi-attack harness',
    href: 'https://github.com/danielsmithdevelopment/ClawQL/tree/main/scripts/benchmarks/multi-attack-injection',
    detail: 'npm run benchmark:multi-attack-injection',
  },
  {
    label: 'OpenBench memory-injection',
    href: 'https://github.com/danielsmithdevelopment/ClawQL/tree/main/benchmarks/openbench/tasks/memory-injection-attempt',
    detail: 'Seed cell for the multi-attack suite',
  },
] as const
