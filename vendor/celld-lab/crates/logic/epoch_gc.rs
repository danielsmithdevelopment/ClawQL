// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Which superseded LTX epoch prefixes an owner may delete.
//!
//! Every activation opens a new epoch prefix, and a restore reads only the
//! epochs of its chain: it walks down from the newest epoch and stops at the
//! first span that opens at TXID 1, the chain's base. Every epoch below the
//! base is never read again, yet nothing removed it, so a bucket grew with
//! database size times activations (denoland/celld#240).
//!
//! The decision is pure; the owner supplies the facts by I/O. The chain is the
//! one the restore code builds (`EpochChain::spans`), over every listed epoch
//! including the owner's own. A second walk written here could disagree with
//! the restore walk, and the disagreement deletes a base: a fenced owner's
//! late snapshot in an intermediate epoch opens at TXID 1 yet sits outside the
//! chain, so "the newest epoch that opens at TXID 1" is not the base.
//!
//! The owner deletes nothing until the chain's newest span is its own epoch.
//! That proves its own opener (a TXID-1 snapshot, or a paged activation's
//! marker) is listed, so a successor that claims the cell later lists it too
//! and restores from a base at or above this one. The caller must read
//! `own.json` after this point and before the delete; that order, not a
//! conditional write, is the fence. Every uncertain fact keeps the epoch: a
//! leak costs bytes, a wrong delete makes a cell unrestorable.

pub type Epoch = u64;

/// One epoch prefix under a stream, with the upload time of its newest object.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ListedEpoch {
    pub epoch: Epoch,
    pub newest_ms: u64,
}

/// What an owner does after activation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plan {
    /// The chain's base. Rows for epochs below it are covered by the base's
    /// image, so bundle GC and recovery may treat them as retired.
    pub retired_below: Epoch,
    /// Whether the stream's recorded mark must be raised to `retired_below`
    /// before any delete.
    pub record: bool,
    /// Epoch prefixes to delete, ascending.
    pub delete: Vec<Epoch>,
}

/// Plans one stream's epoch GC, or `None` when nothing may be decided yet.
///
/// `chain` holds the restore chain's epochs, oldest first. `recorded` is the
/// stream's current retired mark. `pinned_reads` is true while the owner's
/// own activation still reads objects by the chain it built at activation:
/// a paged cell faults pages from those objects until its background fill
/// completes. The chain can gain a later base in the meantime (a fenced
/// owner's late snapshot that ends exactly at the cut links in above the old
/// base), and deleting below the new base would remove objects the fill
/// still reads. An epoch is deleted only when it is below the
/// base, is neither the owner's epoch nor the one before it, and its newest
/// object is at least `grace_ms` old. The previous-epoch rule is a margin
/// against a lagging listing, not the safety argument.
pub fn plan(
    own_epoch: Epoch,
    chain: &[Epoch],
    listed: &[ListedEpoch],
    recorded: Option<Epoch>,
    pinned_reads: bool,
    now_ms: u64,
    grace_ms: u64,
) -> Option<Plan> {
    if pinned_reads || chain.last() != Some(&own_epoch) {
        return None;
    }
    let base = *chain.first()?;
    // A recorded mark above the base means an earlier owner saw a higher
    // base. The base never falls under a consistent listing, so this owner's
    // view is stale; it decides nothing.
    if recorded.is_some_and(|mark| mark > base) {
        return None;
    }
    let delete = listed
        .iter()
        .filter(|l| l.epoch < base && l.epoch + 1 < own_epoch)
        .filter(|l| now_ms.saturating_sub(l.newest_ms) >= grace_ms)
        .map(|l| l.epoch)
        .collect();
    Some(Plan {
        retired_below: base,
        record: recorded != Some(base),
        delete,
    })
}

/// Is a node-log row for `epoch` covered by a stream's retired mark? The mark
/// is read per stream by its exact name; a facet nests under its root's
/// path, and a prefix match would apply the root's mark to the facet.
pub fn retired(epoch: Epoch, recorded: Option<Epoch>) -> bool {
    recorded.is_some_and(|mark| epoch < mark)
}
