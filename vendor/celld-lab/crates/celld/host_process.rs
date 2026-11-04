//! Same-host "provably dead" checks for incarnation supersede.
//!
//! A new generation may supersede its own prior lease **only** when the
//! recorded process cannot still be running on **this** host. Cross-host
//! duplicates must wait out the lease TTL or be refused (stale-owner safety).

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

/// Whether a node lease may be treated as dead for fencing / claim supersede.
///
/// - Published expiry already passed → dead (stock tip rule).
/// - Same-host `host_process` proves the recorded PID is gone → dead (lab).
/// - Missing stamp, live PID, or different boot → **not** dead; wait TTL / refuse.
pub fn lease_may_be_fenced_as_dead(
    expires_ms: u64,
    host_process: Option<&HostProcessIdentity>,
    now_ms: u64,
) -> bool {
    if expires_ms <= now_ms {
        return true;
    }
    host_process.is_some_and(HostProcessIdentity::is_provably_dead_on_this_host)
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
        assert!(lease_may_be_fenced_as_dead(100, None, 100));
        assert!(lease_may_be_fenced_as_dead(99, None, 100));
        assert!(!lease_may_be_fenced_as_dead(101, None, 100));
    }

    #[test]
    fn fenceable_when_same_host_process_is_gone() {
        let Some(live) = HostProcessIdentity::current() else {
            return;
        };
        assert!(!lease_may_be_fenced_as_dead(u64::MAX, Some(&live), 0));
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
        assert!(lease_may_be_fenced_as_dead(u64::MAX, Some(&dead), 0));
        let other_boot = HostProcessIdentity {
            pid: 1_000_000_007,
            process_start_ticks: "1".into(),
            boot_id: "not-this-boot".into(),
        };
        let obs2 = other_boot.observe_on_this_host();
        assert!(!obs2.provably_dead);
        assert_eq!(obs2.reason, "boot_mismatch_or_cross_host");
        assert!(!other_boot.is_provably_dead_on_this_host());
        assert!(!lease_may_be_fenced_as_dead(u64::MAX, Some(&other_boot), 0));
    }
}
