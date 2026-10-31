// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Sans-I/O policy for the fleet drain token.
//!
//! One well-known bucket object serializes concurrent donors: a draining
//! node claims the token before it releases cells, so simultaneous stop
//! signals (a node drain, a cluster upgrade, a spot reclaim) hand off one
//! node at a time instead of flooding the survivors. A fresh node combines the
//! token with the load in live node leases for its first readiness. The gate
//! requires successor publication, memory headroom, bounded restoration, and
//! bounded ownership skew before the fleet loses another node.
//!
//! The token is advisory. Correctness never depends on it: a donor that
//! cannot claim it within a bounded wait proceeds unserialized, a fresh
//! node's gate falls open after a bounded wait, and a dead holder's claim
//! lapses by TTL. Every failure path degrades to the unserialized behavior
//! that existed before the token, never to something worse.

/// The fleet drain token as stored at its well-known bucket key.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DrainToken {
    pub node: String,
    pub expires_ms: u64,
}

/// Whether another node holds a live claim. A claim is live while
/// `expires_ms > now_ms`, matching the node-lease liveness rule.
pub fn held_by_another(existing: Option<&DrainToken>, node: &str, now_ms: u64) -> bool {
    existing.is_some_and(|token| token.node != node && token.expires_ms > now_ms)
}

/// Whether a draining node may claim the token: it is absent, expired, or
/// already its own, so a restarted logical node resumes its earlier claim.
pub fn may_claim(existing: Option<&DrainToken>, node: &str, now_ms: u64) -> bool {
    !held_by_another(existing, node, now_ms)
}

/// Why the first-readiness gate cannot open yet.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FleetUnsettled {
    Drain,
    Unreadable,
    SelfUnpublished,
    MemoryHeadroom { node: String },
    Restoration { current: u64, maximum: u64 },
    OwnershipSkew { current: usize, maximum: usize },
}

/// Whether the joining node can receive ownership during the next paced
/// drain. The node contributes only when its lease is live, it advertises the
/// handoff protocol, and it owns less than the busiest incumbent.
pub fn joining_contributes_successor_capacity(
    peers: &[crate::CapacityPeer],
    node: &str,
    now_ms: u64,
) -> bool {
    let live = peers
        .iter()
        .filter(|peer| peer.expires_ms > now_ms)
        .collect::<Vec<_>>();
    live.iter()
        .find(|peer| peer.node == node)
        .is_some_and(|joining| {
            joining.paced_handoff
                && live
                    .iter()
                    .filter(|peer| peer.node != node)
                    .map(|peer| peer.resident_cells)
                    .max()
                    .is_some_and(|maximum| joining.resident_cells < maximum)
        })
}

/// Evaluate the drain token and the successor capacity published in live node
/// leases. The joining node must publish itself. Every live peer must have
/// memory headroom, the fleet restore backlog must be bounded, and incumbent
/// ownership must fit the successor-share envelope.
pub fn fleet_status(
    existing: Option<&DrainToken>,
    node: &str,
    now_ms: u64,
    peers: &[crate::CapacityPeer],
    max_restoring: u64,
) -> Result<(), FleetUnsettled> {
    if held_by_another(existing, node, now_ms) {
        return Err(FleetUnsettled::Drain);
    }

    let live = peers
        .iter()
        .filter(|peer| peer.expires_ms > now_ms)
        .collect::<Vec<_>>();
    if !live.iter().any(|peer| peer.node == node) {
        return Err(FleetUnsettled::SelfUnpublished);
    }
    if let Some(node) = live
        .iter()
        .filter(|peer| peer.pressured || peer.memory_headroom == Some(false))
        .map(|peer| &peer.node)
        .min()
    {
        return Err(FleetUnsettled::MemoryHeadroom { node: node.clone() });
    }

    let restoring = live
        .iter()
        .fold(0_u64, |sum, peer| sum.saturating_add(peer.restoring));
    if restoring > max_restoring {
        return Err(FleetUnsettled::Restoration {
            current: restoring,
            maximum: max_restoring,
        });
    }

    // A paced joining node publishes its peer endpoint before readiness and
    // accepts ownership-only handoffs without restoring a runtime. When that
    // node holds less ownership than the busiest incumbent, it is usable
    // successor capacity for the next donor. Requiring the incumbents to
    // rebalance first creates a closed loop: idle fleets move ownership only
    // during a handoff, while the orchestrator waits for readiness before it
    // starts that handoff.
    let joining_can_absorb_skew = joining_contributes_successor_capacity(peers, node, now_ms);

    // An unpaced or already-full joining node cannot repair ownership during
    // the next drain. Its incumbents must therefore remain within one equal
    // successor share above their mean.
    let incumbents = live
        .iter()
        .filter(|peer| peer.node != node)
        .collect::<Vec<_>>();
    let count = incumbents.len();
    if count > 1 {
        let total = incumbents
            .iter()
            .fold(0_usize, |sum, peer| sum.saturating_add(peer.resident_cells));
        let count = count as u128;
        let numerator = (total as u128).saturating_mul(count.saturating_add(1));
        let denominator = count.saturating_mul(count);
        let maximum = numerator
            .saturating_add(denominator - 1)
            .checked_div(denominator)
            .unwrap_or_default()
            .min(usize::MAX as u128) as usize;
        let current = incumbents
            .iter()
            .map(|peer| peer.resident_cells)
            .max()
            .unwrap_or_default();
        if current > maximum && !joining_can_absorb_skew {
            return Err(FleetUnsettled::OwnershipSkew { current, maximum });
        }
    }
    Ok(())
}
