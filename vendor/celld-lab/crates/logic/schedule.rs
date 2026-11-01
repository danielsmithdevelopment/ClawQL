// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Cell-isolate dispatch decisions, reified sans-IO. A cell isolate runs one
//! event at a time. A top-level Worker fetch takes the resident-isolate fast
//! path only when the isolate is idle; if the isolate is already pumping an
//! actor event, the fetch must reschedule to the stateless Worker pool — never
//! run nested — carrying its request identity so the reply still lands
//! (`js.rs`). The executor and the production run loop hold the isolate
//! channels and the pool; this is the pure routing they consult, so a
//! deterministic executor can drive it directly.
//!
//! Small protocol sequencing choices also live here when the executor owns
//! the bytes but not the decision. That keeps the shell mechanical and lets
//! callers exercise the same branch production takes.

/// Return whether a close code can appear in a WebSocket close frame.
///
/// RFC 6455 uses 1005, 1006, and 1015 only for local reporting, so an endpoint
/// cannot put them on the wire. Code 1004 is reserved. The IANA registry
/// assigns the remaining standard codes through 1014, and codes from 3000
/// through 4999 are available to applications and libraries.
pub fn websocket_close_code_is_allowed(code: u16) -> bool {
    matches!(code, 1000..=1003 | 1007..=1014 | 3000..=4999)
}

/// Select the protocol close code the shell must echo after the application
/// close handler has run and all of its output has been written.
///
/// An application-selected close wins. Otherwise RFC 6455 requires a clean
/// peer close to receive a close response; 1005 is the local sentinel for a
/// frame with no status and cannot itself appear on the wire, so it becomes
/// the normal close code 1000. A parsed protocol failure receives its permitted
/// error code, while an abnormal transport end receives no frame.
pub fn websocket_echo_close(
    peer_code: u16,
    peer_was_clean: bool,
    handler_sent_close: bool,
) -> Option<u16> {
    if handler_sent_close {
        None
    } else if !peer_was_clean {
        matches!(peer_code, 1002 | 1007).then_some(peer_code)
    } else if peer_code == 1005 {
        Some(1000)
    } else {
        Some(peer_code)
    }
}

/// Track frame boundaries in the unmasked stream from a WebSocket owner.
///
/// A byte-splicing hop can append a failure Close only between frames and
/// before any owner Close. Otherwise a second Close fails browser channels,
/// or the injected bytes become part of an incomplete frame's payload.
/// Payloads are skipped without buffering; this is not a protocol validator.
#[derive(Debug, Default)]
pub struct WebSocketCloseScanner {
    state: WebSocketScanState,
}

#[derive(Debug, Default)]
enum WebSocketScanState {
    #[default]
    Opcode,
    Length,
    ExtendedLength {
        remaining: u8,
        value: u64,
    },
    Payload {
        remaining: u64,
    },
    // A Close has started, or a masked/invalid-length owner frame makes
    // appending a server frame unsafe. Never resume scanning this stream.
    Stopped,
}

impl WebSocketCloseScanner {
    /// Observe bytes successfully written to the client, in stream order.
    pub fn observe(&mut self, mut bytes: &[u8]) {
        use WebSocketScanState::*;
        while let Some((&byte, rest)) = bytes.split_first() {
            match &mut self.state {
                Opcode => {
                    self.state = if byte & 0x0f == 8 { Stopped } else { Length };
                }
                Length => {
                    self.state = match byte {
                        0 => Opcode,
                        1..=125 => Payload {
                            remaining: u64::from(byte),
                        },
                        126 => ExtendedLength {
                            remaining: 2,
                            value: 0,
                        },
                        127 => ExtendedLength {
                            remaining: 8,
                            value: 0,
                        },
                        // A server must not mask its frames.
                        _ => Stopped,
                    };
                }
                ExtendedLength { remaining, value } => {
                    // RFC 6455 limits extended lengths to 63 bits.
                    if *remaining == 8 && byte & 0x80 != 0 {
                        self.state = Stopped;
                    } else {
                        *value = (*value << 8) | u64::from(byte);
                        *remaining -= 1;
                        if *remaining == 0 {
                            self.state = if *value == 0 {
                                Opcode
                            } else {
                                Payload { remaining: *value }
                            };
                        }
                    }
                }
                Payload { remaining } => {
                    let count = (*remaining).min(bytes.len() as u64) as usize;
                    *remaining -= count as u64;
                    bytes = &bytes[count..];
                    if *remaining == 0 {
                        self.state = Opcode;
                    }
                    continue;
                }
                Stopped => return,
            }
            bytes = rest;
        }
    }

    /// Whether the stream can accept a synthetic Close at its current end.
    pub fn can_append_close(&self) -> bool {
        matches!(self.state, WebSocketScanState::Opcode)
    }
}
