# The Decentralized Agent Operating System: Full Specification

Multi-agent systems built on ad hoc messaging tend to fail in two specific ways: agents converge on shared errors rather than independent insight, and integrating new or external agents introduces risk that is hard to audit after the fact. This specification addresses both failures through a strict separation between a transport and persistence layer, which handles communication, durability, and safe execution, and a strategic layer, which measures whether the swarm's collective reasoning is actually diverse and improving, and in which direction it needs to diversify further. NATS JetStream underlies both layers as a single durable, replayable event log.

---

## Part I: Transport and Persistence Layer

### 1.1 Tiers

All client interaction occurs through stateless HTTP GET (for handoff) or POST (for tool invocation) requests, in one of two tiers, chosen per request by which parameters are present.

The **standard tier** uses named query parameters with semicolon-delimited list values and underscores in place of spaces, requiring no encoding or cryptography from the calling agent:

```
GET /chat-summary?session=xK9mP2vQwR7nL4jH3sT8&agent=researcher&summary=Completed_lit_review_on_handoff_patterns&next=Implement_prototype;Test_with_LLM&done=Initial_design;Encoding_strategy
```

Field values must not contain `&`, `=`, or `;`, since these are the tier's delimiters.

The **advanced tier** uses a Base64URL-encoded JSON payload accompanied by an HMAC-SHA256 signature with constant-time verification, for participants with code execution who want tamper-evidence beyond URL secrecy:

```python
import base64, json, hmac, hashlib

payload = json.dumps({"agent": "researcher", "summary": "Completed lit review."})
encoded = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
sig = hmac.new(secret, encoded.encode(), hashlib.sha256).hexdigest()
url = f"https://example.com/chat-summary?session={session}&payload={encoded}&sig={sig}"
```

Both tiers write to the same underlying stream, and a single session may mix participants of either kind. Authorization in the standard tier rests entirely on possession of the session token — a long random string generated once per session by a human operator or setup script, never by a participating agent — and should be treated with the same sensitivity as an unlisted document link. The advanced tier additionally guarantees that a message was produced by a holder of the shared secret, independent of how the token was obtained.

### 1.2 Gateway layer

The gateway performs three functions on every request: validating it against the active tier's schema, classifying the requested tool, and formatting the response through a uniform envelope.

Tools are classified as either **safe**, meaning they execute immediately, or **external_write**, **destructive**, or **financial**, meaning they require a mandatory two-phase commit. A high-impact tool call generates a UUID `action_id` and a short human-readable confirmation code, both written to a key-value bucket (`PENDING_ACTIONS`) with a defined TTL window. The action executes only once a matching approval request references that `action_id` and supplies the correct confirmation code. Approval and cancellation are idempotent: re-approving an already-executed action or re-cancelling an already-cancelled one simply returns the current status rather than acting twice. Both are served in JSON for machine callers and HTML with htmx for human callers, and the response embeds an `approval_url` so the next available action is discoverable directly from the response rather than hardcoded by the client — the HATEOAS principle applied to agent tool use.

### 1.3 Response envelope

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

The `caller` field carries an optional `verifiable_execution_claim` sub-object for agents running inside a Trusted Execution Environment. This is not a separate add-on system; it is an extension of the existing `caller` field, populated with a cryptographic attestation when the executing agent runs inside a TEE, and recorded in the immutable log alongside the rest of the envelope. Callers not running in a TEE simply omit it.

### 1.4 Persistence layer

Two structures back the protocol: a JetStream stream named `CHAT_HANDOFF`, with one subject per session (`chat.handoff.<session_id>`), and the `PENDING_ACTIONS` key-value bucket described above. Each session's subject retains its own message history, so history access via `GET /tool/read_session` uses a durable pull consumer with `deliver_policy: by_start_sequence` when a starting sequence is supplied, letting a caller request all events from any prior point and reconstruct session state incrementally rather than replaying from the beginning every time. Each message carries a monotonic per-subject sequence number, which gives replay protection for free: a consumer that has already processed sequence number N has no reason to reprocess it, which also prevents duplicate execution of a previously-applied action.

