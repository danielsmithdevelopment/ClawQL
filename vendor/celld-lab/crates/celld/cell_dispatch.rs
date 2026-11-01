// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Routed local execution and the durability gate for outgoing effects.
use crate::actor::{ActivityGuard, AppHandle, LocalRequestFailure, Routed};
use crate::engine_api::{
    HttpResponse, HttpResponseWebSocket, RequestBody, RequestId, RuntimeFetch,
};
use crate::http_streams::RequestBodyGuard;
use crate::js::{CallOrder, DoCallReq};
use crate::telemetry::TraceContext;
use anyhow::Context as _;
use celld_logic::{Epoch, NodeId, RequestError, Route, WebSocketKind};
use futures_util::StreamExt as _;
use tokio::sync::oneshot;

#[derive(Debug)]
pub struct RoutedRequestError(pub RequestError);

/// The gate's verdict as the answer's error, with the handler's own failure
/// kept below it when the answer was one: the client needs the verdict, and
/// the operator reading the chain needs what the handler said too. The
/// verdict stays on top, so the routed-error match still finds it.
pub fn local_request_error(failure: LocalRequestFailure) -> anyhow::Error {
    match failure {
        LocalRequestFailure::Handler(error) => error,
        LocalRequestFailure::OutputGate { verdict, handler } => match handler {
            Some(handler) => handler.context(RoutedRequestError(verdict)),
            None => anyhow::Error::new(RoutedRequestError(verdict)),
        },
    }
}

impl std::fmt::Display for RoutedRequestError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "route failed: {:?}", self.0)
    }
}

impl std::error::Error for RoutedRequestError {}

/// The output gate for an effect raised inside a handler, as opposed to the
/// handler's own response.
///
/// Every in-handler channel arrives here holding a `GateReq`. Reuses the routed
/// machinery: `gate_request` pins the cell (no eviction mid-wait) and the core
/// gate decides. `Ok` releases the held effect; `Err` breaks the call, as a
/// routed gate failure would.
pub async fn dispatch_gate(app: AppHandle, req: crate::js::GateReq) {
    let routed = match app.gate_request(req.scope.clone()).await {
        Ok(routed) => routed,
        Err(error) => {
            let _ = req.reply.send(Err(error));
            return;
        }
    };
    // The guard pins the cell and releases the request on drop, so the else
    // branch does not leak the just-acquired request.
    let _activity = app.activity(routed.request, req.scope.clone());
    let result = if routed.route == Route::Local {
        app.gate_output(routed.request, req.ticket).await
    } else {
        // The owning isolate should route the cell locally; if it moved off the
        // node mid-call, fail closed rather than acknowledge an unproven write.
        Err(RequestError::NodeFenced)
    };
    let _ = req.reply.send(result);
}

pub fn local_dispatch_request_id(
    request_id: Option<crate::js::RequestId>,
) -> Option<crate::js::RequestId> {
    // Internal Queue, cron, alarm, and peer calls have no client request ID,
    // but a local handler still needs an identity in the abort registry. The
    // drain cancels by core request and resolves that identity through the
    // activity pin; leaving it absent makes a busy internal handler impossible
    // to stop before the process deadline.
    Some(request_id.unwrap_or_else(crate::js::next_request_id))
}

/// The part of a fetch-style call that a dispatch attempt consumes.
///
/// A local attempt moves it into the handler's `RuntimeFetch`; a remote route
/// hands it back inside [`CallAttempt::Remote`], so the peer forwarder in the
/// binary receives the route and the body together and cannot lose the body
/// between two attempts.
pub struct CallPayload {
    pub name: Option<String>,
    pub url: String,
    pub method: String,
    pub body: RequestBody,
    pub headers: Vec<(String, String)>,
}

/// The state of a fetch-style call that outlives one dispatch attempt.
///
/// A retry after a stale remote route re-enters routing with the same client
/// identity, the same cancellation signal, and the same streamed-body claim.
/// `order` is different: only a local attempt takes it, and a local attempt
/// always ends the call. A remote attempt leaves it in place, so the peer path
/// holds this call's place in its caller's order until the call ends.
pub struct CallContext {
    pub scope: String,
    pub request_id: Option<RequestId>,
    pub parent: Option<TraceContext>,
    pub deliver_abort_to_handler: bool,
    pub cancel: Option<oneshot::Receiver<()>>,
    pub order: Option<CallOrder>,
    /// Reclaims a streamed body abandoned by an early error. A local target or
    /// the peer HTTP body takes ownership before this guard is disarmed.
    pub body_guard: RequestBodyGuard,
}

