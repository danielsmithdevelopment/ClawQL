# The Decentralized Agent Operating System: Coordination Layer Specification

## Scope and Relationship to the DAOS Unified Specification

This document specifies the **transport and coordination layer** of the ClawQL Decentralized Agent Operating System. It covers the HTTP + NATS JetStream handoff protocol, the Ouroboros strategic coordination engine (NSV, SGDOP, reputation attribution, and Diversity Dividends), and the mathematical foundations underlying both.

It is intended for readers who want the conceptual and mathematical foundations without the full engineering stack — implementers of the coordination primitives, researchers evaluating the diversity metrics, or integrators building compatible agents.

The full platform specification — including the 7-layer architecture, ActionType contracts, Policy Enforcement Point, Manifest schema, Circuit Breaker, Memory 2.0, and the complete P0–P3 build plan — is in the **[DAOS Unified Architecture Specification v2.7](./daos-unified-architecture-specification-v2.7.md)**. **Engineering contract:** [Build plan v2.7.1](./daos-build-plan-v2.7.1.md). Where this document and v2.7 conflict, v2.7 takes precedence. Where this document covers topics v2.7 only summarizes (particularly the mathematical derivations), this document is the primary reference.

Two limitations are stated explicitly throughout rather than left implicit: what the strategic layer's privacy model actually guarantees, and what its verification step actually checks.

---

## Part I: Transport and Persistence Layer

### 1.1 Tiers

All client interaction occurs through stateless HTTP GET requests wherever the action itself has no real-world consequence — which, as detailed in 1.2, is almost everywhere in this protocol — in one of two tiers, chosen per request by which parameters are present.

The **standard tier** uses named query parameters with semicolon-delimited list values and underscores in place of spaces, requiring no encoding or cryptography from the calling agent:

```
GET /chat-summary?session=xK9mP2vQwR7nL4jH3sT8&agent=researcher&summary=Completed_lit_review_on_handoff_patterns&next=Implement_prototype;Test_with_LLM&done=Initial_design;Encoding_strategy
```

Field values must not contain `&`, `=`, or `;`, since these are the tier's delimiters.

The **advanced tier** uses a Base64URL-encoded JSON payload accompanied by an HMAC-SHA256 signature with constant-time verification, for participants with code execution who want tamper-evidence beyond URL secrecy, or whose tool arguments are too structured for flat delimited fields:

```python
import base64, json, hmac, hashlib

payload = json.dumps({"agent": "researcher", "summary": "Completed lit review."})
encoded = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
sig = hmac.new(secret, encoded.encode(), hashlib.sha256).hexdigest()
url = f"https://example.com/chat-summary?session={session}&payload={encoded}&sig={sig}"
```

Both tiers write to the same underlying stream, and a single session may mix participants of either kind. Authorization in the standard tier rests entirely on possession of the session token — a long random string generated once per session by a human operator or setup script, never by a participating agent — and should be treated with the same sensitivity as an unlisted document link. The advanced tier additionally guarantees that a message was produced by a holder of the shared secret, independent of how the token was obtained.

### 1.2 Gateway Layer

The gateway performs three functions on every request: validating it against the active tier's schema, classifying the requested tool, and formatting the response through a uniform envelope.

**Why almost everything stays on GET.** HTTP infrastructure treats GET as a promise: link scanners, email security filters, browser prefetchers, and chat-client link-preview bots all assume a GET request is safe to dereference without anyone deciding to, and they act on that assumption automatically. This isn't a theoretical concern — it's the same property that made one-click email unsubscribe links a known failure mode for years, where corporate security scanners pre-fetching every link in an inbox would silently unsubscribe a user before they ever opened the email. The protocol's own usefulness depends on the opposite property holding everywhere it can: an agent or a human should be able to copy any link out of a conversation and paste it into a browser, with nothing more than viewing happening as a result. That property holds for every safe tool, for `read_session`, and — critically — for staging a high-impact action, since staging only writes an inert pending record; nothing observable in the outside world has happened yet.

Tools are classified as either **safe** (execute immediately on GET) or **external_write**, **destructive**, or **financial** (require a mandatory two-phase commit, also initiated over GET). A high-impact tool call generates a UUID `action_id` and a short human-readable confirmation code, written to a key-value bucket (`PENDING_ACTIONS`) with a defined TTL, and returns an `approval_url` pointing to a GET-safe confirmation view — not an execution endpoint. Visiting that view is harmless regardless of who or what visits it. The one and only step that actually executes anything uses POST, specifically because it's the one place where being silently triggered by a scanner, prefetcher, or bot would matter. Cancellation stays on GET deliberately: cancelling can only reduce risk, never cause an irreversible action, so an accidental trigger is an inconvenience to retry, not a mistake.

Approval and cancellation are both idempotent. The `approval_url` field threads through the entire flow as the HATEOAS mechanism — the same field name means "the next thing to do" at every stage. A caller never needs to know the URL structure in advance; it follows what the envelope hands it next until `approval_url` comes back null.

### 1.3 Response Envelope

Every response uses one schema regardless of tool or tier:

```json
{
  "protocol_version": "2.1",
  "success": true,
  "tool": "read_session",
  "caller": { "agent_id": "researcher-01", "tier": "standard" },
  "data": { "...": "..." },
  "seq": 1042,
  "context_updated": true,
  "timestamp": "2026-06-16T18:04:00Z",
  "approval_url": null,
  "error": null
}
```

