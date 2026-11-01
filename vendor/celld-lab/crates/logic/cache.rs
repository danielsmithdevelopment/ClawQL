// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Local snapshot-cache eviction, sans-IO.
//!
//! Idle eviction preserves each cell's SQLite file so a same-node wake is
//! a rename instead of a remote restore, which saves tens of serial storage
//! round trips per wake. The cost is that a node accumulates one file per
//! cell it has ever hosted, which is unbounded while the durable population
//! is unbounded.
//!
//! The bound can be crude because the cache is PURE OPTIMIZATION: every
//! entry is a copy of state the bucket already holds, so deleting any entry
//! is always correct and costs only a future restore. That makes
//! least-recently-used the whole policy — no fencing, no durability, no
//! ordering constraint to respect.

/// One cached file, as the executor observed it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CacheEntry {
    /// Monotonic-ish recency; larger is more recently used. The executor
    /// supplies mtime, which a rename-in refreshes.
    pub last_used_ms: i64,
    pub bytes: u64,
}

/// Which entries to delete so the cache fits `max_bytes`, oldest first.
/// Returns indices into `entries`. An empty result means the cache already
/// fits — the common case, and it must never do I/O-worthy work then.
pub fn plan_eviction(entries: &[CacheEntry], max_bytes: u64) -> Vec<usize> {
    let total: u64 = entries.iter().map(|entry| entry.bytes).sum();
    if total <= max_bytes {
        return Vec::new();
    }
    // Most recently used first; evict from the tail until it fits.
    let mut order: Vec<usize> = (0..entries.len()).collect();
    order.sort_by_key(|&i| std::cmp::Reverse((entries[i].last_used_ms, i)));
    let mut kept = 0_u64;
    let mut evict = Vec::new();
    for i in order {
        let next = kept.saturating_add(entries[i].bytes);
        if next <= max_bytes {
            kept = next;
        } else {
            evict.push(i);
        }
    }
    evict.sort_unstable();
    evict
}
