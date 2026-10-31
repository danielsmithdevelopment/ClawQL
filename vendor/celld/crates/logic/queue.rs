// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Cloudflare Queue policy, reified sans I/O.
//!
//! A queue is one reserved cell. The cell owns SQL and dispatch, while this
//! module owns the values and transitions that another caller must reproduce:
//! the stable address, the public bounds, the alarm deadline, concurrency
//! admission, retry timing, lease-generation advancement, settlement fencing,
//! purge classification, and deploy-time configuration validation.
//!
//! The lease generation travels in [`PlannedLease`]. A caller cannot select a
//! row and then forget to advance its generation, because this module never
//! returns a bare sequence number for a deliverable row. That prevents a late
//! settlement from an expired lease from acknowledging a newer delivery.

use crate::Ms;

/// The runtime-supplied Durable Object class that stores every queue.
pub const RESERVED_CLASS: &str = "__Queue";

/// Cloudflare measures a Queue kilobyte as 1000 bytes.
pub const MAX_MESSAGE_BYTES: usize = 128_000;
pub const MAX_SEND_BATCH_BYTES: usize = 256_000;
pub const MAX_BATCH_MESSAGES: usize = 100;
pub const MAX_BATCH_TIMEOUT_SECONDS: u16 = 60;
pub const MAX_RETRIES: u16 = 100;
pub const MAX_CONCURRENCY: u16 = 250;
pub const MAX_DELAY_SECONDS: u32 = 86_400;

pub const DEFAULT_MAX_BATCH_SIZE: u16 = 10;
pub const DEFAULT_MAX_BATCH_TIMEOUT_SECONDS: u16 = 5;
pub const DEFAULT_MAX_RETRIES: u16 = 3;

/// Queue retention is deployment-independent in celld v1. Wrangler has no
/// configuration key for it, so accepting one would make a celld project
/// invalid on Cloudflare.
pub const RETENTION_MS: Ms = 4 * 24 * 60 * 60 * 1000;

/// The Durable Object name that `getByName` hashes for a queue.
///
/// The identity function is intentional. The queue name is already the
/// fleet-wide resource identity, and prefixing it here would make a project
/// address a different queue from Cloudflare. Both the binding and the
/// operator CLI call this function before the runtime applies the namespace
/// HMAC, so even an identity address has one source.
pub fn cell_name(queue_name: &str) -> &str {
    queue_name
}

/// Choose the one durable alarm from every Queue deadline.
///
/// A deadline already past becomes `now`. SQLite can retain an overdue row
/// across a crash, and installing its old timestamp as a new alarm can leave
/// the wake index behind the clock instead of scheduling immediate work.
pub fn rearm(
    now: Ms,
    batch_deadline: Option<Ms>,
    earliest_visible: Option<Ms>,
    earliest_lease_expiry: Option<Ms>,
    next_sweep: Option<Ms>,
) -> Option<Ms> {
    [
        batch_deadline,
        earliest_visible,
        earliest_lease_expiry,
        next_sweep,
    ]
    .into_iter()
    .flatten()
    .min()
    .map(|deadline| deadline.max(now))
}

/// Resolve a retry deadline from Cloudflare's precedence rule.
///
/// A per-message or per-batch delay wins, including an explicit zero. The
/// configured consumer delay is a fixed default; it does not compound with
/// the attempt number. Cloudflare documents exponential backoff as code an
/// application can implement with `message.attempts`, not as broker behavior.
pub fn retry_at(now: Ms, explicit_seconds: Option<u32>, configured_seconds: Option<u32>) -> Ms {
    let seconds = explicit_seconds.or(configured_seconds).unwrap_or(0);
    now.saturating_add(Ms::from(seconds).saturating_mul(1000))
}

/// Whether a failed current delivery has spent the configured retry count.
///
/// `attempt` is one for the first delivery. `max_retries = 3` therefore allows
/// attempts one through four, and the fourth failure exhausts the message.
pub fn exhausted(attempt: u16, max_retries: u16) -> bool {
    attempt > max_retries
}