The `caller` field carries an optional `verifiable_execution_claim` sub-object for agents running inside a Trusted Execution Environment, recorded in the immutable log alongside the rest of the envelope. Callers not running in a TEE omit it.

### 1.4 Persistence Layer

Two structures back the protocol: a JetStream stream named `CHAT_HANDOFF` with one subject per session (`chat.handoff.<session_id>`), and the `PENDING_ACTIONS` key-value bucket. Each session's subject retains its own message history; `GET /tool/read_session` uses a durable pull consumer with `deliver_policy: by_start_sequence` to let a caller request all events from any prior point. Each message carries a monotonic per-subject sequence number, giving replay protection for free.

Approval expiry is handled explicitly: when a `PENDING_ACTIONS` entry exceeds its TTL, both the GET confirmation view and the POST confirm endpoint return an explicit "Action expired" result rather than a generic error.

### 1.5 Reference Implementation

```python
import os, json, time, uuid, secrets, hmac, hashlib, base64
from datetime import datetime, timezone
from typing import Optional

import nats, nats.errors
from nats.js.api import StreamConfig, KeyValueConfig, ConsumerConfig
from fastapi import FastAPI, HTTPException, Query, Request

app = FastAPI()
nc = js = kv = None

STREAM_NAME = "CHAT_HANDOFF"
KV_BUCKET = "PENDING_ACTIONS"
ACTION_TTL_SECONDS = 2 * 60 * 60
HANDOFF_SECRET = os.environ.get("HANDOFF_SECRET", "").encode()

SAFE_TOOLS = {"read_session", "publish_summary"}
HIGH_IMPACT_TOOLS = {
    "send_email": "external_write",
    "delete_resource": "destructive",
    "transfer_funds": "financial",
}


@app.on_event("startup")
async def startup():
    global nc, js, kv
    nc = await nats.connect(os.environ["NATS_URL"])
    js = nc.jetstream()
    await js.add_stream(StreamConfig(
        name=STREAM_NAME, subjects=["chat.handoff.*"],
        max_msgs_per_subject=200, max_age=7 * 24 * 60 * 60,
    ))
    kv = await js.create_key_value(KeyValueConfig(bucket=KV_BUCKET))


def envelope(tool, success, data=None, seq=None, context_updated=False,
             approval_url=None, error=None, caller=None):
    return {
        "protocol_version": "2.1", "success": success, "tool": tool,
        "caller": caller or {}, "data": data, "seq": seq,
        "context_updated": context_updated,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "approval_url": approval_url, "error": error,
    }


def verify_signature(payload: str, signature: str) -> bool:
    expected = hmac.new(HANDOFF_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@app.post("/chat-summary/new")
async def new_session():
    return {"session": secrets.token_hex(16)}


@app.get("/chat-summary")
async def handle_summary(
    session: str = Query(..., min_length=20),
    agent: Optional[str] = Query(default=None),
    summary: Optional[str] = Query(default=None),
    next: Optional[str] = Query(default=None),
    done: Optional[str] = Query(default=None),
    artifacts: Optional[str] = Query(default=None),
    payload: Optional[str] = Query(default=None),
    sig: Optional[str] = Query(default=None),
):
    subject = f"chat.handoff.{session}"
    if payload:
        if not HANDOFF_SECRET or not sig or not verify_signature(payload, sig):
            raise HTTPException(403, "Invalid or missing signature")
        try:
            padded = payload + "=" * (-len(payload) % 4)
            data = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        except Exception:
            raise HTTPException(400, "Malformed payload")
        data["published_at"] = datetime.now(timezone.utc).isoformat()
        data["tier"] = "advanced"
        ack = await js.publish(subject, json.dumps(data).encode())
        return envelope("publish_summary", True, data={"status": "published"},
                        seq=ack.seq, context_updated=True,
                        caller={"agent_id": agent, "tier": "advanced"})
    elif summary or agent:
        data = {
            "agent": agent,
            "summary": (summary or "").replace("_", " "),
            "next_actions": (next or "").split(";") if next else [],
            "completed": (done or "").split(";") if done else [],
            "artifacts": (artifacts or "").split(";") if artifacts else [],
            "published_at": datetime.now(timezone.utc).isoformat(),
            "tier": "standard",
        }
        ack = await js.publish(subject, json.dumps(data).encode())
        return envelope("publish_summary", True, data={"status": "published"},
                        seq=ack.seq, context_updated=True,
                        caller={"agent_id": agent, "tier": "standard"})
    else:
        return await read_session(session)


@app.get("/tool/read_session")
async def read_session(session: str = Query(..., min_length=20),
                       start_seq: Optional[int] = Query(default=None)):
    subject = f"chat.handoff.{session}"
    try:
        config = ConsumerConfig(
            deliver_policy="by_start_sequence", opt_start_seq=start_seq
        ) if start_seq else None
        sub = await js.pull_subscribe(subject, durable=f"reader-{session}", config=config)
        msgs = await sub.fetch(50, timeout=2.0)
    except nats.errors.TimeoutError:
        msgs = []
    out, last_seq = [], None
    for m in msgs:
        out.append(json.loads(m.data))
        last_seq = m.metadata.sequence.stream
        await m.ack()
    return envelope("read_session", True, data={"messages": out}, seq=last_seq)


@app.get("/tool/{tool_name}")
async def invoke_tool(
    tool_name: str, request: Request,
    session: str = Query(..., min_length=20),
    agent: Optional[str] = Query(default=None),
    payload: Optional[str] = Query(default=None),
    sig: Optional[str] = Query(default=None),
):
    """GET: safe tools execute immediately; high-impact tools only write an inert
    pending record at this stage, so neither has a real-world effect."""
    if payload:
        if not HANDOFF_SECRET or not sig or not verify_signature(payload, sig):
            raise HTTPException(403, "Invalid or missing signature")
        try:
            padded = payload + "=" * (-len(payload) % 4)
            args = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        except Exception:
            raise HTTPException(400, "Malformed payload")
    else:
        reserved = {"session", "agent", "payload", "sig"}
        args = {k: v for k, v in request.query_params.items() if k not in reserved}

    if tool_name in SAFE_TOOLS:
        result = await execute_tool(tool_name, args)
        return envelope(tool_name, True, data=result, caller={"agent_id": agent})

    classification = HIGH_IMPACT_TOOLS.get(tool_name)
    if classification is None:
        raise HTTPException(404, "Unknown tool")

    action_id = str(uuid.uuid4())
    confirmation_code = secrets.token_hex(3)
    record = {
        "tool": tool_name, "args": args, "classification": classification,
        "confirmation_code": confirmation_code, "created_at": time.time(),
        "agent_id": agent, "status": "pending",
    }
    await kv.put(action_id, json.dumps(record).encode())
    approval_url = f"/tool/{tool_name}/approve?action_id={action_id}&code={confirmation_code}"
    return envelope(tool_name, True,
                    data={"action_id": action_id,
                          "confirmation_code": confirmation_code,
                          "classification": classification},
                    approval_url=approval_url, caller={"agent_id": agent})


@app.get("/tool/{tool_name}/approve")
async def view_approval(tool_name: str, action_id: str = Query(...), code: str = Query(...)):
    """GET: displays the pending action and returns the confirm link.
    Visiting this — by anyone or anything — never executes the action."""
    try:
        entry = await kv.get(action_id)
    except Exception:
        raise HTTPException(404, "Action not found")
    record = json.loads(entry.value)
    if time.time() - record["created_at"] > ACTION_TTL_SECONDS:
        return envelope(tool_name, False, error="Action expired",
                        data={"action_id": action_id})
    if record["status"] != "pending":
        return envelope(tool_name, True,
                        data={"status": record["status"], "action_id": action_id})
    if not hmac.compare_digest(record["confirmation_code"], code):
        raise HTTPException(403, "Invalid confirmation code")
    confirm_url = f"/tool/{tool_name}/confirm?action_id={action_id}&code={code}"
    return envelope(tool_name, True,
                    data={"status": "pending", "action_id": action_id,
                          "tool": record["tool"], "args": record["args"],
                          "classification": record["classification"]},
                    approval_url=confirm_url,
                    caller={"agent_id": record["agent_id"]})


@app.post("/tool/{tool_name}/confirm")
async def confirm_action(tool_name: str, action_id: str = Query(...), code: str = Query(...)):
    """POST: the single point where a high-impact action actually executes."""
    try:
        entry = await kv.get(action_id)
    except Exception:
        raise HTTPException(404, "Action not found")
    record = json.loads(entry.value)
    if time.time() - record["created_at"] > ACTION_TTL_SECONDS:
        return envelope(tool_name, False, error="Action expired",
                        data={"action_id": action_id})
    if record["status"] != "pending":
        return envelope(tool_name, True,
                        data={"status": record["status"], "action_id": action_id})
    if not hmac.compare_digest(record["confirmation_code"], code):
        raise HTTPException(403, "Invalid confirmation code")
    result = await execute_tool(record["tool"], record["args"])
    record["status"] = "executed"
    await kv.put(action_id, json.dumps(record).encode())
    return envelope(tool_name, True, data={"status": "executed", "result": result})


@app.get("/tool/{tool_name}/cancel")
async def cancel_action(tool_name: str, action_id: str = Query(...)):
    """GET: cancelling can only reduce risk, never cause an action."""
    try:
        entry = await kv.get(action_id)
    except Exception:
        raise HTTPException(404, "Action not found")
    record = json.loads(entry.value)
    if record["status"] == "pending":
        record["status"] = "cancelled"
        await kv.put(action_id, json.dumps(record).encode())
    return envelope(tool_name, True,
                    data={"status": record["status"], "action_id": action_id})


async def execute_tool(tool_name: str, args: dict) -> dict:
    """Dispatch boundary; real tool implementations live behind this call."""
    return {"executed": tool_name, "args": args}
```

