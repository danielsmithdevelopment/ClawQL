---
title: "Egress Filtering, DNS Controls, and Data Loss Prevention"
series: "Agentic AI Security Curriculum"
level: intermediate
tags:
  - egress
  - ssrf
  - dns
  - dlp
  - istio
part: 6
total_parts: 30
date: "May 2026"
slug: "egress-filtering-dns-dlp"
canonical_path: "/security/best-practices/egress-filtering-dns-dlp"
description: "ServiceEntry allowlists, SSRF prevention, DNS tunneling heuristics, and tool-call DLP."
prev: "agent-gateway-hardening-dns-rebinding"
next: "least-privilege-scoped-kubernetes-identities"
---

# Egress Filtering, DNS Controls, and Data Loss Prevention

Hello and welcome to Module 6!

Modules 1–5 have hardened our images, cluster admission, skills, network fabric, and the gateway itself. Now we turn our attention to the direction most security teams under-invest in: egress.

Ingress controls stop attackers from getting in. Egress controls determine what they can take out once they’re already inside. In an agentic platform, a successful prompt injection or compromised skill without strong egress controls equals a complete data breach.

This module builds the complete outbound defense stack so that even if every upstream control is bypassed, exfiltration remains structurally difficult and immediately detectable.

---

Why Egress Is the Exfiltration Surface

Ingress defenses are well-understood and heavily invested in. Egress is where defenders consistently fall short.

A successful injection without egress controls gives an attacker a direct pipe to the outside world. There are three distinct exfiltration channels we must address:

- HTTPS calls to external APIs

- DNS tunneling

- Side-channel techniques (encoded data, high-volume calls, etc.)

Egress controls are the last line of defense when everything else has failed. They turn a potential breach into a contained, observable event.

---

Istio ServiceEntry Allowlists and Default-Deny Egress

We enforce egress at the service-mesh layer with a strict default-deny posture.

Apply this once per namespace:

apiVersion: networking.istio.io/v1beta1

kind: Sidecar

metadata:

  name: default-egress-deny

spec:

  egress:

  - hosts:

    - "./\*"   # only intra-namespace traffic

Then declare every permitted external destination explicitly with a ServiceEntry:

apiVersion: networking.istio.io/v1beta1

kind: ServiceEntry

metadata:

  name: allowed-external-api

spec:

  hosts:

  - [api.openai.com](http://api.openai.com)

  - [api.anthropic.com](http://api.anthropic.com)

  ports:

  - number: 443

    name: https

    protocol: HTTPS

  location: MESH_EXTERNAL

  resolution: DNS

Key properties:

- The Istio Sidecar resource scopes the egress allowlist per namespace — tenant A cannot reach tenant B’s external services.

- Quarterly review process: remove any ServiceEntry for deprecated integrations.

- Panguard provides a second enforcement point at the tool-call level: it validates the external hostname against the skill manifest’s declared egressRequirements.

---

SSRF Prevention for Agent URL Tools

Any tool that accepts a URL parameter is an SSRF risk. We block it at parse time, before any DNS resolution occurs.

Validation rules applied in the gateway (before the request is dispatched):

- Block all RFC 1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16).

- Block loopback (127.0.0.0/8, ::1).

- Block link-local (169.254.0.0/16 — critical for cloud metadata endpoints).

- Block dangerous schemes: file://, gopher://, dict://, ftp://, ldap://, etc.

- Disable redirect following by default (redirects can hop from an allowed external host to an internal IP).

- After the first DNS lookup, pin the resolved IP for the remainder of the tool call (prevents TOCTOU rebinding).

Even if the application-layer check is bypassed, enforce IMDSv2 at the cloud-provider level as a second control.

---

DNS-Layer Filtering

Istio allowlists stop HTTPS exfiltration but not DNS tunneling. We close that gap with allowlist-only DNS resolution.

- All agent pods use a custom dnsConfig pointing to a filtering resolver (CoreDNS with RPZ or Cloudflare Gateway).

- RPZ zone configuration: rpz-passthru for explicitly declared hostnames, NXDOMAIN for everything else.

DNS tunneling heuristics (applied at the resolver):

- Label length > 40 characters → flag

- 100 unique queries per minute to the same second-level domain → flag

- Shannon entropy of subdomain label > 4.0 bits/character → flag

Falco rule fires on any DNS query from an agent pod to a non-allowlisted domain.

---

DLP Inspection of Outbound Tool Call Payloads

We inspect at the tool-call parameter level — not just log-line scanning.

Panguard runs Presidio entity detection on every content-bearing field (body, text, content, message, data).

Blocked entities:

- PII (names, emails, SSNs, credit cards, etc.)

- Credentials

- Data above the session’s declared maximum classification level

The skill manifest declares maxClassificationLevel for outbound payloads. The gateway enforces this at call time. Inspection is structured (JSON field-level), not simple string matching.

Detection = block (not alert-only). Alert-only gives the attacker the detection-to-response window.

---

Session-Level Egress Volume Detection

Per-call checks are not enough. We also monitor cumulative behavior per session:

- Single session receives >50 MB from external endpoints → HIGH alert

- 500 external calls in 60 minutes from one session → WARNING

- Base64 or hex-encoded strings >100 characters in API parameters → block + HIGH alert

Panguard tracks cumulative egress across all tool calls in the session. We establish a behavioral baseline for each agent role before enabling blocking thresholds — alert fatigue from miscalibrated rules is itself a security risk.

---

Egress from Sandboxed Skill Execution

Skills run in Kata Containers with a default policy of networkEgress: deny.

- Any skill that requires external access must declare the exact hostnames in its manifest under egressRequirements.

- Panguard verifies that runtime egress exactly matches the declared list.

- Any undeclared egress attempt from a sandboxed skill triggers: block + automatic quarantine + critical alert (this is a strong signal of a compromised or malicious skill).

---

Key Takeaways (Memorize These!)

- SSRF and DNS tunneling are distinct bypass paths that require distinct controls — Istio allowlists stop HTTPS exfiltration but not DNS tunneling.

- URL validation must happen at parse time before DNS resolution — post-resolution validation is vulnerable to TOCTOU rebinding.

- DLP at the tool-call parameter level is categorically different from log-line scanning — the former prevents exfiltration, the latter detects it after the fact.

- Baseline before enabling blocking thresholds — alert fatigue from miscalibrated egress volume alerts is itself a security risk.

You now have a complete egress control stack that makes data exfiltration structurally difficult and instantly detectable. Even if an attacker achieves code execution or prompt injection, the data cannot easily leave the platform. This is the final barrier that turns potential breaches into contained incidents.