/// Split a proxied call into its cross-attempt context, its consumable
/// payload, and its reply channel.
///
/// The binary and the simulated dispatcher both start from a `DoCallReq`, and
/// one mapping keeps the two from assigning a field differently.
pub fn split_do_call(
    call: DoCallReq,
) -> (
    CallContext,
    CallPayload,
    oneshot::Sender<anyhow::Result<HttpResponse>>,
) {
    let DoCallReq {
        request_id,
        cancel,
        deliver_abort_to_handler,
        scope,
        name,
        url,
        method,
        body,
        body_guard,
        headers,
        reply,
        order,
        parent,
    } = call;
    (
        CallContext {
            scope,
            request_id,
            parent,
            deliver_abort_to_handler,
            cancel,
            order,
            body_guard,
        },
        CallPayload {
            name,
            url,
            method,
            body,
            headers,
        },
        reply,
    )
}

/// The outcome of one dispatch attempt.
///
/// The binary logs WebSocket route timing, and it treats the three terminal
/// outcomes differently: nothing for a call that never reached routing, a
/// `route_error` record for a refused route, and an `ok`/`error` record with
/// the dispatch time for a local dispatch. A single `Completed(Result)` variant
/// would erase that distinction, and a `RoutedRequestError` downcast cannot
/// recover it, because `local_request_error` also puts a `RoutedRequestError`
/// on top of an output-gate failure. The outcome class therefore crosses this
/// boundary explicitly, while the error values themselves are built here so
/// the client-facing messages live in one place.
pub enum CallAttempt {
    /// The attempt ended before routing completed: the scope is malformed, or
    /// the cancellation tied route resolution. No handler ran and no core
    /// request survived, so the binary emits no timing record.
    Unstarted(anyhow::Error),
    /// `AppHandle::request` refused the route, in the Actor shell or in the
    /// decision core. No handler ran.
    RouteError(anyhow::Error),
    /// The route was local, and the local dispatch result is the call's
    /// result. A missing runtime or a refused admission can end it before
    /// the handler starts.
    Local(anyhow::Result<HttpResponse>),
    /// The route was local, and the call failed after the cell accepted a
    /// WebSocket. The host registry holds the socket until the dispatcher
    /// releases it, and only the binary can deliver the close event that the
    /// release includes. A separate variant makes every dispatcher handle the
    /// socket, which an error that carried the target could silently drop.
    RefusedWebSocket {
        error: anyhow::Error,
        websocket: crate::js::WsTarget,
    },
    /// The route left this node. The payload comes back unconsumed for the
    /// peer forwarder.
    Remote {
        node: NodeId,
        addr: String,
        epoch: Epoch,
        peer_protocol: u16,
        payload: CallPayload,
    },
}

/// Perform one dispatch attempt of a fetch-style call, up to and including
/// local execution.
///
/// The binary's `dispatch_do_call` loop and the simulated dispatcher both call
/// this function, so routing, the cancellation tie, and the local execution
/// branch exist once. The peer transport stays in the binary because it owns
/// the HTTP client and the stale-route retry policy.
///
/// `on_routed` runs once, when the core resolved a route and before the local
/// handler starts or the remote route returns. The binary times route
/// resolution separately from dispatch, and this point is the only place that
/// separates the two. The library cannot take the stamp itself: `Instant::now`
/// is outside the execution boundary, and `asyncrt::mono_ms` is
/// millisecond-grained while the record is in microseconds.
pub async fn dispatch_call_attempt(
    app: &AppHandle,
    call: &mut CallContext,
    payload: CallPayload,
    on_routed: impl FnOnce(),
) -> CallAttempt {
    // The check is pure and cheap, so repeating it on a retry costs nothing,
    // and placing it inside the attempt puts every dispatcher behind the same
    // guard instead of asking each one to remember a separate call.
    if !celld_logic::cell::valid_cell_scope(&call.scope) {
        return CallAttempt::Unstarted(anyhow::anyhow!(
            "cell scope is malformed or exceeds the fleet storage limit"
        ));
    }
    // A disconnect before routing completes has executed no handler, so
    // cancel the core request and release its activation admission. Once
    // routing completes, the same signal moves into the local or remote
    // dispatch and aborts work that did start.
    let route = app.request(call.scope.clone());
    let routed = if call.deliver_abort_to_handler {
        // Workerd delivers an explicit JavaScript AbortSignal to the target
        // request. Resolve the route first, then give the already-fired
        // receiver to fetch_cell so the handler sees request.signal and its
        // waitUntil work can continue.
        route.await
    } else {
        match call.cancel.as_mut() {
            Some(cancel) => crate::asyncrt::select_biased! {
                "a cancellation that ties route resolution prevents dispatch from starting";
                _ = cancel => return CallAttempt::Unstarted(anyhow::anyhow!("Durable Object call cancelled")),
                routed = route => routed,
            },
            None => route.await,
        }
    };
    let Routed { request, route } = match routed {
        Ok(routed) => routed,
        Err(error) => {
            return CallAttempt::RouteError(anyhow::Error::new(RoutedRequestError(error)));
        }
    };
    on_routed();
    match route {
        Route::Local => {
            let CallPayload {
                name,
                url,
                method,
                body,
                headers,
            } = payload;
            dispatch_local_fetch(
                app,
                request,
                call.scope.clone(),
                name,
                RuntimeFetch {
                    url,
                    method,
                    body,
                    headers,
                    request_id: call.request_id,
                    order: call.order.take(),
                    parent: call.parent,
                },
                call.cancel.take(),
                &mut call.body_guard,
            )
            .await
        }
        Route::Remote {
            node,
            addr,
            epoch,
            peer_protocol,
        } => CallAttempt::Remote {
            node,
            addr,
            epoch,
            peer_protocol,
            payload,
        },
    }
}

