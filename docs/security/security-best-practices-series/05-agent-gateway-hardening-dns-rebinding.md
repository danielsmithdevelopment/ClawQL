---
title: "Agent Gateway Hardening: Binding, Firewall Rules, DNS Rebinding Defense, and Safe Remote Access"
series: "Agentic AI Security Curriculum"
level: intermediate
tags:
  - gateway
  - mcp
  - dns-rebinding
  - tailscale
  - firewall
part: 5
total_parts: 30
date: "May 2026"
slug: "agent-gateway-hardening-dns-rebinding"
canonical_path: "/security/best-practices/agent-gateway-hardening-dns-rebinding"
description: "Localhost binding, VPN-only access, Host/Origin validation, and listening-port drift detection."
prev: "zero-trust-network-mtls-istio-rbac"
next: "egress-filtering-dns-dlp"
---
# Agent Gateway Hardening: Binding, Firewall Rules, DNS Rebinding Defense, and Safe Remote Access

Binding, Firewall Rules, DNS Rebinding Defense, and Safe Remote Access

Hello and welcome to Module 5! 

Modules 1–4 have given us trusted images, a cluster that blocks unsigned workloads, vetted skills, and a zero-trust network fabric. Now we focus on the single most valuable target in the entire platform: the ClawQL gateway.

The gateway is not a static web server. It executes tools, dispatches real-world actions, reads secrets from Vault, and sits at the boundary between untrusted MCP clients and the protected agent runtime. A misconfigured gateway bypasses every downstream control in one stroke.

In this module we close both attack vectors that matter: direct network exposure and DNS rebinding. We make the gateway reachable only in the ways we explicitly allow — and impossible to reach in any other way.



---



Why the Gateway Is the Highest-Value Target

The gateway has the keys to the kingdom:

- It executes tools on behalf of agents.  

- It dispatches actions that can change the real world.  

- It reads and exchanges secrets from Vault.  


Two completely separate threat vectors exist here:

1. Direct network exposure — anyone who can reach the listening port can talk to the gateway (firewall/binding problem).  

