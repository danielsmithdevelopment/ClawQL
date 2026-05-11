# Instructor guide — Agentic AI Security Curriculum

Use this page with the twenty modules in this folder (`01-` … `20-`). Each module file already contains learning objectives, time estimates, **Further reading** links, and a **Commercial training use** section for customer engagements.

Each module’s YAML frontmatter includes **`level`** (`foundational` / `intermediate` / `advanced`) and **`tags`** for faceted search or CMS wiring—remap them if your learning platform uses a different taxonomy.

## Audience and assumptions

- **Primary:** Security architects, platform / Kubernetes engineers, and technical leads responsible for **LLM agents, tool calling, or MCP-style** integrations.
- **Prerequisites:** Working knowledge of containers and Kubernetes helps from module 3 onward; modules 1–2 are accessible to anyone who owns CI/CD or supply chain risk.
- **Materials:** Projector or shared doc, customer architecture diagram (even informal), and links to the customer’s standards (NIST CSF, ISO 27001, internal baselines).

## Suggested agendas

Times below assume **discussion and short labs** in addition to silent reading. Adjust using each file’s `estimated_minutes`.

### Half day (~3.5 hours + breaks)

| Block | Time   | Modules | Focus                                    |
| ----- | ------ | ------- | ---------------------------------------- |
| A     | 60 min | 1, 2, 3 | Supply chain, images, admission          |
| B     | 60 min | 4, 5, 7 | Identity, Zero Trust intro, network      |
| C     | 45 min | 8, 9    | Sandboxing, MCP / gateway runtime        |
| D     | 45 min | 19      | OWASP Agentic mapping (discussion-heavy) |

_Homework:_ Read modules 6, 10–14 and skim **Further reading** links.

### One day (~7 hours + breaks)

| Block       | Time   | Modules                           |
| ----------- | ------ | --------------------------------- |
| Morning 1   | 90 min | 1–5                               |
| Morning 2   | 90 min | 6–9                               |
| Afternoon 1 | 90 min | 10–14                             |
| Afternoon 2 | 90 min | 15–17, 20 (checklist as capstone) |

_Homework:_ Modules 18–19 or deep-dive one domain (e.g. only IR + backups).

### Two days (~14 hours + breaks)

| Day   | AM                                             | PM                                              |
| ----- | ---------------------------------------------- | ----------------------------------------------- |
| **1** | 1–7 (build + identity + network)               | 8–11 (runtime, MCP, data, models)               |
| **2** | 12–17 (observe, respond, IR, GPU, dev, deploy) | 18–20 (STRIDE, OWASP Agentic, quarterly review) |

### Four days (multi-week or executive + deep technical)

| Day | Theme                | Modules |
| --- | -------------------- | ------- |
| 1   | Build & deploy trust | 1–4     |
| 2   | Zero Trust & network | 5–8     |
| 3   | Agent runtime & data | 9–12    |
| 4   | Operate & govern     | 13–20   |

Stretch each day with **linked standards** (NIST, OWASP, CIS), customer-specific threat sketches, and tool demos aligned to their stack.

## Teaching patterns that work well

1. **One diagram per module:** Ask learners to mark where the control sits (build, registry, admission, runtime, egress, logs).
2. **Translate, don’t memorize:** Explicitly swap example tool names (Harbor, Kyverno, etc.) for the customer’s equivalents in the first hour.
3. **Tabletop before tools:** For modules 13–14, run a 30-minute tabletop (“agent calls a bad tool—what breaks first, who is paged, what evidence exists?”).
4. **Capstone:** Module 20 is a natural **exit criteria** for a cohort; assign each table one checklist section to present.

## Assessment (quiz stubs)

Use these as **open-book** or **take-home** prompts; adapt wording to your LMS. Each module maps to one row (you can split into 2–3 multiple-choice items if needed).

| Module | Check understanding                                                                                                        |
| -----: | -------------------------------------------------------------------------------------------------------------------------- |
|      1 | List three reasons floating image tags fail audits; name two artifacts besides images that belong in a private trust root. |
|      2 | Define “golden image” in one sentence; give two runtime settings that reduce writable attack surface.                      |
|      3 | Explain what admission control can enforce that CI alone cannot.                                                           |
|      4 | Give one Kubernetes RBAC anti-pattern and one fix for agent-facing APIs.                                                   |
|      5 | State Zero Trust in one line for **agents** (not humans with VPNs).                                                        |
|      6 | Contrast static secrets vs short-TTL dynamic secrets for a batch job vs a long-lived service.                              |
|      7 | Name two layers of east-west control (e.g. mesh + something else).                                                         |
|      8 | Pick a workload class and justify sandbox tier (VM vs userspace kernel vs default container).                              |
|      9 | Describe synchronous vs asynchronous policy enforcement for a tool call.                                                   |
|     10 | Why must redaction happen **before** write to long-term log stores?                                                        |
|     11 | Why are model weights not fully covered by container image signing alone?                                                  |
|     12 | List three signal types (e.g. syscall, log, metric) and who owns tuning.                                                   |
|     13 | Map one alert tier to human-only vs automated response.                                                                    |
|     14 | PICERL: which phase includes **tested** restore?                                                                           |
|     15 | Two controls that protect a shared GPU pool from one noisy tenant.                                                         |
|     16 | Name two workstation controls that reduce supply-chain risk to production.                                                 |
|     17 | Order five dependencies for a secure rollout (customize to customer).                                                      |
|     18 | Pick one STRIDE letter and give one agent-specific threat example.                                                         |
|     19 | Map any **two** OWASP Agentic items to **different** control layers.                                                       |
|     20 | Who owns the quarterly review, and what evidence would you show an auditor?                                                |

**Rubric (simple):** _Meets_ = correct pattern + one customer-specific example; _Exceeds_ = cites a **Further reading** standard by name.

## Delivery modes

| Mode                | Tips                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| **Virtual**         | Break every 45–60 min; use breakout rooms for module 20 section owners. |
| **Hybrid**          | Send modules 1–2 as pre-read; day-of focuses on 8–14.                   |
| **Executive slice** | Modules 5, 18, 19, 20 in 2 hours + Q&A; defer YAML to technical track.  |

## After the course

- Re-run module 20 on a calendar cadence (quarterly).
- Attach completed quiz / discussion notes to the customer’s risk register or training LMS.
- When a **specific product or reference stack** is relevant to the engagement, say so explicitly so learners do not confuse **patterns** with **mandatory vendor choices**.

---

_This guide is maintained alongside the module files in the same directory._
