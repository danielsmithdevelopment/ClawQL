// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! WebSockets inside the isolate: the registry, the ops JS calls, and the
//! frames waiting to leave.
//!
//! A socket outlives the event that created it, so the registry is what
//! connects the two — JS holds an id, and this module knows what that id
//! is attached to. Frames emitted inside an output-gate region are held
//! until the gate opens, which is why emitting is not simply a send.
use super::*;

/// Outbound WebSocket traffic from a DO's `ws.send`/`ws.close`. The host holds
/// the socket in a task decoupled from the isolate (so the cell can hibernate
/// while the socket lives); `ws.send` routes here by wsId.
pub enum WsOut {
    Text(String),
    Binary(Vec<u8>),
    Close(u16, String),
}

/// The result of delivering one `webSocketMessage`. `frames` are the outbound
/// frames the handler produced, captured by the output gate; `write_position`
/// is the cell's committed-write count after the handler when it advanced past
/// where it stood before — i.e. the handler wrote, and its frames must be held
/// until that position is durable. `None` means no write: flush the frames.
pub struct WsDispatch {
    pub frames: Vec<(u64, WsOut)>,
    pub write_position: Option<u64>,
}

/// One inbound event on a socket the ISOLATE polls, rather than one the host
/// pushes into a cell.
///
/// A Durable Object socket must survive between events and wake a hibernated
/// cell, so its frames arrive as `CellJob`s. A Worker socket cannot work that
/// way: the stateless pool has no addressable isolate to push into. That is
/// not a limitation to route around — it is exactly the lifetime Cloudflare
/// gives a Worker socket, which lives and dies with its `IoContext`, and
/// `IoContext::close_sockets` is what enforces it here. So the isolate pulls,
/// the same way it already pulls a streamed response body.
pub enum WsPull {
    Open(String),
    Text(String),
    Binary(Vec<u8>),
    Close(u16, String, bool),
}

/// Tags for the byte frame `__ws_next` resolves with. A tagged buffer keeps a
/// binary message on its fast path instead of base64 through a JSON envelope.
const WS_PULL_TAG_TEXT: u8 = 0;
const WS_PULL_TAG_BINARY: u8 = 1;
const WS_PULL_TAG_OPEN: u8 = 2;
const WS_PULL_TAG_CLOSE: u8 = 3;

impl WsPull {
    fn encode(self) -> Vec<u8> {
        let (tag, mut body) = match self {
            WsPull::Text(text) => (WS_PULL_TAG_TEXT, text.into_bytes()),
            WsPull::Binary(bytes) => (WS_PULL_TAG_BINARY, bytes),
            WsPull::Open(protocol) => (WS_PULL_TAG_OPEN, protocol.into_bytes()),
            WsPull::Close(code, reason, was_clean) => (
                WS_PULL_TAG_CLOSE,
                serde_json::json!({
                    "code": code,
                    "reason": reason,
                    "wasClean": was_clean,
                })
                .to_string()
                .into_bytes(),
            ),
        };
        let mut framed = Vec::with_capacity(body.len() + 1);
        framed.push(tag);
        framed.append(&mut body);
        framed
    }
}

pub type WsPullReceiver = tokio::sync::mpsc::UnboundedReceiver<WsPull>;
pub type WsPullSender = tokio::sync::mpsc::UnboundedSender<WsPull>;

/// One socket's inbound queue. Shared so an op can await it without holding
/// the registry lock; one isolate polls a given socket serially.
type WsPullQueue = Arc<tokio::sync::Mutex<WsPullReceiver>>;
type WsPullRegistry = std::sync::Mutex<HashMap<u64, WsPullQueue>>;

/// Inbound queues for isolate-polled sockets, keyed by wsId.
static WS_PULL: OnceLock<WsPullRegistry> = OnceLock::new();

fn ws_pull() -> &'static WsPullRegistry {
    WS_PULL.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

pub fn ws_pull_register(id: u64, rx: WsPullReceiver) {
    ws_pull()
        .lock()
        .unwrap()
        .insert(id, Arc::new(tokio::sync::Mutex::new(rx)));
}

pub fn ws_pull_unregister(id: u64) {
    ws_pull().lock().unwrap().remove(&id);
}

/// The frame channel that a top-level Worker transfers with its 101 response.
///
/// The channel and the socket id move together. Dropping the response before
/// the HTTP upgrade, or ending the upgrade task, therefore removes every host
/// registration instead of leaving a socket that no isolate can reach.
pub struct WorkerWebSocket {
    id: u64,
    inbound: WsPullSender,
}

impl WorkerWebSocket {
    pub fn id(&self) -> u64 {
        self.id
    }

    pub fn inbound(&self) -> WsPullSender {
        self.inbound.clone()
    }
}

impl Drop for WorkerWebSocket {
    fn drop(&mut self) {
        ws_pull_unregister(self.id);
        ws_unregister(self.id);
    }
}

fn prepare_worker_websocket_handoff(id: u64) {
    let (inbound, receiver) = tokio::sync::mpsc::unbounded_channel();
    ws_pull_register(id, receiver);
    ws_register_outbound(id, "");
    ws_track_request_socket(id);
    let registry = ws_registry();
    let replaced = registry.lock().unwrap().worker_handoffs.insert(id, inbound);
    drop(replaced);
}

