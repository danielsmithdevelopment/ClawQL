// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! The gray-follower eviction policy (sans-IO), the log tier's answer to
//! write-all's classic price: one slow follower stalls every ack, so the
//! leader evicts on suspicion and the empty-join reconfiguration makes a
//! false positive cost one flush plus one CAS.
//!
//! The decision: evict a follower
//! whose windowed append-latency tail exceeds
//! `max(absolute budget, k x sibling median)` sustained for a short
//! window, or whose single append has been outstanding past a hard
//! backstop. Flapping is bounded by rate-capping reconfigurations, not by
//! excluding the evicted member: slowness is transient and the latency rule
//! can judge it again. A member that cannot serve appends at all is a
//! different case and does sit out a term, because no latency verdict can
//! see it.
//! The executor feeds observations and performs the swap; nothing here
//! performs I/O or reads a clock.

use std::collections::BTreeMap;
use std::collections::VecDeque;

use crate::NodeId;

/// The constants are E8 targets, not commitments: the lab sweep measures
/// them, and the env overrides exist so it can.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EvictionPolicy {
    /// The absolute tail budget: a follower slower than this is suspect
    /// regardless of its sibling.
    pub budget_ms: u64,
    /// The relative signal: suspect when the windowed median exceeds this
    /// multiple of the sibling's windowed median.
    pub sibling_factor: u64,
    /// How long the windowed median must stay over budget before the
    /// evict fires — one slow fsync is not a dying disk, and a median
    /// cannot be captured by a single outlier the way a tail quantile is.
    pub sustain_ms: u64,
    /// The hard backstop: any single append outstanding this long evicts
    /// immediately, sustain or none. The default covers the measured
    /// append tail, not a guess: the S5c kill-validation corpus's worst
    /// uncensored append is 923 ms with the tail right-censored above the
    /// old 400 ms deadline (issue #295), and the 2026-08-24 stream-fleet
    /// verification took the same fleet from two gray evictions of
    /// healthy members and 14.5% bucket-proof acks at 400 ms to zero and
    /// 0.94% at this value. A truly dead member still evicts well inside
    /// the 2 s sustain path's patience.
    pub backstop_ms: u64,
    /// How long a follower that cannot serve appends sits out recruitment.
    /// This is the incapability term only; a gray follower is not excluded
    /// by a clock (see `FollowerHealth::evicted`).
    pub quarantine_ms: u64,
    /// At most one eviction-driven reconfiguration per interval.
    pub min_swap_interval_ms: u64,
    /// The sliding window the medians are computed over.
    pub window_ms: u64,
    /// The fewest window samples a median may rest on before the sustain
    /// rule may judge it. The 2026-08-26 overload ledger caught a healthy
    /// member evicted on ONE 56 ms sample that a quiet window then held as
    /// its "median" for the whole sustain; a single outlier is exactly what
    /// the median exists to ignore, and one sample is no median at all.
    pub min_samples: usize,
    /// The stream hedge never arms below this, so a quiet window cannot
    /// produce a hair trigger. Above the measured loaded honest service
    /// p99 (~72 ms at 3,000 writes/s on the NVMe lab fleet, 2026-08-25)
    /// with margin; the fixed 50 ms it replaces sat inside that tail and
    /// its constant fires amplified into reseal churn (the
    /// log-hedge-deadline design).
    pub hedge_floor_ms: u64,
    /// The hedge multiple of the fleet's windowed worst honest append —
    /// the sibling-factor spirit: honest variance is bounded by a small
    /// multiple of recently observed service.
    pub hedge_factor: u64,
}