TTL expiry is checked against `created_at` in application logic rather than relying on native per-key KV expiry, keeping behavior consistent across NATS server versions.

---

## Part II: Cognitive and Strategic Layer (Ouroboros)

Where the transport layer guarantees durable, ordered, safely gated communication, the strategic layer measures whether the swarm's collective output reflects genuine diversity of reasoning or merely correlated repetition, identifies specifically what kind of diversity is missing, and adjusts each agent's standing accordingly.

### 2.1 Agent Loop

Each agent runs a five-phase loop, defined functionally:

- **Wonder / Reflect**: local state transformation, informed by history replay via `read_session` and the agent's own prior position.
- **Execute**: output generation, invoked through the transport layer, with high-impact tool calls staged over GET and confirmed over POST per 1.2.
- **Evaluator**: an external verification hook — a test suite, a secondary agent, or a held-out check — independent of the producing agent's internal confidence. See 2.3 for what this phase does and does not establish.
- **Convergence check**: a local decision point, informed by both the Evaluator's verdict and the swarm-level dispersion signals below.

Every agent maintains a **position**: a unit-normalized embedding vector of its current contribution, tagged with an `embeddingModelVersion`. Comparisons between any two vectors in this system — agent to agent, or agent to candidate — are only valid when both carry the same `embeddingModelVersion` and the same normalization. This constraint applies uniformly across every metric defined below.

