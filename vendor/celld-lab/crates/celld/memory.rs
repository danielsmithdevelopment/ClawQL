// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! What the process holds, and how much of that a cell actually holds.
//!
//! Process RSS and cgroup memory answer different questions. RSS describes the
//! process, while `memory.current` is the complete charge that the kernel
//! constrains. `memory.stat` identifies inactive file pages that the kernel can
//! reclaim, so the ordinary pressure measurement does not treat that cache as
//! a cell working set. [`sample`] obtains the measurements in one sampling
//! turn and keeps their relationship intact.

/// A memory sample from one sampling turn.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Sample {
    pub rss_bytes: u64,
    pub in_use_bytes: u64,
    pub cgroup_working_set_bytes: Option<u64>,
    pub cgroup_current_bytes: Option<u64>,
}

/// The resident set size and the memory a cell holds, together.
pub fn sample() -> Sample {
    let rss_bytes = resident_bytes();
    let cgroup = cgroup_memory();
    Sample {
        rss_bytes,
        in_use_bytes: rss_bytes.saturating_sub(allocator_slack_bytes()),
        cgroup_working_set_bytes: cgroup.map(|memory| memory.working_set_bytes),
        cgroup_current_bytes: cgroup.map(|memory| memory.current_bytes),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct CgroupMemory {
    current_bytes: u64,
    working_set_bytes: u64,
}

#[cfg(target_os = "linux")]
#[allow(clippy::disallowed_methods)] // cgroup files are kernel telemetry.
fn cgroup_memory() -> Option<CgroupMemory> {
    for (current_path, stat_path, inactive_key) in [
        (
            "/sys/fs/cgroup/memory.current",
            "/sys/fs/cgroup/memory.stat",
            "inactive_file",
        ),
        (
            "/sys/fs/cgroup/memory/memory.usage_in_bytes",
            "/sys/fs/cgroup/memory/memory.stat",
            "total_inactive_file",
        ),
    ] {
        let Ok(current) = std::fs::read_to_string(current_path) else {
            continue;
        };
        let Some(current_bytes) = current.trim().parse::<u64>().ok() else {
            continue;
        };
        let stat = std::fs::read_to_string(stat_path).unwrap_or_default();
        return Some(cgroup_memory_from_stat(current_bytes, &stat, inactive_key));
    }
    None
}

#[cfg(not(target_os = "linux"))]
fn cgroup_memory() -> Option<CgroupMemory> {
    None
}

#[cfg(any(target_os = "linux", all(test, celld_internal_tests)))]
fn memory_stat_value(stat: &str, key: &str) -> Option<u64> {
    stat.lines().find_map(|line| {
        let mut fields = line.split_whitespace();
        (fields.next()? == key)
            .then(|| fields.next()?.parse::<u64>().ok())
            .flatten()
    })
}

#[cfg(any(target_os = "linux", all(test, celld_internal_tests)))]
fn cgroup_memory_from_stat(current_bytes: u64, stat: &str, inactive_key: &str) -> CgroupMemory {
    let inactive_file_bytes = memory_stat_value(stat, inactive_key)
        .or_else(|| {
            (inactive_key == "total_inactive_file")
                .then(|| memory_stat_value(stat, "inactive_file"))
                .flatten()
        })
        .unwrap_or_default();
    CgroupMemory {
        current_bytes,
        // The files are separate kernel snapshots. If the inactive charge
        // races above the earlier current charge, using zero would hide all
        // active memory from the ordinary pressure and rollout gates.
        working_set_bytes: current_bytes
            .checked_sub(inactive_file_bytes)
            .unwrap_or(current_bytes),
    }
}

/// The active memory-cgroup limit. `None` means that no finite cgroup limit is
/// readable, so the caller must use the host memory size.
#[cfg(target_os = "linux")]
#[allow(clippy::disallowed_methods)] // cgroup files are kernel telemetry.
pub(crate) fn cgroup_limit_bytes() -> Option<u64> {
    for path in [
        "/sys/fs/cgroup/memory.max",
        "/sys/fs/cgroup/memory/memory.limit_in_bytes",
    ] {
        if let Ok(raw) = std::fs::read_to_string(path) {
            if let Ok(limit) = raw.trim().parse::<u64>() {
                // cgroup v1 reports "no limit" as a huge page-rounded value.
                if limit < (1 << 50) {
                    return Some(limit);
                }
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
#[allow(clippy::disallowed_methods)] // `/proc` is host telemetry, not node storage.
pub fn resident_bytes() -> u64 {
    std::fs::read_to_string("/proc/self/statm")
        .ok()
        .and_then(|statm| statm.split_whitespace().nth(1)?.parse::<u64>().ok())
        .map(|pages| pages.saturating_mul(page_size()))
        .unwrap_or(0)
}

#[cfg(target_os = "linux")]
fn page_size() -> u64 {
    let size = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
    u64::try_from(size).ok().filter(|s| *s > 0).unwrap_or(4_096)
}

#[cfg(target_os = "macos")]
pub fn resident_bytes() -> u64 {
    let mut info: libc::proc_taskinfo = unsafe { std::mem::zeroed() };
    let size = std::mem::size_of::<libc::proc_taskinfo>() as libc::c_int;
    let got = unsafe {
        libc::proc_pidinfo(
            // This samples the actual process RSS, so it needs the real host pid.
            libc::getpid(),
            libc::PROC_PIDTASKINFO,
            0,
            (&raw mut info).cast(),
            size,
        )
    };
    if got == size {
        info.pti_resident_size
    } else {
        0
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
pub fn resident_bytes() -> u64 {
    0
}

/// The pages jemalloc holds but nothing uses: `stats.resident` less
/// `stats.allocated`. The statistics are cached, so the epoch must advance
/// first. A failure gives zero, which makes the sample equal to RSS.
pub fn allocator_slack_bytes() -> u64 {
    if tikv_jemalloc_ctl::epoch::advance().is_err() {
        return 0;
    }
    let Ok(resident) = tikv_jemalloc_ctl::stats::resident::read() else {
        return 0;
    };
    let Ok(allocated) = tikv_jemalloc_ctl::stats::allocated::read() else {
        return 0;
    };
    (resident as u64).saturating_sub(allocated as u64)
}

/// The allocator's own view of the heap, for `/state`.
///
/// RSS and `in_use_bytes` cannot say whether memory belongs to Rust or to
/// V8: V8 maps its heaps itself, so both counts include it. `allocated` is
/// what Rust code holds right now, `active` adds the pages jemalloc has
/// given to size classes, `resident` adds the dirty pages it keeps for
/// reuse, and `mapped` and `retained` are its address space. The residual
/// a hibernated cell leaves (about 160 KB on GCE, measured 2026-09-03)
/// is in `allocated` if it is a Rust structure and outside it if it is not.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub struct AllocatorStats {
    pub allocated_bytes: u64,
    pub active_bytes: u64,
    pub resident_bytes: u64,
    pub mapped_bytes: u64,
    pub retained_bytes: u64,
}

/// The allocator statistics after one epoch advance, or `None` when jemalloc
/// cannot answer, so a broken allocator does not break `/state`.
pub fn allocator_stats() -> Option<AllocatorStats> {
    tikv_jemalloc_ctl::epoch::advance().ok()?;
    Some(AllocatorStats {
        allocated_bytes: tikv_jemalloc_ctl::stats::allocated::read().ok()? as u64,
        active_bytes: tikv_jemalloc_ctl::stats::active::read().ok()? as u64,
        resident_bytes: tikv_jemalloc_ctl::stats::resident::read().ok()? as u64,
        mapped_bytes: tikv_jemalloc_ctl::stats::mapped::read().ok()? as u64,
        retained_bytes: tikv_jemalloc_ctl::stats::retained::read().ok()? as u64,
    })
}

/// The C allocator's own view of its heap, for `/state`, on Linux only.
///
/// Rust allocates through jemalloc, but SQLite and V8's C++ side allocate
/// through the system allocator, and glibc keeps a freed chunk in its
/// arena until the top of that arena is free. `in_use` is what those
/// callers hold and `free` is what glibc keeps for them; RSS counts both.
/// The residual a hibernated cell left on GCE (2026-09-03) survived
/// every isolate being freed, so this is the counter that decides whether
/// it is glibc retention.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub struct LibcMallocStats {
    pub in_use_bytes: u64,
    pub free_bytes: u64,
    pub mmap_bytes: u64,
    pub arena_bytes: u64,
}

#[cfg(target_os = "linux")]
pub fn libc_malloc_stats() -> Option<LibcMallocStats> {
    // `mallinfo2` exists from glibc 2.33, and the release binaries link
    // against 2.31, so the symbol is resolved at run time: a node on an
    // older libc reports null instead of the binary failing to link. The
    // older `mallinfo` is not a fallback, because its fields are `int` and
    // wrap above 2 GiB, which a 16 GB node reaches.
    // SAFETY: `dlsym` on the default namespace takes a C string; the symbol
    // has the documented signature, reads allocator statistics, and takes
    // no pointer.
    let info = unsafe {
        let symbol = libc::dlsym(libc::RTLD_DEFAULT, c"mallinfo2".as_ptr());
        if symbol.is_null() {
            return None;
        }
        let mallinfo2: unsafe extern "C" fn() -> libc::mallinfo2 = std::mem::transmute(symbol);
        mallinfo2()
    };
    Some(LibcMallocStats {
        in_use_bytes: info.uordblks as u64,
        free_bytes: info.fordblks as u64,
        mmap_bytes: info.hblkhd as u64,
        arena_bytes: info.arena as u64,
    })
}

#[cfg(not(target_os = "linux"))]
pub fn libc_malloc_stats() -> Option<LibcMallocStats> {
    None
}

/// Growth of the C allocator's free lists since the last trim that earns
/// another one. A trim walks every free chunk of every arena, so it is not
/// worth running for the churn of ordinary requests; 32 MiB is about a
/// hundred evicted cells' storage caches, so a node hibernating cells
/// trims within seconds of the first batch and a busy node with nothing
/// freed never does.
const C_HEAP_TRIM_THRESHOLD_BYTES: u64 = 32 << 20;

/// The free-list size at the last trim, lowered whenever the lists shrink
/// below it, so a trim answers memory freed since then and not the chunks a
/// previous trim already gave back: `mallinfo2` keeps counting a trimmed
/// chunk as free, because trimming decommits its pages and does not take it
/// off the list.
static C_HEAP_FREE_AT_TRIM: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Give the kernel the pages the C allocator keeps for memory that SQLite
/// and V8's C++ side freed, once enough has been freed since the last time.
///
/// glibc keeps a freed chunk in its arena until the top of that arena is
/// free, and a cell's storage is freed in the middle of an arena when the
/// cell stops. Every eviction therefore left about 300 KB on glibc's free
/// lists: with 5,000 cells hibernated a node held 1.5 GB there and reported
/// 1.6 GB of RSS, and one trim took it to 126 MB (GCE, 2026-09-04).
/// jemalloc's background thread already does this for the Rust heap.
///
/// Returns the free-list size that earned the trim, for the log. The sample
/// that follows sees the node without the retained pages, so the pressure
/// classifier measures cells and not the allocator.
pub fn trim_c_heap_if_retained() -> Option<u64> {
    use std::sync::atomic::Ordering;
    let free_bytes = libc_malloc_stats()?.free_bytes;
    let floor = C_HEAP_FREE_AT_TRIM
        .fetch_min(free_bytes, Ordering::Relaxed)
        .min(free_bytes);
    if free_bytes.saturating_sub(floor) < C_HEAP_TRIM_THRESHOLD_BYTES {
        return None;
    }
    let started_ms = crate::asyncrt::mono_ms();
    trim_c_heap();
    C_HEAP_FREE_AT_TRIM.store(free_bytes, Ordering::Relaxed);
    tracing::debug!(
        event = "c_heap_trimmed",
        free_bytes,
        elapsed_ms = crate::asyncrt::mono_ms().saturating_sub(started_ms),
        "returned the C allocator's retained free pages to the kernel"
    );
    Some(free_bytes)
}

#[cfg(target_os = "linux")]
fn trim_c_heap() {
    // SAFETY: `malloc_trim` takes a pad size and touches only the
    // allocator's own bookkeeping.
    unsafe {
        libc::malloc_trim(0);
    }
}

#[cfg(not(target_os = "linux"))]
fn trim_c_heap() {}

/// Ask jemalloc to give freed pages back on a timer. Its 10-second decay runs
/// only when a thread next calls the allocator, which a node that just shed its
/// working set does not do. This repairs what RSS reports, not the decision.
///
/// macOS has no background thread, so the failure is expected there and is
/// logged rather than raised. It matters to an operator: without the thread,
/// retention is never purged, and the absolute cap in `PressureConfig` is the
/// only thing between the process and a kill by the operating system.
pub fn tune_allocator() {
    if let Err(error) = tikv_jemalloc_ctl::background_thread::write(true) {
        tracing::warn!(
            %error,
            "the allocator will not run a background thread, so freed pages \
             return only when a thread allocates again"
        );
    }
}

#[cfg(all(test, celld_internal_tests))]
mod internal_tests {
    include!(env!("CELLD_INTERNAL_MEMORY_TESTS"));
}