pub(super) fn transfer_worker_websocket_handoff(id: u64) -> Option<WorkerWebSocket> {
    let inbound = ws_registry().lock().unwrap().worker_handoffs.remove(&id)?;
    // The response now owns cleanup. Transfer the frame channel and request
    // ownership together so request retirement cannot close a returned socket.
    current_context()
        .sockets
        .lock()
        .unwrap()
        .retain(|opened| *opened != id);
    Some(WorkerWebSocket { id, inbound })
}

/// Close every isolate-polled socket a finished request opened.
///
/// The close frame is what actually ends the connection: the connector task
/// writes it to the wire and stops pumping, and only then does it drop the
/// `WsPull` sender that this socket's `__ws_next` is waiting on. Unregistering
/// first would strand the task instead — it detects a dead isolate by the
/// send failing, and nothing else tells it to go.
pub(super) fn ws_close_request_sockets(opened: Vec<u64>) {
    for id in opened {
        let registry = ws_registry();
        let handoff = registry.lock().unwrap().worker_handoffs.remove(&id);
        drop(handoff);
        // A socket whose remote already hung up has no output sender left,
        // and that is the ordinary case rather than an error. `ws_emit` logs
        // a dropped frame for an unknown id, so ask before sending.
        let open = ws_registry().lock().unwrap().outputs.contains_key(&id);
        if open {
            ws_emit(id, WsOut::Close(1001, "request ended".into()));
        }
        ws_pull_unregister(id);
        ws_unregister(id);
    }
}

/// Whether the host still holds an inbound queue for `id`.
///
/// A leak here is invisible from outside the process: the queue holds the
/// receiver whose survival keeps a connector task — and its TCP connection —
/// alive, and a request that dies before its socket is ever registered for
/// output leaves nothing else to observe.
#[cfg(celld_internal_tests)]
#[doc(hidden)]
pub fn ws_pull_registered(id: u64) -> bool {
    ws_pull().lock().unwrap().contains_key(&id)
}

/// Account a Worker socket to the request that opened it.
fn ws_track_request_socket(id: u64) {
    current_context().sockets.lock().unwrap().push(id);
}
pub enum WsIn {
    Text(String),
    Binary(Vec<u8>),
}

impl From<WsIn> for WsPull {
    fn from(frame: WsIn) -> Self {
        match frame {
            WsIn::Text(text) => Self::Text(text),
            WsIn::Binary(bytes) => Self::Binary(bytes),
        }
    }
}

#[doc(hidden)]
pub struct WsMeta {
    pub scope: String,
    pub hibernatable: bool,
    pub tags: Vec<String>,
    /// Structured-clone bytes, not JSON: `serializeAttachment` accepts
    /// anything cloneable, so Date, Map and Set must survive a round trip.
    pub attachment: Option<Vec<u8>>,
    pub pending: Vec<WsOut>,
    /// When the shell last answered this socket with the cell's auto-response,
    /// unix ms. Lives here rather than in the isolate because the reply is
    /// sent while the cell may not be resident at all.
    pub auto_response_at: Option<f64>,
}
#[derive(Default)]
#[doc(hidden)]
pub struct WsRegistry {
    outputs: HashMap<u64, tokio::sync::mpsc::UnboundedSender<WsOut>>,
    pub metadata: HashMap<u64, WsMeta>,
    worker_handoffs: HashMap<u64, WsPullSender>,
}
impl WsRegistry {
    #[doc(hidden)]
    pub fn register(&mut self, id: u64, tx: tokio::sync::mpsc::UnboundedSender<WsOut>) {
        if let Some(meta) = self.metadata.get_mut(&id) {
            for pending in meta.pending.drain(..) {
                let _ = tx.send(pending);
            }
        }
        self.outputs.insert(id, tx);
    }

    fn unregister(&mut self, id: u64) -> Option<WsMeta> {
        self.outputs.remove(&id);
        self.metadata.remove(&id)
    }

    #[doc(hidden)]
    pub fn emit(&mut self, id: u64, out: WsOut) {
        if let Some(tx) = self.outputs.get(&id) {
            tracing::debug!(ws_id = id, "queued outbound WebSocket frame");
            let _ = tx.send(out);
        } else if let Some(meta) = self.metadata.get_mut(&id) {
            tracing::debug!(ws_id = id, "buffered pre-upgrade WebSocket frame");
            meta.pending.push(out);
        } else {
            // The socket is gone and the frame has nowhere to go. Silence here
            // is what made a held frame indistinguishable from a sent one.
            tracing::warn!(ws_id = id, "dropped a frame for a closed WebSocket");
        }
    }
}
pub(crate) struct WebSocketService {
    registry: Arc<std::sync::Mutex<WsRegistry>>,
    regular_counts: Arc<std::sync::Mutex<HashMap<String, usize>>>,
    next_id: AtomicU64,
    auto_responses: Arc<std::sync::Mutex<HashMap<String, (String, String)>>>,
}