### 2.2 Privacy Model

Every Position event an agent publishes travels to the Coordinator as a plaintext embedding vector. The transport layer's TLS protects this in transit from outside eavesdroppers; it does not protect the vector from the Coordinator itself, which sees every agent's raw position in order to compute NSV, SGDOP, and reputation alignment. This is a deliberate trust boundary: the Coordinator is already trusted to gate two-phase-commit approvals and run dispersion calibration, and this extends the same trust to reading raw positions.

A natural question is whether positions could instead stay encrypted from the Coordinator entirely. That requires more than additively homomorphic schemes such as Paillier provide: Paillier supports ciphertext-plus-ciphertext addition and ciphertext-times-plaintext-scalar multiplication, but not ciphertext-times-ciphertext multiplication, and a dot product — the operation underlying both cosine similarity and the SGDOP Gram matrix — needs exactly that missing operation. Reaching it requires either a fully homomorphic scheme such as CKKS (which handles real-valued embeddings natively and needs only one multiplicative level for a dot product, so noise-budget exhaustion is not the limiting factor) or an interactive two-party computation protocol.

Neither is used here. CKKS-based computation runs orders of magnitude slower than plaintext arithmetic, a poor fit for a signal recomputed on every position update in a live coordination loop. A 2PC protocol requires multi-round interactive exchange between the two parties holding the vectors, conflicting with the single-request simplicity the standard transport tier is built around. This specification accepts a trusted-coordinator model rather than a zero-trust one. A deployment that needs positions to stay private even from the Coordinator would need to adopt one of the two approaches above and accept its cost.

### 2.3 Verification Scope

The Evaluator phase checks a finished candidate against criteria independent of the producing agent's confidence. This is **outcome verification**: it establishes whether a result is acceptable, not whether the reasoning that produced it followed a sound or coherent path. Dead-reckoning extrapolation of agent positions over time is a state-tracking mechanism built on the same limitation — it estimates where an agent's reasoning is heading, not whether the steps taken to get there were valid.

Verifying intermediate reasoning steps deterministically is an open problem outside narrow domains. The closest established precedent, Verifiable Process Reward Models (VPRM), achieves rule-based step verification specifically for risk-of-bias assessment in medical evidence synthesis — a domain with guideline-defined criteria that supply gold intermediate steps to check against. The method inherits process-level RLVR's known boundary: strong where a domain hands you ground-truth steps, with no established path to domains that don't. Swarm reasoning over open-ended tasks sits squarely in the regime the method's own authors flag as unestablished.

Nothing in this specification verifies an agent's reasoning trajectory; only its output is gated. A claim that the Coordinator validates how a swarm reasoned, rather than what it produced, would overstate what the Evaluator phase and dispersion metrics actually provide.

### 2.4 Dispersion Monitoring: Two Complementary Signals

A single scalar dispersion metric cannot distinguish "agents are spread out" from "agents are spread out in only one direction." The strategic layer uses two metrics together: a cheap scalar tripwire, and a directional diagnostic that runs when the tripwire fires.

#### Normalized Semantic Variance (NSV)

The Coordinator computes the mean pairwise cosine distance across all agents sharing an `embeddingModelVersion`:

```
NSV = (1 / (n * (n - 1))) * sum over i != j of (1 - cos(theta_i,j))
```

NSV is bounded, reproducible, and requires no high-dimensional volume estimate. Its convergence threshold `NSV_crit` is not a universal constant — embedding spaces are anisotropic, and a single cutoff does not transfer reliably across models. `NSV_crit` is calibrated per `embeddingModelVersion` at the 10th percentile of a baseline dispersion run. This calibration is only as good as the diversity of that baseline run; correlated calibration agents produce a threshold set too low, causing the detector to under-report convergence.

#### Semantic GDOP (SGDOP)

NSV misses a specific failure mode: agents whose pairwise cosine distances are all large but who are strung out along a single direction in embedding space, leaving every other direction unexplored. SGDOP catches this case using the same matrix-conditioning mathematics GPS dilution-of-precision is built on, adapted for embedding geometry.

Let `C` be the embedding of the swarm's current candidate output (same frozen model and normalization as agent positions). For each agent, define the chord direction from the candidate toward that agent:

```
u_i = (p_i - C) / ||p_i - C||
```

Stack these as rows of matrix `U` (n × d). In GPS, GDOP comes from the trace of the inverse of `GᵗG` (d×d). In embedding space, `d` is typically far larger than `n`, so `UᵗU` is necessarily rank-deficient and cannot be inverted directly. The fix is a standard identity: the nonzero eigenvalues of `UᵗU` are identical to the nonzero eigenvalues of the Gram matrix `K = U·Uᵗ` (n×n), which is cheap to eigendecompose regardless of embedding size. SGDOP is the sum of reciprocals of `K`'s nonzero eigenvalues above a numerical floor:

```
SGDOP = sum over eigenvalues lambda_j of K where lambda_j > floor, of 1 / lambda_j
```

