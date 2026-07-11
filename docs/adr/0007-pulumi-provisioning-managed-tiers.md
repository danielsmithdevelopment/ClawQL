# ADR 0007: Pulumi provisioning for managed ClawQL tiers

- Status: Accepted
- Date: 2026-07-11
- Related: [ADR 0006: Golden host images (Packer)](./0006-golden-host-images-packer.md), [`infra/pulumi/`](../../infra/pulumi/), [`packer/`](../../packer/)
- Supersedes: N/A (complements Packer — artifact vs infrastructure)

## Context

[ADR 0006](./0006-golden-host-images-packer.md) defines **Packer** as the golden **artifact** pipeline (AMI/GCP image with ClawQL baked in, secrets at boot). Operators still need **infrastructure** to launch those images: EC2/GCE instances, security groups, IAM, R2 team-vault buckets, and boot-time user-data that wires tier-specific sync prefixes.

ClawQL is **TypeScript-native** (core, CLI, operator). Multi-tenant managed tiers need **conditional logic** (dedicated namespaces, per-tenant bucket prefixes, SSM paths). Future **`clawql operator provision`** should trigger provisioning programmatically.

## Decision

### 1) Pulumi over Terraform for ClawQL provisioning

| Factor                        | Pulumi                            | Terraform                          |
| ----------------------------- | --------------------------------- | ---------------------------------- |
| Language                      | TypeScript (same repo/toolchain)  | HCL (context switch)               |
| Dynamic multi-tenant logic    | Native loops/conditionals         | Awkward in HCL                     |
| Programmatic `up` from ClawQL | **Automation API**                | Terraform Cloud API / exec wrapper |
| State backends                | Pulumi Cloud, S3, R2, self-hosted | S3, Terraform Cloud, etc.          |

**Packer builds the artifact; Pulumi provisions the infrastructure that runs it.** Clean separation of concerns.

Terraform’s ecosystem breadth is acknowledged but does not outweigh TypeScript alignment and the agentic provisioning path for this codebase.

### 2) Single TypeScript package: `infra/pulumi`

- **Project:** `clawql-provision` ([`Pulumi.yaml`](../../infra/pulumi/Pulumi.yaml))
- **Cloud targets:** `aws` (EC2 golden host), `gcp` (GCE), `cloudflare` (R2 team vault — no VM)
- **Tier helpers:** `syncPrefixForTier()` — `shared/`, `tenant/{id}/`, enterprise custom prefix
- **Boot wiring:** `buildBootstrapUserData()` delegates to `bootstrap-team-vault.sh` on golden images (same as ADR 0006)

Stack config namespace: `clawql:*` (see [`Pulumi.example.yaml`](../../infra/pulumi/Pulumi.example.yaml)).

### 3) State backend — both supported

| Backend                                         | When to use                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Pulumi Cloud** (default for solo/small teams) | Fastest onboarding, built-in secrets encryption, team RBAC, no state bucket to operate |
| **Self-hosted on R2 or S3**                     | Sovereignty / air-gap; object store you already run for team vault                     |

**Recommendation:** start with **Pulumi Cloud** for development and early managed tiers; move production dedicated-tenant stacks to **R2-backed state** when sovereignty or customer contract requires it. Configure via `pulumi login` (cloud) or `pulumi login s3://…` / compatible self-hosted endpoint — not hard-coded in the program.

Secrets (sync keys) belong in **Pulumi stack secrets** or **AWS SSM** (dedicated tier boot fetch), never in golden images.

### 4) Automation API path

[`infra/pulumi/src/automation.ts`](../../infra/pulumi/src/automation.ts) wraps `LocalWorkspace.createOrSelectStack` + `stack.up()` using `workDir` (program from `Pulumi.yaml`). Intended integration:

```text
clawql operator provision --tier dedicated --tenant acme --cloud aws
  → automation.upProvisionStack({ stackName: dedicated-acme, config: … })
```

This is the hook for agents provisioning infrastructure through ClawQL without shelling out to a separate IaC toolchain.

### 5) CI

Unit tests for tier prefixes, user-data bash, and stack naming — no cloud credentials in PR CI (`npm test` in `infra/pulumi`). Cloud `pulumi preview` remains manual or release-dispatch (like Packer cloud builds).

## Consequences

### Positive

- Same language as ClawQL for operators and future agent-generated infra
- Tier and boot logic testable without AWS/GCP accounts
- Clear pairing: Packer AMI id → `clawql:goldenImageId` → Pulumi EC2/GCE

### Trade-offs

- Pulumi provider deps add weight to `infra/pulumi` install (isolated workspace package)
- Cloud `pulumi up` still needs credentials (not in default CI)
- Operator CLI integration is documented but not yet wired (Automation API is ready)

## Alternatives considered

- **Terraform** — rejected for reasons above (HCL, weaker in-repo agent story)
- **Pulumi only, no Packer** — rejected; slower boot, drift, secrets-in-user-data-only story weaker
- **Helm-only** — does not cover EC2/GCE dedicated tiers (K8s path unchanged via `teamSync`)
