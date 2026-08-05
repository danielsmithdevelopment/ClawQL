# ADR 0007: Pulumi provisioning for managed ClawQL tiers

- Status: Accepted
- Date: 2026-07-11
- Related: [ADR 0006: Golden host images (Packer)](./0006-golden-host-images-packer.md), [`infra/pulumi/`](../../infra/pulumi/), [`packer/`](../../packer/), [ADR 0009](./0009-enterprise-ontology.md) (kinetic infra executor via Automation API)
- Supersedes: N/A (complements Packer — artifact vs infrastructure)

## Context

[ADR 0006](./0006-golden-host-images-packer.md) defines **Packer** as the golden **artifact** pipeline (AMI/GCP image with ClawQL baked in, secrets at boot). Operators still need **infrastructure** to launch those images: EC2/GCE instances, security groups, IAM, R2 team-vault buckets, and boot-time user-data that wires tier-specific sync prefixes.

ClawQL is **TypeScript-native** (core, CLI, operator). Multi-tenant managed tiers need **conditional logic** (dedicated namespaces, per-tenant bucket prefixes, SSM paths). Future **`clawql operator provision`** should trigger provisioning programmatically.

## Decision

### 1) Pulumi over Terraform for ClawQL provisioning

| Factor                        | Pulumi                                     | Terraform                          |
| ----------------------------- | ------------------------------------------ | ---------------------------------- |
| Language                      | TypeScript (same repo/toolchain)           | HCL (context switch)               |
| Dynamic multi-tenant logic    | Native loops/conditionals                  | Awkward in HCL                     |
| Programmatic `up` from ClawQL | **Automation API**                         | Terraform Cloud API / exec wrapper |
| State backends                | Self-hosted S3 / R2 only (no Pulumi Cloud) | S3, Terraform Cloud, etc.          |

**Packer builds the artifact; Pulumi provisions the infrastructure that runs it.** Clean separation of concerns.

Terraform’s ecosystem breadth is acknowledged but does not outweigh TypeScript alignment and the agentic provisioning path for this codebase.

### 2) Single TypeScript package: `infra/pulumi`

- **Project:** `clawql-provision` ([`Pulumi.yaml`](../../infra/pulumi/Pulumi.yaml))
- **Cloud targets:** `aws` (EC2 golden host), `gcp` (GCE), `cloudflare` (R2 team vault — no VM)
- **Tier helpers:** `syncPrefixForTier()` — `shared/`, `tenant/{id}/`, enterprise custom prefix
- **Boot wiring:** `buildBootstrapUserData()` delegates to `bootstrap-team-vault.sh` on golden images (same as ADR 0006)

Stack config namespace: `clawql:*` (see [`Pulumi.example.yaml`](../../infra/pulumi/Pulumi.example.yaml)).

### 3) State backend — self-hosted only (no Pulumi Cloud)

ClawQL does **not** use Pulumi Cloud. Stack state and encrypted secrets live in object storage you control — aligned with the team-vault sovereignty story.

| Backend                       | When to use                                                 |
| ----------------------------- | ----------------------------------------------------------- |
| **Cloudflare R2** (preferred) | Default for managed tiers; same provider as team vault sync |
| **AWS S3** (or S3-compatible) | When AWS is already the control plane                       |

Configure once per operator machine or CI runner:

```bash
# R2 (S3-compatible API) — replace bucket and account id
export AWS_ACCESS_KEY_ID=...          # R2 API token access key
export AWS_SECRET_ACCESS_KEY=...      # R2 API token secret
pulumi login 's3://clawql-pulumi-state?region=auto&endpoint=https://<accountid>.r2.cloudflarestorage.com&awssdk=v2'

# Or AWS S3
pulumi login s3://clawql-pulumi-state
```

State bucket layout is standard Pulumi (`s3://<bucket>/.pulumi/`). Not hard-coded in programs — only `pulumi login` / backend URL.

Secrets (sync keys) belong in **Pulumi stack secrets** (encrypted by the self-hosted backend passphrase) or **AWS SSM** (dedicated tier boot fetch), never in golden images.

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

---

## Amendment (2026-08) — Live hosted profiles + Argo CD

**Status:** Accepted  
**Date:** 2026-08-05

Extend `infra/pulumi` with explicit **`clawql:profile`** values for the GTM hybrid path:

| Profile | Purpose |
| --- | --- |
| `edge` | Cloudflare R2 + KV + D1 + Queues (+ optional Worker stub) for Developer/Teams |
| `idp-k3s` | AWS `r7i.2xlarge` K3s bootstrap for first IDP customer |
| `eks` | EKS control plane + reserved node group + Karpenter IAM for shared tenancy |

**Cluster desired state** (Helm charts, `.cqw` WorkflowTemplates, Karpenter NodePools) remains **Argo CD** under [`deployment/gitops/`](../../deployment/gitops/). Pulumi provisions the plane; Argo CD reconciles apps. Deterministic pipelines are authored as [`.cqw`](../specs/cq-extensions/cqw.md) and synced to Argo Workflows.

Canonical operator guide: [`docs/deployment/hosted-live-bootstrap.md`](../deployment/hosted-live-bootstrap.md).