impl Default for EvictionPolicy {
    fn default() -> Self {
        EvictionPolicy {
            budget_ms: 25,
            sibling_factor: 4,
            sustain_ms: 2_000,
            backstop_ms: 1_500,
            quarantine_ms: 300_000,
            min_swap_interval_ms: 10_000,
            window_ms: 3_000,
            min_samples: 5,
            hedge_floor_ms: 250,
            hedge_factor: 4,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    Healthy,
    /// Over budget, sustain running; the executor need not act yet.
    Suspect,
    /// Swap this member out now.
    Evict,
}

/// Everything `verdict` computed on the way to its answer, so the executor
/// can log WHY a member was evicted instead of only that it was. The
/// 2026-08-26 overload investigation had to reconstruct these offline from
/// completed-append samples — and could not, because a backstop eviction's
/// evidence is precisely the append that never completed.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct VerdictDetail {
    /// `"backstop"`, `"sustain"`, or `""` when healthy.
    pub rule: &'static str,
    /// How long the current in-flight append has been outstanding.
    pub outstanding_ms: u64,
    /// The member's windowed median and how many samples it rests on.
    pub own_median_ms: Option<u64>,
    pub samples: usize,
    /// The fastest sibling's windowed median, if any sibling has one.
    pub sibling_median_ms: Option<u64>,
    /// `max(budget, sibling_factor x sibling median)`.
    pub threshold_ms: u64,
    /// How long the median has stayed over the threshold.
    pub suspect_ms: u64,
}

#[derive(Clone, Debug, Default)]
struct MemberHealth {
    /// (completed_at_ms, latency_ms), oldest first, pruned to the window.
    samples: VecDeque<(u64, u64)>,
    /// When the current in-flight append started, if one is out.
    outstanding_since: Option<u64>,
    /// When the windowed median first exceeded the threshold, while it
    /// has stayed exceeded.
    suspect_since: Option<u64>,
}

impl MemberHealth {
    fn prune(&mut self, now_ms: u64, window_ms: u64) {
        while let Some((at, _)) = self.samples.front() {
            if at.saturating_add(window_ms) < now_ms {
                self.samples.pop_front();
            } else {
                break;
            }
        }
    }

    fn median_ms(&self) -> Option<u64> {
        if self.samples.is_empty() {
            return None;
        }
        let mut sorted: Vec<u64> = self.samples.iter().map(|(_, ms)| *ms).collect();
        sorted.sort_unstable();
        Some(sorted[sorted.len() / 2])
    }
}

/// The tracker for one ensemble's followers. Survives shipper swaps on the
/// executor side; `reset` starts a fresh ensemble's bookkeeping while the
/// quarantine ledger persists across it.
#[derive(Clone, Debug, Default)]
pub struct FollowerHealth {
    members: BTreeMap<NodeId, MemberHealth>,
    quarantined_until: BTreeMap<NodeId, u64>,
    last_swap_ms: Option<u64>,
}

impl FollowerHealth {
    /// A new ensemble: drop the members' windows, keep the quarantine
    /// ledger — it is exactly the memory that stops flapping.
    pub fn reset(&mut self) {
        self.members.clear();
    }

    /// Return the completion time and latency for each recorded append.
    #[cfg(celld_internal_tests)]
    pub fn append_samples_for_test(&self, member: &str) -> Vec<(u64, u64)> {
        self.members
            .get(member)
            .map(|health| health.samples.iter().copied().collect())
            .unwrap_or_default()
    }

    /// An append POST went out to `member`.
    pub fn append_started(&mut self, member: &str, now_ms: u64) {
        let health = self.members.entry(member.to_string()).or_default();
        health.outstanding_since.get_or_insert(now_ms);
    }

    /// The append completed (ok or not) after `latency_ms`.
    pub fn append_completed(&mut self, member: &str, now_ms: u64, latency_ms: u64) {
        let health = self.members.entry(member.to_string()).or_default();
        health.outstanding_since = None;
        health.samples.push_back((now_ms, latency_ms));
    }

    /// The eviction decision for `member`, judged against its sibling's
    /// windowed median. The executor calls this per member per tick (and
    /// on every completion) and swaps on the first `Evict`.
    pub fn verdict(
        &mut self,
        policy: &EvictionPolicy,
        member: &str,
        siblings: &[NodeId],
        now_ms: u64,
    ) -> Verdict {
        self.verdict_detailed(policy, member, siblings, now_ms).0
    }

