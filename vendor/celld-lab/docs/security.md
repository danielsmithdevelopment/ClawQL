# Security

celld v0.6.3 is a beta release. It is not safe for hostile multi-tenant use.
Only the latest release receives security fixes.

## Security boundary

One fleet runs one application. celld trusts the application code, the fleet
nodes, and the operators. Application code can use its configured bindings and
can consume shared node resources. Do not run code from mutually distrusting
tenants in one fleet.

Application code cannot reach the engine's host functions. An internal script
receives them as function parameters, and `globalThis` carries no
`__`-prefixed property. A Worker Loader worker with `globalOutbound: null`
therefore reaches the host only through the capabilities in its `env`.

celld depends on two external boundaries: a trusted private network protects
the internal listener, and object storage credentials control the fleet.

## Separate the listeners

celld opens two HTTP listeners and terminates TLS on neither.

| Listener | Serves | Required protection |
| --- | --- | --- |
| `--listen` (public) | The deployed Worker | Terminate TLS and authenticate users in a proxy or the application. |
| `--internal-listen` (default `127.0.0.1:0`, a free loopback port) | The peer protocol and the operator API | Restrict access to trusted operators and fleet nodes. Never expose it to the public internet. Use an encrypted overlay such as WireGuard or Tailscale when the network does not provide confidentiality. |

`--advertise` gives peers the internal address. celld rejects an explicit
`--advertise` or a non-loopback `--listen` without an explicit
`--internal-listen`. celld cannot verify a hostname or a translated port, so
you must route the advertised address to the internal listener.

The public listener reserves only `/.well-known/celld/health`: 200 with
`{"ok":true}` when healthy, 503 otherwise. The Worker owns every other public
path, including `/health`. The internal listener returns 404 for an unknown
path, so an operator request cannot become an application request.

The internal listener has three request groups, and all three require the
trusted private network:

- Most operator routes have no request authentication.
- `/peer/tunnel` opens a tunnel for cell fetch, RPC, and WebSocket calls. The
  establishment request carries the fleet HMAC, a clock limit, and replay
  protection. The calls inside the tunnel are plain, unsigned HTTP.
- The peer-control and reserved-cell routes sign each request with the fleet
  HMAC, a clock limit, and replay protection.

Every path to a runtime class therefore demands the fleet secret. The HMAC
does not authenticate tunnel bytes after establishment and does not encrypt
traffic, so it does not replace the private network.

## Use the internal operator API

The operator API is an alpha interface. A release can change its paths or
response formats. These routes do not authenticate the caller:

- `/state` reports node state.
- `/cell/<SCOPE>` resolves or activates a cell.
- `/evict/<SCOPE>` tries to evict a resident cell and reports the result.
- `/do/<ID>` sends a direct request to an ordinary Durable Object.
- `POST /shutdown` starts a graceful ownership handoff. `handoff=preserve`
  prepares a same-node reload.

`/do/<ID>` refuses every reserved runtime class, such as D1, Workflows, KV,
and Queues, because their protocols can access application data. Use the
HMAC-authenticated `/runtime/<SCOPE>` route for these classes.

`/peer/probe` returns a signed diagnostic response. Do not call the other
reserved peer paths directly.

### Read an eviction result

An accepted eviction waits for the operation to finish, and a refused one
returns at once. Concurrent callers can join one eviction, so the success
count does not equal the stop count.

The Rust method `AppHandle::evict` returns `Result<EvictSuccess, EvictError>`.
`Evicted` confirms a completed runtime stop, and `AlreadyAbsent` confirms
settled local absence. A caller that needs a completed eviction must check for
`Evicted`. Over HTTP, both return 200 with `{"ok":true}`. `kind()` and
`reason()` on the error match the HTTP error body. A later request can
reactivate the cell before the response arrives.

A missing cell or a settled `Inactive`, `Dormant`, or `Remote` cell is locally
absent. A pending activation, stop, or ownership transfer prevents that
result. The request does not evict a remote runtime. A dormant cell keeps its
ownership and its hibernated host sockets. The node refuses during
preservation, reload, or local inventory confirmation, or when it lacks
authority.

An error body has this form:

```json
{"ok":false,"error":{"kind":"refused","reason":"cell_active"}}
```

| Status | Kind | Reason | Cause |
| --- | --- | --- | --- |
| 409 | `refused` | `cell_active` | The cell has active work or a socket that requires a runtime. |
| 409 | `refused` | `cell_transitioning` | The cell has another lifecycle transition. |
| 409 | `refused` | `alarm_imminent` | The alarm residency policy retains the cell. |
| 409 | `refused` | `alarm_uncovered` | The alarm coverage is unconfirmed, or a firing alarm blocks eviction during pressure shedding. |
| 503 | `refused` | `node_unavailable` | The node cannot accept the eviction. |
| 503 | `refused` | `eviction_limit` | The node has reached its eviction concurrency limit. |
| 409 | `cancelled` | `new_activity` | A new request cancels an accepted eviction. |
| 409 | `cancelled` | `alarm_activity` | An alarm observation or firing cancels an accepted eviction. |
| 409 | `cancelled` | `node_fenced` | The node loses its authority during the eviction. |
| 503 | `failed` | `actor_unavailable` | The request cannot reach the Actor. |
| 500 | `failed` | `reply_lost` | A delivered request loses its reply, so its outcome is unknown. |
| 500 | `failed` | `durability_failed` | The durability verification fails. |
| 500 | `failed` | `durability_timeout` | The durability verification exceeds its operation deadline. |
| 500 | `failed` | `runtime_stop_failed` | The runtime stop reports a failure. |

A malformed scope returns 400. An error does not prove that the runtime is
still resident. The runtime stop has no overall timeout, so a stop that never
returns keeps the request pending.

## Set the forwarded-header policy

celld ignores `X-Forwarded-Host` and `X-Forwarded-Proto` by default. Set
`--trust-forwarded-headers` or `CELLD_TRUST_FORWARDED_HEADERS=1` only when a
trusted proxy replaces both headers. celld uses the last value in each header,
so an earlier client value cannot override the proxy value.

celld takes the path and query from the request target and ignores the scheme
and authority of an absolute-form target. Without a trusted proxy, the `Host`
header sets the hostname in `request.url`. celld accepts a hostname, an IPv4
address, or a bracketed IPv6 address, with an optional port. It rejects
malformed and noncanonical values and falls back to `celld.local`.

The hostname is still client-controlled. Do not use an unchecked hostname for
an authorization decision. Use a trusted proxy, or check the hostname against a
list in the Worker.

## Limit request bodies

The public listener and `/do/<ID>` limit a request body to 1 GiB by default.
Set `CELLD_MAX_REQUEST_BODY_BYTES` to a smaller positive value to lower it.
celld returns 413 for a declared oversized body and when a Worker reads past
the limit.

For a method other than `GET` or `HEAD`, `/do/<ID>` streams a body of unknown
length or of at least 1 MiB. It collects a smaller body before dispatch.

## Protect the fleet bucket

The fleet bucket is the root of authority. It stores the deployments, the cell
state, the ownership and node leases, and the shared peer-authentication
secret. A holder of the bucket credentials controls the fleet. Give each
credential access to one fleet bucket only, and rotate it after a suspected
disclosure.

## Cell ownership

Each cell is a SQLite database with one writer. An ownership epoch fences each
cell, so a node that loses its lease cannot modify the current state. This
fencing protects storage consistency. It does not isolate hostile
applications. See [what celld guarantees](guarantees.md) and
[limitations](limitations.md).