impl Default for WebSocketService {
    fn default() -> Self {
        Self {
            registry: Arc::new(std::sync::Mutex::new(WsRegistry::default())),
            regular_counts: Arc::new(std::sync::Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
            auto_responses: Arc::new(std::sync::Mutex::new(HashMap::new())),
        }
    }
}

fn ws_registry() -> Arc<std::sync::Mutex<WsRegistry>> {
    asyncrt::services().websockets().registry.clone()
}

fn regular_ws_counts() -> Arc<std::sync::Mutex<HashMap<String, usize>>> {
    asyncrt::services().websockets().regular_counts.clone()
}
fn increment_regular_ws(scope: &str) {
    *regular_ws_counts()
        .lock()
        .unwrap()
        .entry(scope.to_string())
        .or_default() += 1;
}
fn decrement_regular_ws(scope: &str) {
    let counts = regular_ws_counts();
    let mut counts = counts.lock().unwrap();
    let Some(count) = counts.get_mut(scope) else {
        return;
    };
    *count = count.saturating_sub(1);
    if *count == 0 {
        counts.remove(scope);
    }
}
pub fn has_regular_websocket(scope: &str) -> bool {
    regular_ws_counts()
        .lock()
        .unwrap()
        .get(scope)
        .is_some_and(|count| *count > 0)
}
/// The auto-response pair per cell scope, set by
/// `state.setWebSocketAutoResponse`. Shell state, like the socket registry:
/// the whole point of the feature is answering a matched message while the
/// cell is not resident, so the isolate cannot hold it.
fn ws_auto_responses() -> Arc<std::sync::Mutex<HashMap<String, (String, String)>>> {
    asyncrt::services().websockets().auto_responses.clone()
}

/// The shell's read path asks here before dispatching a text frame. A match
/// returns the response to send on the same socket and stamps the socket's
/// timestamp; the frame then never reaches the cell — no dispatch, no wake.
/// Only hibernatable sockets participate, as in workerd, where matching
/// lives in the hibernation manager's read loop.
pub fn ws_auto_response(scope: &str, id: u64, text: &str) -> Option<String> {
    let response = {
        let pairs = ws_auto_responses();
        let pairs = pairs.lock().unwrap();
        let (request, response) = pairs.get(scope)?;
        if request != text {
            return None;
        }
        response.clone()
    };
    let registry = ws_registry();
    let mut registry = registry.lock().unwrap();
    let meta = registry.metadata.get_mut(&id)?;
    if !meta.hibernatable {
        return None;
    }
    meta.auto_response_at = Some(unix_ms());
    Some(response)
}

fn unix_ms() -> f64 {
    asyncrt::wall_ms() as f64
}

pub fn ws_hibernatable(id: u64) -> Option<bool> {
    ws_registry()
        .lock()
        .unwrap()
        .metadata
        .get(&id)
        .map(|meta| meta.hibernatable)
}
pub fn ws_next_id() -> u64 {
    asyncrt::services()
        .websockets()
        .next_id
        .fetch_add(1, Ordering::Relaxed)
}
pub fn ws_register(id: u64, tx: tokio::sync::mpsc::UnboundedSender<WsOut>) {
    ws_registry().lock().unwrap().register(id, tx);
}

/// Install one hibernatable socket through a cfg-gated execution backend.
#[cfg(celld_internal_tests)]
pub(crate) fn ws_register_hibernatable_for_test(
    id: u64,
    scope: &str,
    tx: tokio::sync::mpsc::UnboundedSender<WsOut>,
) {
    let registry = ws_registry();
    let mut registry = registry.lock().unwrap();
    registry.register(id, tx);
    registry.metadata.insert(
        id,
        WsMeta {
            scope: scope.to_string(),
            hibernatable: true,
            tags: Vec::new(),
            attachment: None,
            pending: Vec::new(),
            auto_response_at: None,
        },
    );
}
pub fn ws_register_outbound(id: u64, scope: &str) {
    let inserted = {
        let registry = ws_registry();
        let mut registry = registry.lock().unwrap();
        if let std::collections::hash_map::Entry::Vacant(entry) = registry.metadata.entry(id) {
            entry.insert(WsMeta {
                scope: scope.to_string(),
                hibernatable: false,
                tags: Vec::new(),
                attachment: None,
                pending: Vec::new(),
                auto_response_at: None,
            });
            true
        } else {
            false
        }
    };
    if inserted {
        increment_regular_ws(scope);
    }
}
pub fn ws_unregister(id: u64) {
    let meta = ws_registry().lock().unwrap().unregister(id);
    if let Some(meta) = meta.filter(|meta| !meta.hibernatable) {
        decrement_regular_ws(&meta.scope);
    }
}

pub(super) fn ws_capture_begin() {
    current_context()
        .ws_capture
        .lock()
        .unwrap()
        .push(Vec::new());
}

pub(super) fn ws_capture_take() -> Vec<(u64, WsOut)> {
    current_context()
        .ws_capture
        .lock()
        .unwrap()
        .pop()
        .unwrap_or_default()
}

/// Which channel a frame on this socket leaves by.
///
/// A hibernatable transport is `WsHibernatable`: the host pushes its messages
/// into the cell, captures what the handler emits, and releases the batch from
/// the cell's barrier queue.
///
/// A socket the isolate opened and polls itself is `WsSelf`, and the two are
/// separate channels in the model for a concrete reason. That handler runs
/// inside the isolate's event loop, and that loop is what a captured frame
/// would be waiting on: the reply to a frame the gate is withholding never
/// arrives, so the loop never finishes, so the frame is never released. It
/// takes a durability ticket on the host runtime instead, which is a different
/// way of being held rather than not being held at all.
fn ws_channel(id: u64) -> celld_logic::Channel {
    let registry = ws_registry();
    let registry = registry.lock().unwrap();
    if registry
        .metadata
        .get(&id)
        .is_some_and(|meta| meta.hibernatable)
    {
        celld_logic::Channel::WsHibernatable
    } else {
        celld_logic::Channel::WsSelf
    }
}

static WS_DEFERRED: OnceLock<std::sync::Mutex<HashMap<u64, Vec<WsOut>>>> = OnceLock::new();

/// Frames held back because the handler that produced them has written
/// something not yet durable, one queue per socket.
///
/// A socket with a queue has a flush already scheduled, and every later frame
/// for that socket joins the queue rather than overtaking it: a socket's
/// frames must arrive in the order the script sent them. Ordering is a
/// property of one socket, which is what the key says.
///
/// Process-wide, not thread-local. It is filled inside the isolate and
/// drained by an op, and an op runs on the host runtime — so a thread-local
/// queue was filled on one thread and taken, empty, on another. The frames
/// never left the process, and because the queue stayed non-empty every
/// later frame joined them.
#[doc(hidden)]
pub fn ws_deferred() -> &'static std::sync::Mutex<HashMap<u64, Vec<WsOut>>> {
    WS_DEFERRED.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

static WS_FLUSHES: OnceLock<std::sync::Mutex<HashMap<u64, usize>>> = OnceLock::new();

/// How many flushes still hold frames for a socket. A count, not a flag: one
/// flush can finish and drain its queue while a later frame starts another.
fn ws_flushes() -> &'static std::sync::Mutex<HashMap<u64, usize>> {
    WS_FLUSHES.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

static WS_FLUSH_DONE: OnceLock<tokio::sync::Notify> = OnceLock::new();
fn ws_flush_done() -> &'static tokio::sync::Notify {
    WS_FLUSH_DONE.get_or_init(tokio::sync::Notify::new)
}

