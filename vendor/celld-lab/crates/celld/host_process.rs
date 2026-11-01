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

    /// True when this identity's process is gone **on the current host**.
    ///
    /// - Different `boot_id` than the running host → not same-host proof; caller
    ///   must not supersede (cross-host / reboot without matching fields).
    /// - Same boot, PID missing → dead.
    /// - Same boot, PID present but start ticks differ → PID reused; dead.
    /// - Same boot, PID + start match → still live; do not supersede.
    pub fn is_provably_dead_on_this_host(&self) -> bool {
        let Ok(current_boot) = fs::read_to_string("/proc/sys/kernel/random/boot_id") else {
            return false;
        };
        let current_boot = current_boot.trim();
        if self.boot_id.is_empty() || self.boot_id != current_boot {
            // Cross-host or unknown boot — not a same-host dead proof.
            return false;
        }
        if self.pid == 0 {
            return false;
        }
        let proc_dir = format!("/proc/{}", self.pid);
        if !Path::new(&proc_dir).exists() {
            return true;
        }
        match read_process_start_ticks(self.pid) {
            Some(ticks) => ticks != self.process_start_ticks,
            // Unreadable stat while dir exists — treat as live (fail closed).
            None => false,
        }
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
    }
}
