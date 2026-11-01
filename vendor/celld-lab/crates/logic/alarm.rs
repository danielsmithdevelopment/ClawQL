// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Alarm retry policy, reified sans-IO. After a handler fails, `celld` persists
//! a backoff in SQLite (`storage.rs`) and abandons the alarm once a bounded
//! number of limit-counting failures accrue. That schedule is a pure function
//! of the row's retry counters; storage is its executor.

use crate::Ms;

/// Failures that count toward the ceiling before the alarm is abandoned.
const RETRY_CEILING: i64 = 6;
/// Backoff base; the nth retry waits `BACKOFF_BASE_MS << min(retry, MAX_SHIFT)`.
const BACKOFF_BASE_MS: Ms = 2_000;
const MAX_BACKOFF_SHIFT: i64 = 6;

/// `retry` is the total failure count (drives the exponential backoff);
/// `counted_retry` is how many counted against the limit. `counts_against_limit`
/// is false for failures the caller excuses (e.g. a shed under pressure) — those
/// back off but never reach the ceiling. Returns the next deadline, or `None`
/// when the counted failure ceiling is reached.
pub fn alarm_retry(
    now_ms: Ms,
    retry: i64,
    counted_retry: i64,
    counts_against_limit: bool,
) -> Option<Ms> {
    if counts_against_limit && counted_retry >= RETRY_CEILING {
        None
    } else {
        let shift = retry.clamp(0, MAX_BACKOFF_SHIFT) as u32;
        let at_ms = now_ms.saturating_add(BACKOFF_BASE_MS * (1_i64 << shift));
        Some(at_ms)
    }
}
