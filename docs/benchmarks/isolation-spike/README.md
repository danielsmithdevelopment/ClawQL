# Isolation spike evidence (open backends)

**ADR:** [0018](../../adr/0018-open-isolation-backends.md)

## Rules

- Pin backend versions from `ISOLATION_BACKEND_PINS`; re-check LICENSE at that tag when bumping.
- Record Mac model + macOS version on Darwin hosts.
- **Firecracker / gVisor on dedicated Linux:** publish-grade allowed when measured there.
- **Apple container / Lima:** `publishGradeAllowed: false` (Mac VM noise).
- Do not run governance / injection / AgentDojo / token boards here.
- **No Cua** — FSL competing-use risk for sold runners.

## Template

[`evidence.template.json`](./evidence.template.json)

## Arms

| Arm                         | Backend      |
| --------------------------- | ------------ |
| C1 conformance              | each pin     |
| C2 N=50 checkpoint forks    | Firecracker  |
| C3 replay spike             | with O4      |
| C4 gateway bypass           | Firecracker  |
| O4 snapshot/restore timing  | Firecracker → Apple VZ |
