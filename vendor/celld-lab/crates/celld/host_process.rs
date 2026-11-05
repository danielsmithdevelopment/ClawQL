//! Same-host "provably dead" checks for incarnation supersede.
//!
//! A new generation may supersede its own prior lease **only** when the
//! recorded process cannot still be running on **this** host. Cross-host
//! duplicates must wait out the lease TTL or be refused (stale-owner safety).
//!
//! # Expiry ≠ dead
//!
//! Published lease expiry permits a **fenced takeover** (epoch bump + storage
//! CAS the old owner cannot pass). It does **not** prove the owner is dead.
//! A wedged owner is alive past expiry — that is what wedged means. Eager
//! open-log recovery must not treat expiry alone as abandonment: recovering
//! while the owner is frozen mid-write can read the log before an in-flight
//! intent lands, then start a generation without that intent (stale-incarnation
//! / H2 through the sweep path).

use std::fs;
use std::path::Path;

/// Identity of the process that holds (or held) a node lease on this host.
#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct HostProcessIdentity {
    pub pid: u32,
    /// Kernel start time in clock ticks (`/proc/<pid>/stat` field 22), as a
    /// string so mixed-version readers never fail on integer width.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub process_start_ticks: String,
    /// Contents of `/proc/sys/kernel/random/boot_id` when the lease was written.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub boot_id: String,
}

/// Local observation used when judging a stamped lease identity.
///
/// Audits need **both** sides: what the predecessor lease recorded, and what
/// `/proc` showed on this host at the check. Logging only the lease fields
/// cannot prove the comparison ran.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HostProcessDeadnessObservation {
    pub lease_pid: u32,
    pub lease_process_start_ticks: String,
    pub lease_boot_id: String,
    pub observed_boot_id: Option<String>,
    pub boot_id_matches: bool,
    pub pid_dir_exists: bool,
    pub observed_process_start_ticks: Option<String>,
    /// `Some(true)` when pid exists and ticks equal the lease; `Some(false)`
    /// when pid exists and ticks differ; `None` when pid is absent / unread.
    pub start_ticks_match: Option<bool>,
    pub provably_dead: bool,
    /// Stable token for logs/audits: `pid_absent` | `start_ticks_mismatch` |
    /// `still_live` | `boot_mismatch_or_cross_host` | `pid_zero` |
    /// `boot_unreadable`.
    pub reason: &'static str,
}

/// Expiry alone: may take over only through the **fenced** path (epoch bump +
/// CAS the old owner cannot pass). Never proof the owner process is gone.
#[inline]
pub fn lease_expiry_permits_fenced_takeover(expires_ms: u64, now_ms: u64) -> bool {
    expires_ms <= now_ms
}

/// Same-host process evidence that the recorded owner is gone.
/// Never inferred from published expiry.
pub fn lease_owner_provably_dead(host_process: Option<&HostProcessIdentity>) -> bool {
    host_process.is_some_and(HostProcessIdentity::is_provably_dead_on_this_host)
}

/// Whether a node lease may be **fenced** / claimed for takeover.
///
/// - Published expiry already passed → fenceable (takeover must fence).
/// - Same-host `host_process` proves the recorded PID is gone → fenceable.
/// - Otherwise → wait TTL / refuse.
///
/// This is **not** permission to treat an open log as abandoned dead-leader
/// content — see [`lease_open_log_may_be_recovered_as_dead`].
pub fn lease_may_be_fenced(
    expires_ms: u64,
    host_process: Option<&HostProcessIdentity>,
    now_ms: u64,
) -> bool {
    lease_expiry_permits_fenced_takeover(expires_ms, now_ms)
        || lease_owner_provably_dead(host_process)
}

/// Historical name used at fence/claim call sites. Prefer [`lease_may_be_fenced`].
///
/// **Warning:** the old body treated expiry as “dead.” Call sites that recover
/// open logs must use [`lease_open_log_may_be_recovered_as_dead`] instead.
#[inline]
pub fn lease_may_be_fenced_as_dead(
    expires_ms: u64,
    host_process: Option<&HostProcessIdentity>,
    now_ms: u64,
) -> bool {
    lease_may_be_fenced(expires_ms, host_process, now_ms)
}

/// Whether eager sweep may recover an **open** log as abandoned dead-leader
/// content.
///
/// - Same-host process provably gone → yes.
/// - Same-host process still live (including wedged past expiry) → **no**.
/// - Cross-host / boot mismatch / unstamped → yes only when expiry has passed
///   (TTL + fencing is the cross-host dead proof; recovery itself fences).
///
/// Expiry alone on a same-host live owner must never return true.
pub fn lease_open_log_may_be_recovered_as_dead(
    expires_ms: u64,
    host_process: Option<&HostProcessIdentity>,
    now_ms: u64,
) -> bool {
    if lease_owner_provably_dead(host_process) {
        return true;
    }
    match host_process {
        Some(hp) => {
            let obs = hp.observe_on_this_host();
            match obs.reason {
                // Cannot observe this host's /proc for that stamp — treat like
                // cross-host: expiry + fenced recovery only.
                "boot_mismatch_or_cross_host" | "boot_unreadable" => {
                    lease_expiry_permits_fenced_takeover(expires_ms, now_ms)
                }
                // Same boot, process still there (or unreadable → fail closed live).
                "still_live" | "pid_zero" => false,
                // pid_absent / start_ticks_mismatch already returned via
                // lease_owner_provably_dead; keep fail-closed.
                _ => false,
            }
        }
        // Unstamped lease (stock writers): expiry permits fenced open-log recovery.
        None => lease_expiry_permits_fenced_takeover(expires_ms, now_ms),
    }
}