    /// `verdict` with its evidence.
    pub fn verdict_detailed(
        &mut self,
        policy: &EvictionPolicy,
        member: &str,
        siblings: &[NodeId],
        now_ms: u64,
    ) -> (Verdict, VerdictDetail) {
        let mut detail = VerdictDetail::default();
        let sibling_median = siblings
            .iter()
            .filter(|sibling| sibling.as_str() != member)
            .filter_map(|sibling| {
                let health = self.members.get_mut(sibling)?;
                health.prune(now_ms, policy.window_ms);
                health.median_ms()
            })
            .min();
        detail.sibling_median_ms = sibling_median;
        let Some(health) = self.members.get_mut(member) else {
            return (Verdict::Healthy, detail);
        };
        if let Some(since) = health.outstanding_since {
            detail.outstanding_ms = now_ms.saturating_sub(since);
            if detail.outstanding_ms >= policy.backstop_ms {
                detail.rule = "backstop";
                return (Verdict::Evict, detail);
            }
        }
        health.prune(now_ms, policy.window_ms);
        detail.samples = health.samples.len();
        let Some(own_median) = health.median_ms() else {
            return (Verdict::Healthy, detail);
        };
        detail.own_median_ms = Some(own_median);
        // Too few samples for a median to mean anything: not a verdict.
        // The suspect clock does not run either — a member that goes quiet
        // after one slow sample must not accrue sustain time on it.
        if detail.samples < policy.min_samples {
            health.suspect_since = None;
            return (Verdict::Healthy, detail);
        }
        // A lone survivor has no relative signal, and the absolute budget
        // alone was tuned as a floor under the sibling comparison, not as
        // a verdict by itself: judging the last member against it is the
        // cascade that empties an ensemble (the churn run's sixth eviction).
        if sibling_median.is_none() && siblings.iter().any(|s| s.as_str() != member) {
            health.suspect_since = None;
            return (Verdict::Healthy, detail);
        }
        let threshold = sibling_median
            .map(|median| median.saturating_mul(policy.sibling_factor))
            .unwrap_or(0)
            .max(policy.budget_ms);
        detail.threshold_ms = threshold;
        if own_median <= threshold {
            health.suspect_since = None;
            return (Verdict::Healthy, detail);
        }
        let since = *health.suspect_since.get_or_insert(now_ms);
        detail.suspect_ms = now_ms.saturating_sub(since);
        if detail.suspect_ms >= policy.sustain_ms {
            detail.rule = "sustain";
            (Verdict::Evict, detail)
        } else {
            (Verdict::Suspect, detail)
        }
    }

    /// Record the eviction and stamp the swap for the rate cap. A gray
    /// member is NOT quarantined.
    ///
    /// Slowness is transient and re-measurable, so excluding a member by a
    /// clock decides in advance something the latency rule can decide again
    /// on evidence. In-sync replica sets do not do it either: a lagging Kafka
    /// replica rejoins its ISR as soon as it catches up, and the lag rule is
    /// the whole membership test.
    ///
    /// It also cost us. An ensemble is at most two followers and a fleet
    /// smaller than four nodes has no spare, so quarantining the evicted
    /// member left nothing to recruit and every acknowledgement fell to the
    /// bucket for the whole term. A measured A/B that varied only this term
    /// on one three-node fleet read 906 ms at 300 s against 22 ms at 5 s,
    /// with identical eviction counts in both arms: the evictions came from
    /// load, and only the recovery differed.
    ///
    /// `min_swap_interval_ms` remains the anti-flap bound, and it is the one
    /// that belongs here — it limits how often the ensemble may change, which
    /// is the cost being avoided, rather than pre-judging which member is
    /// fit. Incapability still quarantines: see `append_incapable`, whose
    /// member cannot be judged by the latency rule at all.
    pub fn evicted(&mut self, policy: &EvictionPolicy, member: &str, now_ms: u64) {
        let _ = policy;
        self.members.remove(member);
        self.last_swap_ms = Some(now_ms);
    }