/// workerd's `TypeError` text for a WebSocket response to a request that did
/// not ask to upgrade (`Response::send` in workerd's `api/http.c++`).
pub const WEBSOCKET_WITHOUT_UPGRADE: &str =
    "Worker tried to return a WebSocket in a response to a \
     request which did not contain the header \"Upgrade: websocket\".";

/// Whether a request asks for a WebSocket, by the rule workerd applies before
/// a response can carry one: an `Upgrade` field equal to `websocket`.
pub fn requests_websocket_upgrade(headers: &[(String, String)]) -> bool {
    headers.iter().any(|(name, value)| {
        name.eq_ignore_ascii_case("upgrade") && value.eq_ignore_ascii_case("websocket")
    })
}

/// Execute an admitted local call and retain its activity through the response.
///
/// The response is the only owner of a socket that the cell accepted, and
/// `WsTarget` is plain data. Every failure after the cell returns a socket
/// therefore hands the target back in [`CallAttempt::RefusedWebSocket`]: a
/// request that did not ask to upgrade, a failed core registration, and an
/// output-gate verdict that discards the response.
async fn dispatch_local_fetch(
    app: &AppHandle,
    request: u64,
    scope: String,
    name: Option<String>,
    mut fetch: RuntimeFetch,
    cancel: Option<tokio::sync::oneshot::Receiver<()>>,
    body_guard: &mut RequestBodyGuard,
) -> CallAttempt {
    let local_request_id = local_dispatch_request_id(fetch.request_id);
    fetch.request_id = local_request_id;
    let upgrade = requests_websocket_upgrade(&fetch.headers);
    let mut accepted = None;
    let local = app.local_request(request, scope.clone(), local_request_id, "local");
    let completed = local
        .run(async {
            let host = app.execution_host().context("no cell runtime")?;
            let response = host.fetch_cell(scope.clone(), name, fetch, cancel).await?;
            // `fetch_cell` cannot return a response until the cell
            // has installed its request context. That context now
            // owns an unread tail through its waitUntil work.
            body_guard.disarm();
            if let Some(HttpResponseWebSocket::Cell(target)) = &response.websocket {
                accepted = Some(target.clone());
                // workerd applies this check in the object's own response
                // path, so the caller's `stub.fetch()` rejects whichever
                // node the caller runs on.
                anyhow::ensure!(upgrade, "TypeError: {WEBSOCKET_WITHOUT_UPGRADE}");
                let (cell, hibernatable) = crate::js::ws_core_registration(target);
                let kind = if hibernatable {
                    WebSocketKind::Hibernatable
                } else {
                    WebSocketKind::Regular
                };
                app.websocket_opened(cell, target.id, kind).await?;
            }
            Ok(response)
        })
        .await;
    let activity = completed.activity;
    match completed.result.map_err(local_request_error) {
        Ok(mut response) => {
            let body_active = response.stream.is_some();
            activity.set_phase("response_body", true, body_active);
            if let Some(stream) = response.stream.take() {
                response.stream = Some(local_response_stream(stream, activity, || {}));
            } else {
                drop(activity);
            }
            CallAttempt::Local(Ok(response))
        }
        Err(error) => match accepted {
            Some(websocket) => CallAttempt::RefusedWebSocket { error, websocket },
            None => CallAttempt::Local(Err(error)),
        },
    }
}

// The body owns the activity until EOF, cancellation, or drop. A forwarded
// body also owns its peer-abort guard: disarm it at EOF, but retain it on a
// dropped body so the owner cancels work for the disconnected peer.
pub fn local_response_stream(
    stream: crate::js::HttpChunkStream,
    activity: ActivityGuard,
    on_finish: impl FnOnce() + Send + 'static,
) -> crate::js::HttpChunkStream {
    let cancellation = activity.cancellation();
    Box::pin(futures_util::stream::unfold(
        (stream, activity, on_finish, cancellation),
        |(mut stream, activity, on_finish, mut cancellation)| async move {
            let chunk = if *cancellation.borrow() {
                None
            } else {
                crate::asyncrt::select! {
                    chunk = stream.next() => chunk,
                    changed = cancellation.changed() => {
                        let _ = changed;
                        None
                    }
                }
            };
            match chunk {
                Some(chunk) => Some((chunk, (stream, activity, on_finish, cancellation))),
                None => {
                    on_finish();
                    drop(activity);
                    None
                }
            }
        },
    ))
}
