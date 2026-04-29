# Image signature enforcement (deploy only signed images)

For the **full golden image story** (repo gates → single OCI build → Trivy → skopeo → Cosign → tag promotion) and how **Helm + Kyverno** connect to that digest at deploy time, read **[`golden-image-pipeline.md`](golden-image-pipeline.md)** first.

**Signing in CI** (Cosign in [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml)) proves **who built and signed** an image. **Enforcement** is a separate layer: something on the **deploy path** must **reject** workloads whose images are **unsigned** or **signed by the wrong identity**.

The chart **defaults** to rendering a **`ClusterPolicy`** (**`kyverno.imageSignaturePolicy.enabled: true`**) that matches the example below — operators must install **Kyverno** (CRDs + controller) **before** applying the chart, or pass **`--set kyverno.imageSignaturePolicy.enabled=false`** if their cluster does not use Kyverno yet. See [`charts/clawql-mcp/values.yaml`](../../charts/clawql-mcp/values.yaml) and matrix row **19** in [`clawql-security-defense-deliverables.md`](clawql-security-defense-deliverables.md) ([#132](https://github.com/danielsmithdevelopment/ClawQL/issues/132)).

## What “impossible to deploy unsigned” requires

1. **Images are referenced by digest** in Kubernetes (`image: repo@sha256:…`) or the admission layer **mutates tags to digests** and verifies signatures on that digest.
2. **Admission** runs on **Pod** (and usually **Deployment/Job/DaemonSet** via controllers) with **`validationFailureAction: Enforce`** (or equivalent) so the API server **blocks** creates/updates.
3. **Verification policy** matches your **Cosign** mode. This repo uses **keyless** signing from **GitHub Actions OIDC** → **Fulcio** → **Rekor**; policies must allow that **issuer** + **subject** (or regex), and Rekor unless you operate a private Sigstore stack.

## Option A — Kyverno `verifyImages` (common on Kubernetes)

Install [Kyverno](https://kyverno.io/) in the cluster, then either rely on the **chart’s bundled `ClusterPolicy`** (default **`enabled: true`**) or **`kubectl apply`** a **ClusterPolicy** similar to the following. **Tune** `imageReferences`, `subjectRegExp`, and `issuerRegExp` for your org, forks, and workflow paths.

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: clawql-ghcr-cosign-keyless
  annotations:
    policies.kyverno.io/title: ClawQL GHCR — require Cosign (keyless / GitHub Actions)
spec:
  validationFailureAction: Enforce
  background: false
  failurePolicy: Fail
  webhookTimeoutSeconds: 30
  rules:
    - name: verify-clawql-images
      match:
        any:
          - resources:
              kinds:
                - Pod
      verifyImages:
        - imageReferences:
            - "ghcr.io/danielsmithdevelopment/clawql-mcp*"
            - "ghcr.io/danielsmithdevelopment/clawql-website*"
          # When every manifest uses `image@sha256:…`, add `verifyDigest: true` (and/or `mutateDigest: true`)
          # per Kyverno docs) so only digest pulls are admitted.
          attestors:
            - entries:
                - keyless:
                    subjectRegExp: "^https://github\\.com/danielsmithdevelopment/ClawQL/.*"
                    issuerRegExp: "^https://token\\.actions\\.githubusercontent\\.com.*"
                    rekor:
                      url: https://rekor.sigstore.dev
```

**Caveats**

- **Cosign bundle format vs Kyverno:** CI must emit signatures Kyverno’s **`verifyImages`** can consume (this repo pins **Cosign v2** in [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml); **v2** defaults to legacy bundles; **`--new-bundle-format`** is **v3** only). **Cosign v3** “new bundle” artifacts often fail verification until policy/stack upgrades. See **[`golden-image-pipeline.md`](golden-image-pipeline.md)** Step 5.
- **Kyverno version** skew: field names moved across releases (`failureAction` vs nested fields). Validate against your installed Kyverno docs.
- **Private GHCR**: the admission controller needs **registry pull** access to fetch signatures/manifests (imagePullSecrets, workload identity, or Kyverno `imageRegistryCredentials`).
- **Escape hatches** break the guarantee: policies that **exclude** namespaces, `kube-system`, or `failurePolicy: Ignore` on the webhook, or workloads that **bypass** the API server (static manifests applied with elevated rights) are all ways enforcement can be weakened.
- **Third-party images** in the same chart (document services, etc.) each need their **own** policy or an explicit **allowlist** if they are unsigned.

## Option B — Other stacks

- **Sigstore Policy Controller** / **Ratify** (AKS and others): policy CRDs that verify Cosign signatures before admit.
- **OPA Gatekeeper** / **Conftest** in CI: enforce manifests in GitOps **before** apply — does not replace in-cluster admission unless you block all other apply paths.
- **Cloud-specific**: e.g. AWS Signer + EKS admission, Binary Authorization (GKE) — same idea, different CRDs.

## Helm values (necessary but not sufficient)

Pin **`image: …@sha256:…`** in [`charts/clawql-mcp/values.yaml`](../../charts/clawql-mcp/values.yaml) (or overlays) so deploys are **immutable** and policies can key off digests. **Without** admission, a mistaken edit can still apply an unsigned digest — Git review + CI helps, but **only admission makes “impossible” cluster-local**.

**`make local-k8s-up`** (Docker Desktop) installs **Kyverno** and enables the chart policy in **`values-docker-desktop.yaml`** (**`kyverno.imageSignaturePolicy`** and **`matchReleaseNamespaceOnly`**) so ClawQL MCP/UI images in that namespace must be **Cosign-signed** on GHCR; unsigned **`docker build`** deploy paths are rejected by the script.

## Verify manually (debug / break-glass)

Same as [`docker/README.md`](../../docker/README.md): `cosign verify` with **`--certificate-identity-regexp`** and **`--certificate-oidc-issuer-regexp`** matching your signing identity.
