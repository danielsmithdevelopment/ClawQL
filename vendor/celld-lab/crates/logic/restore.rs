// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Restore-source durability predicates, reified sans-IO. Activation restores a
//! cell's SQLite from the newest SAFE source — a local eviction snapshot or
//! the replicated bucket. Which source is a durability decision: pick a stale
//! one over a newer replica and the cell serves lost writes; pick a
//! needlessly-remote one and pay dozens of sequential round trips (measured:
//! 46, 0 local reuses in 910 activations, before the previous-epoch lookup).
//! The AVAILABILITY of each source is I/O (file checks, S3 LIST); this
//! predicate is the pure choice among them.
//!
//! Two siblings (`local_epoch_wins`, `recoverable`) guarded the local
//! crash-epoch restore, a source the external litestream backend needed and
//! the in-process ltx replicator deliberately does not have: a restart
//! re-acquires the next epoch from the bucket, so a committed-but-unacked
//! write is discarded and RPO=0 covers exactly the acknowledged ones. They
//! were deleted with their mechanism.

pub type Epoch = u64;

/// May an eviction snapshot from the PREVIOUS epoch be reused? Ordinary idle
/// eviction is followed by an epoch advance, so its cache sits under
/// `epoch - 1` — safe to reuse only when we did NOT take the cell over from
/// another node. A takeover means someone else may have written the cell while
/// we slept, so their newer durable state, not our stale snapshot, is
/// authoritative. Epoch 1 has no previous epoch.
pub fn previous_epoch_reusable(epoch: Epoch, took_over: bool) -> bool {
    epoch > 1 && !took_over
}