Approval expiry is handled explicitly rather than left to client guesswork: when a `PENDING_ACTIONS` entry's age exceeds the TTL, the approval endpoint returns an explicit "Action expired" result rather than a generic error, and the HTML fallback path renders this as its own state so a human approver is never left wondering whether a stale link silently succeeded.

### 1.5 Reference implementation

```python
import os
import json
import time
import uuid
import secrets
import hmac
import hashlib
import base64
from datetime import datetime, timezone
from typing import Optional

import nats
import nats.errors
from nats.js.api import StreamConfig, KeyValueConfig, ConsumerConfig
from fastapi import FastAPI, HTTPException, Query, Request

app = FastAPI()
nc = None
js = None
kv = None

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
        name=STREAM_NAME,
        subjects=["chat.handoff.*"],
        max_msgs_per_subject=200,
        max_age=7 * 24 * 60 * 60,
    ))
    kv = await js.create_key_value(KeyValueConfig(bucket=KV_BUCKET))


def envelope(tool, success, data=None, seq=None, context_updated=False,
             approval_url=None, error=None, caller=None):
    return {
        "protocol_version": "2.1",
        "success": success,
        "tool": tool,
        "caller": caller or {},
        "data": data,
        "seq": seq,
        "context_updated": context_updated,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "approval_url": approval_url,
        "error": error,
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

    if payload:  # advanced tier
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
        return envelope("publish_summary", True, data={"status": "published"}, seq=ack.seq,
                         context_updated=True, caller={"agent_id": agent, "tier": "advanced"})

    elif summary or agent:  # standard tier
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
        return envelope("publish_summary", True, data={"status": "published"}, seq=ack.seq,
                         context_updated=True, caller={"agent_id": agent, "tier": "standard"})

    else:
        return await read_session(session)


@app.get("/tool/read_session")
async def read_session(session: str = Query(..., min_length=20),
                        start_seq: Optional[int] = Query(default=None)):
    subject = f"chat.handoff.{session}"
    try:
        config = ConsumerConfig(deliver_policy="by_start_sequence", opt_start_seq=start_seq) if start_seq else None
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


@app.post("/tool/{tool_name}")
async def invoke_tool(tool_name: str, request: Request, session: str = Query(..., min_length=20)):
    body = await request.json()
    agent_id = body.get("agent_id")

    if tool_name in SAFE_TOOLS:
        result = await execute_tool(tool_name, body)
        return envelope(tool_name, True, data=result, caller={"agent_id": agent_id})

    classification = HIGH_IMPACT_TOOLS.get(tool_name)
    if classification is None:
        raise HTTPException(404, "Unknown tool")

    action_id = str(uuid.uuid4())
    confirmation_code = secrets.token_hex(3)
    record = {
        "tool": tool_name,
        "args": body,
        "classification": classification,
        "confirmation_code": confirmation_code,
        "created_at": time.time(),
        "agent_id": agent_id,
        "status": "pending",
    }
    await kv.put(action_id, json.dumps(record).encode())

    approval_url = f"/tool/{tool_name}/approve?action_id={action_id}&code={confirmation_code}"
    return envelope(tool_name, True,
                     data={"action_id": action_id, "confirmation_code": confirmation_code,
                           "classification": classification},
                     approval_url=approval_url, caller={"agent_id": agent_id})


@app.post("/tool/{tool_name}/approve")
async def approve_action(tool_name: str, action_id: str = Query(...), code: str = Query(...)):
    try:
        entry = await kv.get(action_id)
    except Exception:
        raise HTTPException(404, "Action not found")
    record = json.loads(entry.value)

    if time.time() - record["created_at"] > ACTION_TTL_SECONDS:
        return envelope(tool_name, False, error="Action expired", data={"action_id": action_id})

    if record["status"] != "pending":
        return envelope(tool_name, True, data={"status": record["status"], "action_id": action_id})

    if not hmac.compare_digest(record["confirmation_code"], code):
        raise HTTPException(403, "Invalid confirmation code")

    result = await execute_tool(record["tool"], record["args"])
    record["status"] = "executed"
    await kv.put(action_id, json.dumps(record).encode())
    return envelope(tool_name, True, data={"status": "executed", "result": result})


@app.post("/tool/{tool_name}/cancel")
async def cancel_action(tool_name: str, action_id: str = Query(...)):
    try:
        entry = await kv.get(action_id)
    except Exception:
        raise HTTPException(404, "Action not found")
    record = json.loads(entry.value)
    if record["status"] == "pending":
        record["status"] = "cancelled"
        await kv.put(action_id, json.dumps(record).encode())
    return envelope(tool_name, True, data={"status": record["status"], "action_id": action_id})


async def execute_tool(tool_name: str, args: dict) -> dict:
    """Dispatch boundary; real tool implementations live behind this call."""
    return {"executed": tool_name, "args": args}
```