/// Counts one flush out on every exit path, including the ones that run no
/// code: a flush spawned onto a runtime that is already shutting down is
/// dropped unpolled, and a panic unwinds through it. A count left behind by
/// either would park the socket's teardown. Held by the flush, so the count
/// falls whether it finished, failed, or never ran. It cannot help a flush
/// that is merely parked -- nothing drops, so nothing runs -- which is what
/// the teardown wait is bounded for.
struct WsFlushGuard(u64);

impl Drop for WsFlushGuard {
    fn drop(&mut self) {
        {
            let mut flushes = ws_flushes().lock().unwrap();
            if let Some(count) = flushes.get_mut(&self.0) {
                *count -= 1;
                if *count == 0 {
                    flushes.remove(&self.0);
                }
            }
        }
        ws_flush_done().notify_waiters();
    }
}

/// Wait until no flush holds frames for `id` any more.
///
/// The socket's own teardown calls this. Closing reads the handler's output
/// with a non-blocking drain and, finding none, answers the peer with the
/// protocol echo of the close the peer itself sent -- so a close frame still
/// behind the gate is not merely late, it is replaced. The wait is bounded by
/// the gate: a cell with no barrier answers at once, a barrier settles when
/// its proof does, and an unprovable one still resolves the flush through its
/// fail-closed arm.
pub async fn ws_await_flushes(id: u64) {
    loop {
        // Registered before the count is read. A flush that finishes in
        // between must find a waiter to wake, or this parks forever on a
        // notification that already happened.
        let notified = ws_flush_done().notified();
        tokio::pin!(notified);
        notified.as_mut().enable();
        if !ws_flushes().lock().unwrap().contains_key(&id) {
            return;
        }
        notified.await;
    }
}