/// The durable transition owed when one persisted lease expires.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ExpiredLease {
    /// The delivery that just failed. The first delivery is attempt one.
    pub attempt: u16,
    pub action: ExpiredLeaseAction,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExpiredLeaseAction {
    RetryAt(Ms),
    Exhausted,
    DeletePurged,
}

/// Spend one failed delivery and decide what replaces its expired lease.
///
/// Purge wins over retry because a purge is irreversible. Otherwise the same
/// fixed consumer delay and retry ceiling used by an explicit settlement
/// apply to a consumer that did not settle before its lease deadline.
pub fn expire_lease(
    now: Ms,
    prior_failures: u16,
    max_retries: u16,
    configured_delay_seconds: Option<u32>,
    purge_on_settle: bool,
) -> ExpiredLease {
    let attempt = prior_failures.saturating_add(1);
    let action = if purge_on_settle {
        ExpiredLeaseAction::DeletePurged
    } else if exhausted(attempt, max_retries) {
        ExpiredLeaseAction::Exhausted
    } else {
        ExpiredLeaseAction::RetryAt(retry_at(now, None, configured_delay_seconds))
    };
    ExpiredLease { attempt, action }
}

/// The fixed lifetime of one persisted Queue lease.
///
/// Admission, handler execution, and settlement each have a runtime-enforced
/// budget. A lease must cover all three or a live consumer can be reclaimed.
/// The broker stores the resulting absolute deadline once, so a restart or a
/// configuration change cannot lengthen an existing lease.
pub fn lease_duration_ms(admission_wait_ms: Ms, handler_budget_ms: Ms, settle_budget_ms: Ms) -> Ms {
    admission_wait_ms
        .saturating_add(handler_budget_ms)
        .saturating_add(settle_budget_ms)
}

/// The row facts needed to plan one lease transaction.
///
/// The SQL query supplies rows in its chosen best-effort delivery order. This
/// function preserves that order and never upgrades it into a FIFO promise.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BatchRow {
    pub seq: i64,
    pub visible_at: Ms,
    pub lease_generation: u64,
    pub leased_until: Option<Ms>,
    /// Purge marks a live lease and lets its consumer finish. The row is
    /// deleted when the lease settles or expires, and is never redelivered.
    pub purge_on_settle: bool,
}

/// A row and the generation the new consumer must settle.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PlannedLease {
    pub seq: i64,
    pub generation: u64,
    /// True when the previous lease expired. The cell increments the failed
    /// attempt in the same transaction that installs this generation.
    pub reclaimed: bool,
}

/// One message identity captured by a Queue lease.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LeaseMember<'a> {
    pub seq: i64,
    pub message_id: &'a str,
    pub generation: u64,
}

/// Decide whether a settlement names the complete current lease batch.
///
/// A consumer can retain an old settlement after the broker has re-leased a
/// message. The lease ID selects the candidate rows, and this comparison then
/// fences every member by its message identity, sequence, and generation. A
/// complete one-to-one match also rejects a truncated or duplicated batch.
pub fn settlement_matches(current: &[LeaseMember<'_>], submitted: &[LeaseMember<'_>]) -> bool {
    if current.is_empty() || current.len() != submitted.len() {
        return false;
    }
    if current.iter().enumerate().any(|(index, member)| {
        current[..index]
            .iter()
            .any(|prior| prior.message_id == member.message_id)
    }) {
        return false;
    }

    let mut matched = vec![false; current.len()];
    for submitted in submitted {
        let Some((index, _)) = current.iter().enumerate().find(|(index, current)| {
            !matched[*index]
                && current.message_id == submitted.message_id
                && current.seq == submitted.seq
                && current.generation == submitted.generation
        }) else {
            return false;
        };
        matched[index] = true;
    }
    true
}

/// Decide whether another batch lease fits the configured concurrency bound.
///
/// `active_batches` counts persisted lease IDs, not completed settlements. A
/// consumer batch occupies its slot from lease installation until settlement
/// or expiry removes the lease.
pub fn can_install_lease(active_batches: usize, max_concurrency: u16) -> bool {
    active_batches < usize::from(max_concurrency)
}

/// The lease fact needed to classify one row during a Queue purge.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PurgeRow {
    pub seq: i64,
    pub lease_id_present: bool,
    pub leased_until: Option<Ms>,
}

