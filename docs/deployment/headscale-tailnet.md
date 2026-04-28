# Headscale tailnet and MagicDNS (`*.clawql.local`)

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

## ACL hardening (follow-up)

Bootstrap ACLs are often permissive. **Least-privilege** policies (tags, host groups, port restrictions) should be tracked after the mesh is stable — **[#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213)**.

---

## Related

- **[`../readme/deployment.md`](../readme/deployment.md)** — Cursor, **`CLAWQL_MCP_URL`**, managed Tailscale **`*.ts.net`**
- **[`helm.md`](helm.md)** / **[`deploy-k8s.md`](deploy-k8s.md)** — in-cluster deploy; optional **Ingress** is orthogonal to tailnet client DNS
- **[`../clawql-ecosystem.md`](../clawql-ecosystem.md)** — service map and **`*.clawql.local`** examples for **Kubernetes** ingress patterns