fn ws_emit(id: u64, out: WsOut) {
    let context = current_context();
    let mut capture = context.ws_capture.lock().unwrap();
    if !capture.is_empty() && ws_channel(id) == celld_logic::Channel::WsHibernatable {
        capture.last_mut().unwrap().push((id, out));
        return;
    }
    drop(capture);
    // A socket the isolate opened itself, which the capture above deliberately
    // will not hold: releasing captured frames waits for the handler to
    // return, and this handler may be awaiting a reply to the very frame being
    // held. Waiting on the DURABILITY ticket instead has no such cycle -- it
    // is resolved by the replicator, which does not need this event loop -- so
    // the frame can be held without deadlocking the script that sent it.
    let gate = egress_gate_request(ws_channel(id));
    // Held until this frame is either queued or sent. A flush runs on another
    // thread, so releasing here would let it drain its queue between the check
    // below and the send, putting a later frame ahead of an earlier one.
    let mut deferred = ws_deferred().lock().unwrap();
    let already_deferring = deferred.contains_key(&id);
    // Gated for a read-only frame as well, and deliberately: the frame reveals
    // what the cell holds, so it has to ask the core whether a barrier is open
    // rather than assume its own event opened one. A cell with nothing
    // outstanding answers at once and the queue flushes on the same tick.
    if gate.is_gated() || already_deferring {
        deferred.entry(id).or_default().push(out);
        if !already_deferring {
            // Counted in while `deferred` is held, so a teardown that reads
            // the count cannot observe a queued frame with no flush behind it.
            *ws_flushes().lock().unwrap().entry(id).or_default() += 1;
            let counted = WsFlushGuard(id);
            // Detached onto the HOST runtime (`op_handle`) deliberately:
            // this flush exists precisely to outlive the dispatch that
            // produced the frames — a writing connect handler's ready frame,
            // an alarm broadcast — and it awaits a durability ticket that
            // resolves with no isolate involvement. Both region-owned homes
            // silently kill it: `asyncrt::enqueue`'s future is aborted when
            // the dispatch region closes, and the isolate thread's local
            // request driver stops polling its operation future the moment the
            // dispatch returns. Either way the frames never left the
            // process.
            asyncrt::op_handle().spawn(async move {
                let _counted = counted;
                let held = await_egress_gate(gate).await;
                let mut deferred = ws_deferred().lock().unwrap();
                let frames = deferred.remove(&id).unwrap_or_default();
                // Keep the lock from removal through the registry send. Once
                // the entry is absent, another release would otherwise look
                // direct and overtake these frames. `ws_emit_batch` reacquires
                // this mutex, so the lock-aware helper is required here.
                match held {
                    // Unprovable: these frames describe a write the fleet may
                    // never have, so they must not be delivered. Dropping them
                    // and leaving the socket open is not an option -- a
                    // WebSocket is an ordered stream, and a peer cannot see a
                    // hole in one. It would read the frames on either side of
                    // the gap as consecutive.
                    //
                    // Close instead. A truncated stream is something the peer
                    // can detect and resynchronise from; a silently incomplete
                    // one is not. The cell is reset underneath this as well,
                    // but that is a separate path and this must not depend on
                    // its timing.
                    Err(_) => {
                        ws_emit_ordered(
                            &mut deferred,
                            std::iter::once((
                                id,
                                WsOut::Close(
                                    1011,
                                    "celld could not prove the write behind this message durable"
                                        .to_string(),
                                ),
                            )),
                        );
                    }
                    Ok(()) => {
                        ws_emit_ordered(&mut deferred, frames.into_iter().map(|out| (id, out)));
                    }
                }
            });
        }
        return;
    }
    ws_emit_ordered(&mut deferred, std::iter::once((id, out)));
}

/// Emit released frames without crossing a queue that already orders a socket.
///
/// The caller holds `ws_deferred` from the queue check through the registry
/// send. Otherwise a flush can remove an earlier queue between those two steps,
/// or a later release can reach the registry before that removed queue does.
/// A batch can span sockets, so each frame makes the decision independently.
fn ws_emit_ordered(
    deferred: &mut HashMap<u64, Vec<WsOut>>,
    frames: impl IntoIterator<Item = (u64, WsOut)>,
) {
    let registry = ws_registry();
    let mut registry = registry.lock().unwrap();
    for (id, out) in frames {
        match deferred.get_mut(&id) {
            Some(queue) => queue.push(out),
            None => registry.emit(id, out),
        }
    }
}

/// Release a batch into each socket's ordered stream. A socket whose
/// durability-ticket queue is still present joins that queue, so an Actor
/// barrier release cannot overtake an earlier frame on the same socket.
pub fn ws_emit_batch(frames: Vec<(u64, WsOut)>) {
    let mut deferred = ws_deferred().lock().unwrap();
    ws_emit_ordered(&mut deferred, frames);
}

/// Close one socket. A forced generation swap closes the regular and
/// outbound sockets that pin a cell to its old isolate and nothing else: the
/// cell stays on this node, so its hibernatable sockets and auto-response
/// pair survive, which `ws_close_scope` would take with it.
pub fn ws_close(id: u64, code: u16, reason: &str) {
    ws_registry()
        .lock()
        .unwrap()
        .emit(id, WsOut::Close(code, reason.to_string()));
}

/// Break a cell's sockets: the output gate could not prove a write durable, so
/// close every socket the cell owns rather than let a client keep a connection
/// whose acknowledged effects may not have persisted (a reset DO).
pub fn ws_close_scope(scope: &str, code: u16, reason: &str) {
    // A reset cell is a new actor; workerd's hibernation manager dies with
    // the old one and takes the auto-response pair with it.
    ws_auto_responses().lock().unwrap().remove(scope);
    let registry = ws_registry();
    let mut registry = registry.lock().unwrap();
    let ids: Vec<u64> = registry
        .metadata
        .iter()
        .filter(|(_, meta)| meta.scope == scope)
        .map(|(id, _)| *id)
        .collect();
    for id in ids {
        registry.emit(id, WsOut::Close(code, reason.to_string()));
    }
}

