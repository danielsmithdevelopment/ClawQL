---
title: "Sandboxing Agent Workloads: Kata Containers, gVisor, and macOS Seatbelt"
series: "Agentic AI Security Curriculum"
level: intermediate
tags:
  - sandbox
  - kata
  - gvisor
  - seccomp
  - seatbelt
part: 11
total_parts: 32
date: "May 2026"
slug: "sandboxing-kata-gvisor-seatbelt"
canonical_path: "/security/best-practices/sandboxing-kata-gvisor-seatbelt"
description: "Choose Kata, gVisor, or seccomp baselines by workload trust and performance requirements."
prev: "agent-identity-lifecycle-provisioning"
next: "mcp-runtime-enforcement-panguard-atr"
---

# Sandboxing Agent Workloads: Kata Containers, gVisor, and macOS Seatbelt

Kata Containers, gVisor, and macOS Seatbelt

Hello and welcome to Module 11!

Modules 1–10 have given us trusted images, admission control, vetted skills, zero-trust networking, a hardened gateway, egress controls, scoped identities, dynamic secrets, per-request authentication, and a full agent lifecycle. Now we add the final layer of isolation that protects the host kernel itself.

Standard Kubernetes containers are convenient, but they all share the same host kernel. A single kernel exploit from inside a container can compromise the entire node. For agents that execute arbitrary code, process untrusted documents, or run third-party skills, shared-kernel isolation is simply not enough.

In this module we explore the three sandboxing technologies that give us real security boundaries — Kata Containers, gVisor, and macOS Seatbelt — plus seccomp as the universal baseline. You will learn exactly when to use each one and how Panguard integrates with them for defense in depth.

---

Why Container Isolation Is Not Enough

A standard container gives you process and filesystem isolation, but the kernel is shared.

If an attacker finds a kernel vulnerability (and they do — new ones are disclosed regularly), they can escape the container and gain full control of the node. All containers on that node share the same kernel attack surface.

Agentic workloads are especially risky because they:

- Execute untrusted code (skills, user-provided scripts)

- Process external content (PDFs, web pages, tool outputs)

- Run third-party dependencies that may contain zero-days

We need a genuine security boundary between the agent code and the host kernel. That is what sandboxing technologies provide.

---

Kata Containers — VM-Level Isolation

Kata Containers is the highest-isolation option.

How it works:

- Each Kata pod runs inside its own lightweight virtual machine.

- The VM has a dedicated kernel — the agent code can never reach the host kernel.

- The VM boundary is the isolation boundary.

Performance characteristics:

- Startup latency: 50–100 ms

- Runtime overhead: 10–15 % compared to standard containers

Requirements:

- Nested virtualization must be enabled on the node (AWS metal instances or KVM-enabled types).

Integration:

- Panguard runtime hooks enforce syscall policy at the VM level.

Best used for:

- Long-running agent sessions

- exec-class tools

- Any workload that processes untrusted external documents or runs third-party skills

Kata gives us the strongest guarantee that even a kernel exploit inside the sandbox cannot touch the host.

---

gVisor (runsc) — Userspace Kernel with Lower Overhead

gVisor provides strong isolation without a full VM.

How it works:

- gVisor intercepts every syscall from the container.

- It re-implements the kernel in Go in userspace (the “runsc” runtime).

- The host kernel attack surface is reduced from thousands of syscalls to only the small set that gVisor itself implements.

Performance:

- Runtime overhead: 5–10 %

- Startup latency: negligible

Limitations:

- Not every syscall is implemented yet — always test compatibility with your specific workloads before production.

Best used for:

- Short-lived tool executions

- Trusted skills with high invocation frequency

- Workloads where Kata’s VM overhead would be prohibitive

gVisor is the sweet spot for many agentic use cases — excellent isolation with acceptable performance.

---

macOS Seatbelt (for Local Development Only)

When developing locally on macOS we use Apple’s built-in sandbox.

How it works:

- Sandbox profiles are written in a simple Scheme-like DSL.

- The profile restricts the process to specific filesystem paths, network operations, and syscall categories.

- Applied via the sandbox-exec wrapper or built into the local ClawQL gateway startup.

Example restrictions:

- Filesystem access limited to the workspace directory

- Network connections only to declared hostnames

- Fork/exec limited to approved binaries

Important: Seatbelt is for local development only. It is not a production replacement for Kata or gVisor.

---

seccomp Profiles — The Universal Baseline

Regardless of which sandbox you choose, we always apply seccomp (secure computing mode).

seccomp filters syscalls at the kernel level before they reach the host kernel.

We ship a default seccomp profile that blocks the syscalls most commonly used in container escapes:

- ptrace, process_vm_readv, process_vm_writev

- Dangerous socket and mount operations

- Many others from the Kubernetes “restricted” profile

In the pod spec:

securityContext:

  seccompProfile:

    type: RuntimeDefault

    # or [Localhost](http://Localhost) with a custom profile

seccomp is the baseline applied to all containers. Kata and gVisor build on top of it.

---

Panguard Integration with Sandbox Policy

Panguard and the sandbox work together as complementary layers:

- Panguard operates at the MCP protocol / tool-call layer (ATR rules, schema validation).

- The sandbox operates at the OS syscall layer.

If Panguard allows a tool call but the sandbox blocks the underlying syscall, the sandbox wins.

Together they give:

- Panguard logs the high-level intent (“agent tried to run curl”).

- Sandbox logs the low-level outcome (“syscall execve denied”).

Full observability of what the agent attempted and whether it was permitted at every layer.

---

Choosing Between Runtimes

Use this decision matrix:

|                                                      |                     |                                 |
| ---------------------------------------------------- | ------------------- | ------------------------------- |
| Workload Type                                        | Recommended Runtime | Reason                          |
| Long-running agents, exec tools, untrusted documents | Kata Containers     | Highest isolation               |
| Short-lived tools, high-frequency trusted skills     | gVisor              | Strong isolation + low overhead |
| Stateless internal workloads                         | Standard + seccomp  | Lowest overhead                 |
| Local development (macOS)                            | Seatbelt            | Developer convenience           |

Critical rule: Never mix runtime types within the same node pool for security-sensitive workloads. Isolation boundaries are enforced at the node level.

---

Key Takeaways (Memorize These!)

- Container isolation is a process boundary, not a security boundary — kernel exploitation from inside a container is a real attack class.

- Kata provides VM-level isolation at the cost of startup and runtime overhead; gVisor provides syscall-level isolation with lower overhead but narrower compatibility.

- seccomp profiles are the baseline for all containerized workloads regardless of whether Kata or gVisor is used.

- The choice of sandbox runtime is a threat-model decision based on the workload’s trust level and performance requirements, not a one-size-fits-all answer.

You now have a true security boundary between agent code and the host kernel. Even if an attacker achieves arbitrary code execution inside an agent, they are still trapped inside the sandbox. This is the final layer that makes the entire platform resilient to kernel-level escapes.