impl HostProcessIdentity {
    /// Snapshot this process. Returns `None` if `/proc` is unavailable.
    pub fn current() -> Option<Self> {
        let pid = std::process::id();
        let boot_id = fs::read_to_string("/proc/sys/kernel/random/boot_id")
            .ok()?
            .trim()
            .to_string();
        if boot_id.is_empty() {
            return None;
        }
        let process_start_ticks = read_process_start_ticks(pid)?;
        Some(Self {
            pid,
            process_start_ticks,
            boot_id,
        })
    }

    /// Compare this lease stamp to local `/proc` (both sides of the check).
    pub fn observe_on_this_host(&self) -> HostProcessDeadnessObservation {
        let lease_pid = self.pid;
        let lease_process_start_ticks = self.process_start_ticks.clone();
        let lease_boot_id = self.boot_id.clone();

        let observed_boot_id = fs::read_to_string("/proc/sys/kernel/random/boot_id")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let Some(ref current_boot) = observed_boot_id else {
            return HostProcessDeadnessObservation {
                lease_pid,
                lease_process_start_ticks,
                lease_boot_id,
                observed_boot_id: None,
                boot_id_matches: false,
                pid_dir_exists: false,
                observed_process_start_ticks: None,
                start_ticks_match: None,
                provably_dead: false,
                reason: "boot_unreadable",
            };
        };

        if self.boot_id.is_empty() || &self.boot_id != current_boot {
            return HostProcessDeadnessObservation {
                lease_pid,
                lease_process_start_ticks,
                lease_boot_id,
                observed_boot_id: Some(current_boot.clone()),
                boot_id_matches: false,
                pid_dir_exists: false,
                observed_process_start_ticks: None,
                start_ticks_match: None,
                provably_dead: false,
                reason: "boot_mismatch_or_cross_host",
            };
        }

        if self.pid == 0 {
            return HostProcessDeadnessObservation {
                lease_pid,
                lease_process_start_ticks,
                lease_boot_id,
                observed_boot_id: Some(current_boot.clone()),
                boot_id_matches: true,
                pid_dir_exists: false,
                observed_process_start_ticks: None,
                start_ticks_match: None,
                provably_dead: false,
                reason: "pid_zero",
            };
        }

        let proc_dir = format!("/proc/{}", self.pid);
        let pid_dir_exists = Path::new(&proc_dir).exists();
        if !pid_dir_exists {
            return HostProcessDeadnessObservation {
                lease_pid,
                lease_process_start_ticks,
                lease_boot_id,
                observed_boot_id: Some(current_boot.clone()),
                boot_id_matches: true,
                pid_dir_exists: false,
                observed_process_start_ticks: None,
                start_ticks_match: None,
                provably_dead: true,
                reason: "pid_absent",
            };
        }

        match read_process_start_ticks(self.pid) {
            Some(ticks) => {
                let matches = ticks == self.process_start_ticks;
                HostProcessDeadnessObservation {
                    lease_pid,
                    lease_process_start_ticks,
                    lease_boot_id,
                    observed_boot_id: Some(current_boot.clone()),
                    boot_id_matches: true,
                    pid_dir_exists: true,
                    observed_process_start_ticks: Some(ticks),
                    start_ticks_match: Some(matches),
                    provably_dead: !matches,
                    reason: if matches {
                        "still_live"
                    } else {
                        "start_ticks_mismatch"
                    },
                }
            }
            // Unreadable stat while dir exists — treat as live (fail closed).
            None => HostProcessDeadnessObservation {
                lease_pid,
                lease_process_start_ticks,
                lease_boot_id,
                observed_boot_id: Some(current_boot.clone()),
                boot_id_matches: true,
                pid_dir_exists: true,
                observed_process_start_ticks: None,
                start_ticks_match: None,
                provably_dead: false,
                reason: "still_live",
            },
        }
    }

    /// True when this identity's process is gone **on the current host**.
    pub fn is_provably_dead_on_this_host(&self) -> bool {
        self.observe_on_this_host().provably_dead
    }
}