A near-singular `K` — agents clustered along one axis through the candidate — produces a small nonzero eigenvalue whose reciprocal dominates this sum, exactly as near-singular satellite geometry spikes real GDOP. The eigenvector belonging to the smallest surviving eigenvalue, lifted back into embedding space via `U^T`, recovers the literal direction the swarm is failing to explore — turning recruitment from "add a diverse agent" into "add an agent whose position projects strongly onto this specific direction."

**Reference implementation:**

```python
import numpy as np

def compute_nsv(positions: np.ndarray) -> float:
    """positions: (n, d) unit-normalized agent vectors sharing one embeddingModelVersion."""
    n = positions.shape[0]
    if n < 2:
        return 0.0
    sims = positions @ positions.T
    off_diag = ~np.eye(n, dtype=bool)
    return float(np.mean(1.0 - sims[off_diag]))


def compute_sgdop(positions: np.ndarray, candidate: np.ndarray,
                  eigenvalue_floor: float = 1e-6):
    """
    positions: (n, d) unit-normalized agent vectors
    candidate: (d,) unit-normalized candidate embedding
    Returns (sgdop_value, blind_spot_direction)
    """
    chords = positions - candidate
    norms = np.linalg.norm(chords, axis=1, keepdims=True)
    norms[norms == 0] = 1e-12  # guard: agent positioned exactly at candidate
    U = chords / norms

    K = U @ U.T
    eigvals, eigvecs = np.linalg.eigh(K)  # ascending order

    sgdop = 0.0
    blind_idx, min_nonzero = None, None
    for idx, val in enumerate(eigvals):
        if val <= eigenvalue_floor:
            continue
        sgdop += 1.0 / val
        if min_nonzero is None or val < min_nonzero:
            min_nonzero, blind_idx = val, idx

    if blind_idx is None:
        return float("inf"), np.zeros(positions.shape[1])

    blind_direction = U.T @ eigvecs[:, blind_idx]
    blind_direction = blind_direction / np.linalg.norm(blind_direction)
    return float(sgdop), blind_direction


def calibrate_nsv_crit(baseline_runs: list) -> float:
    """baseline_runs: list of (n, d) position matrices from M independent baseline trials."""
    values = [compute_nsv(run) for run in baseline_runs]
    return float(np.percentile(values, 10))
```

### 2.5 Reputation Attribution

Each agent carries a reputation weight `w_i` in `[0.1, 1.0]`. The update rule attributes reputation by alignment with the candidate the swarm produced, not by membership in whatever group produced it — this is what shields a dissenting agent from penalty when the group's candidate turns out to be wrong.

Let `S_i = cos(p_i, C)` be the raw cosine similarity between agent `i`'s position and candidate `C`. Because embedding anisotropy compresses raw similarity scores into a narrow band, `S_i` alone cannot separate a true contributor from a true dissenter. The update uses a calibrated alignment score:

```
delta_S_i = S_i - S_bar
```

where `S_bar` is the mean cosine similarity between agent positions and known-unrelated candidate text, calibrated once per `embeddingModelVersion` from a sample independent of the `NSV_crit` calibration — agent-to-candidate geometry is not guaranteed to match agent-to-agent geometry in an anisotropic space.

The reward or penalty is centered against the swarm's recent baseline success rate `V_pool`, an exponential moving average of Evaluator verdicts tracked independently of any individual agent's reputation — to avoid a circular baseline in which an agent's own weight distorts the standard it is later judged against:

```
V_pool_new = (1 - eta) * V_pool_old + eta * V
```

The full update, given Evaluator verdict `V` in `{0, 1}`:

```
delta_w_i = gamma * (S_i - S_bar) * (V - V_pool)
w_i_new   = clamp(w_i_old + delta_w_i, 0.1, 1.0)
```

Walking the cases: an agent aligned with a successful candidate receives a positive update; an agent aligned with a failed candidate receives a negative update; an agent uncorrelated with the outcome receives an update near zero; an agent anti-correlated with a failed candidate — a genuine dissenter — receives a small positive update rather than being punished for the group's failure. `V` is the Evaluator's outcome verdict as scoped in 2.3 — this update rewards alignment with a candidate that passed an outcome check, not alignment with a correct process, which this specification does not verify.

**Reference implementation:**

```python
def update_reputation(w_i, agent_position, candidate_embedding, verdict,
                      s_bar, v_pool, gamma, w_min=0.1, w_max=1.0):
    s_i = float(np.dot(agent_position, candidate_embedding))
    delta_w = gamma * (s_i - s_bar) * (verdict - v_pool)
    return float(np.clip(w_i + delta_w, w_min, w_max))


def update_v_pool(v_pool, verdict, eta):
    return (1 - eta) * v_pool + eta * verdict


def calibrate_s_bar(unrelated_pairs: list) -> float:
    """unrelated_pairs: (agent_position, unrelated_candidate_embedding) tuples,
    same embeddingModelVersion."""
    sims = [float(np.dot(p, c)) for p, c in unrelated_pairs]
    return float(np.mean(sims))
```

### 2.6 Diversity Dividends

The per-turn `w_i` update in 2.5 measures recent alignment but does not reward persistent structural contribution — an agent that consistently explores underrepresented directions over many rounds accumulates no additional standing beyond what the per-turn update provides. Diversity Dividends are a persistent reputation floor mechanism that addresses this.

An agent that **consistently** fills SGDOP-identified blind-spot directions across multiple evaluation rounds accumulates a dividend score `D_i` that raises its effective reputation floor:

