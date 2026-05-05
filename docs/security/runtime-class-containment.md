# Runtime containment: Kata, gVisor, and Kyverno (issue [#274](https://github.com/danielsmithdevelopment/ClawQL/issues/274))

This document describes optional **Kata** and **gVisor** **`RuntimeClass`** containment for MCP and sandbox namespaces. **Runtime isolation is orthogonal to MCP proxy / JWT policy**: once namespaces are fixed, enforce **`spec.runtimeClassName`** at admission (**Kyverno**) and opt-in on the MCP **`Deployment`** (**`security.kata`**).

## Kata vs gVisor (when to use which)

| | **Kata Containers** | **gVisor** |
| --- | --- | --- |
| **Boundary** | Lightweight VM per pod (hardware-backed isolation via hypervisor) | User-space kernel (`runsc`) intercepting syscalls |
| **Threat model** | Strong default for **arbitrary code / shell / filesystem** exposure (MCP tools, `sandbox_exec`) | Reasonable for **lower-risk** workloads where VM overhead is hard to justify |
| **Cost** | Higher per-pod overhead (memory, boot, IO) | Lower overhead; different syscall compatibility surface |
| **Fit for ClawQL** | **Preferred default** for namespaces dedicated to MCP + sandbox execution | Optional tier for supporting services that never execute untrusted code |

They are **not** drop-in substitutes: pick **Kata** where a compromised container must not reach the host kernel; use **gVisor** only where you accept userspace-kernel semantics and have validated syscall coverage for your images.

## Helm values (`charts/clawql-mcp`)

### MCP Deployment (`security.kata`)

- **`security.kata.enabled`**: when `true`, sets **`spec.runtimeClassName`** on the **MCP** `Deployment` pod template to **`security.kata.runtimeClassName`** (default **`kata-qemu`**).
- Requires a cluster **`RuntimeClass`** with that name and nodes/runtimes that can run it (for example [kata-containers/kata-deploy](https://github.com/kata-containers/kata-containers/tree/main/tools/packaging/kata-deploy)).

Default is **`enabled: false`** so standard clusters (including Docker Desktop without Kata) keep working.

### Kyverno (`kyverno.runtimeClassPolicy`)

Optional **`ClusterPolicy`** with two rule groups:

1. **`kataNamespaces`**: every **Pod** in those namespaces must set **`spec.runtimeClassName`** to **`kataRuntimeClassName`**.
2. **`gvisorNamespaces`**: same for **`gvisorRuntimeClassName`** (default **`gvisor`**).

**Defaults:** policy **`enabled: false`**. When you turn it **`true`**, you must populate at least one namespace list or the chart renders nothing.

**Prerequisites:** Kyverno installed **and** valid **`RuntimeClass`** objects **before** enforcing — otherwise admission rejects workloads or scheduling fails.

**Exemptions:** set **`exemptPodLabelKey`** (and optionally **`exemptPodLabelValue`**) to skip Pods carrying that label within matched namespaces (for break-glass or mixed workloads).

**Namespace layout:** keep **`kataNamespaces`** and **`gvisorNamespaces`** **disjoint**. If MCP and UI share one namespace but only MCP should use Kata, either split namespaces or exempt non-MCP pods with the label above.

## Example (illustrative)

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n openclaw --create-namespace \
  --set security.kata.enabled=true \
  --set security.kata.runtimeClassName=kata-qemu \
  --set kyverno.runtimeClassPolicy.enabled=true \
  --set kyverno.runtimeClassPolicy.kataNamespaces={openclaw}
```

Use your real **`RuntimeClass`** name (`kata-clh`, `kata-qemu`, etc.) as installed on the cluster.

## Related

- Cosign / **`verifyImages`** (separate Kyverno policy): [`image-signature-enforcement.md`](image-signature-enforcement.md)
- Helm overview: [`docs/deployment/helm.md`](../deployment/helm.md)
