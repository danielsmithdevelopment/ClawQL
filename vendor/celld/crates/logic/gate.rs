// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! The input gate, reified sans-IO.
//!
//! A cell serves several requests at once — that is the Durable Object
//! contract, and D1 restores it by deleting the per-cell thread that
//! accidentally forbade it. Concurrency is only safe if a handler that
//! must not be interrupted cannot be, or it would resume to find its own
//! state changed underneath it by whatever ran while it waited.
//!
//! workerd's rule (`io-gate.h`): while the gate is held, **no incoming
//! event of any kind is delivered** to that cell except the event holding
//! it. Not just new requests — a subrequest's response, a timer, a stream
//! read. Anything that would run JS and observe state.
//!
//! **What holds it here is not storage.** In workerd the async KV API
//! (`actor-state.h:49`, `jsg::Promise<...> get`) can genuinely suspend on an
//! `ActorCache` miss, so storage is what gates; the SQL API (`sql.h:41`,
//! `exec` returning a `Cursor`) is synchronous and does not. In celld every
//! storage path is local SQLite underneath, including the async-shaped one,
//! whose `await Promise.resolve()` drains in the same microtask checkpoint.
//! A read or a write therefore completes inside the turn that started it and
//! never yields to another event, so there is no window for the gate to
//! close.
//!
//! Its user is **`blockConcurrencyWhile`** (`harness.js:1001`), which holds
//! across arbitrary user code — including real awaits like `fetch` — and
//! whose entire purpose is that nothing else runs meanwhile.
//!
//! # Why there is no queue here
//!
//! An earlier version of this file parked refused events in a `VecDeque` and
//! returned them from `release`. That mirrored a queue the shell already
//! owns: a cell's events arrive on its job channel, and an event the gate
//! refuses is simply **left there**, in arrival order, until a later
//! delivery attempt takes it. Modelling it twice bought nothing and cost the
//! two structures agreeing.
//!
//! # Why acquiring cannot fail
//!
//! [`acquire`](InputGate::acquire) panics if another event holds the gate,
//! and that is not optimism. Acquiring happens *during* an event, and an
//! event only runs because a delivery point found the gate open. So a second
//! event cannot be running to acquire second. Nested blocks within one event
//! are counted, not refused, because that event already holds it.
//!
//! This property is what makes the mechanism small, and losing it is what
//! wedged cells before: while acquiring was asynchronous, a cell could
//! deliver a second event in the window between a block starting and the
//! gate shutting. That event then had to *wait* for a gate held by an event
//! suspended beneath it on the stack, which nothing could ever release.
//! Acquiring is therefore synchronous with the JS call that asks for it, and
//! the panic is what says so.
//!
//! This is the decision half. The shell owns the delivery points and asks
//! [`is_open`](InputGate::is_open) at each one; it never decides who runs.

/// An event delivered to a cell: a request turn, an alarm, a subrequest
/// response, a stream wakeup. The shell assigns the ids and only needs them
/// to be unique among a cell's live events.
pub type EventId = u64;

/// One cell's input gate.
///
/// Default is open, which is the common case: a cell with nothing blocking
/// delivers everything immediately and this costs a branch.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct InputGate {
    /// The event holding the gate, if any.
    holder: Option<EventId>,
    /// How many holds the holder has taken at once.
    ///
    /// `blockConcurrencyWhile` nests. Opening the gate when the innermost
    /// block ends would admit another event while the outer ones still run,
    /// which a boolean would do.
    outstanding: u32,
}

impl InputGate {
    pub fn new() -> Self {
        Self::default()
    }

    /// May an event that is not already running be delivered now?
    ///
    /// The one question a delivery point asks. The holder never asks it: it
    /// is already running, and its own continuations are not deliveries.
    pub fn is_open(&self) -> bool {
        self.holder.is_none()
    }

    /// `event` entered a `blockConcurrencyWhile`. Shuts the gate, and
    /// answers whether it got it.
    ///
    /// `false` means another event holds it and this one must wait. That
    /// used to be impossible: while a cell's events came off one channel
    /// only one ran at a time, and a delivery point had already found the
    /// gate open. Events are independent tasks now, several are in flight
    /// at once by design, so two can reach a block together.
    #[must_use]
    pub fn acquire(&mut self, event: EventId) -> bool {
        match self.holder {
            None => {
                self.holder = Some(event);
                self.outstanding = 1;
                true
            }
            Some(holder) if holder == event => {
                self.outstanding += 1;
                true
            }
            Some(_) => false,
        }
    }

    /// One of `event`'s blocks ended. The gate opens when the last one does.
    ///
    /// # Panics
    ///
    /// If `event` does not hold the gate. Opening a gate somebody else
    /// depends on is worse than stopping.
    pub fn release(&mut self, event: EventId) {
        match self.holder {
            Some(holder) if holder == event => {}
            Some(holder) => panic!("input gate held by event {holder}, released by {event}"),
            None => panic!("input gate released by {event} while open"),
        }
        self.outstanding -= 1;
        if self.outstanding == 0 {
            self.holder = None;
        }
    }

    /// The holder died — terminated, cancelled, or timed out — and will
    /// never release.
    ///
    /// Without this a request killed mid-block shuts its cell's gate
    /// forever, and the cell accepts nothing again. JS `finally` covers
    /// every ordinary exit, a throw included; this covers the one exit that
    /// runs no JS.
    pub fn abandon(&mut self) {
        self.holder = None;
        self.outstanding = 0;
    }
}