2. DNS rebinding — an application-layer attack that bypasses firewalls entirely by making the browser treat an external hostname as [localhost](http://localhost) (the firewall never sees the danger).  


Each vector is invisible to controls that protect the other. Both must be addressed simultaneously.



---



Default Binding: 127.0.0.1 and Unix Sockets

Never bind the gateway to 0.0.0.0. Loopback binding is the first and simplest defense.

Correct defaults in ClawQL:

- HTTP/SSE transport binds to 127.0.0.1:8080 (or the configured port).  

- Preferred transport: Unix domain socket at unix:///var/run/clawql/gateway.sock.  


Why Unix sockets are ideal:

- They are not addressable over any network interface — impossible to reach from outside the host.  

- Socket file permissions: 0660, owned by the clawql group (only processes in that group can connect).  

- MCP clients that support stdio transport can reach the socket via a thin wrapper — no TCP port is ever exposed.  


Unix socket transport is the only transport that is immune to DNS rebinding by construction. Use it wherever your MCP client supports stdio.



---



Host Firewall Rules

Even with [localhost](http://localhost) binding, we add explicit firewall rules as a second layer.

ufw example (Ubuntu/Debian):

ufw deny in on any to any port 8080

ufw allow in on lo to any port 8080

ufw reload



firewalld example (RHEL/CentOS): Use rich rules scoped to specific source addresses only.

Docker note: Docker manipulates iptables directly and can bypass ufw. For Docker-based deployments, apply the rules directly with iptables.

Tailscale ACL example:

{

  "acls": [

    ["tag:gateway-clients", "tag:gateway", "tcp:8080"]

  ]

}



Scope access to the specific Tailscale IP of the client machine — never *:8080.



---



VPN-Only Remote Access

Production gateway access is VPN-only. No public ports are ever opened.

Recommended options:

- Tailscale: Gateway binds only to its Tailscale IP. Access is restricted to authenticated Tailscale nodes.  

- Headscale: Self-hosted coordination server for organizations that cannot use Tailscale’s infrastructure.  

- WireGuard: Manual key distribution with full routing control; gateway binds exclusively to the wg0 interface IP.  


In every VPN model, no inbound port forwarding is required. The gateway host has zero public attack surface.



---



Cloudflare Tunnel and Access (Outbound-Only Option)

For environments that need occasional HTTP access without a persistent VPN (e.g., certain CI runners):

- Use Cloudflare Tunnel (cloudflared).  

- The tunnel is outbound-only — no inbound firewall rules are opened on the gateway host.  

- cloudflared initiates the tunnel; Cloudflare’s edge terminates it.  

- Cloudflare Access policy requires identity-aware authentication before any request reaches the gateway.  

- Combine with strict SNI/Host rules at the Cloudflare layer for extra protection.  


This is an outbound-only pattern that keeps the gateway host invisible from the public internet.



---



DNS Rebinding: The Attack the Firewall Cannot Stop

DNS rebinding is the attack that laughs at firewalls.

Attack mechanism:

1. Attacker serves a page with a short-TTL DNS record that first resolves to a public IP (bypassing same-origin policy).  

2. After the page loads, the DNS record rebinds to 127.0.0.1.  

3. The browser treats subsequent requests as same-origin because the hostname matches, not the IP.  

4. The firewall never sees an external connection; the [localhost](http://localhost) binding is satisfied; the attack succeeds.  


The MCP specification makes Host and Origin header validation a MUST requirement for HTTP and SSE transports.



---



Host and Origin Header Validation Middleware

ClawQL ships this validation enabled by default.

Configuration:

- Allowlist of permitted Host values: [localhost](http://localhost), 127.0.0.1, ::1, plus any declared internal hostname (e.g., Tailscale DNS name).  

- Strip the port from the Host header before comparison.  

- Validate the Origin header (when present): the origin hostname must also be in the allowed set.  

- Any mismatch returns 403 Forbidden immediately — never fall through silently.  


allowedHosts is configurable via Helm values for Tailscale or internal-domain deployments.

This middleware cannot be disabled on HTTP or SSE transports. Only Unix socket transport makes it redundant.



---



Monitoring for Unexpected Listening Ports

Configuration drift is the silent killer. We monitor continuously:

- Falco rule: Alert on any clawql-api process binding to 0.0.0.0.  

- Panguard: Alert if the health-check endpoint becomes reachable from a non-approved source IP.  

- Weekly automated check: Compare listening ports against the declared expected state (stored in git).  


Drift detection is as important as initial configuration. Upgrades and environment-variable changes can silently rebind the gateway.



---



Key Takeaways (Memorize These!)

- [Localhost](http://Localhost) binding + firewall stops direct external access; Host/Origin validation stops DNS rebinding — both are required.  

- Unix socket transport eliminates the rebinding attack surface entirely — use it wherever the MCP client supports stdio.  

- MCP specification mandates Host/Origin validation for HTTP/SSE — this is a compliance requirement, not optional hardening.  

- Every gateway configuration change must be followed by a port audit — silent drift is the operational risk.  


The gateway is now hardened end-to-end. It can only be reached in the exact ways we explicitly allow, and the most dangerous browser-based bypass is structurally impossible. This completes the perimeter around the single highest-value component in the entire platform.



## **MODULE 6**

### **Egress Filtering, DNS Controls, and Data Loss Prevention**

Every ingress control in this series stops things from getting in — egress controls determine what happens to the data an attacker already has access to if something does get through. Istio ServiceEntry allowlists, allowlist-only DNS resolution, and payload-level DLP inspection on outbound tool call parameters together ensure that a successful injection or skill compromise remains a containment event rather than a data breach. This module builds the outbound control stack that makes exfiltration structurally difficult regardless of how an attacker gains initial access.

**Why egress is the exfiltration surface**

- Ingress defenses are well-understood; egress is where defenders consistently underinvest  

- A successful prompt injection without egress controls = complete data breach  

- Three distinct exfiltration channels: HTTPS to external APIs, DNS tunneling, side channels  

- Egress controls are the last line of defense when all upstream controls fail  


**Istio ServiceEntry allowlists and default-deny egress**

- Default-deny Sidecar resource: no external traffic unless explicitly declared  

- ServiceEntry per permitted external host: hostname, port, TLS mode  

- Istio Sidecar resource scopes egress allowlist per namespace — tenant A cannot reach tenant B’s external services  

- Quarterly review: remove ServiceEntry declarations for deprecated integrations  

- Panguard second enforcement point: validates external hostname against skill manifest declaration at tool-call level  


**SSRF prevention for agent URL tools**

- Any tool that accepts a URL parameter is an SSRF risk  

- Validate URL at parse time, before DNS resolution: block RFC 1918 ranges (10.x, 172.16.x, 192.168.x), loopback, link-local (169.254.x — cloud metadata)  

- Block non-HTTP/HTTPS schemes: file://, gopher://, dict://, ftp://  

- Disable redirect following by default — redirects can hop from allowed external host to internal IP  

- IMDSv2 requirement for cloud metadata: even if the URL is blocked at the application layer, enforce IMDSv2 at the cloud level as a second control  

- Pin to resolved IP after first DNS lookup — prevents TOCTOU rebinding at the tool call level  


**DNS-layer filtering**

- Allowlist-only DNS resolution for agent pods: CoreDNS RPZ or Cloudflare Gateway  

- All agents use a custom dnsConfig pointing to the filtering resolver  

- RPZ zone: rpz-passthru for declared hostnames, NXDOMAIN for everything else  

- DNS tunneling heuristics on the filtering resolver:  

  - Label length > 40 characters → flag  
  
    - 100 unique queries per minute to same second-level domain → flag  
    
  
    - Shannon entropy of subdomain label > 4.0 bits/character → flag  
  
  - Falco rule: alert on DNS queries to non-allowlisted domains from agent pods  


**DLP inspection of outbound tool call payloads**

- DLP at the tool-call parameter level — not just log line scanning  

- Presidio entity detection on all fields declared as content-bearing: body, text, content, message, data  

- Entities blocked from leaving via external tool calls: PII, credentials, classified data above declared egress level  

- Skill manifest declares maxClassificationLevel for outbound payloads — gateway enforces at call time  

- Structured data inspection: JSON field-level, not just full-string matching  

- Block on detection (not alert-only) — alert-only gives the attacker the detection-to-response window  


**Session-level egress volume detection**

- Single session >50MB received from external endpoints → HIGH alert  

- 500 external calls in 60 minutes from one session → WARNING  
  

- Base64 or hex-encoded strings >100 characters in API parameters → block + HIGH alert  

- Establish behavioral baseline for each agent role before enabling blocking thresholds  

- Panguard tracks cumulative egress per session across all tool calls, not just per-call  


**Egress from sandboxed skill execution**

- Skills default to networkEgress: deny inside Kata Container sandbox  

- Skills requiring external access must declare hosts in manifest egressRequirements  

- Panguard verifies runtime egress matches manifest declaration  

- Undeclared egress attempt from a sandboxed skill → block + quarantine + alert (critical signal of compromised skill)  


**Key takeaways to cover**

- SSRF and DNS tunneling are distinct bypass paths that require distinct controls — Istio allowlists stop HTTPS exfiltration but not DNS tunneling  

- URL validation must happen at parse time before DNS resolution — post-resolution validation is vulnerable to TOCTOU rebinding  

- DLP at the tool-call parameter level is categorically different from log-line scanning — the former prevents exfiltration, the latter detects it after the fact  

- Baseline before enabling blocking thresholds — alert fatigue from miscalibrated egress volume alerts is itself a security risk  




---
