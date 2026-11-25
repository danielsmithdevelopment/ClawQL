# ClawQL 5.0.0 — release announcement drafts (Medium, LinkedIn, HN/Reddit, X)

**Links:** [GitHub release v5.0.0](https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v5.0.0) · [npm: clawql-mcp](https://www.npmjs.com/package/clawql-mcp) · [Docs](https://docs.clawql.com) · [CHANGELOG](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md)

---

## 1) Medium / long blog post (draft)

**Title:** _ClawQL 5.0.0: Native GraphQL + gRPC on the MCP supergraph, Core tools always on, and release-hardened supply chain_

**Subhead:** The MCP server graduates a major line: merged **`search` / `execute`** over OpenAPI and **native** GraphQL and gRPC sources, **`audit` / `cache`** as non-optional Core tools, and CI + Helm defaults that match how serious teams ship containers.

**Body:**

ClawQL’s contract has always been simple: treat APIs as specs, then expose them through **`search`** and **`execute`** with predictable auth and transport behavior. **5.0.0** is a **semver-major** step that expands what “spec” means—without abandoning the OpenAPI + Discovery path that existing installs rely on.

### What is new in 5.0.0

**1. ADR 0002: first-class native GraphQL and gRPC**

Configure **`CLAWQL_GRAPHQL_SOURCES`**, **`CLAWQL_GRAPHQL_URL`** (Linear-style single-endpoint shortcut), or **`CLAWQL_GRPC_SOURCES`**. Operations merge into the same index as bundled REST; **`execute`** dispatches by **`protocolKind`**. SDL / saved introspection paths support air-gapped or blocked introspection endpoints.

**2. Core MCP tools: `audit` and `cache` are always registered**

Feature flags and Helm toggles for Core tools are removed—update automation that assumed opt-in env vars.

**3. Ouroboros convergence and default engines**

Convergence respects evaluation gates end-to-end; mixed-route execution runs hints in order; default evaluator provider inference is tighter (including fixes for mixed-provider false positives).

**4. Cloudflare Global API Key auth**

Beyond Bearer API tokens, **`mergedAuthHeaders`** supports **`X-Auth-Email`** + **`X-Auth-Key`** when Global Key envs are set—aligned with Cloudflare’s REST security schemes for operations like **`zones-get`**.

**5. Supply chain, golden image, and Kyverno-by-default Helm**

Repository **OSV-Scanner** + **Trivy** + **Syft** SBOM gates in CI; **`docker-publish`** mirrors repo gates then scans the built OCI layout before GHCR push and **Cosign** sign. Chart **0.5.x** defaults **`kyverno.imageSignaturePolicy.enabled: true`**; local Docker Desktop script installs Kyverno for signed-image enforcement.

**6. Docs, website, and defense-in-depth matrix**

Security narrative, Helm pages, and a **deliverables matrix** map slide-deck ambition to **shipped / partial / planned** so operators and buyers can audit claims against Git.

### Why it matters

Agent infrastructure needs one honest execution plane: REST where specs exist, GraphQL and gRPC where they are native, and admission policy that matches how images are built. **5.0.0** is the release line that encodes that story in code, CI, and chart defaults.

**CTA:** Pin **`clawql-mcp@5.0.0`**, read **[CHANGELOG](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md)**, and for Kubernetes installs review **`docs/deployment/helm.md`** and **`kyverno.imageSignaturePolicy`** before **`helm upgrade`**.

---

## 2) LinkedIn (draft)

**Post:**

We shipped **clawql-mcp 5.0.0** on npm.

Highlights:

- **Native GraphQL + gRPC** merged into the same **`search` / `execute`** model (**ADR 0002**)
- **`audit` and `cache`** are **Core**—always on; remove old enable flags
- **Ouroboros** gates and default evaluator hardened for real multi-route seeds
- **Cloudflare** auth: **Global API Key** (**`X-Auth-Email` / `X-Auth-Key`**) supported alongside API tokens
- **CI + Helm**: OSV/Trivy/SBOM gates; **Kyverno `verifyImages`** policy **on by default** in chart **0.5.x**

**Links:**  
GitHub release: `https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v5.0.0`  
npm: `https://www.npmjs.com/package/clawql-mcp`  
Docs: `https://docs.clawql.com`

#MCP #OpenAPI #GraphQL #gRPC #Kubernetes #Helm #SupplyChain #ClawQL

---

## 3) Hacker News + Reddit (draft)

**Hacker News title:**

> ClawQL 5.0.0: MCP server with native GraphQL/gRPC merge, Kyverno defaults, supply-chain gates

**Submission URL:**  
`https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v5.0.0`

**First comment:**

I maintain **ClawQL**, a TypeScript MCP server for **`search` / `execute`** over merged API surfaces.

**5.0.0** is a major release:

- **Native GraphQL** (`CLAWQL_GRAPHQL_*`, **`CLAWQL_GRAPHQL_SOURCES`**) and **gRPC** (`CLAWQL_GRPC_SOURCES`) merge with OpenAPI/Discovery operations.
- **`audit`** / **`cache`** are always registered (breaking if you relied on opt-out flags).
- **Ouroboros** convergence and default-engine evaluation fixes for mixed providers.
- **Cloudflare** execute auth supports **Global API Key** headers when configured.
- **CI**: OSV + Trivy + SBOM artifact; **publish** workflow scans OCI layout before push; **Helm** chart defaults Cosign verification via **Kyverno** (disable if your cluster has no Kyverno).

CHANGELOG: `https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md`

**Reddit title option (r/selfhosted):**  
_ClawQL 5.0.0: MCP with merged GraphQL/gRPC + signed-image Kyverno policy in Helm_

---

## 4) X (Twitter) thread (draft)

**1/6**  
**clawql-mcp 5.0.0** is on npm. Major: native **GraphQL** + **gRPC** on the same **`search` / `execute`** index as OpenAPI (**ADR 0002**).

**2/6**  
**Core tools:** **`audit`** and **`cache`** are always on—delete **`CLAWQL_ENABLE_*`** / Helm **`enableAudit`/`enableCache`** from older installs.

**3/6**  
**Ouroboros:** convergence respects approval gates; default evaluator won’t greenwash mixed-provider ACs on **`goal`** text alone.

**4/6**  
**Cloudflare:** set email + Global API key envs → **`X-Auth-Email` / `X-Auth-Key`** for REST paths that require legacy auth.

**5/6**  
**Supply chain:** CI runs **OSV-Scanner** + **Trivy** + **Syft** SBOM; image publish scans the **OCI** layout before **GHCR** + **Cosign**.

**6/6**  
**Helm 0.5.x:** **Kyverno** **`verifyImages`** policy defaults **on**—install Kyverno or **`--set kyverno.imageSignaturePolicy.enabled=false`**. Links in pinned release notes.
