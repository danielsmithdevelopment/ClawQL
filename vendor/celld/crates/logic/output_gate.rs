// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! The output gate: one choke point every egress passes through.
//!
//! # The rule
//!
//! Nothing that reveals a cell's state may leave this process while that cell
//! has a write it cannot prove durable. A client told about a write that a
//! crash then discards has been told something false, and no later message can
//! retract a side effect that has already left.
//!
//! # The implementation contract
//!
//! [`Channel`] enumerates every route that can reveal a cell's state. The shell
//! holds each effect and sends an [`Event::Output`] with its route. This module
//! applies one durability rule to every route and returns the same route in an
//! [`Effect::Release`].
//!
//! Each part of that contract has one implementation counterpart:
//!
//! | contract | implementation |
//! | --- | --- |
//! | enumerate every output route | the [`Channel`] enum |
//! | apply one rule to every route | the `channel` argument to [`State::output`] |
//! | bypass the gate when disabled | with `CELLD_OUTPUT_GATE=0`, the shell sends no [`Event::Output`] |
//! | release only revealable state | the output's barrier, or the barrier it trails, has settled |
//! | let the held effect leave | [`Effect::Release`] with `Ok` |
//!
//! **The core does not read the channel.** It stores what the shell gave it and
//! hands the same value back. A `match` on [`Channel`] inside this module would
//! split the invariant into six independent rules. Per-channel code belongs in
//! the shell and is limited to how an effect is held and how it is released.
//!
//! # Why one choke point
//!
//! Earlier implementations split this rule between a core reader gate, a shell
//! WebSocket queue, and an in-handler position check. Each mechanism had a
//! different view of the outstanding writes, so one channel could miss a write
//! that another mechanism knew about. One core barrier map gives every channel
//! the same view.
//!
//! # The second way a barrier opens
//!
//! Every channel passes through [`State::output`]. Not every barrier is opened
//! by one: `alarm_finished` opens its own when a firing's consuming commit is
//! unproven, owned by [`GateOwner::Alarm`] rather than by an output. An alarm
//! is not a seventh channel -- it settles by replay into the core, not by
//! release to the shell, so a [`Channel`] variant could not carry it -- but its
//! barrier lives in the same per-cell map, which is what matters here: a
//! read-only output trails the newest barrier on its cell without asking who
//! opened it, so it trails an alarm's unproven write exactly as it trails a
//! request's.
//!
//! An earlier alarm path proved its write inside [`Effect::FireAlarm`] without
//! registering a core barrier. A read-only output could therefore miss that
//! unproven write. The alarm now opens a barrier in the same map, so every
//! reader observes it.
//!
//! # Boundary
//!
//! A response body that streams is gated once, when the response is released.
//! Later chunks do not pass again. The model treats a response as atomic, so it
//! does not see this either.

use crate::*;

impl State {
    /// **The output gate. Every channel passes through here.**
    ///
    /// The implementation contract is meant to be checked line by line:
    ///
    /// - `channel` names the route. This function stores it but does not branch
    ///   on it, so all six channels use one rule.
    /// - with `CELLD_OUTPUT_GATE=0`, the shell never sends [`Event::Output`].
    /// - no barrier means that no unproven write remains for this output to
    ///   reveal, so the core emits [`Effect::Release`] with `Ok`.
    ///
    /// A write opens its own barrier and waits for a proof that covers its
    /// position. A read-only output joins the newest barrier open on its cell,
    /// because a reader can start after a write commits and before its proof
    /// lands. Comparing the reader's own start and end positions therefore
    /// decides nothing.
    pub(crate) fn output(
        &mut self,
        request: RequestId,
        channel: Channel,
        position: Option<u64>,
        effects: &mut Vec<Effect>,
    ) {
        let held = Held { request, channel };
        match position {
            Some(position) => self.open_write_barrier(held, position, effects),
            None => self.trail_open_barrier(held, effects),
        }
    }

    /// Open the output gate for a local write: hold its output until the
    /// cell's committed `position` is proven replicated. The request must still
    /// be a live local activity on its cell, resident at the epoch that
    /// committed the write; otherwise durability cannot be proven for it and
    /// the output fails rather than falsely acknowledging the write.
    fn open_write_barrier(&mut self, held: Held, position: u64, effects: &mut Vec<Effect>) {
        let request = held.request;
        let resident = self.active_requests.get(&request).and_then(|id| {
            match self.cells.get(id).map(|cell| &cell.phase) {
                Some(Phase::Resident { epoch }) => Some((id.clone(), *epoch)),
                _ => None,
            }
        });
        let Some((cell, epoch)) = resident else {
            effects.push(Effect::Release {
                request,
                channel: held.channel,
                result: Err(RequestError::DurabilityUnproven),
            });
            return;
        };
        let op = self.op();
        self.barriers.insert(
            op,
            Barrier {
                owner: GateOwner::Output(held),
                cell: cell.clone(),
                epoch,
                position,
                followers: Vec::new(),
            },
        );
        effects.push(Effect::AwaitDurable {
            op,
            cell,
            epoch,
            position,
        });
    }