pub(super) fn op_ws_send(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue<v8::Value>,
) {
    let id = args
        .get(0)
        .to_integer(scope)
        .map(|n| n.value() as u64)
        .unwrap_or(0);
    let data = args.get(1).to_rust_string_lossy(scope);
    ws_emit(id, WsOut::Text(data));
}
pub(super) fn op_ws_send_binary(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue<v8::Value>,
) {
    let id = args
        .get(0)
        .to_integer(scope)
        .map(|n| n.value() as u64)
        .unwrap_or(0);
    let data = view_bytes(args.get(1)).unwrap_or_default();
    ws_emit(id, WsOut::Binary(data));
}
pub(super) fn op_ws_close(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue<v8::Value>,
) {
    let id = args
        .get(0)
        .to_integer(scope)
        .map(|n| n.value() as u64)
        .unwrap_or(0);
    let code = args.get(1).uint32_value(scope).unwrap_or(1000) as u16;
    let reason = args.get(2).to_rust_string_lossy(scope);
    ws_emit(id, WsOut::Close(code, reason));
}
pub(super) fn op_ws_alloc(
    scope: &mut v8::PinScope,
    _args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue<v8::Value>,
) {
    rv.set(v8::Number::new(scope, ws_next_id() as f64).into());
}

pub(super) fn op_ws_prepare_worker_handoff(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue<v8::Value>,
) {
    let id = args
        .get(0)
        .to_integer(scope)
        .map(|n| n.value() as u64)
        .unwrap_or(0);
    prepare_worker_websocket_handoff(id);
}
/// `fetch(url, { headers: { Upgrade: "websocket" } })`. Returns a JSON
/// envelope: either an upgraded socket, or the ordinary response a server sent
/// instead, which the caller returns unchanged.
pub(super) fn op_ws_upgrade(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue<v8::Value>,
) {
    if actor_runtime_state(scope).egress == EgressPolicy::Deny {
        return loader_throw(
            scope,
            "This worker is not permitted to access the internet via global functions.",
        );
    }
    let id = args
        .get(0)
        .to_integer(scope)
        .map(|n| n.value() as u64)
        .unwrap_or(0);
    let cell = args.get(1).to_rust_string_lossy(scope);
    let url = args.get(2).to_rust_string_lossy(scope);
    // The subprotocol list is read back out of these headers, so a silent
    // default opened the socket with no headers and no subprotocol at all.
    let headers: Vec<(String, String)> =
        match serde_json::from_str(&args.get(3).to_rust_string_lossy(scope)) {
            Ok(headers) => headers,
            Err(error) => {
                return loader_throw(
                    scope,
                    &format!("websocket: the upgrade headers are not a name/value list: {error}"),
                )
            }
        };
    let protocols: Vec<String> = headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("sec-websocket-protocol"))
        .map(|(_, value)| value.split(',').map(|p| p.trim().to_string()).collect())
        .unwrap_or_default();
    let pull = cell.is_empty().then(|| {
        let (pull_tx, pull_rx) = tokio::sync::mpsc::unbounded_channel();
        ws_pull_register(id, pull_rx);
        ws_track_request_socket(id);
        pull_tx
    });
    let (tx, rx) = tokio::sync::oneshot::channel();
    let sent = outbound_ws_tx().is_some_and(|sender| {
        sender
            .send(OutboundWsReq {
                scope: cell,
                id,
                url,
                protocols,
                pull,
                headers,
                want_response: true,
                target: None,
                reply: tx,
            })
            .is_ok()
    });
    let async_id = asyncrt::enqueue(async move {
        if !sent {
            return Err("no outbound WebSocket channel".into());
        }
        let open = match rx.await {
            Ok(Ok(open)) => open,
            Ok(Err(error)) => return Err(format!("WebSocket upgrade failed: {error}")),
            Err(error) => return Err(format!("WebSocket connector dropped: {error}")),
        };
        Ok(match open.declined {
            Some(declined) => serde_json::json!({
                "upgraded": false,
                "status": declined.status,
                "headers": declined.headers,
                "body": declined.body,
            })
            .to_string(),
            None => serde_json::json!({
                "upgraded": true,
                "protocol": open.protocol.unwrap_or_default(),
            })
            .to_string(),
        })
    });
    rv.set(promise_for(scope, async_id));
}

/// Await the next inbound event on an isolate-polled socket. Resolves with a
/// tagged buffer; a closed queue resolves as a 1006 close so the JS pump always
/// terminates rather than hanging on a dropped sender.
pub(super) fn op_ws_next(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue<v8::Value>,
) {
    let id = args
        .get(0)
        .to_integer(scope)
        .map(|n| n.value() as u64)
        .unwrap_or(0);
    let queue = ws_pull().lock().unwrap().get(&id).cloned();
    let async_id = asyncrt::enqueue(async move {
        let Some(queue) = queue else {
            return Ok(WsPull::Close(1006, "socket is not registered".into(), false).encode());
        };
        let mut queue = queue.lock().await;
        Ok(queue
            .recv()
            .await
            .unwrap_or_else(|| WsPull::Close(1006, String::new(), false))
            .encode())
    });
    rv.set(promise_for(scope, async_id));
}

