# Tailscale and Headscale for ClawQL (beginner’s guide)

This guide is for operators who are **new to Tailscale / Headscale** and want a **private tailnet** so **ClawQL MCP** (`clawql-mcp-http` at **`/mcp`**) and related **`execute`** targets (Ollama, Paperless, Onyx, etc.) are reachable **without exposing them to the public internet**.

**Shorter, ops-focused material** lives in **[`readme/deployment.md` § Private tailnet](../readme/deployment.md#private-tailnet-tailscale-magicdns)** ([#211](https://github.com/danielsmithdevelopment/ClawQL/issues/211)) and **[`headscale-tailnet.md`](headscale-tailnet.md)** ([#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206)). **ACL starter:** [`headscale-acls-clawql.hujson`](headscale-acls-clawql.hujson) ([#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213)).

---

## Why a tailnet for ClawQL?

- **Cursor / MCP clients** need a stable **`url`** (usually ending in **`/mcp`**). **`localhost`** only works on the same machine as the server.
- **`execute`** calls **your** APIs using **`BASE_URL`** / spec **`servers`**. If those point at the public internet by mistake, traffic leaves your trust boundary.
- A **tailnet** gives each enrolled machine a **stable identity** and **private IP** (typically **`100.x.y.z`**) so **MagicDNS** names resolve only for members.

---

## Core concepts (read once)

| Term                 | Plain meaning                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tailscale client** | Software on each device (laptop, server, phone) that speaks **WireGuard** and registers with a **control plane**.                                                                                                               |
| **Tailnet**          | The set of devices and rules that belong to **one** logical mesh.                                                                                                                                                               |
| **Control plane**    | Coordinates keys, peers, and policy. **Tailscale Inc.** runs it for managed accounts; **Headscale** is an open-source control plane **you** host.                                                                               |
| **MagicDNS**         | Names like **`my-laptop.tailnet-name.ts.net`** or **`mac-mini.clawql.local`** that resolve to a device’s **tailnet IP** for members only.                                                                                       |
| **DERP**             | Encrypted relay when direct UDP between two peers is impossible. Managed Tailscale provides relays; self-hosted setups may configure their own.                                                                                 |
| **ACL**              | Policy that says **who may talk to whom** on the tailnet. With Headscale (and Tailscale), permissive defaults are common during bootstrap; tighten later ([#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213)). |

Official primers: [What is Tailscale?](https://tailscale.com/kb/1151/what-is-tailscale/), [MagicDNS](https://tailscale.com/kb/1081/magicdns/), [ACLs](https://tailscale.com/kb/1018/acls/). Headscale ACLs: [Headscale ACL reference](https://docs.headscale.org/ref/acls/).

---

## Managed Tailscale vs self-hosted Headscale

|                   | **Managed Tailscale**                       | **Self-hosted Headscale**                                                       |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| **Control plane** | Tailscale Inc. (cloud)                      | Your server (VM, homelab, etc.)                                                 |
| **Accounts**      | Tailscale admin console                     | **`headscale` CLI** + your identity flow                                        |
| **DNS names**     | **`*.ts.net`** (per tailnet)                | You choose a **MagicDNS base domain** (this repo’s pattern: **`clawql.local`**) |
| **Trust**         | You trust Tailscale’s SaaS + your login IdP | You trust **your** Headscale host, backups, TLS, and ACL workflow               |
| **Best when**     | Fastest path, small teams, less infra       | Data residency, air-gapped style, or full control                               |

ClawQL works the same either way: clients and env vars use **HTTPS or HTTP URLs** that resolve on the tailnet.

---

## Part A — Managed Tailscale (step-by-step)

Use this path if you do **not** need to run the control plane yourself. Issue context: [#211](https://github.com/danielsmithdevelopment/ClawQL/issues/211).

### A1. Install the client

Install **Tailscale** on the machine that runs **`clawql-mcp-http`** and on every operator laptop. Vendor instructions: [Install Tailscale](https://tailscale.com/kb/1019/install/).

### A2. Sign in and join the tailnet

Sign in with your org’s method (GitHub, Google, OIDC, etc.). In the admin console, confirm each machine appears under **Machines**.

### A3. Turn on MagicDNS

In the admin console, enable **MagicDNS** so each machine gets a **`*.ts.net`** (or your tailnet’s) name. Details: [MagicDNS](https://tailscale.com/kb/1081/magicdns/).

### A4. Expose MCP with HTTPS (recommended)

Prefer **HTTPS** for MCP when clients expect TLS. Common patterns:

- **[Tailscale Serve](https://tailscale.com/kb/1312/serve)** — terminates TLS on the node and proxies to local **`http://127.0.0.1:8080`**. You get a URL like **`https://<machine>.<tailnet>.ts.net/mcp`** (exact path depends on your Serve config).
- **Reverse proxy** (Caddy, nginx) on the tailnet listening on **443**.

Avoid copying bearer tokens into chat logs or git. Use **`${env:CLAWQL_MCP_URL}`** in **`mcp.json`** and set **`CLAWQL_MCP_URL`** in the shell or a local env file: [Cursor env interpolation](https://cursor.com/docs/context/mcp).

### A5. Point ClawQL workflows at the same URL (optional)

**`CLAWQL_MCP_URL`** is **not** read by **`clawql-mcp`** itself. Scripts such as **`npm run workflow:complex-release-stack:mcp`** use it to attach to an **already running** HTTP MCP server (they may poll **`/healthz`**).

### A6. Align provider **`BASE_URL`** values

Set **`PAPERLESS_BASE_URL`**, **`ONYX_BASE_URL`**, **`TIKA_BASE_URL`**, **`CLAWQL_SANDBOX_BRIDGE_URL`**, **`CLAWQL_API_BASE_URL`**, **`CLAWQL_GRAPHQL_*`**, etc., to **tailnet-reachable** hostnames so **`execute`** does not “phone home” over the public internet by accident. Use **`CLAWQL_BUNDLED_OFFLINE=1`** in production when you do not want runtime OpenAPI bundle fetches — see **`README.md`**.

### A7. Validate

From a **second** tailnet device:

1. **`tailscale status`** — both machines **active**.
2. **`curl -sS https://<machine>.<tailnet>.ts.net/healthz`** (or your HTTP URL) — expect **`{"status":"ok"`** … `}` from ClawQL’s health endpoint.
3. In Cursor, confirm **`listTools`** / a safe **`execute`** works with **`CLAWQL_MCP_URL`** set to the same **`…/mcp`** URL.

---

## Part B — Self-hosted Headscale (step-by-step overview)

Use this when the **managed** control plane is not acceptable or you want **`*.clawql.local`** under your own DNS policy. Deep runbook: **[`headscale-tailnet.md`](headscale-tailnet.md)** ([#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206)).

### B1. Architecture you are building

- **One** Headscale server (API + database + config).
- **Nodes**: laptops and servers run the **Tailscale** client with **`--login-server https://<your-headscale>`** instead of Tailscale Inc.
- **MagicDNS**: configure a **`base_domain`** such as **`clawql.local`** so enrolled hosts become **`hostname.clawql.local`** on the tailnet.

### B2. Bootstrap (outline)

1. Install Headscale ([upstream project](https://github.com/juanfont/headscale)).
2. Set **`server_url`** to the **HTTPS** URL clients use; terminate TLS at a reverse proxy if needed.
3. Enable **MagicDNS** with your chosen **`base_domain`**.
4. Persist state (**SQLite** or other DB) with **backups**.
5. Create **users** and **pre-auth keys** with **`headscale` CLI** — never commit live keys.

### B3. Enroll each machine

On each node, install Tailscale and join with your **`login-server`** URL. Approve **subnet routes** / **exit nodes** only when you understand the blast radius.

### B4. Harden ACLs after the mesh works

Bootstrap policies are often **allow-all**. Replace that with least privilege: **[`headscale-acls-clawql.hujson`](headscale-acls-clawql.hujson)** ([#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213)) and **[`headscale-tailnet.md` § ACL hardening](headscale-tailnet.md#acl-hardening-least-privilege)**.

### B5. ClawQL URLs on Headscale

Same idea as managed Tailscale: **`http://mac-mini.clawql.local:8080/mcp`** (or HTTPS if you terminate TLS). **`CLAWQL_MCP_URL`** and **`mcp.json`** follow the same env hygiene as Part A.

Full validation checklist: **[`headscale-tailnet.md` § Validation checklist](headscale-tailnet.md#validation-checklist)**.

---

## Kubernetes **`*.clawql.local`** vs tailnet **`*.clawql.local`**

**Easy mistake:** the repo and Helm examples use names like **`grafana.clawql.local`** for **in-cluster Ingress**. Those names are resolved by **cluster DNS** (or **`/etc/hosts`** on your laptop pointing at the cluster), **not** automatically by Headscale MagicDNS.

On a **Headscale** tailnet, **`*.clawql.local`** resolves for **Tailscale-enrolled hosts** when MagicDNS is configured on Headscale. Same suffix, **different DNS authority** depending on where you query from. See **[`clawql-ecosystem.md`](../clawql-ecosystem.md)** service map vs tailnet note ([#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206)).

---

## Security checklist (tailnet + ClawQL)

- **No live pre-auth keys, API tokens, or MCP bearer secrets in git or public issues** — placeholders only in docs.
- **`mcp.json`**: prefer **`${env:…}`** for URLs and headers; keep secrets in env or a secrets manager.
- **ACLs**: assume **implicit deny** outside what you allow; separate **human** Headscale users from **service** users for tagged servers when using the starter ACL ([#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213)).
- **Firewalls**: MCP and provider UIs should not be **public** unless you deliberately threat-model that surface (see **`docs/enterprise-mcp-tools.md`**).

---

## Regulatory and compliance context (how tailnets help)

**Not legal or compliance advice.** HIPAA, SOC 2, GDPR, CCPA, and similar regimes depend on **your** contracts, jurisdictions, data inventory, policies, logging, vendor reviews, and attestation—not on a single network pattern. The points below describe **how private tailnets commonly support control objectives** when ClawQL and provider traffic stay **off the public internet** and are **restricted to enrolled identities**. Map them in your own risk assessment, DPIA, or SOC 2 control matrix with counsel and your GRC team.

### Themes that show up across frameworks

| Theme                                       | What the tailnet pattern contributes                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Network segmentation / trust boundaries** | MCP (**`/mcp`**) and **`execute`** upstreams (Ollama, EHR-adjacent APIs, internal tools) are reachable on **private** addresses and **ACL-governed** paths instead of a routable public listener. That supports “default deny” and **least privilege** narratives for auditors.                                                                                                                                                                     |
| **Encryption in transit**                   | Tailscale’s data plane uses **WireGuard** between nodes. Prefer **HTTPS** (e.g. **Serve**, reverse proxy) for **application** TLS where clients require it. You still document **where** TLS terminates and what logs may contain.                                                                                                                                                                                                                  |
| **Strong identity for access**              | Joining the tailnet is tied to **login** and device enrollment; **ACLs** (and **`tagOwners`**) limit which principals can reach which **ports** and tags. That aligns with **logical access** and **need-to-know** storylines—**if** you configure ACLs tightly (see [#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213)).                                                                                                          |
| **Reduced attack surface**                  | Deprecating a **public** MCP or admin URL after cutover shrinks opportunistic exposure—often cited under **SOC 2** CC (e.g. logical/physical access, change management) and **“reasonable security”** style obligations (**CCPA/CPRA**).                                                                                                                                                                                                            |
| **Vendor / subprocessors**                  | **Managed Tailscale** introduces a **vendor** that participates in coordination (and may see metadata relevant to your program). Your **DPA**, **SCCs**, and **subprocessor** list should reflect that. **Headscale** shifts more control-plane responsibility **to you** (patching, backups, access to the Headscale host)—which can help **data residency** or “no third-party control plane” positions **if** operated in-region and documented. |
| **Logging and monitoring**                  | A tailnet does not replace **audit logs** on MCP, proxies, or backends. Pair network controls with application logging, **`audit`** / vault trails where you use them, and your SIEM story. See **`docs/enterprise-mcp-tools.md`**.                                                                                                                                                                                                                 |

### HIPAA (United States — health data)

The **HIPAA Security Rule** expects **administrative, physical, and technical** safeguards for **ePHI**. A private tailnet can **support** technical safeguards such as **access control** (who can reach the MCP host and internal APIs) and **transmission security** (encrypted mesh), **when** ePHI or tools that touch ePHI only traverse paths you’ve assessed. It does **not** replace: **BAA** relationships, minimum necessary workflows, workforce training, endpoint controls, backup/DR, or breach procedures. If assistants or MCP tools can reach systems holding ePHI, treat that path as **in scope** for your risk analysis.

### SOC 2 (AICPA Trust Services Criteria)

SOC 2 reports are built from **your** system description and criteria (e.g. **Security**, often **Confidentiality** / **Availability**). Tailnets help you tell a coherent story for criteria such as **logical and physical access controls** (CC6), **system operations** and **change management** (CC7/CC8), and **risk mitigation**—by documenting **who** can reach production MCP, **how** ACLs enforce that, and **why** public exposure was avoided. Evidence still includes screenshots/policies, change tickets, penetration test scope, and monitoring—not the mesh alone.

### GDPR (EU / UK GDPR-style laws)

**Article 32** requires appropriate **technical and organizational measures** (TOMs) for security, including **pseudonymization/encryption**, **confidentiality**, **integrity**, **availability**, and **resilience**. Keeping ClawQL and **`execute`** targets on a **private** network supports **confidentiality** and **integrity** goals (fewer hops over untrusted networks) **if** paired with contracts (**Article 28** processors), **records of processing**, and—where data leaves the EEA—**Chapter V** transfer tools (**SCCs**, adequacy, etc.). **Managed Tailscale** may involve **international transfers** of account or telemetry metadata: disclose and govern that in your **DPIA** and vendor assessment. **Headscale** self-hosted in a chosen region can simplify **residency** arguments for **mesh metadata**, at the cost of you operating the control plane securely.

### CCPA / CPRA (California)

Regulators and plaintiffs’ counsel often look for **reasonable security** procedures after incidents. A documented decision to **avoid public MCP**, use **tailnet + ACLs**, and align **`BASE_URL`**s with private names supports a **defense-in-depth** narrative alongside encryption, MFA, logging, and vendor due diligence. It does not eliminate statutory notice or consumer rights obligations.

### What to document for auditors or legal review

- **Data flow diagram**: Cursor / agent → MCP URL → **`execute`** → each upstream (**`BASE_URL`**, vault, bridge).
- **Trust boundary**: what is **on tailnet** vs **public SaaS** vs **in-cluster only** (see Kubernetes vs MagicDNS section above).
- **ACL / firewall owner**, review cadence, and emergency “open path” procedure.
- **Vendor list**: Tailscale Inc. (if used), cloud where Headscale runs, any **DERP** or relay policy.
- **Retention**: what MCP or proxy logs contain (headers, URLs, bodies) relative to GDPR **storage limitation** and HIPAA **documentation** expectations.

---

## Troubleshooting

| Symptom                            | Things to check                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Name does not resolve**          | MagicDNS enabled? Correct **base domain** / tailnet? Client using tailnet DNS (not only **`/etc/hosts`**)?         |
| **Timeout to `100.x` address**     | **ACL** too strict? **Host firewall** blocking **UDP** mesh or **TCP** service port?                               |
| **HTTPS errors with Serve**        | Serve **hostname** vs **`/mcp`** path; client **`url`** must match what Serve presents.                            |
| **Cursor works on server only**    | **`CLAWQL_MCP_URL`** / **`mcp.json`** still **`localhost`** on the laptop — switch to MagicDNS URL.                |
| **`execute` hits public internet** | Provider **`BASE_URL`** still public — repoint to tailnet hostname; verify with **`curl -v`** from a tailnet node. |

---

## Related links

- **[`../readme/deployment.md` § Private tailnet](../readme/deployment.md#private-tailnet-tailscale-magicdns)** — Cursor, **`CLAWQL_MCP_URL`**, **`*.ts.net`**
- **[`headscale-tailnet.md`](headscale-tailnet.md)** — Headscale topology, firewall, MagicDNS, validation, deprecation of public MCP URLs
- **[`headscale-acls-clawql.hujson`](headscale-acls-clawql.hujson)** — least-privilege ACL starter
- **[`clawql-ecosystem.md`](../clawql-ecosystem.md)** — in-cluster vs tailnet naming
- **[`../enterprise-mcp-tools.md`](../enterprise-mcp-tools.md)** — regulated deployments, **`audit`**, public MCP considerations

---

## Issue index

| Topic                                    | Issue                                                               |
| ---------------------------------------- | ------------------------------------------------------------------- |
| Headscale runbook + **`*.clawql.local`** | [#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206) |
| Managed Tailscale / env hygiene          | [#211](https://github.com/danielsmithdevelopment/ClawQL/issues/211) |
| ACL least privilege                      | [#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213) |