TTL expiry is checked against a stored `created_at` timestamp in application logic rather than relying on native per-key KV expiry, which keeps the behavior identical across NATS server versions.

---

## Part II: Cognitive and Strategic Layer (Ouroboros)

Where the transport layer guarantees that communication is durable and high-impact actions are gated, the strategic layer measures whether the swarm's collective output reflects genuine diversity of reasoning or merely correlated repetition, identifies specifically what kind of diversity is missing, and adjusts each agent's standing accordingly.

### 2.1 Agent loop

Each agent runs a five-phase loop, defined functionally:

- **Wonder / Reflect**: local state transformation, informed by history replay via `read_session` and the agent's own prior position.
- **Execute**: output generation, invoked through the transport layer, subject to the two-phase commit gate for any high-impact tool call.
- **Evaluator**: an external verification hook — a test suite, a secondary agent, or a held-out check — independent of the producing agent's internal confidence.
- **Convergence check**: a local decision point, informed by both the Evaluator's verdict and the swarm-level dispersion signals below.

Every agent maintains a **position**: a unit-normalized embedding vector of its current contribution, tagged with an `embeddingModelVersion`. Comparisons between any two vectors in this system — agent to agent, or agent to candidate — are only valid when both carry the same `embeddingModelVersion` and the same normalization; this constraint applies uniformly across every metric defined below.

### 2.2 Dispersion monitoring: two complementary signals

A single scalar dispersion metric cannot distinguish "agents are spread out" from "agents are spread out in only one direction." The strategic layer therefore uses two metrics together: a cheap scalar tripwire, and a directional diagnostic that runs when the tripwire fires.

**Normalized Semantic Variance (NSV).** The Coordinator computes the mean pairwise cosine distance across all agents sharing an `embeddingModelVersion`:

```
NSV = (1 / (n * (n - 1))) * sum over i != j of (1 - cos(theta_i,j))
```

NSV is bounded, reproducible, and requires no high-dimensional volume estimate. Its convergence threshold, `NSV_crit`, is not a universal constant. Embedding spaces are anisotropic — vectors from a given model often cluster in a narrow region regardless of how semantically diverse the underlying content actually is — which makes one fixed threshold unreliable across models. `NSV_crit` is instead calibrated per `embeddingModelVersion`: sample N prompts across the swarm's domain, run M agents on them, measure the resulting NSV distribution, and set `NSV_crit` at its 10th percentile. This calibration is only as good as the diversity of that baseline run; if the M calibration agents are themselves prone to correlated output, the resulting threshold will be set too low, and the detector will under-report convergence.

