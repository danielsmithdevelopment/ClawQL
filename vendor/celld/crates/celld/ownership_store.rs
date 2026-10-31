// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Bucket ownership effect adapter, over either conditional-write dialect.
//!
//! This module deliberately contains serialization, wall-clock sampling, SDK
//! configuration and error classification only. Ownership decisions remain in
//! `celld-logic`.

use crate::bucket::Bucket;
use anyhow::Context;
use celld_logic::{
    CapacityPeer, CasGuard, CasOutcome, LeaseCasOutcome, NodeLeaseRecord, OwnerRecord,
};
use futures_util::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;

#[derive(Serialize)]
struct OwnerWire<'a> {
    node: &'a str,
    epoch: u64,
}

#[derive(Deserialize)]
struct OwnerWireOwned {
    node: String,
    epoch: u64,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct NodeLeaseWire {
    pub(crate) node: String,
    pub(crate) expires_ms: u64,
    #[serde(default)]
    pub(crate) addr: String,
    #[serde(default)]
    pub(crate) probe_public_key: String,
    #[serde(default)]
    pub(crate) peer_protocol: u16,
    /// This node accepts a signed shutdown-adoption request and responds only
    /// after it publishes the requested cell. The default keeps old node
    /// records readable during a mixed-version rollout.
    #[serde(default)]
    pub(crate) paced_handoff: bool,
    #[serde(default, rename = "ownership_index_generation")]
    pub(crate) generation: String,
    /// The folded node log: absent until the
    /// session's first fleet open. Every writer of this record carries it
    /// through unchanged except the log tier itself and recovery.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) log: Option<NodeLogWire>,
    #[serde(default)]
    pub(crate) load: NodeLoadWire,
}

/// The folded log fields, exactly the old log/<session>.json body: the
/// record moved into the lease, the shape did not change.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub(crate) struct NodeLogWire {
    pub(crate) state: String,
    pub(crate) epoch: u64,
    pub(crate) ensemble: Vec<String>,
    pub(crate) tiered: u64,
    #[serde(default)]
    pub(crate) active: bool,
}