pub(super) fn op_ws_connect(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue<v8::Value>,
) {
    if actor_runtime_state(scope).egress == EgressPolicy::Deny {
        return loader_throw(
            scope,
            "This worker is not permitted to access the internet via global functions.",
        );
    }
    let id = args
        .get(0)
        .to_integer(scope)
        .map(|n| n.value() as u64)
        .unwrap_or(0);
    let cell = args.get(1).to_rust_string_lossy(scope);
    let url = args.get(2).to_rust_string_lossy(scope);
    let protocols: Vec<String> =
        match serde_json::from_str(&args.get(3).to_rust_string_lossy(scope)) {
            Ok(protocols) => protocols,
            Err(error) => {
                return loader_throw(
                    scope,
                    &format!("websocket: the subprotocol list is not a JSON array: {error}"),
                )
            }
        };
    // No cell means a Worker socket: the isolate polls it, so register the
    // queue here on the JS thread and track it against the running request.
    let pull = cell.is_empty().then(|| {
        let (pull_tx, pull_rx) = tokio::sync::mpsc::unbounded_channel();
        ws_pull_register(id, pull_rx);
        ws_track_request_socket(id);
        pull_tx
    });
    let (tx, rx) = tokio::sync::oneshot::channel();
    let sent = outbound_ws_tx().is_some_and(|sender| {
        sender
            .send(OutboundWsReq {
                scope: cell,
                id,
                url,
                protocols,
                pull,
                headers: Vec::new(),
                want_response: false,
                target: None,
                reply: tx,
            })
            .is_ok()
    });
    let async_id = asyncrt::enqueue(async move {
        if !sent {
            return Err("no outbound WebSocket channel".into());
        }
        match rx.await {
            Ok(Ok(open)) => Ok(open.protocol.unwrap_or_default()),
            Ok(Err(error)) => Err(format!("WebSocket connection failed: {error}")),
            Err(error) => Err(format!("WebSocket connector dropped: {error}")),
        }
    });
    rv.set(promise_for(scope, async_id));
}