fn read_process_start_ticks(pid: u32) -> Option<String> {
    let stat = fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // `comm` may contain spaces/parens; starttime is field 22 after the
    // closing paren of comm.
    let after_comm = stat.rsplit_once(')')?.1;
    let start = after_comm.split_whitespace().nth(19)?; // 22nd overall = index 19 after comm
    Some(start.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_identity_round_trips_on_linux() {
        let Some(id) = HostProcessIdentity::current() else {
            return;
        };
        assert!(id.pid > 0);
        assert!(!id.boot_id.is_empty());
        assert!(!id.process_start_ticks.is_empty());
        assert!(!id.is_provably_dead_on_this_host());
        let obs = id.observe_on_this_host();
        assert!(obs.boot_id_matches);
        assert!(obs.pid_dir_exists);
        assert_eq!(obs.start_ticks_match, Some(true));
        assert_eq!(obs.reason, "still_live");
        assert!(!obs.provably_dead);
    }

    #[test]
    fn fenceable_when_expired_even_without_host_process() {
        assert!(lease_may_be_fenced(100, None, 100));
        assert!(lease_may_be_fenced(99, None, 100));
        assert!(!lease_may_be_fenced(101, None, 100));
        // Unstamped + expired: open-log recovery allowed (cross-host/stock path).
        assert!(lease_open_log_may_be_recovered_as_dead(100, None, 100));
        assert!(!lease_open_log_may_be_recovered_as_dead(101, None, 100));
    }

    #[test]
    fn expired_same_host_live_is_fenceable_but_not_abandoned() {
        let Some(live) = HostProcessIdentity::current() else {
            return;
        };
        // Wedged past expiry: takeover may fence, but open log is NOT dead.
        assert!(lease_may_be_fenced(0, Some(&live), 100));
        assert!(lease_expiry_permits_fenced_takeover(0, 100));
        assert!(!lease_owner_provably_dead(Some(&live)));
        assert!(
            !lease_open_log_may_be_recovered_as_dead(0, Some(&live), 100),
            "expiry must not treat a still-live same-host owner as dead for open-log sweep"
        );
    }

    #[test]
    fn fenceable_when_same_host_process_is_gone() {
        let Some(live) = HostProcessIdentity::current() else {
            return;
        };
        assert!(!lease_may_be_fenced(u64::MAX, Some(&live), 0));
        let dead = HostProcessIdentity {
            pid: 1_000_000_007, // almost certainly absent
            process_start_ticks: "1".into(),
            boot_id: live.boot_id.clone(),
        };
        let obs = dead.observe_on_this_host();
        assert!(obs.provably_dead);
        assert_eq!(obs.reason, "pid_absent");
        assert!(!obs.pid_dir_exists);
        assert!(obs.boot_id_matches);
        assert!(dead.is_provably_dead_on_this_host());
        assert!(lease_may_be_fenced(u64::MAX, Some(&dead), 0));
        assert!(lease_open_log_may_be_recovered_as_dead(
            u64::MAX,
            Some(&dead),
            0
        ));
        let other_boot = HostProcessIdentity {
            pid: 1_000_000_007,
            process_start_ticks: "1".into(),
            boot_id: "not-this-boot".into(),
        };
        let obs2 = other_boot.observe_on_this_host();
        assert!(!obs2.provably_dead);
        assert_eq!(obs2.reason, "boot_mismatch_or_cross_host");
        assert!(!other_boot.is_provably_dead_on_this_host());
        // Unexpired cross-host: not fenceable, not abandoned.
        assert!(!lease_may_be_fenced(u64::MAX, Some(&other_boot), 0));
        assert!(!lease_open_log_may_be_recovered_as_dead(
            u64::MAX,
            Some(&other_boot),
            0
        ));
        // Expired cross-host: fenceable + open-log recovery (TTL + fencing).
        assert!(lease_may_be_fenced(0, Some(&other_boot), 100));
        assert!(lease_open_log_may_be_recovered_as_dead(
            0,
            Some(&other_boot),
            100
        ));
    }

    /// Deterministic H2-via-sweep scenario (predicate layer):
    /// intent mid-flight → owner still live past expiry → buggy expiry-as-dead
    /// would authorize open-log recovery; fixed predicate must refuse.
    #[test]
    fn wedged_owner_past_expiry_blocks_open_log_abandonment() {
        let Some(owner) = HostProcessIdentity::current() else {
            return;
        };
        let expires_ms = 1_000;
        let now_after_wedge = 5_000; // past expiry while process still live
        assert!(lease_expiry_permits_fenced_takeover(
            expires_ms,
            now_after_wedge
        ));
        // Buggy historical rule (expiry ⇒ dead):
        let buggy_expiry_as_dead = expires_ms <= now_after_wedge;
        assert!(buggy_expiry_as_dead);
        // Fixed rule:
        assert!(!lease_open_log_may_be_recovered_as_dead(
            expires_ms,
            Some(&owner),
            now_after_wedge
        ));
        // After process is gone, abandonment is allowed even before "now" matters.
        let gone = HostProcessIdentity {
            pid: 1_000_000_009,
            process_start_ticks: "1".into(),
            boot_id: owner.boot_id.clone(),
        };
        assert!(lease_open_log_may_be_recovered_as_dead(
            expires_ms,
            Some(&gone),
            now_after_wedge
        ));
    }
}