/// All mutations one purge transaction owes.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PurgePlan {
    /// Rows with no live lease can be deleted immediately.
    pub delete: Vec<i64>,
    /// Rows with a live lease remain until settlement or expiry.
    pub mark_for_settle: Vec<i64>,
}

/// Partition Queue rows without deleting a row under a live consumer.
pub fn purge_plan(now: Ms, rows: &[PurgeRow]) -> PurgePlan {
    let mut plan = PurgePlan::default();
    for row in rows {
        if row.lease_id_present && row.leased_until.is_some_and(|until| until > now) {
            plan.mark_for_settle.push(row.seq);
        } else {
            plan.delete.push(row.seq);
        }
    }
    plan
}

/// All mutations one batch-planning transaction owes.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BatchPlan {
    pub leases: Vec<PlannedLease>,
    /// Purged rows remain while a live consumer can still settle them. Once
    /// that lease expires, deletion replaces reclamation and redelivery.
    pub delete_purged: Vec<i64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlanError {
    GenerationExhausted { seq: i64 },
}

impl std::fmt::Display for PlanError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::GenerationExhausted { seq } => {
                write!(f, "queue message {seq} exhausted its lease generation")
            }
        }
    }
}

impl std::error::Error for PlanError {}

/// Select visible, unleased rows and reclaim expired leases under a new
/// generation. A live lease is never returned.
pub fn batch_plan(
    now: Ms,
    rows: &[BatchRow],
    max_batch_size: usize,
) -> Result<BatchPlan, PlanError> {
    let mut plan = BatchPlan::default();
    for row in rows {
        let live_lease = row.leased_until.is_some_and(|until| until > now);
        if row.purge_on_settle {
            if !live_lease {
                plan.delete_purged.push(row.seq);
            }
            continue;
        }
        if plan.leases.len() >= max_batch_size || row.visible_at > now || live_lease {
            continue;
        }
        let generation = row
            .lease_generation
            .checked_add(1)
            .ok_or(PlanError::GenerationExhausted { seq: row.seq })?;
        plan.leases.push(PlannedLease {
            seq: row.seq,
            generation,
            reclaimed: row.leased_until.is_some(),
        });
    }
    Ok(plan)
}

/// The Wrangler Queue values whose bounds celld enforces at deploy time.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct QueueConfig {
    pub max_batch_size: u16,
    pub max_batch_timeout_seconds: u16,
    pub max_retries: u16,
    pub max_concurrency: Option<u16>,
    pub delivery_delay_seconds: u32,
    pub retry_delay_seconds: Option<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ConfigError {
    pub field: &'static str,
    pub message: &'static str,
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} {}", self.field, self.message)
    }
}

impl std::error::Error for ConfigError {}

/// Validate the Queue bounds that a bad deployment must report up front.
pub fn validate_config(config: &QueueConfig) -> Result<(), ConfigError> {
    let fail = |field, message| ConfigError { field, message };
    if !(1..=MAX_BATCH_MESSAGES as u16).contains(&config.max_batch_size) {
        return Err(fail("max_batch_size", "must be between 1 and 100"));
    }
    if config.max_batch_timeout_seconds > MAX_BATCH_TIMEOUT_SECONDS {
        return Err(fail(
            "max_batch_timeout",
            "must be between 0 and 60 seconds",
        ));
    }
    if config.max_retries > MAX_RETRIES {
        return Err(fail("max_retries", "must be between 0 and 100"));
    }
    if config
        .max_concurrency
        .is_some_and(|value| !(1..=MAX_CONCURRENCY).contains(&value))
    {
        return Err(fail("max_concurrency", "must be between 1 and 250"));
    }
    if config.delivery_delay_seconds > MAX_DELAY_SECONDS {
        return Err(fail(
            "delivery_delay",
            "must be between 0 and 86400 seconds",
        ));
    }
    if config
        .retry_delay_seconds
        .is_some_and(|value| value > MAX_DELAY_SECONDS)
    {
        return Err(fail("retry_delay", "must be between 0 and 86400 seconds"));
    }
    Ok(())
}