    /// Hold a read-only output behind the newest barrier open on its cell.
    ///
    /// Residency is not required here, unlike a write: a read on a cell that
    /// has left `Resident` has no barrier to find and no write of its own to
    /// prove, so it releases rather than fails.
    fn trail_open_barrier(&mut self, held: Held, effects: &mut Vec<Effect>) {
        let Some(cell) = self.active_requests.get(&held.request).cloned() else {
            effects.push(Effect::Release {
                request: held.request,
                channel: held.channel,
                result: Err(RequestError::DurabilityUnproven),
            });
            return;
        };
        if let Some((_, barrier)) = self
            .barriers
            .iter_mut()
            .rev()
            .find(|(_, barrier)| barrier.cell == cell)
        {
            barrier.followers.push(held);
        } else {
            effects.push(Effect::Release {
                request: held.request,
                channel: held.channel,
                result: Ok(()),
            });
        }
    }

    /// A gated write's durability proof completed. Acknowledge the write only
    /// when the replica proved a position that *covers* it — a shorter proof
    /// (a lagging or lying replicator) fails it rather than acknowledging a
    /// write the node cannot actually restore. Any error fails it. A completion
    /// for a gate already drained (fence or deadline) is ignored — the
    /// versioned-op discipline used throughout the core.
    pub(crate) fn durable_reached(
        &mut self,
        op: OpId,
        result: Result<u64, Failure>,
        source: ProofSource,
        effects: &mut Vec<Effect>,
    ) {
        let Some(gate) = self.barriers.get(&op) else {
            return;
        };
        let proven = matches!(result, Ok(durable) if durable >= gate.position);
        // A bucket proof reveals nothing until an ownership read confirms the
        // record still names this node at this epoch: "durable in `e<epoch>/`" is not
        // durable if the prefix was orphaned, and the bucket cannot refuse a
        // stale writer. A fleet proof needs no read — the ensemble
        // arbitrated it: a takeover seals a member before restoring, so a
        // stale owner's ack-all fails closed.
        if proven && source == ProofSource::Bucket {
            let (cell, epoch) = (gate.cell.clone(), gate.epoch);
            effects.push(Effect::VerifyOwnership { op, cell, epoch });
            return;
        }
        self.settle_gate(op, proven, effects);
    }

    /// Ownership verification for a bucket-proof gate. A record that no longer
    /// names this node at this epoch fails the write exactly like an unproven
    /// durability result: refuse and reset, never acknowledge into an
    /// orphaned lineage.
    pub(crate) fn ownership_verified(
        &mut self,
        op: OpId,
        result: Result<(), Failure>,
        effects: &mut Vec<Effect>,
    ) {
        if !self.barriers.contains_key(&op) {
            return;
        }
        self.settle_gate(op, result.is_ok(), effects);
    }

    /// Release one withheld output, unpinning it first so the cleanup that
    /// ends -- shedding, eviction -- is queued ahead of the release.
    fn release_held(
        &mut self,
        held: Held,
        result: Result<(), RequestError>,
        effects: &mut Vec<Effect>,
    ) {
        if self.gate_pinned.remove(&held.request) {
            self.activity_finished(held.request, effects);
        }
        effects.push(Effect::Release {
            request: held.request,
            channel: held.channel,
            result,
        });
    }

    fn settle_gate(&mut self, op: OpId, proven: bool, effects: &mut Vec<Effect>) {
        let Some(gate) = self.barriers.remove(&op) else {
            return;
        };
        let result = if proven {
            Ok(())
        } else {
            Err(RequestError::DurabilityUnproven)
        };
        match gate.owner {
            // Unpin before releasing: the cleanup this ends -- shedding,
            // eviction -- is queued ahead of the response, so a caller that
            // sees its write acknowledged sees the residency it released too.
            // `activity_finished` re-checks the barrier map, so a request
            // holding a second gated write simply re-pins itself here.
            GateOwner::Output(held) => self.release_held(held, result, effects),
            // The alarm settles only now. A proven commit replays the
            // observation the handler made, which routes through
            // `alarm_observed` and orders the consume-side wake-entry delete
            // -- after the proof, by construction. An unproven one takes the
            // re-arm branch a failed handler takes, so the entry stays
            // discoverable and at-least-once holds. The replay carries no
            // position, so it settles rather than opening a second barrier.
            GateOwner::Alarm {
                alarm,
                at_ms,
                covered,
            } => {
                let outcome = if proven {
                    Ok((at_ms, covered, None))
                } else {
                    Err(Failure::Ambiguous)
                };
                let (now_ms, now_mono_ms) = (self.now_ms, self.now_mono_ms);
                self.alarm_finished(
                    alarm,
                    (gate.cell.clone(), gate.epoch),
                    now_ms,
                    now_mono_ms,
                    outcome,
                    effects,
                );
            }
        }
        // A follower is always an output: an alarm opens a barrier, it never
        // trails one.
        for held in gate.followers {
            self.release_held(held, result, effects);
        }
        if !proven {
            let (id, epoch) = (gate.cell.clone(), gate.epoch);
            self.reset_cell(&id, epoch, effects);
        }
    }
}