```
AccrueDividend_i =
    (blind_spot_projection_i > d_crit + d_crit_hysteresis)   # threshold with hysteresis
    AND (verdict = 1)                                          # outcome gate
    AND (consistency confirmed over last w_consistency rounds) # persistence gate

VariancePenalty_i = 1 - min(1.0, position_variance_i / variance_ceiling)
IsolationScale_i  = contribution_isolation_score_i  [if enabled, else 1.0]

delta_D_i = delta_d * VariancePenalty_i * IsolationScale_i   [if AccrueDividend_i]

D_i_new   = min(1.0, decay(D_i_old, lambda_d) + delta_D_i)
w_floor_i = min(W_FLOOR_CEILING, w_min + kappa * D_i_new)
```

**Reward hacking mitigations** built into the function:

- _Outcome gate_ (`verdict = 1`): projecting onto a blind spot while the swarm fails is not rewarded — the direction may have been wrong, or the coverage unhelpful.
- _Consistency window_ (`w_consistency` rounds): prevents opportunistic contrarian positioning from accumulating dividends; only demonstrated persistent coverage qualifies.
- _Variance penalty_: high position variance (jitter) dampens accrual, discouraging dimension-hopping without penalizing genuine positional evolution.
- _Contribution isolation_ (optional): scales accrual by the agent's marginal influence on the SGDOP coverage map — an agent parked in the blind-spot direction without materially shifting the candidate scores low and accrues less.
- _Hysteresis band_: accrual starts at `d_crit + d_crit_hysteresis` and continues until `d_crit - d_crit_hysteresis`, preventing oscillation at threshold boundaries due to embedding model floating-point variance.

Dividends are distinct from per-turn softmax weighting: a high `D_i` raises the agent's baseline reputation floor, making it a preferred recruitment candidate across sessions, not just on the current turn. Agents in active re-sync, Conservative Mode, or under anomalous drift investigation are gated from accruing dividends until their status resolves.

### 2.7 Selection Probability

Reputation weights govern gossip peer selection and marketplace recruitment through a softmax transform:

```
P(i) = exp(w_i / tau) / sum over j of exp(w_j / tau)
```

As `tau` approaches zero, selection becomes greedy, favoring only the highest-reputation agents. As `tau` grows large, selection approaches uniform sampling, keeping low-reputation agents reachable as a passive reservoir that can recover standing through later contributions.

```python
def softmax_selection(weights: np.ndarray, tau: float) -> np.ndarray:
    scaled = weights / tau
    scaled -= np.max(scaled)  # numerical stability
    exp_w = np.exp(scaled)
    return exp_w / np.sum(exp_w)
```

### 2.8 Reference Coordinator