**Semantic GDOP (SGDOP).** NSV collapses all geometric structure into one number, which means it can miss a specific failure mode: agents whose pairwise cosine distances are all large, but who are nevertheless strung out along a single direction in embedding space, leaving every other direction completely unexplored. SGDOP is built to catch exactly that case, using the same matrix-conditioning idea GPS dilution-of-precision is built on, adapted to embedding geometry rather than borrowed as a label.

Let `C` be the embedding of the swarm's current candidate output, computed through the same frozen model and normalization as agent positions. For each agent, define the chord direction from the candidate toward that agent:

```
u_i = (p_i - C) / ||p_i - C||
```

Stack these as rows of a matrix `U` (n agents by d embedding dimensions). In GPS, GDOP comes from the trace of the inverse of `GᵗG`, a d×d matrix; in embedding space, `d` is typically far larger than `n` (an embedding might have 1536 dimensions against eight agents), so `UᵗU` is necessarily rank-deficient and cannot be inverted directly. The fix is a standard linear algebra identity: the nonzero eigenvalues of `UᵗU` (d×d) are identical to the nonzero eigenvalues of the Gram matrix `K = U·Uᵗ` (n×n, with `K_ij = u_i · u_j`), which is cheap to eigendecompose regardless of embedding size. SGDOP is the sum of the reciprocals of `K`'s nonzero eigenvalues, with a small numerical floor to exclude both true zero eigenvalues (exact linear dependencies, such as duplicate positions) and floating-point noise near zero:

```
SGDOP = sum over eigenvalues lambda_j of K where lambda_j > floor, of 1 / lambda_j
```

A near-singular `K` — agents clustered along one axis through the candidate — produces a small nonzero eigenvalue whose reciprocal dominates this sum, exactly the way near-singular satellite geometry spikes real GDOP. Because `K`'s eigenvectors are linear combinations of the `u_i`, the eigenvector belonging to the smallest surviving eigenvalue can be lifted back into embedding space (`U^T` applied to that eigenvector) to recover the literal direction the swarm is failing to explore, turning recruitment from "add a diverse agent" into "add an agent whose position projects strongly onto this specific direction." SGDOP, like NSV, is model-specific and requires its own per-`embeddingModelVersion` calibration of the eigenvalue floor; its cost is O(n³) in the agent count, independent of embedding dimensionality, so it is cheap enough to compute alongside NSV rather than only after NSV trips.

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
    norms[norms == 0] = 1e-12  # guard: an agent positioned exactly at the candidate
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

### 2.3 Reputation attribution

Each agent carries a reputation weight `w_i` in `[0.1, 1.0]`. The update rule attributes reputation by how closely an agent's position aligns with the candidate the swarm actually produced, rather than by mere membership in whatever group produced it — this is what shields a dissenting agent from a penalty when the group's eventual candidate turns out to be wrong.

Let `S_i = cos(p_i, C)` be the raw cosine similarity between agent `i`'s position and the candidate `C`, computed through the same frozen model and normalization constraint already required everywhere else. Because embedding anisotropy compresses raw similarity scores into a narrow band regardless of actual alignment, `S_i` alone cannot reliably separate a true contributor from a true dissenter. The update instead uses a calibrated alignment score:

```
delta_S_i = S_i - S_bar
```

where `S_bar` is the mean cosine similarity between agent positions and known-unrelated candidate text, measured once per `embeddingModelVersion` using a calibration sample independent of the one used for `NSV_crit`, since agent-to-candidate geometry is not guaranteed to match agent-to-agent geometry in an anisotropic space.

The reward or penalty is further centered against the swarm's recent baseline success rate, `V_pool`, an exponential moving average of Evaluator verdicts tracked independently of any individual agent's reputation, to avoid a circular baseline in which an agent's own weight distorts the standard it is later judged against:

```
V_pool_new = (1 - eta) * V_pool_old + eta * V
```

where `eta` governs how quickly the baseline adapts; too high and it chases noise, too low and it lags real shifts in swarm performance.

