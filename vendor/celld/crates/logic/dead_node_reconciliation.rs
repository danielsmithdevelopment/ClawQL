// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Sans-I/O decisions for retiring compatibility ownership-index debris.
//!
//! celld does not create `node-cells/` markers, but it shares fleet buckets
//! with celld and must retire markers left by dead historical generations.

const MAX_BACKOFF_SHIFT: u32 = 6;

/// Delay after `failure_count` consecutive incomplete passes.
///
/// Counts start at one and double through 64 ordinary waker ticks. Saturating
/// arithmetic keeps a damaged store from turning reconciliation into a tight
/// retry loop even at extreme configured intervals.
pub fn retry_delay_ms(tick_ms: u64, failure_count: u32) -> u64 {
    let shift = failure_count.saturating_sub(1).min(MAX_BACKOFF_SHIFT);
    tick_ms.saturating_mul(1_u64 << shift)
}

/// Parse `node-cells/<node>/<generation>/<cell>` into its GC identity.
///
/// The generation is deliberately discarded. Once a node session is dead,
/// every generation below its prefix is debris; matching only the generation
/// named by the final node record permanently strands overlapping older
/// generations after a same-ID restart.
pub fn parse_marker_key(key: &str) -> Option<(&str, &str)> {
    let rest = key.strip_prefix("node-cells/")?;
    let mut parts = rest.splitn(3, '/');
    let (node, generation, cell) = (parts.next()?, parts.next()?, parts.next()?);
    if node.is_empty() || generation.is_empty() || cell.is_empty() {
        return None;
    }
    Some((node, cell))
}

/// A listed node record is GC-eligible only when its identity still matches
/// its object key and its wall-clock lease is no longer live.
pub fn node_record_is_dead(
    key_node: &str,
    record_node: &str,
    expires_ms: u64,
    now_ms: u64,
) -> bool {
    key_node == record_node && expires_ms <= now_ms
}