```python
import json, nats
import numpy as np

class Coordinator:
    """
    Trust model (see 2.2): this service receives plaintext agent positions.
    TLS protects them in transit only; this process is a trusted party
    with full visibility into swarm state by design.
    """

    def __init__(self, nats_url, eigenvalue_floor=1e-6, gamma=0.1, eta=0.05,
                 lambda_d=0.03, kappa=0.15, delta_d=0.05,
                 d_crit=0.55, d_crit_hysteresis=0.02, w_consistency=3,
                 variance_ceiling=0.25, w_floor_ceiling=0.6):
        self.nats_url = nats_url
        self.eigenvalue_floor = eigenvalue_floor
        self.gamma, self.eta = gamma, eta
        self.lambda_d, self.kappa, self.delta_d = lambda_d, kappa, delta_d
        self.d_crit, self.d_crit_hysteresis = d_crit, d_crit_hysteresis
        self.w_consistency = w_consistency
        self.variance_ceiling = variance_ceiling
        self.w_floor_ceiling = w_floor_ceiling

        self.positions = {}         # embeddingModelVersion -> {agent_id: vector}
        self.weights = {}           # agent_id -> w_i
        self.dividends = {}         # agent_id -> D_i
        self.consistency_history = {}  # agent_id -> [bool] last w_consistency rounds
        self.v_pool = 0.5
        self.nsv_crit = {}          # embeddingModelVersion -> calibrated threshold
        self.s_bar = {}             # embeddingModelVersion -> calibrated baseline

    async def connect(self):
        self.nc = await nats.connect(self.nats_url)
        self.js = self.nc.jetstream()

    async def on_position_event(self, msg):
        data = json.loads(msg.data)
        version, agent_id = data["embeddingModelVersion"], data["agent_id"]
        vector = np.array(data["position"], dtype=float)
        vector = vector / np.linalg.norm(vector)
        self.positions.setdefault(version, {})[agent_id] = vector
        self.weights.setdefault(agent_id, 0.5)
        self.dividends.setdefault(agent_id, 0.0)
        self.consistency_history.setdefault(agent_id, [])
        await msg.ack()
        await self.evaluate_dispersion(version)

    async def evaluate_dispersion(self, version):
        pool = self.positions.get(version, {})
        if len(pool) < 3:
            return
        ids = list(pool.keys())
        matrix = np.stack([pool[i] for i in ids])
        nsv = compute_nsv(matrix)
        crit = self.nsv_crit.get(version)
        if crit is not None and nsv < crit:
            candidate = await self.current_candidate(version)
            sgdop, blind_direction = compute_sgdop(
                matrix, candidate, self.eigenvalue_floor)
            await self.publish_escalation(
                version, nsv, sgdop, blind_direction, ids)

    async def publish_escalation(self, version, nsv, sgdop, blind_direction, agent_ids):
        payload = {
            "type": "escalation",
            "embeddingModelVersion": version,
            "nsv": nsv, "sgdop": sgdop,
            "blind_direction": blind_direction.tolist(),
            "agents_considered": agent_ids,
        }
        await self.js.publish(
            "chat.handoff.escalation", json.dumps(payload).encode())

    async def on_evaluator_verdict(self, agent_id, version, candidate, verdict):
        s_bar = self.s_bar.get(version, 0.0)
        position = self.positions.get(version, {}).get(agent_id)
        if position is None:
            return

        # Per-turn reputation update
        w = self.weights.get(agent_id, 0.5)
        self.weights[agent_id] = update_reputation(
            w, position, candidate, verdict, s_bar, self.v_pool, self.gamma)
        self.v_pool = update_v_pool(self.v_pool, verdict, self.eta)

        # Diversity Dividend accrual
        blind_projection = await self.compute_blind_projection(
            agent_id, version, candidate)
        accrues = (
            verdict == 1
            and blind_projection > self.d_crit + self.d_crit_hysteresis
            and self._consistency_confirmed(agent_id)
        )
        history = self.consistency_history[agent_id]
        history.append(accrues)
        if len(history) > self.w_consistency:
            history.pop(0)

        D = self.dividends.get(agent_id, 0.0)
        D = D * (1 - self.lambda_d)  # decay
        if accrues:
            D = min(1.0, D + self.delta_d)
        self.dividends[agent_id] = D
        w_floor = min(self.w_floor_ceiling, 0.1 + self.kappa * D)
        if self.weights[agent_id] < w_floor:
            self.weights[agent_id] = w_floor

    def _consistency_confirmed(self, agent_id: str) -> bool:
        history = self.consistency_history.get(agent_id, [])
        if len(history) < self.w_consistency:
            return False
        return all(history[-self.w_consistency:])

    async def compute_blind_projection(
            self, agent_id: str, version: str, candidate: np.ndarray) -> float:
        """Project agent position onto the current SGDOP blind-spot direction."""
        pool = self.positions.get(version, {})
        if len(pool) < 3:
            return 0.0
        ids = list(pool.keys())
        matrix = np.stack([pool[i] for i in ids])
        _, blind_direction = compute_sgdop(matrix, candidate, self.eigenvalue_floor)
        position = pool.get(agent_id)
        if position is None or np.linalg.norm(blind_direction) < 1e-10:
            return 0.0
        return float(np.dot(position, blind_direction))

    async def current_candidate(self, version: str) -> np.ndarray:
        """
        Fetch and embed the swarm's most recent candidate output.

        Subscribes to the latest message on the session's candidate subject,
        extracts the candidate text, and embeds it using the same frozen
        model pinned to this embeddingModelVersion. Returns a unit-normalized
        vector of the same dimensionality as agent positions.

        Raises NotImplementedError if no embedding model is configured for
        this version — callers should ensure embeddingModelVersion is
        registered before invoking evaluate_dispersion.
        """
        subject = f"chat.handoff.candidate.{version}"
        try:
            sub = await self.js.pull_subscribe(
                subject, durable=f"coordinator-candidate-{version}")
            msgs = await sub.fetch(1, timeout=1.0)
            if not msgs:
                raise ValueError(f"No candidate available for version {version}")
            data = json.loads(msgs[0].data)
            await msgs[0].ack()
            candidate_text = data["candidate_text"]
        except nats.errors.TimeoutError:
            raise ValueError(f"No candidate available for version {version}")

        embedding_fn = self._get_embedding_fn(version)
        vector = np.array(embedding_fn(candidate_text), dtype=float)
        norm = np.linalg.norm(vector)
        if norm < 1e-10:
            raise ValueError("Candidate embedding has zero norm")
        return vector / norm

    def _get_embedding_fn(self, version: str):
        """Return the embedding function registered for this embeddingModelVersion.
        Raises NotImplementedError if version is not registered."""
        fn = getattr(self, "_embedding_registry", {}).get(version)
        if fn is None:
            raise NotImplementedError(
                f"No embedding function registered for embeddingModelVersion '{version}'. "
                f"Call coordinator.register_embedding_model(version, fn) at startup."
            )
        return fn

    def register_embedding_model(self, version: str, embedding_fn):
        """Register an embedding function for a given embeddingModelVersion.

        embedding_fn: callable that takes a string and returns a list[float].
        Must use the same frozen model and normalization as agent positions.
        """
        if not hasattr(self, "_embedding_registry"):
            self._embedding_registry = {}
        self._embedding_registry[version] = embedding_fn
```

---

## Part III: Integration

| Ouroboros phase   | Protocol integration                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wonder / Reflect  | History replay via `read_session` (`by_start_sequence`); position publication                                                                                          |
| Execute           | Tool invocation through the gateway; high-impact actions staged over GET, confirmed over POST                                                                          |
| Evaluator         | External verification hook; verdict feeds per-turn reputation update and Diversity Dividend accrual (outcome-level only — see 2.3)                                     |
| Convergence check | NSV computed against calibrated `NSV_crit`; SGDOP computed on trip, identifying unexplored direction and informing `blind_spot_direction` in ReputationUpdate          |
| Recruitment       | Escalation events with SGDOP blind-spot direction routed through marketplace, weighted by softmax over reputation (incorporating `w_floor_i` from Diversity Dividends) |

