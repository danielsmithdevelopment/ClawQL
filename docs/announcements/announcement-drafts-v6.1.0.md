# ClawQL 6.1.0 — release announcement drafts (Medium, LinkedIn, HN/Reddit, X)

**After publish:** replace **`v6.1.0`** / **`6.1.0`** placeholders with the live [GitHub release](https://github.com/danielsmithdevelopment/ClawQL/releases) tag and [npm `clawql-mcp@6.1.0`](https://www.npmjs.com/package/clawql-mcp).

**Links:** [GitHub release v6.1.0](https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v6.1.0) · [npm: clawql-mcp](https://www.npmjs.com/package/clawql-mcp) · [Docs](https://docs.clawql.com) · [CHANGELOG](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md)

---

## 1) Medium / long blog post (draft)

**Title:** _ClawQL 6.1.0: Vault-ready Helm, a bundled env dashboard, and the Panguard MCP bridge_

**Subhead:** A **semver-minor** stacked with **Kubernetes** defense-in-depth: **Vault** in-chart, **External Secrets** docs, optional **Kyverno**-verified **dashboard** + **docs** hosts on localhost, optional **JWT** + **gRPC** on the **Panguard** edge, and hardened **Istio** MCP routing—for teams who run ClawQL like a product, not a script.

**Body:**

**6.1.0** keeps **`search`** / **`execute`** and published **npm** entrypoints backward-compatible by default. The headline is **how you operate** ClawQL: Helm now encodes **Vault** as the long-term secrets story, ships an optional **env dashboard** wired for **Vault KV**, and adds an optional **mesh-facing** MCP **bridge** without changing the core server’s public API unless you flip new flags.

### What shipped in 6.1.0

**1. Helm — HashiCorp Vault dependency + sourcing guard**

- Subchart (**`hashicorpvault`** alias) and **`secretSourcing.requireVaultBackedSecrets`** — production posture expects Vault-backed **`envFromSecret` / `envFromSecrets`**; docker-desktop overlay keeps labs ergonomic.
- **External Secrets Operator** guides and example YAML for Vault KV.

**2. Helm — bundled env dashboard**

- Opt-in **`dashboard`** workload, **Ingress** (`http://clawql.localhost` locally), **Kyverno** verify for **`clawql-dashboard`** images, **`CLAWQL_DASHBOARD_*`** wiring; **`http://docs.localhost`** for the bundled docs UI; website **`/dashboard-kubernetes`**.

**3. MCP edge — Panguard bridge**

- **`mcpProxy`** + **`clawql-panguard-mcp-bridge`**; optional **JWT** (**`CLAWQL_MCP_JWT_ENABLED`**) with JWKS / PEM / dev HS256; unary **gRPC** delegation and E2E shim coverage.

**4. Istio (Docker Desktop–class clusters)**

- **LoadBalancer**-style ingress on desktop kube VMs; **`/mcp`**, **`/graphql`**, **`/healthz`** routed to **`clawql-mcp-http`** before the docs catch-all; **`.cursor/mcp.json.example`** documents **`127.0.0.1`** for macOS **`::1`** pitfalls.

**5. Optional egress allowlist + runtime containment**

- **`istio.egressAllowlist`** ServiceEntry patterns; **Kata** / **gVisor** **`runtimeClass`** + **Kyverno** policy scaffolding.

**6. Supply chain / secrets hygiene**

- **Gitleaks** gate in CI + **TruffleHog** on a schedule (**`providers/`** excluded via a filter **file**, not inline regex).

**7. Minor npm knob**

- **`CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE`** — opt-in JSON for Streamable HTTP when a client/proxy needs it (**default unchanged**).

### Why it matters

If you deploy ClawQL on **Kubernetes**, **6.1.0** is the release where Helm, Istio, and secrets management line up with the same story you tell auditors: **Vault + ESO + verified images + scheduled history scans**. npm-only users get a calm **minor** bump—pin **`@6.1`** when your images and Helm chart move.

**CTA:** **`npm install clawql-mcp@6.1.0`**, read **[CHANGELOG [6.1.0]](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md)** and **`RELEASE_NOTES_v6.1.0.md`**, then **`helm upgrade`** with your environment’s **`values`** and the new **dashboard** / **Vault** sections as needed.

---

## 2) LinkedIn (draft)

**Post:**

Shipped **clawql-mcp 6.1.0** (semver-**minor**).

Highlights:

- **Helm:** **Vault** subchart + **`secretSourcing`** posture; **External Secrets** + Vault KV docs
- **Dashboard:** optional bundled **Vault-first** UI + **Kyverno** image verify; **`docs.localhost`** vs **`clawql.localhost`**
- **Panguard bridge:** **`mcpProxy`**, optional **JWT**, unary **gRPC** MCP delegation
- **Istio local:** MCP routes fixed under **`clawql.localhost`**; **`127.0.0.1`** MCP URL guidance
- **Egress allowlist + runtime class** scaffolding (**Kata** / **gVisor** + **Kyverno**)
- **Gitleaks** + scheduled **TruffleHog**; **npm ci** reliability on Node **25**

**Links:** GitHub releases · npm **`clawql-mcp`** · **docs.clawql.com**

#MCP #Kubernetes #Helm #Vault #Istio #Kyverno #Secrets #ClawQL

---

## 3) Hacker News + Reddit (draft)

**Hacker News title:**

> ClawQL 6.1.0: Helm Vault subchart, bundled env dashboard, Panguard MCP bridge with optional JWT

**Submission URL:** `https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v6.1.0`

**First comment:**

**ClawQL** is an MCP server for **`search` / `execute`** over merged OpenAPI / GraphQL / gRPC surfaces.

**6.1.0** is a **minor** npm release focused on **Kubernetes**:

- Helm **Vault** dependency + **`secretSourcing`** pattern; External Secrets docs
- Optional **dashboard** (**Vault**-backed env UI) + **docs** host split (**`docs.localhost`** / **`clawql.localhost`**)
- **`mcpProxy`** + **Panguard**-style **bridge** with optional **JWT** and unary **gRPC** delegation
- Istio localhost **ingress** tweaks so **`/mcp`** is not swallowed by Next.js on the docs host
- **TruffleHog** + **Gitleaks** in the secrets story

CHANGELOG: `https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md`

**Reddit (r/kubernetes / r/selfhosted) title:**

_ClawQL 6.1.0 — Helm Vault + dashboard + Istio MCP routing fixes_

---

## 4) X (Twitter) thread (draft)

**1/6**  
**clawql-mcp 6.1.0** — **minor** npm bump, **major** Kubernetes story: **Vault-ready Helm**, optional **dashboard**, **Panguard** edge bridge.

**2/6**  
**Helm:** **Vault** subchart + **`requireVaultBackedSecrets`** pattern; **ESO** docs for syncing KV → **Secrets**.

**3/6**  
**Dashboard + docs UI:** **`clawql.localhost`** vs **`docs.localhost`**; **Kyverno** verify for **`clawql-dashboard`** images.

**4/6**  
**Bridge:** **`mcpProxy`** + **`clawql-panguard-mcp-bridge`**; optional **JWT** (**`CLAWQL_MCP_JWT_ENABLED`**); unary **gRPC** MCP path.

**5/6**  
**Istio lab:** MCP under **`clawql.localhost`** routed to **`clawql-mcp-http`**; **`127.0.0.1`** in **`.cursor/mcp.json.example`** for macOS **`::1`** quirks.

**6/6**  
**CHANGELOG [6.1.0]**, **`RELEASE_NOTES_v6.1.0.md`**, announcement drafts under **`docs/announcements/`**. Pin **`@6.1`** when you roll Helm + images.
