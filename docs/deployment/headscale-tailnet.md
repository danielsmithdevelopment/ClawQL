# Headscale tailnet and MagicDNS (`*.clawql.local`)

**New to Tailscale / Headscale?** Read the beginner-oriented guide **[`tailscale-and-headscale-for-clawql.md`](tailscale-and-headscale-for-clawql.md)** first (managed **Tailscale** vs **Headscale**, MagicDNS, **`CLAWQL_MCP_URL`**, Kubernetes vs tailnet DNS). The website mirrors it at **`/tailscale`**.

This runbook supports **[#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206)**: a **self-hosted Headscale** control plane so operator machines join a **WireGuard mesh**, with **MagicDNS** under **`clawql.local`**, and **tailnet-only** URLs for Streamable HTTP MCP (and aligned provider **`BASE_URL`**s).

It is **control plane + client nodes + DNS**, not the ClawQL **Helm** chart tree. Kubernetes Ingress hostnames like **`grafana.clawql.local`** in [`../clawql-ecosystem.md`](../clawql-ecosystem.md) describe **in-cluster** naming; on a Headscale tailnet, **`*.clawql.local`** resolves to **Tailscale IPs** for enrolled hosts when MagicDNS is configured accordingly.

For **managed Tailscale** (no Headscale), **`*.ts.net`** and **Serve**, see **[`../readme/deployment.md` § Private tailnet](../readme/deployment.md#private-tailnet-tailscale-magicdns)** ([#211](https://github.com/danielsmithdevelopment/ClawQL/issues/211)).

---

## Topology (logical)

```text
                    Internet (TLS termination / reverse proxy)
                                      |
                              Headscale API (HTTPS)
                                      |
              +-----------------------+-----------------------+
              |                       |                       |
         Mac Mini                 MacBook Air              Mini PC
    (MCP :8080 /mcp)            (client)              (Ollama :11434)
    mac-mini.clawql.local       ...                   mini-pc.clawql.local
```

- **One** designated **Headscale server** (VM or always-on metal) runs the control plane API and stores state (often **SQLite** for small deployments — set a **stable path** on disk and back it up).
- **Nodes** run the **Tailscale** client configured to use your **`login-server`** (Headscale) instead of Tailscale Inc.
- **MagicDNS** publishes **`hostname.clawql.local`** (and similar) for each machine **registered in Headscale**, resolving to the node’s **tailnet IP** (not necessarily LAN `192.168.x.x` unless you use subnet routing — document what you enable).

Exact **`config.yaml`** keys (**`server_url`**, **`dns_config`**, **`ip_prefixes`**, database) follow the **Headscale version you install**; always prefer [upstream Headscale documentation](https://github.com/juanfont/headscale) for field names and migrations.

---

## Firewall and exposure assumptions

- **Headscale gRPC/HTTP API** must be reachable by **every node** that enrolls (typically **443** behind a reverse proxy with valid TLS for **`server_url`**).
- **Node-to-node WireGuard** uses UDP high ports per Tailscale/Headscale defaults; ensure **host firewalls** and **cloud security groups** allow **mesh traffic** between tailnet members (see upstream “ports” / firewall guides).
- **MCP HTTP** (`:8080` or your port) and **Ollama** (`:11434`) should be bound and firewalled intentionally:
  - **Tailnet-only:** bind to the Tailscale interface or **`0.0.0.0`** only if the host firewall restricts source IPs to **100.64.0.0/10** (Tailscale CGNAT range) or tagged peers.
  - **Do not** expose MCP or provider admin UIs to the public internet unless that is a deliberate, separately threat-modeled product surface.

---

## Control plane bootstrap (outline)

1. Install Headscale on the control-plane host (package, container, or release binary — pick one operational style and keep it consistent).
2. Configure **`server_url`** to the **HTTPS URL** clients use (terminate TLS on **nginx**, **Caddy**, **Traefik**, etc.).
3. Enable **MagicDNS** with **`base_domain`** (or equivalent) **`clawql.local`** so records like **`mac-mini.clawql.local`** resolve on the tailnet.
4. Choose **persistence** (**SQLite** path or other DB) and **backup** procedure.
5. Create **users** / **namespaces** and issue **pre-auth keys** with **`headscale` CLI**.

**Security:** never paste **live pre-auth keys**, auth keys, or API secrets into GitHub issues or git. Docs and issues should use **placeholders** only.

---

## Enrolling nodes

On each machine (macOS, Linux, iOS via Tailscale app, etc.):

1. Install the **Tailscale** client build that supports **custom login servers** (Headscale documents compatible clients).
2. Join with your Headscale **`--login-server`** URL (exact flags depend on client version — follow Headscale “join” docs).

Example shape (placeholders):

```bash
tailscale up --login-server https://headscale.example.com
```

3. Approve routes or **exit nodes** only if required; document any **subnet routers** separately.

---

## DNS names and ClawQL URLs

After MagicDNS works, prefer **stable hostnames** for MCP and providers:

| Service        | Example tailnet URL                         |
| -------------- | ------------------------------------------- |
| Streamable MCP | `http://mac-mini.clawql.local:8080/mcp`     |
| Health check   | `http://mac-mini.clawql.local:8080/healthz` |
| Ollama         | `http://mini-pc.clawql.local:11434`         |

Use **HTTPS** where you terminate TLS (**Tailscale Serve**, reverse proxy on the node, or mesh ingress). Cursor **`mcp.json`** should reference **`${env:CLAWQL_MCP_URL}`** so secrets and host-specific URLs stay out of git — see **[`../readme/deployment.md`](../readme/deployment.md#private-tailnet-tailscale-magicdns)**.

**`CLAWQL_MCP_URL`** is consumed by **`scripts/workflows/mcp-workflow-complex-release-stack.mjs`** (workflow attaches to an existing HTTP server); **`clawql-mcp`** itself does not read it.

Align **`PAPERLESS_BASE_URL`**, **`ONYX_BASE_URL`**, **`TIKA_BASE_URL`**, **`CLAWQL_SANDBOX_BRIDGE_URL`**, **`CLAWQL_API_BASE_URL`**, **`CLAWQL_GRAPHQL_*`**, etc., to the **same tailnet** hostnames so **`execute`** does not cross the public internet unintentionally. Use **`CLAWQL_BUNDLED_OFFLINE=1`** when the server must not fetch OpenAPI bundles at runtime (typical production stance — see **`README.md`** / ecosystem docs).

---

## Validation checklist

Run these **from a second tailnet node** after enrollments complete:

1. **`tailscale status`** — all expected peers **active**; note subnets / exit nodes if configured.
2. **DNS:** `ping mac-mini.clawql.local` (replace with your MCP host) — should resolve to a **100.x** address and reply if ICMP allowed.
3. **MCP:** `curl -sS http://mac-mini.clawql.local:8080/healthz` — expect **`{"status":"ok"`** … `}` (or your configured health JSON). For HTTPS/Serve, use **`https://...`** accordingly.
4. **Cursor / agent:** set **`CLAWQL_MCP_URL`** to the same **`…/mcp`** URL and confirm **`listTools`** / a smoke **`execute`** against a safe provider.

If resolution fails, distinguish **MagicDNS** (Headscale) from **local `/etc/hosts`** or **Kubernetes cluster DNS** — only one should own **`*.clawql.local`** for a given client context.

---

## Deprecating a prior public MCP base URL

When tailnet MCP is **validated** and clients have migrated:

1. **Document the cutover date** in your internal runbook (and optionally in team **`mcp.json`** comments).
2. **Stop advertising** the old **public** MCP **`https://`** base URL to operators and agents; rotate any **bearer tokens** that were ever sent over that path if exposure is a concern.
3. **Remove or firewall** the public listener if it existed only for convenience — regulated deployments should treat a public MCP surface as a **separate product decision** (see **`docs/enterprise-mcp-tools.md`**, roadmap **[#88](https://github.com/danielsmithdevelopment/ClawQL/issues/88)** for public gateway work).

This repository’s examples default to **`localhost`** or placeholders until you set final hostnames ([#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206)).

---

## ACL hardening (least privilege)

After **[#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206)** enrollment works, replace permissive defaults (for example **`src` / `dst` of `*`**). **Headscale** evaluates Tailscale-compatible **[ACL policies](https://docs.headscale.org/ref/acls/)** (typically **huJSON** with **`//` comments**). Track iterative tightening in **[#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213)**.

### Principles

1. **User isolation is ACL-defined** — with ACLs enabled, Headscale does **not** keep the old “machines under the same user only talk to each other” boundary; only what the policy **accepts** is allowed (see **[Tailscale ACLs](https://tailscale.com/kb/1018/acls/)**).
2. **`tagOwners`** — only trusted **Headscale users** (namespaces) may advertise **`tag:…`** on a node; without this, tags are not a security boundary.
3. **Prefer `tag:` destinations** for shared services (MCP, Ollama, bridges); use **explicit TCP/UDP ports** instead of **`*`** on the destination port when you know the surface (for example **`8080`** for HTTP MCP, **`11434`** for Ollama).
4. **Self and control plane** — keep rules that allow a node to talk to **itself** where clients require it; ensure **DERP / coordination** still matches your Headscale version (see upstream docs for **`autogroup:`** support on your release).
5. **Subnet routers and exit nodes** — if you use them, add **`autoApprovers`** (or manual approvals) intentionally; do not auto-approve wide RFC1918 routes without review.

### ClawQL-oriented tag sketch

| Tag (example)       | Intended role                                        | Example ports worth allowing _to_ the tag     |
| ------------------- | ---------------------------------------------------- | --------------------------------------------- |
| `tag:clawql-mcp`    | Hosts running Streamable HTTP MCP (`clawql-mcp`)     | `8080` (or your MCP TCP port), `443` if HTTPS |
| `tag:clawql-llm`    | Ollama / local inference                             | `11434`                                       |
| `tag:clawql-bridge` | Sandbox bridge or other internal HTTP helpers        | whatever **`CLAWQL_SANDBOX_BRIDGE_URL`** uses |
| `tag:clawql-client` | Operator laptops / agents (usually sources, not dst) | — (typically **src** only)                    |

Adjust tags and port lists to your actual **`BASE_URL`** ports (Paperless, Onyx, Tika, etc.).

### Starter policy (hardened)

The repository ships a **least-privilege** **[`headscale-acls-clawql.hujson`](headscale-acls-clawql.hujson)** policy (huJSON, comments allowed):

- **Human operators** (`alice`, `bob` — rename to your Headscale users) vs **service users** (`svc-mcp`, `svc-llm`) used only when enrolling tagged servers, so **`user:*` self rules** do not accidentally mesh laptops with servers on the same user.
- **Explicit TCP ports:** MCP **8080** + optional native gRPC **50051**, Ollama **11434**, optional internal HTTP **80,443,8080**, optional tailnet bridge **8080,8443**.
- **No** global **`{"action":"accept","src":["*"],"dst":["*:*"]}`**; no **`ssh`** block (add **[Tailscale SSH](https://tailscale.com/kb/1193/tailscale-ssh/)** rules only if you use it).

Copy the file to your Headscale host, substitute names, drop unused tags or ACL pairs, then point **`policy.path`** at it. Operators do **not** need **`--advertise-tags`** on laptops unless you choose a tag-based client model.

### Rollout checklist

1. **Back up the current ACL file** referenced by **`policy.path`** in Headscale **`config.yaml`** (see **[Headscale ACLs](https://docs.headscale.org/ref/acls/)**); some deployments also store policy in the database — follow the procedure for your installed version.
2. **Add stricter rules alongside** permissive ones, validate connectivity (see [Validation checklist](#validation-checklist)), then **remove** **`{"action":"accept","src":["*"],"dst":["*:*"]}`** (or equivalent).
3. **Document** which user may attach which **`tag:`** and which ports each service listens on in your environment.

---

## Related

- **[`tailscale-and-headscale-for-clawql.md`](tailscale-and-headscale-for-clawql.md)** — beginner guide (managed Tailscale + Headscale, MagicDNS, ClawQL env); website **`/tailscale`**
- **[`headscale-acls-clawql.hujson`](headscale-acls-clawql.hujson)** — least-privilege starter ACL (huJSON) for this runbook ([#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213))
- **[`../readme/deployment.md`](../readme/deployment.md)** — Cursor, **`CLAWQL_MCP_URL`**, managed Tailscale **`*.ts.net`**
- **[`helm.md`](helm.md)** / **[`deploy-k8s.md`](deploy-k8s.md)** — in-cluster deploy; optional **Ingress** is orthogonal to tailnet client DNS
- **[`../clawql-ecosystem.md`](../clawql-ecosystem.md)** — service map and **`*.clawql.local`** examples for **Kubernetes** ingress patterns