The Coordinator subscribes to position events on `CHAT_HANDOFF`, retains only embeddings sharing the active `embeddingModelVersion`, computes NSV continuously and SGDOP when NSV crosses `NSV_crit`, updates per-turn reputation and Diversity Dividends on Evaluator verdicts, and publishes escalation events. This is the single point where dispersion monitoring, reputation attribution, dividend accrual, and recruitment decisions are reconciled — and, per 2.2, the single point that holds plaintext visibility into every agent's position.

---

## Part IV: Calibration and Open Parameters

The following are calibrated parameters or stated limitations rather than fixed constants. Treating them as universal would reintroduce unjustified precision. In a full DAOS deployment, all of these live in the Manifest Policy Block so they are version-controlled and auditable alongside the decisions they governed.

- `NSV_crit` — per `embeddingModelVersion`, 10th-percentile baseline protocol, contingent on calibration run diversity.
- `S_bar` — per `embeddingModelVersion`, from a calibration sample of known-unrelated agent/candidate pairs, distinct from the `NSV_crit` sample.
- `sgdop_eigenvalue_floor` — per `embeddingModelVersion`; high enough to exclude floating-point noise without discarding genuine near-degeneracies.
- `gamma`, `eta`, `tau` — reputation learning rate, baseline decay rate, softmax temperature; tuned against observed swarm behavior.
- `d_crit`, `d_crit_hysteresis` — blind-spot projection threshold and hysteresis band for dividend accrual; calibrated per embedding model to account for anisotropic score compression.
- `w_consistency` — rounds required before consistent blind-spot coverage triggers accrual; higher values prevent opportunistic gaming, lower values reward faster adaptation.
- `variance_ceiling` — position variance above which the variance penalty fully suppresses accrual; calibrated against observed position stability for the agent class.
- `lambda_d`, `kappa`, `delta_d` — dividend decay rate, dividend-to-floor scaling, and per-round accrual bonus; govern the long-term shape of the reputation floor.
- **Privacy model** (2.2): positions are plaintext to the Coordinator by design. Zero-trust computation requires CKKS-based FHE or a two-party computation protocol; both are out of scope due to latency and interactivity costs incompatible with the transport layer's single-request design.
- **Verification scope** (2.3): the Evaluator validates candidate outputs, not reasoning trajectories. Deterministic process verification remains unestablished outside narrow rule-based domains.

Each parameter should be logged alongside the events it governs so a later audit can distinguish a genuine reasoning failure from a miscalibrated parameter.

---

## Part V: Implementation Roadmap

This document's implementation phases align with the P0–P3 milestone structure in the DAOS Unified Specification v2.7. The mapping is:

| DAOS Milestone                             | This document's scope                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| P0-A: `clawql-manifest-validator`          | Validates Policy Block parameters used by the Coordinator (NSV_crit, d_crit, lambda_d, etc.)                  |
| P0-B: Gateway PEP                          | Transport layer (Part I) — GET/POST split, two-phase commit, HATEOAS approval flow                            |
| P1: Coordinator Watchdog + Circuit Breaker | Monitors Coordinator liveness and correctness; drives Conservative/Blind mode gating for dividend accrual     |
| P2: Memory 2.0                             | Provides the context management layer that agents draw from in Wonder/Reflect; not directly part of this spec |
| P3-A: Diversity Dividend accrual           | Section 2.6 — reward function, consistency window, variance penalty, hysteresis                               |
| P3-B: Reputation Interface                 | `ReputationUpdate` push protocol carrying `w_i`, `D_i`, `w_floor_i`, and `blind_spot_direction` directive     |

Phases within this document's scope, in implementation order:

1. Transport layer (Part I): gateway, NATS stream, PENDING_ACTIONS KV, GET/POST split, HATEOAS envelope.
2. NSV computation and `NSV_crit` calibration protocol.
3. SGDOP computation, eigenvalue-floor calibration, blind-spot direction recovery.
4. Per-turn reputation attribution (`w_i` update, `V_pool` tracking, `S_bar` calibration).
5. Diversity Dividend accrual (`D_i`, `w_floor_i`, consistency window, variance penalty, hysteresis).
6. `ReputationUpdate` push broadcast and agent-side acceptance rules.
7. Marketplace registry and softmax-weighted recruitment using `w_floor_i`-adjusted weights.

---

## Part VI: Summary

The transport layer guarantees durable, ordered, safely gated communication over NATS JetStream, with GET used everywhere an action has no real-world consequence and POST reserved for the single step where something irreversible executes. The `approval_url` field acts as a HATEOAS thread through the full approval flow so a caller never needs to know the next URL's shape in advance.

The strategic layer measures collective reasoning quality using two complementary signals: NSV as a cheap scalar tripwire for overall clustering, and SGDOP as a directional diagnostic identifying specifically which axis of embedding space the swarm has failed to explore — derived from the same matrix-conditioning logic that gives GPS dilution-of-precision its meaning, not borrowed as a label. Per-turn reputation attribution is baseline-corrected against both an independent success rate and a calibrated similarity floor, protecting dissenters from group-failure penalties. Diversity Dividends extend this into a persistent incentive layer, rewarding agents whose consistent blind-spot coverage over multiple rounds aligns individual utility with global swarm stability.

Two boundaries are named explicitly. Agent positions are plaintext to the Coordinator by design — TLS protects transit, not computation — and a genuinely zero-trust version would require CKKS or a two-party protocol, both deliberately out of scope. The Evaluator gates final candidates, not reasoning trajectories; deterministic process verification at the step level remains unestablished for open-ended swarm reasoning. These are not temporary limitations awaiting a fix; they are the honest boundaries of what this architecture currently delivers.