The full reputation update for agent `i`, given Evaluator verdict `V` in `{0, 1}`:

```
delta_w_i = gamma * (S_i - S_bar) * (V - V_pool)
w_i_new   = clamp(w_i_old + delta_w_i, 0.1, 1.0)
```

where `gamma` is the learning rate. Walking the cases confirms the intended behavior: an agent aligned with a successful candidate receives a positive update; an agent aligned with a failed candidate receives a negative update; an agent uncorrelated with the outcome receives an update near zero; and an agent anti-correlated with a failed candidate — a genuine dissenter — receives a small positive update rather than being punished for the group's failure. The explicit clamp keeps every weight within its declared bounds regardless of update magnitude.

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
    """unrelated_pairs: (agent_position, unrelated_candidate_embedding) tuples, same embeddingModelVersion."""
    sims = [float(np.dot(p, c)) for p, c in unrelated_pairs]
    return float(np.mean(sims))
```

### 2.4 Selection probability

Reputation weights govern how often an agent is sampled for gossip peer exchange and how it is prioritized for marketplace recruitment, through a softmax transform rather than raw weight comparison:

```
P(i) = exp(w_i / tau) / sum over j of exp(w_j / tau)
```

As `tau` approaches zero, selection becomes effectively greedy, favoring only the highest-reputation agents; as `tau` grows large, selection approaches uniform sampling, keeping low-reputation agents reachable as a passive reservoir that can recover standing if their later contributions align with success.

```python
def softmax_selection(weights: np.ndarray, tau: float) -> np.ndarray:
    scaled = weights / tau
    scaled -= np.max(scaled)  # numerical stability
    exp_w = np.exp(scaled)
    return exp_w / np.sum(exp_w)
```

### 2.5 Reference coordinator

```python
import json
import nats

class Coordinator:
    def __init__(self, nats_url, eigenvalue_floor=1e-6, gamma=0.1, eta=0.05):
        self.nats_url = nats_url
        self.eigenvalue_floor = eigenvalue_floor
        self.gamma, self.eta = gamma, eta
        self.positions = {}     # embeddingModelVersion -> {agent_id: vector}
        self.weights = {}       # agent_id -> w_i
        self.v_pool = 0.5       # initialized at midpoint pending observed data
        self.nsv_crit = {}      # embeddingModelVersion -> calibrated threshold
        self.s_bar = {}         # embeddingModelVersion -> calibrated baseline similarity

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
            sgdop, blind_direction = compute_sgdop(matrix, candidate, self.eigenvalue_floor)
            await self.publish_escalation(version, nsv, sgdop, blind_direction, ids)

    async def publish_escalation(self, version, nsv, sgdop, blind_direction, agent_ids):
        payload = {
            "type": "escalation",
            "embeddingModelVersion": version,
            "nsv": nsv,
            "sgdop": sgdop,
            "blind_direction": blind_direction.tolist(),
            "agents_considered": agent_ids,
        }
        await self.js.publish("chat.handoff.escalation", json.dumps(payload).encode())

    async def on_evaluator_verdict(self, agent_id, version, candidate, verdict):
        s_bar = self.s_bar.get(version, 0.0)
        position = self.positions.get(version, {}).get(agent_id)
        if position is None:
            return
        w = self.weights.get(agent_id, 0.5)
        self.weights[agent_id] = update_reputation(
            w, position, candidate, verdict, s_bar, self.v_pool, self.gamma)
        self.v_pool = update_v_pool(self.v_pool, verdict, self.eta)

    async def current_candidate(self, version):
        """Embedding of the swarm's most recent candidate output, same frozen model as positions."""
        raise NotImplementedError
