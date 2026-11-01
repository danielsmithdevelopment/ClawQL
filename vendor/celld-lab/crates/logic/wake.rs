// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Immutable alarm publications and the retirement frontier, without I/O.
//!
//! A committed installation owns one key for its entire lifetime. Cleanup
//! only deletes identities below a proved SQLite frontier, so an unresolved
//! old DELETE cannot name a later installation. LIST, rather than successful
//! callbacks, supplies the cleanup inventory after a lost response or restart.
use super::Ms;
use std::collections::{BTreeMap, HashMap};

/// A SQLite writer epoch and its persistent, non-repeating alarm sequence.
/// A publication always belongs to a positive ownership epoch. A listed
/// migration seed uses zero and is older than every real installation.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct PublicationId {
    pub epoch: u64,
    pub sequence: u64,
}

impl std::fmt::Display for PublicationId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:016x}-{:016x}", self.epoch, self.sequence)
    }
}

impl PublicationId {
    pub fn parse(value: &str) -> Option<Self> {
        let (epoch, sequence) = value.split_once('-')?;
        if epoch.len() != 16 || sequence.len() != 16 {
            return None;
        }
        let id = Self {
            epoch: u64::from_str_radix(epoch, 16).ok()?,
            sequence: u64::from_str_radix(sequence, 16).ok()?,
        };
        (id.epoch > 0 && id.to_string() == value).then_some(id)
    }
}

/// The write position and publication identity sampled from one committed
/// SQLite connection. A mailbox must carry this value, not sample it again.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AlarmSource {
    pub id: PublicationId,
    pub position: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AlarmSnapshot {
    at_ms: Option<Ms>,
    source: Option<AlarmSource>,
}

impl AlarmSnapshot {
    pub fn without_wake(at_ms: Option<Ms>) -> Self {
        Self {
            at_ms,
            source: None,
        }
    }

    pub fn committed(at_ms: Option<Ms>, source: AlarmSource) -> Self {
        Self {
            at_ms,
            source: Some(source),
        }
    }

    pub fn at_ms(self) -> Option<Ms> {
        self.at_ms
    }

    pub fn source(self) -> Option<AlarmSource> {
        self.source
    }

    /// Other SQLite writes can advance a position without installing an alarm.
    pub fn same_installation(self, other: Self) -> bool {
        self.at_ms == other.at_ms && self.source.map(|s| s.id) == other.source.map(|s| s.id)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Publication {
    pub key: String,
    pub alarm: AlarmSnapshot,
}

/// A projection of durable SQLite truth. The executor must prove replication,
/// ownership, and replacement publication before it writes this certificate.
/// A stale certificate is conservative: it protects every later identity,
/// including an installation whose PUT is still in progress.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Retirement {
    pub id: PublicationId,
    pub at_ms: Option<Ms>,
}

impl Retirement {
    pub fn retires(self, candidate: PublicationId) -> bool {
        candidate < self.id || (candidate == self.id && self.at_ms.is_none())
    }
}

/// A bounded cache of confirmed publications. Recent keys allow eager cleanup
/// even when observations coalesce. LIST remains the complete inventory after
/// overflow, cancellation, lost responses, or restart; no arm waits for DELETE.
#[derive(Default)]
pub struct WakeCore {
    confirmed: HashMap<String, BTreeMap<PublicationId, AlarmSnapshot>>,
}

impl WakeCore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn publication(&self, cell: &str, alarm: AlarmSnapshot) -> Option<Publication> {
        let due_ms = alarm.at_ms?;
        let source = alarm.source?;
        if due_ms < 0 || source.id.epoch == 0 || self.covered(cell, alarm) {
            return None;
        }
        Some(Publication {
            key: entry_key(due_ms, cell, source.id),
            alarm,
        })
    }

    /// A completion never replaces a newer installation's cache entry.
    pub fn confirm(&mut self, cell: &str, alarm: AlarmSnapshot) {
        let Some(source) = alarm.source else { return };
        if alarm.at_ms.is_some() {
            // A stalled durability proof must not accumulate an unbounded
            // queue. Retain the newest identities, including current coverage.
            const RECENT_PUBLICATIONS: usize = 32;
            let recent = self.confirmed.entry(cell.to_string()).or_default();
            recent.insert(source.id, alarm);
            while recent.len() > RECENT_PUBLICATIONS {
                recent.pop_first();
            }
        }
    }

    pub fn covered(&self, cell: &str, alarm: AlarmSnapshot) -> bool {
        alarm.at_ms.is_some()
            && alarm.source.is_some()
            && self
                .confirmed
                .get(cell)
                .and_then(|recent| recent.last_key_value())
                .is_some_and(|(_, confirmed)| confirmed.same_installation(alarm))
    }

    /// Drain only identities below the proven frontier. Forgetting a candidate
    /// before its DELETE finishes is safe because the collector can rediscover it.
    pub fn take_retired(&mut self, cell: &str, retirement: Retirement) -> Vec<String> {
        let mut keys = Vec::new();
        if let Some(recent) = self.confirmed.get_mut(cell) {
            recent.retain(|id, alarm| {
                if retirement.retires(*id) {
                    keys.push(entry_key(alarm.at_ms.unwrap(), cell, *id));
                    false
                } else {
                    true
                }
            });
        }
        keys
    }

