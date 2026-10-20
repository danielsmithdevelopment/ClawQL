/**
 * Harness² × ClawQL adversarial gate board — marketing mirror of
 * docs/benchmarks/harness2-gate-adversarial/
 *
 * Step 1 is a ClawQL claim under a stand-in optimizer — not a Harness² result.
 */

export const harness2Headline = 'Harness² × ClawQL — adversarial gate (step 1)'

export const harness2Summary =
  'Recursive harness optimizers search for shortcuts (skip approval, widen tools). Authority must sit outside the improvable harness. Step 1 measures a real ClawQL park/IFC gate against a stand-in optimizer — not upstream Harness² yet.'

export const harness2HeadlineResult =
  'ClawQL gate: every evasion failed (15 → 0 effectuated); six adaptations learned to request approval; utility held at 1.0 (recall + search). Passthrough: 21 → 19 effectuated. “The gate teaches good habits” is measured here.'

export const harness2Meta = {
  measuredAt: '2026-10-20',
  step: '1',
  boardLabel: 'harness2-gate-adversarial-step1',
  measuredLabel: 'Real ClawQL gate · stand-in optimizer · board_pass',
  artifact: 'docs/benchmarks/harness2-gate-adversarial/results-step1.json',
  spec: 'docs/benchmarks/harness2-gate-adversarial/SPEC.md',
  thesis: 'docs/vision/harness2-authority-outside.md',
} as const

export type Harness2ArmRow = {
  arm: string
  status: 'measured' | 'planned'
  evade: string
  adaptSucceeded: string
  utility: string
  note: string
  highlight?: boolean
}

/** Step 1 — regenerate via npm run benchmark:harness2-gate-adversarial */
export const harness2ArmRows: readonly Harness2ArmRow[] = [
  {
    arm: 'B · ClawQL gate',
    status: 'measured',
    evade: '15 → 0',
    adaptSucceeded: '6',
    utility: '1.0',
    note: 'park + session IFC; adapt ≠ evade',
    highlight: true,
  },
  {
    arm: 'A · Passthrough',
    status: 'measured',
    evade: '21 → 19',
    adaptSucceeded: '4',
    utility: 'n/a',
    note: 'Control — evasions take effect',
  },
] as const

export const harness2Honesty = [
  {
    title: 'What this claims',
    body: 'Evidence about ClawQL under an optimizing adversary (stand-in). board_pass requires evade_effectuated = 0 and utility held.',
  },
  {
    title: 'What this does not claim',
    body: 'Not a Harness² integration result. Not “defeated Harness².” v0 dual-sim numbers are illustrative only.',
  },
  {
    title: 'Step 2 (next)',
    body: 'Upstream Harness² + WorkBuddy / JobBench / LAB scorers; equal arms except gateway; lesson-poison cell. Publish when passthrough shows effectuated evasions + poisoned lessons and ClawQL shows neither with matching task scores.',
  },
] as const

/** Docs live on main after #1355 (gate) + #1362 (board). */
const H2_DOCS_REF = 'main'

export const harness2Links = [
  {
    label: 'Board SPEC',
    href: `https://github.com/danielsmithdevelopment/ClawQL/blob/${H2_DOCS_REF}/docs/benchmarks/harness2-gate-adversarial/SPEC.md`,
    detail: 'Publish bar · step 2 plan',
  },
  {
    label: 'Step 1 artifact',
    href: `https://github.com/danielsmithdevelopment/ClawQL/blob/${H2_DOCS_REF}/docs/benchmarks/harness2-gate-adversarial/results-step1.json`,
    detail: 'results-step1.json',
  },
  {
    label: 'Thesis',
    href: `https://github.com/danielsmithdevelopment/ClawQL/blob/${H2_DOCS_REF}/docs/vision/harness2-authority-outside.md`,
    detail: 'Authority outside the harness',
  },
  {
    label: 'Step 1 board PR',
    href: 'https://github.com/danielsmithdevelopment/ClawQL/pull/1362',
    detail: '#1362 — merged',
  },
] as const