```

---

## Part III: Integration

| Ouroboros phase   | Protocol integration                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Wonder / Reflect  | History replay via `read_session` (`by_start_sequence`); position publication                                                                |
| Execute           | Tool invocation through the gateway; two-phase commit for high-impact actions                                                                |
| Evaluator         | External verification hook; verdict logged as an event, feeding the reputation update                                                        |
| Convergence check | NSV computed against the calibrated `NSV_crit`; SGDOP computed on trip, identifying the unexplored direction                                 |
| Recruitment       | Escalation events, including the SGDOP blind-spot direction, routed through the marketplace gateway, weighted by softmax-selected reputation |

The Coordinator subscribes to position events on `CHAT_HANDOFF`, retains only embeddings sharing the active `embeddingModelVersion`, computes NSV continuously and SGDOP when NSV crosses `NSV_crit`, updates each agent's reputation on Evaluator verdicts, and publishes escalation events carrying the specific direction recruitment should target. This makes the Coordinator the single point where dispersion monitoring, reputation attribution, and recruitment decisions are reconciled against one consistent view of swarm state, while the transport layer remains responsible only for durability, ordering, and safe execution.

---

## Part IV: Calibration and Open Parameters

The following are deliberately left as calibrated parameters rather than fixed constants, since treating them as universal would reintroduce unjustified precision:

- `NSV_crit`, per `embeddingModelVersion`, via the 10th-percentile baseline protocol, contingent on the calibration run's own diversity.
- `S_bar`, per `embeddingModelVersion`, via a calibration sample of known-unrelated agent/candidate pairs, distinct from the NSV calibration sample.
- The SGDOP eigenvalue floor, per `embeddingModelVersion`, set high enough to exclude floating-point noise without discarding genuine near-degeneracies.
- `gamma`, `eta`, and `tau` — the reputation learning rate, baseline decay rate, and selection temperature — swarm-level hyperparameters tuned against observed behavior.

Each should be logged alongside the events it governs, so a later audit of swarm behavior can distinguish a genuine reasoning failure from a poorly calibrated parameter.

---

## Part V: Implementation Roadmap

- **Phase 1**: Deploy the core gateway with HATEOAS-enabled approval flows, the response envelope, and sequence-based replay protection.
- **Phase 2**: Configure the JetStream `CHAT_HANDOFF` stream and `PENDING_ACTIONS` key-value bucket; implement durable consumers for session replay.
- **Phase 3**: Build the Coordinator with version-aware position handling, NSV computation, and the `NSV_crit`/`S_bar` calibration protocols.
- **Phase 4**: Add SGDOP computation, the eigenvalue-floor calibration, and blind-spot-direction-aware recruitment.
- **Phase 5**: Implement the marketplace registry, softmax-based recruitment, and TEE attestation verification within the `caller` field.
- **Phase 6**: Bring up the full reputation attribution loop, including the independent `V_pool` tracker, and make the Evaluator gate mandatory for all high-impact convergence decisions.

---

## Part VI: Summary

The transport layer guarantees durable, ordered, safely gated communication using NATS JetStream primitives already well understood in distributed systems practice. The strategic layer measures collective reasoning quality using two complementary, bounded, reproducible signals: NSV as a cheap scalar tripwire for overall clustering, and SGDOP as a directional diagnostic that identifies specifically which axis of the embedding space the swarm has failed to explore, recovered through the same matrix-conditioning logic that gives GPS dilution-of-precision its meaning rather than borrowed as a label. Reputation attribution is baseline-corrected against both an independent success rate and a calibrated similarity floor, so dissent is protected rather than punished. Every threshold that depends on a specific embedding model is exposed as a parameter to be calibrated, not assumed. Where the two layers meet, in the Coordinator, the system has one explicit point at which swarm-level decisions are made and logged, which is what makes the architecture auditable rather than merely automated.

---

_For the shipped TypeScript library and MCP tools, see [`clawql-ouroboros.md`](./clawql-ouroboros.md). For platform context, see the [Vision & Roadmap document](../vision/clawql-vision-roadmap.md)._