    pub fn forget(&mut self, cell: &str) {
        self.confirmed.remove(cell);
    }
}

/// Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
pub(crate) fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

/// The time bucket a due timestamp falls in: minute precision, UTC,
/// lexicographically ordered so the waker LISTs due buckets in order.
fn minute_bucket(due_ms: i64) -> String {
    let mins = due_ms.div_euclid(60_000);
    let (y, mo, d) = civil_from_days(mins.div_euclid(1440));
    let m = mins.rem_euclid(1440);
    format!("{y:04}-{mo:02}-{d:02}T{:02}:{:02}", m / 60, m % 60)
}

fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = y - i64::from(m <= 2);
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = i64::from(if m > 2 { m - 3 } else { m + 9 });
    let doy = (153 * mp + 2) / 5 + i64::from(d) - 1;
    era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468
}

/// The due-minute floor a `YYYY-MM-DDTHH:MM` bucket names, in ms.
fn parse_minute(minute: &str) -> Option<i64> {
    if minute.len() != 16 {
        return None;
    }
    let y: i64 = minute.get(0..4)?.parse().ok()?;
    let mo: u32 = minute.get(5..7)?.parse().ok()?;
    let d: u32 = minute.get(8..10)?.parse().ok()?;
    let h: i64 = minute.get(11..13)?.parse().ok()?;
    let mi: i64 = minute.get(14..16)?.parse().ok()?;
    if minute.get(4..5)? != "-"
        || minute.get(7..8)? != "-"
        || minute.get(10..11)? != "T"
        || minute.get(13..14)? != ":"
        || !(1..=12).contains(&mo)
        || !(1..=31).contains(&d)
        || !(0..24).contains(&h)
        || !(0..60).contains(&mi)
    {
        return None;
    }
    let ms = (days_from_civil(y, mo, d) * 1440 + h * 60 + mi) * 60_000;
    (minute_bucket(ms) == minute).then_some(ms)
}

pub const ENTRY_PREFIX: &str = "wake/entries/";

pub fn entry_key(due_ms: i64, cell: &str, id: PublicationId) -> String {
    format!("{ENTRY_PREFIX}{}/{cell}/{id}", minute_bucket(due_ms))
}

/// An offline inventory hint, never an alarm installation. Its distinct name
/// cannot collide with a writer or be removed by a legacy minute-key DELETE.
pub fn migration_seed_key(cell: &str) -> String {
    format!("{ENTRY_PREFIX}1970-01-01T00:00/{cell}/migration")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListedEntry {
    pub minute_ms: i64,
    pub cell: String,
    pub id: PublicationId,
}

/// Reject malformed identities and scopes before they can reach ownership.
pub fn parse_entry_key(key: &str) -> Option<ListedEntry> {
    let rest = key.strip_prefix(ENTRY_PREFIX)?;
    let mut parts = rest.split('/');
    let minute = parts.next()?;
    let cell = parts.next()?;
    let identity = parts.next()?;
    let id = if identity == "migration" && minute == "1970-01-01T00:00" {
        PublicationId {
            epoch: 0,
            sequence: 0,
        }
    } else {
        PublicationId::parse(identity)?
    };
    if parts.next().is_some() || !crate::cell::valid_cell_scope(cell) {
        return None;
    }
    Some(ListedEntry {
        minute_ms: parse_minute(minute)?,
        cell: cell.to_string(),
        id,
    })
}

pub fn parse_minute_prefix(prefix: &str) -> Option<i64> {
    parse_minute(prefix.strip_prefix(ENTRY_PREFIX)?.trim_end_matches('/'))
}

/// May this node take the singleton waker-role lease — because it already holds
/// it, or the current holder's lease has expired? An exactly-expired lease MUST
/// be claimable (`<=`, not `<`): the waker is a SINGLE role, so a claim that
/// stalls on the boundary leaves every evicted cell's alarm unwoken until
/// some other node happens to reclaim.
pub fn waker_may_claim(held_by_us: bool, expires_ms: Ms, now_ms: Ms) -> bool {
    held_by_us || expires_ms <= now_ms
}

/// The elected waker's decision for one due entry once it has read the
/// cell's owner record: does this node need to send the `Fleet` hint?
///
/// A live owner fires its own alarms. A resident cell fires from the owner's
/// timer, and a dormant one wakes from the owner's own due scan, which sends
/// it an `Owned` hint. The elected waker's hint is for everything else: a
/// cell nobody owns, a cell whose owner's lease has run out, and a cell this
/// node owns itself. Hinting a live owner's cell risks nothing (the core never
/// steals), but it costs the elected node an activation permit and an owner
/// read per entry, for the whole fleet's due set, every tick.
pub fn elected_hint_needed(owner: Option<&str>, node: &str, owner_live: bool) -> bool {
    match owner {
        None => true,
        Some(owner) if owner == node => true,
        Some(_) => !owner_live,
    }
}