    /// The member answered an append with a protocol-level rejection a
    /// healthy follower cannot produce: the route is missing, or the
    /// response does not parse — a binary that does not speak the log
    /// tier (the 0.2.x rolling-upgrade seam). The latency verdicts are
    /// blind to this member, because its rejection is FAST and reads as
    /// a healthy sample, so recruiting re-picks it forever and the
    /// posture flaps once per repair tick. Incapability therefore feeds
    /// the quarantine directly: the member sits out `quarantine_ms` and
    /// the next rebuild recruits around it, or parks when no capable
    /// peer remains. An epoch refusal (`ok: false` in a well-formed
    /// response) is NOT incapability — a sealed or reconfigured
    /// follower answers that way and recruits fine at the next epoch.
    /// No `last_swap_ms` here: this is not an eviction-driven swap, and
    /// the rebuild that follows must not be rate-limited away from the
    /// capable peers that remain.
    pub fn append_incapable(&mut self, policy: &EvictionPolicy, member: &str, now_ms: u64) {
        self.quarantined_until.insert(
            member.to_string(),
            now_ms.saturating_add(policy.quarantine_ms),
        );
        self.members.remove(member);
    }

    /// May an eviction-driven swap happen now? A failed follower (a hard
    /// error, not a gray tail) bypasses this — that swap is v0's existing
    /// degrade path and correctness needs it regardless of cadence.
    pub fn swap_allowed(&self, policy: &EvictionPolicy, now_ms: u64) -> bool {
        self.last_swap_ms
            .is_none_or(|last| now_ms.saturating_sub(last) >= policy.min_swap_interval_ms)
    }

    /// The stream hedge deadline: a head frame outstanding longer than
    /// this is raced by one idempotent duplicate. Derived from the
    /// fleet's windowed worst honest append, not fixed — fleet-wide so a
    /// wedged member sticks out against its siblings and a member's own
    /// decay cannot stretch its own leash (gradual decay is the eviction
    /// machinery's case). The cap is two thirds of the backstop and the
    /// floor yields to it, so the deadline stays strictly below the
    /// backstop for every supported override — a reduced backstop
    /// (`CELLD_LOG_EVICT_BACKSTOP_MS` under the floor) must not let
    /// eviction, the expensive remedy, fire before the cheap one. A
    /// backstop under 2 ms caps the deadline at zero, which the lane reads
    /// as "no hedge": eviction is then the only remedy, by that policy.
    pub fn hedge_deadline_ms(&mut self, policy: &EvictionPolicy, now_ms: u64) -> u64 {
        let mut worst = 0_u64;
        for health in self.members.values_mut() {
            health.prune(now_ms, policy.window_ms);
            for (_, latency_ms) in &health.samples {
                worst = worst.max(*latency_ms);
            }
        }
        let cap = (policy.backstop_ms / 3).saturating_mul(2);
        let floor = policy.hedge_floor_ms.min(cap);
        policy.hedge_factor.saturating_mul(worst).clamp(floor, cap)
    }

    /// Is this candidate quarantined out of re-recruitment?
    pub fn quarantined(&self, candidate: &str, now_ms: u64) -> bool {
        self.quarantined_until
            .get(candidate)
            .is_some_and(|until| *until > now_ms)
    }

    /// Every member's append is simultaneously outstanding past the
    /// backstop: the common cause is us — our NIC, our partition — not
    /// two disks dying in the same instant. The executor degrades to
    /// bucket posture WITHOUT quarantining anyone, so recruitment
    /// recovers the moment connectivity does; quarantining every peer
    /// for our own partition held a healed fleet on the bucket floor for
    /// the full quarantine term. One member is not evidence of
    /// correlation — a single-member stall keeps the ordinary eviction.
    pub fn correlated_stall(
        &self,
        policy: &EvictionPolicy,
        members: &[NodeId],
        now_ms: u64,
    ) -> bool {
        members.len() >= 2
            && members.iter().all(|member| {
                self.members
                    .get(member)
                    .and_then(|health| health.outstanding_since)
                    .is_some_and(|since| now_ms.saturating_sub(since) >= policy.backstop_ms)
            })
    }

    /// Does this member owe an idle probe? Quiet means no append in flight
    /// and no completion within the interval — a member under real load
    /// needs no synthetic samples.
    pub fn probe_due(&self, member: &str, now_ms: u64, quiet_ms: u64) -> bool {
        let Some(health) = self.members.get(member) else {
            return true;
        };
        if health.outstanding_since.is_some() {
            return false;
        }
        health
            .samples
            .back()
            .is_none_or(|(at, _)| at.saturating_add(quiet_ms) < now_ms)
    }
}