/// Join this isolate's client socket to a Durable Object socket that a
/// subrequest already upgraded. The cell end lives in another isolate, so
/// the host carries each direction: it is the same route an external client
/// takes, with a pull queue in place of a TCP connection.
///
/// Called from `accept()`, never from the upgrade itself. A Worker that
/// passes the response straight back out never accepts the socket, and the
/// host binds that 101 to the real client instead — binding here as well
/// would give one cell socket two readers.
pub(super) fn op_ws_bind_target(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue<v8::Value>,
) {
    let id = args
        .get(0)
        .to_integer(scope)
        .map(|n| n.value() as u64)
        .unwrap_or(0);
    let Ok(target) = serde_json::from_str::<WsTarget>(&args.get(1).to_rust_string_lossy(scope))
    else {
        return loader_throw(scope, "WebSocket target is not valid");
    };
    // The caller's scope, which is empty for a Worker — the socket is
    // accounted against the isolate holding it, exactly as `op_ws_connect`
    // accounts an outbound one.
    let cell = args.get(2).to_rust_string_lossy(scope);
    let (pull_tx, pull_rx) = tokio::sync::mpsc::unbounded_channel();
    ws_pull_register(id, pull_rx);
    if cell.is_empty() {
        ws_track_request_socket(id);
    }
    // Registered here, on the JS thread, so a frame sent between this op and
    // the pipe task buffers as a pending frame instead of being dropped for
    // a socket the registry has never heard of. `accept()` opens the socket
    // synchronously, so that window is reachable by an ordinary `send()`.
    ws_register_outbound(id, &cell);
    let (tx, rx) = tokio::sync::oneshot::channel();
    let sent = outbound_ws_tx().is_some_and(|sender| {
        sender
            .send(OutboundWsReq {
                scope: target.scope.clone(),
                id,
                url: String::new(),
                protocols: Vec::new(),
                pull: Some(pull_tx),
                headers: Vec::new(),
                want_response: false,
                target: Some(target),
                reply: tx,
            })
            .is_ok()
    });
    // Nothing observes the outcome: the socket is already open, so there is
    // no handshake for JS to await. The task keeps the reply receiver alive
    // until the connector answers. A bind failure drops the pull sender, so
    // `op_ws_next` reports the caller socket as abnormally closed.
    asyncrt::enqueue(async move {
        if !sent {
            return Err::<String, String>("no outbound WebSocket channel".into());
        }
        match rx.await {
            Ok(Ok(_)) => Ok(String::new()),
            Ok(Err(error)) => Err(format!("WebSocket bind failed: {error}")),
            Err(error) => Err(format!("WebSocket connector dropped: {error}")),
        }
    });
}
pub(super) fn op_ws_accept(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue<v8::Value>,
) {
    let id = args
        .get(0)
        .to_integer(scope)
        .map(|n| n.value() as u64)
        .unwrap_or(0);
    let cell = args.get(1).to_rust_string_lossy(scope);
    // Tags are how `state.getWebSockets(tag)` finds this socket again after a
    // hibernation, so a silent default accepted the socket untagged and the
    // Worker could not address it by tag; only a bare `getWebSockets()` still
    // returned it.
    let tags: Vec<String> = match serde_json::from_str(&args.get(2).to_rust_string_lossy(scope)) {
        Ok(tags) => tags,
        Err(error) => {
            return loader_throw(
                scope,
                &format!("websocket: the tag list is not a JSON array: {error}"),
            )
        }
    };
    let replaced_regular_scope = {
        let registry = ws_registry();
        let mut registry = registry.lock().unwrap();
        let sockets = &mut registry.metadata;
        let replaced_regular_scope = sockets
            .get(&id)
            .filter(|meta| !meta.hibernatable)
            .map(|meta| meta.scope.clone());
        sockets
            .entry(id)
            .and_modify(|meta| {
                meta.scope = cell.clone();
                meta.hibernatable = true;
                meta.tags = tags.clone();
            })
            .or_insert(WsMeta {
                scope: cell.clone(),
                hibernatable: true,
                tags,
                attachment: None,
                pending: Vec::new(),
                auto_response_at: None,
            });
        replaced_regular_scope
    };
    if let Some(scope) = replaced_regular_scope {
        decrement_regular_ws(&scope);
    }
    tracing::info!(ws_id = id, scope = %cell, "accepted hibernatable WebSocket");
}
pub(super) fn op_ws_accept_regular(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue<v8::Value>,
) {
    let id = args
        .get(0)
        .to_integer(scope)
        .map(|n| n.value() as u64)
        .unwrap_or(0);
    let cell = args.get(1).to_rust_string_lossy(scope);
    let inserted = {
        let registry = ws_registry();
        let mut registry = registry.lock().unwrap();
        let sockets = &mut registry.metadata;
        if let std::collections::hash_map::Entry::Vacant(entry) = sockets.entry(id) {
            entry.insert(WsMeta {
                scope: cell.clone(),
                hibernatable: false,
                tags: Vec::new(),
                attachment: None,
                pending: Vec::new(),
                auto_response_at: None,
            });
            true
        } else {
            false
        }
    };
    if inserted {
        increment_regular_ws(&cell);
    }
    tracing::info!(ws_id = id, scope = %cell, "accepted regular WebSocket");
}
pub(super) fn op_ws_list(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue<v8::Value>,
) {
    let cell = args.get(0).to_rust_string_lossy(scope);
    let tag = args.get(1);
    let tag = if tag.is_undefined() || tag.is_null() {
        None
    } else {
        Some(tag.to_rust_string_lossy(scope))
    };
    let rows = ws_registry()
        .lock()
        .unwrap()
        .metadata
        .iter()
        .filter(|(_, meta)| {
            meta.hibernatable
                && meta.scope == cell
                && tag.as_ref().is_none_or(|tag| meta.tags.contains(tag))
        })
        .map(|(id, meta)| {
            serde_json::json!({
                "id": id,
                "tags": meta.tags,
                "attachment": meta.attachment,
            })
        })
        .collect::<Vec<_>>();
    let json = serde_json::to_string(&rows).unwrap();
    rv.set(v8::String::new(scope, &json).unwrap().into());
}
pub(super) fn op_ws_attachment_set(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue<v8::Value>,
) {
    let id = args
        .get(0)
        .to_integer(scope)
        .map(|n| n.value() as u64)
        .unwrap_or(0);
    let Some(attachment) = view_bytes(args.get(1)) else {
        let message = v8::String::new(scope, "__ws_attachment_set expects bytes").unwrap();
        let exception = v8::Exception::type_error(scope, message);
        scope.throw_exception(exception);
        return;
    };
    if let Some(meta) = ws_registry().lock().unwrap().metadata.get_mut(&id) {
        meta.attachment = Some(attachment.to_vec());
    }
}

pub(super) fn op_ws_auto_response_set(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue<v8::Value>,
) {
    let cell = args.get(0).to_rust_string_lossy(scope);
    let request = args.get(1);
    if request.is_null() || request.is_undefined() {
        ws_auto_responses().lock().unwrap().remove(&cell);
        return;
    }
    let request = request.to_rust_string_lossy(scope);
    let response = args.get(2).to_rust_string_lossy(scope);
    ws_auto_responses()
        .lock()
        .unwrap()
        .insert(cell, (request, response));
}
pub(super) fn op_ws_auto_response_get(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue<v8::Value>,
) {
    let cell = args.get(0).to_rust_string_lossy(scope);
    let pair = ws_auto_responses().lock().unwrap().get(&cell).cloned();
    let json = match pair {
        Some((request, response)) => serde_json::to_string(&[request, response]).unwrap(),
        None => "null".to_string(),
    };
    rv.set(v8::String::new(scope, &json).unwrap().into());
}
pub(super) fn op_ws_auto_response_ts(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue<v8::Value>,
) {
    let id = args
        .get(0)
        .to_integer(scope)
        .map(|n| n.value() as u64)
        .unwrap_or(0);
    let stamped = ws_registry()
        .lock()
        .unwrap()
        .metadata
        .get(&id)
        .and_then(|meta| meta.auto_response_at);
    match stamped {
        Some(ms) => rv.set(v8::Number::new(scope, ms).into()),
        None => rv.set(v8::null(scope).into()),
    }
}