pub(crate) fn log_state_from_wire(
    log: &Option<NodeLogWire>,
) -> Option<celld_logic::log_tier::LogState> {
    match log.as_ref().map(|log| log.state.as_str()) {
        Some("open") => Some(celld_logic::log_tier::LogState::Open),
        Some("recovering") => Some(celld_logic::log_tier::LogState::Recovering),
        Some("sealed") => Some(celld_logic::log_tier::LogState::Sealed),
        _ => None,
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct NodeLoadWire {
    pub sampled_ms: u64,
    pub resident_cells: usize,
    pub host_websockets: usize,
    pub rss_bytes: u64,
    /// The allocator-adjusted RSS fallback, published next to `rss_bytes` so a
    /// gap between the two is visible.
    ///
    /// `None` means the node did not report it, which a node before this field
    /// existed does not. That is not the same as zero, and a consumer that
    /// ranks nodes must not read a silent zero as the emptiest node in the
    /// fleet for the length of a rolling upgrade.
    #[serde(default)]
    pub in_use_bytes: Option<u64>,
    /// The cgroup working set (`memory.current - inactive_file`).
    #[serde(default)]
    pub cgroup_working_set_bytes: Option<u64>,
    /// The complete cgroup charge from `memory.current`.
    #[serde(default)]
    pub cgroup_current_bytes: Option<u64>,
    pub cpu_percent_x100: u64,
    pub open_fds: u64,
    pub fd_limit: u64,
    pub pressured: bool,
    /// Every configured memory measurement is below its low watermark. `None`
    /// means that a peer predates this field.
    #[serde(default)]
    pub memory_headroom: Option<bool>,
    pub shed_cells: u64,
    /// Cold demand queued behind the activation ceiling. Zero in steady
    /// state; positive only while a restore burst saturates the node, so a
    /// rollout waits it out before it restarts the next node.
    #[serde(default)]
    pub restoring: u64,
}

#[cfg(all(test, celld_internal_tests))]
#[derive(Clone)]
pub(crate) struct AmbientLoadSample {
    pub rss_bytes: u64,
    pub in_use_bytes: u64,
    pub cgroup_working_set_bytes: Option<u64>,
    pub cgroup_current_bytes: Option<u64>,
    pub open_fds: u64,
    pub fd_limit: u64,
}

/// A node record older than this is not worth reading. Three lease
/// lifetimes, floored, so a fleet with a short TTL does not discard records
/// a slow renewal would have refreshed.
const CAPACITY_RECORD_RECENCY_FLOOR_MS: u64 = 60_000;

fn capacity_record_is_recent(last_modified_secs: i64, now_ms: u64, lease_ttl_ms: u64) -> bool {
    let window_ms = lease_ttl_ms
        .saturating_mul(3)
        .max(CAPACITY_RECORD_RECENCY_FLOOR_MS);
    last_modified_secs >= (now_ms.saturating_sub(window_ms) / 1_000) as i64
}

pub fn now_ms() -> u64 {
    crate::asyncrt::wall_ms().max(0) as u64
}

/// The production-compatible conditional object store used by ownership
/// effects. A failed write is always reported to the core as ambiguous unless
/// the store definitively returned HTTP 412.
pub struct BucketOwnership {
    bucket: Bucket,
    lease_bucket: Bucket,
    node: String,
    probe_public_key: String,
    live: Arc<LiveLoad>,
    lease_ttl_ms: u64,
    /// A deterministic execution must not publish ambient process telemetry into
    /// its authoritative store. The override leaves the simulated clock and
    /// the live Actor counters load-bearing.
    #[cfg(all(test, celld_internal_tests))]
    ambient_load_override: Option<AmbientLoadSample>,
    /// A gated tooth observes whether a deterministic override reached the
    /// production sampler. Such a call advances jemalloc's epoch and reads
    /// process resources even if the caller later replaces the values.
    #[cfg(all(test, celld_internal_tests))]
    production_load_samples: AtomicUsize,
    /// The full folded log object this node's OWN lease record carries,
    /// tagged with a publish sequence.
    /// Renewals snapshot (seq, object) ONCE when they serialize the wire
    /// body, and the applied notification reports the seq of the body
    /// that actually landed — never a re-read of this slot. A confirmation
    /// must carry the identity of the write it confirms.
    own_log: std::sync::Mutex<(u64, Option<NodeLogWire>)>,
    /// Every APPLIED write of our own lease record, as (etag, the publish
    /// seq its body carried). A waiter that published seq S is satisfied
    /// only by applied seq >= S; combined with the OwnLog write lock
    /// (one publish outstanding at a time), >= S implies the applied body
    /// IS the waiter's object.
    applied: tokio::sync::watch::Sender<(String, u64)>,
}

/// What this node currently looks like, for peers deciding where to place a
/// cell. The executor owns these numbers and publishes them on every lease
/// renewal; nothing here decides anything locally.
pub fn set_node_load(load: std::sync::Arc<LiveLoad>) {
    crate::asyncrt::services().set_node_load(load);
}

/// Is this node over a resource ceiling and recovering? False when nothing
/// publishes load (no bucket), which is also when there is no pressure
/// sampler to say otherwise.
pub fn node_is_shedding() -> bool {
    crate::asyncrt::services()
        .node_load()
        .is_some_and(|load| load.pressured.load(std::sync::atomic::Ordering::Relaxed))
}

#[derive(Debug, Default)]
pub struct LiveLoad {
    pub resident_cells: AtomicUsize,
    pub host_websockets: AtomicUsize,
    pub cpu_percent_x100: AtomicU64,
    pub pressured: AtomicBool,
    /// Stricter than not pressured: the last sample cleared every resume line.
    pub memory_headroom: AtomicBool,
    /// Cells shed since this process started. Monotonic, and only ever read
    /// by a human or a diagnostic -- placement uses the levels, not the rate.
    pub shed_cells: AtomicU64,
    /// Cold demand queued behind the activation ceiling, republished on every
    /// lease renewal for a rollout to pace on.
    pub restoring: AtomicU64,
}

impl BucketOwnership {
    /// Creates an adapter with an isolated lease pool and the process key
    /// advertised for challenge-bound direct probes.
    pub fn new(
        bucket: Bucket,
        lease_bucket: Bucket,
        node: String,
        probe_public_key: String,
    ) -> Self {
        Self {
            bucket,
            lease_bucket,
            node,
            probe_public_key,
            live: Arc::new(LiveLoad::default()),
            lease_ttl_ms: 0,
            #[cfg(all(test, celld_internal_tests))]
            ambient_load_override: None,
            #[cfg(all(test, celld_internal_tests))]
            production_load_samples: AtomicUsize::new(0),
            own_log: std::sync::Mutex::new((0, None)),
            applied: tokio::sync::watch::channel((String::new(), 0)).0,
        }
    }

    /// The lease lifetime this fleet renews on, used to decide which node
    /// records are still worth reading.
    pub fn with_lease_ttl_ms(mut self, ttl_ms: u64) -> Self {
        self.lease_ttl_ms = ttl_ms;
        self
    }

    #[cfg(all(test, celld_internal_tests))]
    pub(crate) fn with_ambient_load_for_test(mut self, load: AmbientLoadSample) -> Self {
        self.ambient_load_override = Some(load);
        self
    }

    #[cfg(all(test, celld_internal_tests))]
    pub(crate) fn load_sample_for_test(&self) -> NodeLoadWire {
        self.process_load()
    }

    #[cfg(all(test, celld_internal_tests))]
    pub(crate) fn production_load_samples_for_test(&self) -> usize {
        self.production_load_samples.load(Ordering::Relaxed)
    }

    pub fn lease_ttl_ms(&self) -> u64 {
        self.lease_ttl_ms
    }

    /// The store's own transport, shared with the log tier. A fresh client
    /// costs tens of milliseconds of rustls setup at boot, and boot speed is
    /// load-bearing: the clean-reload resume window is the predecessor's
    /// remaining lease TTL, and two extra client constructions can consume
    /// enough of a short lease to prevent a clean reload.
    pub fn bucket_client(&self) -> Bucket {
        self.bucket.clone()
    }

    /// The counters this node publishes to its peers.
    pub fn live(&self) -> Arc<LiveLoad> {
        self.live.clone()
    }

    /// The storage scheme this adapter coordinates through (`s3` or `gs`),
    /// for the startup banner.
    pub fn storage_scheme(&self) -> &'static str {
        self.bucket.scheme()
    }

    /// Stable identity for this exact lease-writing process.
    pub fn process_generation(&self) -> Option<&str> {
        (!self.probe_public_key.is_empty()).then_some(self.probe_public_key.as_str())
    }

    pub async fn read_owner(&self, cell: &str) -> anyhow::Result<Option<OwnerRecord>> {
        let key = format!("cells/{cell}/own.json");
        let Some((owner, etag)) = load_json::<OwnerWireOwned>(&self.bucket, &key).await? else {
            return Ok(None);
        };
        let record = OwnerRecord {
            node: (!owner.node.is_empty()).then_some(owner.node),
            epoch: owner.epoch,
            etag,
        };
        Ok(Some(record))
    }

    pub async fn read_node_lease(&self, owner: &str) -> anyhow::Result<Option<NodeLeaseRecord>> {
        load_node_lease(&self.bucket, owner).await
    }

    /// Read this process's authority record through the isolated lease pool.
    pub async fn read_self_node_lease(
        &self,
        owner: &str,
    ) -> anyhow::Result<Option<NodeLeaseRecord>> {
        load_node_lease(&self.lease_bucket, owner).await
    }

    /// Enumerate the fleet membership records used for advisory placement.
    /// The adapter owns pagination and bounded I/O concurrency; the core gets
    /// every decoded observation and owns all filtering and selection policy.
    pub async fn read_capacity_peers(&self) -> anyhow::Result<Vec<CapacityPeer>> {
        const READ_CONCURRENCY: usize = 16;
        let current_ms = now_ms();
        let mut nodes = Vec::new();
        for object in self.bucket.list("nodes/").await? {
            // A record nothing has rewritten in several lease lifetimes
            // belongs to a node that is not coming back. Skipping it here
            // is the difference between reading the live fleet and
            // reading every node that has ever run: the listing is what
            // the placement decision costs, and it is paid on every
            // unowned cell.
            if !capacity_record_is_recent(
                object.last_modified.timestamp(),
                current_ms,
                self.lease_ttl_ms,
            ) {
                continue;
            }
            let Some(node) = object
                .location
                .as_ref()
                .strip_prefix("nodes/")
                .and_then(|key| key.strip_suffix(".json"))
            else {
                continue;
            };
            if !node.is_empty() {
                nodes.push(node.to_string());
            }
        }
        nodes.sort();
        nodes.dedup();

        let mut reads = stream::iter(nodes.into_iter().map(|node| async move {
            let key = format!("nodes/{node}.json");
            Ok::<_, anyhow::Error>(load_json::<NodeLeaseWire>(&self.bucket, &key).await?.map(
                |(lease, _)| CapacityPeer {
                    node: lease.node,
                    addr: lease.addr,
                    expires_ms: lease.expires_ms,
                    peer_protocol: lease.peer_protocol,
                    sampled_ms: lease.load.sampled_ms,
                    resident_cells: lease.load.resident_cells,
                    host_websockets: lease.load.host_websockets,
                    rss_bytes: lease.load.rss_bytes,
                    in_use_bytes: lease.load.in_use_bytes,
                    pressured: lease.load.pressured,
                    memory_headroom: lease.load.memory_headroom,
                    restoring: lease.load.restoring,
                    paced_handoff: lease.paced_handoff,
                },
            ))
        }))
        .buffer_unordered(READ_CONCURRENCY);
        let mut peers = Vec::new();
        while let Some(peer) = reads.next().await {
            if let Some(peer) = peer? {
                peers.push(peer);
            }
        }
        Ok(peers)
    }

    /// Publish a cell as unowned, keeping its epoch.
    ///
    /// Read-then-conditional-write, because the release is only safe against
    /// the exact record this node wrote: a takeover in the meantime means the
    /// cell is someone else's now, and blanking it would strip a live owner's
    /// claim. Rejection is an ordinary outcome, not an error -- the record
    /// keeps naming whoever it names, and nothing was lost.
    pub async fn release_owner(&self, cell: &str, epoch: u64) -> anyhow::Result<CasOutcome> {
        let Some(current) = self.read_owner(cell).await? else {
            return Ok(CasOutcome::Rejected);
        };
        if current.node.as_deref() != Some(self.node.as_str()) || current.epoch != epoch {
            return Ok(CasOutcome::Rejected);
        }
        let key = format!("cells/{cell}/own.json");
        let body = serde_json::to_vec(&OwnerWire { node: "", epoch })?;
        match self.bucket.put_cas(&key, body, Some(&current.etag)).await? {
            Some(_) => Ok(CasOutcome::Applied),
            None => Ok(CasOutcome::Rejected),
        }
    }

    pub async fn cas_owner(
        &self,
        cell: &str,
        guard: CasGuard,
        epoch: u64,
    ) -> anyhow::Result<CasOutcome> {
        let key = format!("cells/{cell}/own.json");
        let body = serde_json::to_vec(&OwnerWire {
            node: &self.node,
            epoch,
        })?;
        let etag = match &guard {
            CasGuard::Absent => None,
            CasGuard::Match(etag) => Some(etag.as_str()),
        };
        match self.bucket.put_cas(&key, body, etag).await? {
            Some(_) => Ok(CasOutcome::Applied),
            None => Ok(CasOutcome::Rejected),
        }
    }

    pub async fn cas_node_lease(
        &self,
        guard: CasGuard,
        record: &NodeLeaseRecord,
        stamped: &mut Option<celld_logic::log_tier::LogState>,
    ) -> anyhow::Result<LeaseCasOutcome> {
        if self.probe_public_key.is_empty() {
            return Err(anyhow::anyhow!(
                "refusing to publish a node lease without a signed-probe key"
            ));
        }
        let key = format!("nodes/{}.json", self.node);
        // Snapshot the folded log ONCE, before serialization: the applied
        // notification below reports THIS seq — the identity of the body
        // that landed — never a re-read of the slot.
        let (log_seq, log) = self.own_log.lock().unwrap().clone();
        // Report the stamp through the out-parameter, synchronously,
        // before the first await: a caller that times this future out
        // still learns what the possibly-landed body carried.
        *stamped = log_state_from_wire(&log);
        let body = serde_json::to_vec(&NodeLeaseWire {
            node: record.node.clone(),
            expires_ms: record.expires_ms,
            addr: record.addr.clone(),
            probe_public_key: self.probe_public_key.clone(),
            peer_protocol: record.peer_protocol,
            paced_handoff: true,
            generation: record.generation.clone(),
            load: self.process_load(),
            // The CORE's lease writes carry the folded log through
            // UNCHANGED: the full object lives in own_log, written only by
            // the log tier's own core-mediated updates.
            log,
        })?;
        let etag = match &guard {
            CasGuard::Absent => None,
            CasGuard::Match(etag) => Some(etag.as_str()),
        };
        match self.lease_bucket.put_cas(&key, body, etag).await? {
            Some(etag) => {
                let _ = self.applied.send((etag.clone(), log_seq));
                Ok(LeaseCasOutcome::Applied { etag })
            }
            None => Ok(LeaseCasOutcome::Rejected),
        }
    }

    fn process_load(&self) -> NodeLoadWire {
        #[cfg(all(test, celld_internal_tests))]
        if let Some(ambient) = &self.ambient_load_override {
            let rss_bytes = ambient.rss_bytes.max(1);
            return NodeLoadWire {
                sampled_ms: now_ms(),
                resident_cells: self.live.resident_cells.load(Ordering::Relaxed),
                host_websockets: self.live.host_websockets.load(Ordering::Relaxed),
                rss_bytes,
                in_use_bytes: Some(ambient.in_use_bytes.max(1).min(rss_bytes)),
                cgroup_working_set_bytes: ambient.cgroup_working_set_bytes,
                cgroup_current_bytes: ambient.cgroup_current_bytes,
                cpu_percent_x100: self.live.cpu_percent_x100.load(Ordering::Relaxed),
                open_fds: ambient.open_fds,
                fd_limit: ambient.fd_limit,
                pressured: self.live.pressured.load(Ordering::Relaxed),
                memory_headroom: Some(self.live.memory_headroom.load(Ordering::Relaxed)),
                shed_cells: self.live.shed_cells.load(Ordering::Relaxed),
                restoring: self.live.restoring.load(Ordering::Relaxed),
            };
        }
        #[cfg(all(test, celld_internal_tests))]
        self.production_load_samples.fetch_add(1, Ordering::Relaxed);
        process_load(&self.live)
    }
}

impl BucketOwnership {
    /// Replace the folded log object the next lease write carries and
    /// return its publish seq. The caller nudges a renewal and awaits
    /// `applied_log` reaching that seq; the store never initiates writes.
    pub(crate) fn set_own_log(&self, log: Option<NodeLogWire>) -> u64 {
        let mut slot = self.own_log.lock().unwrap();
        slot.0 += 1;
        slot.1 = log;
        slot.0
    }

    pub(crate) fn own_log(&self) -> Option<NodeLogWire> {
        self.own_log.lock().unwrap().1.clone()
    }

    pub(crate) fn applied_log(&self) -> tokio::sync::watch::Receiver<(String, u64)> {
        self.applied.subscribe()
    }
}

pub(crate) async fn load_node_lease(
    bucket: &Bucket,
    owner: &str,
) -> anyhow::Result<Option<NodeLeaseRecord>> {
    let key = format!("nodes/{owner}.json");
    Ok(load_json::<NodeLeaseWire>(bucket, &key)
        .await?
        .map(|(lease, etag)| NodeLeaseRecord {
            log_state: log_state_from_wire(&lease.log),
            node: lease.node,
            addr: lease.addr,
            expires_ms: lease.expires_ms,
            peer_protocol: lease.peer_protocol,
            generation: lease.generation,
            etag,
        }))
}

async fn load_json<T: for<'de> Deserialize<'de>>(
    bucket: &Bucket,
    key: &str,
) -> anyhow::Result<Option<(T, String)>> {
    let Some((bytes, etag)) = bucket.get(key).await? else {
        return Ok(None);
    };
    let value = serde_json::from_slice(&bytes)
        .with_context(|| format!("decode {}://{}/{key}", bucket.scheme(), bucket.name))?;
    Ok(Some((value, etag)))
}

#[allow(clippy::disallowed_methods)] // `/proc` is host telemetry, not node storage.
fn process_load(live: &LiveLoad) -> NodeLoadWire {
    // One sample for both numbers. Reading the resident set size here and the
    // in-use figure from a value the actor wrote on its own timer would publish
    // a pair from two instants, and before the first sample it would publish a
    // real resident set size beside an in-use figure of zero -- which reads as
    // total allocator retention.
    let memory = crate::memory::sample();
    // A 1-byte floor is the sentinel a platform without /proc leaves behind.
    // Both numbers take it, so the in-use figure can never read as zero beside
    // a real resident set size.
    let rss_bytes = memory.rss_bytes.max(1);
    let in_use_bytes = memory.in_use_bytes.max(1).min(rss_bytes);

    #[cfg(target_os = "linux")]
    let open_fds = std::fs::read_dir("/proc/self/fd")
        .map(|entries| entries.count() as u64)
        .unwrap_or_default();
    #[cfg(not(target_os = "linux"))]
    let open_fds = 0;

    #[cfg(unix)]
    let fd_limit = {
        let mut limit = libc::rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        if unsafe { libc::getrlimit(libc::RLIMIT_NOFILE, &mut limit) } == 0 {
            limit.rlim_cur
        } else {
            0
        }
    };
    #[cfg(not(unix))]
    let fd_limit = 0;

    NodeLoadWire {
        sampled_ms: now_ms(),
        rss_bytes,
        in_use_bytes: Some(in_use_bytes),
        cgroup_working_set_bytes: memory.cgroup_working_set_bytes,
        cgroup_current_bytes: memory.cgroup_current_bytes,
        open_fds,
        fd_limit,
        cpu_percent_x100: live.cpu_percent_x100.load(Ordering::Relaxed),
        resident_cells: live.resident_cells.load(Ordering::Relaxed),
        host_websockets: live.host_websockets.load(Ordering::Relaxed),
        pressured: live.pressured.load(Ordering::Relaxed),
        memory_headroom: Some(live.memory_headroom.load(Ordering::Relaxed)),
        shed_cells: live.shed_cells.load(Ordering::Relaxed),
        restoring: live.restoring.load(Ordering::Relaxed),
    }
}
