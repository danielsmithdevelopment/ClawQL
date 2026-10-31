// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Whether a failed peer dispatch may be re-sent.
//!
//! A cell runs on exactly one node, so every other node forwards to the
//! owner. When that forward fails, celld must decide between two bad
//! options: fail the caller, or re-send and risk running the request twice.
//! The deciding fact is how far the attempt got. A connection that was never
//! established carried no request bytes, so the owner's cell is untouched and
//! a fresh attempt cannot double-apply. Every other failure — a timeout after
//! the request was written, a truncated body, a decode error — leaves the
//! outcome ambiguous: the owner may have run it and lost the reply. Re-sending
//! those would break at-most-once execution.
//!
//! The case this exists for is a burst of cold activations, where TCP
//! handshakes stall past the client's connect timeout. Those forwards never
//! reached the owner, so surfacing them to the caller is a self-inflicted
//! error.

/// How far a dispatch attempt got before it failed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Attempt {
    /// The peer answered that it no longer owns the cell. Nothing ran.
    NotOwner,
    /// The connection was never established. No bytes reached the owner.
    NeverConnected,
    /// The request was on the wire when the attempt failed. The owner may or
    /// may not have run it.
    Ambiguous,
}

/// Per-request redispatch state. Each recoverable failure class gets one retry,
/// counted separately so a route that is both stale and unreachable still
/// terminates. A connection retry costs a full connect timeout, so a second
/// retry would add the same latency when the owner is genuinely down.
#[derive(Debug, Default)]
pub struct Dispatcher {
    retried_not_owner: bool,
    retried_never_connected: bool,
}

impl Dispatcher {
    /// Record a failed attempt. Return `true` when the caller can safely
    /// invalidate the failed route and dispatch the request again.
    pub fn redispatch(&mut self, attempt: Attempt) -> bool {
        match attempt {
            Attempt::Ambiguous => false,
            Attempt::NotOwner if self.retried_not_owner => false,
            Attempt::NotOwner => {
                self.retried_not_owner = true;
                true
            }
            Attempt::NeverConnected if self.retried_never_connected => false,
            Attempt::NeverConnected => {
                self.retried_never_connected = true;
                true
            }
        }
    }
}
