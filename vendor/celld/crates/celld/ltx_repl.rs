// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! In-process replication backend built on `celld-ltx`.
//!
//! One shared `object_store` client for the whole node, and a managed
//! `celld_ltx::Db` per resident cell that captures the cell's committed WAL
//! and uploads it on demand. No external process, no directory-watch lag — a
//! just-written cell is registered the instant it activates, so the output
//! gate can prove a fresh cell durable with no cold-start window.
//!
//! The object layout is `cells/<cell>/ltx/e<epoch>/` in the bucket, mirroring
//! the local `<watch>/<cell>/ltx/e<epoch>/db.sqlite` tree. This backend builds
//! its own object-store clients rather than going through `bucket::Bucket`, so
//! it carries the fleet's key prefix itself: without that, two fleets sharing
//! one bucket would replicate over each other.

use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::path::Path;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::Weak;
use std::time::Duration;

use anyhow::anyhow;
use celld_ltx::object_store::ObjectStore;
use celld_ltx::replica;
use celld_ltx::replica_compactor::ReplicaCompactor;
use celld_ltx::Db;
use celld_ltx::HostTaskError;
use celld_ltx::LtxHost;
use celld_ltx::ObjectStoreClient;
use celld_ltx::ObjectStoreConfig;
use celld_ltx::Pos;
use celld_ltx::Replica;
use celld_ltx::ReplicaClient;
use celld_ltx::TimestampMetadataKey;
use celld_ltx::TXID;
use tokio::sync::mpsc;
use tokio::sync::Notify;
use tokio::sync::Semaphore;
use tracing::info;
use tracing::warn;

use crate::asyncrt;
use crate::replication::sqlite_snapshot;
use crate::replication::ActivationOptions;
use crate::replication::ActivationResult;
use crate::replication::EvictionRestoreArtifact;
use crate::replication::RestoredSnapshot;
use crate::replication::StorageCredentials;
use crate::replication::SyncWait;

/// Max cells uploading concurrently across the node. Caps blocking-pool threads
/// and in-flight object-store requests under high write fan-out.
const SYNC_CONCURRENCY: usize = 64;

/// Max LTX object downloads across every restore on this node. A hot cell can
/// contain thousands of L0 files, so serial reads turn a takeover into minutes
/// of terminal failures. This shared ceiling hides round-trip latency without
/// multiplying the bound by the activation count.
const RESTORE_DOWNLOAD_CONCURRENCY: usize = 64;

/// One attempt consumes at most this many source objects. This bound keeps a
/// first compaction of an old, write-hot cell from reading its complete L0
/// history into memory.
const COMPACTION_MAX_FILES: usize = 256;

/// The current `ReplicaClient` interface buffers objects, so bound the complete
/// input set until the client gains a streaming read and write surface.
const COMPACTION_MAX_INPUT_BYTES: u64 = 64 * 1024 * 1024;

/// One captured-but-not-yet-uploaded L0 segment, the log tier's
/// replication unit (`crate::node_log`).
pub struct ShipEntry {
    pub cell: String,
    pub epoch: u64,
    pub txid: u64,
    pub bytes: Vec<u8>,
}

/// The result of one submitted ship round. The private reservation stays
/// live until the ship loop applies or discards the result, so dropping either
/// a pending future or a completed result releases the reconfigure barrier.
pub struct ShipCompletion {
    last_seq: Option<u64>,
    _reservation: Option<Box<dyn Send>>,
}

impl ShipCompletion {
    pub fn unreserved(last_seq: Option<u64>) -> Self {
        Self {
            last_seq,
            _reservation: None,
        }
    }

    pub fn reserved(last_seq: Option<u64>, reservation: impl Send + 'static) -> Self {
        Self {
            last_seq,
            _reservation: Some(Box::new(reservation)),
        }
    }

    pub fn last_seq(&self) -> Option<u64> {
        self.last_seq
    }
}

/// The fleet shipper the log tier installs: pipelined, all-member fsync
/// confirmation. A completion without a sequence means the batch is not
/// fleet-durable and the gate must ride the bucket upload instead.
pub trait Shipper: Send + Sync + 'static {
    /// Ship one batch; `covered_seq` is the highest sequence whose frames
    /// are all bucket-covered, which followers may truncate behind.
    /// `completion.last_seq() == Some(last_seq)` means every member confirmed
    /// the whole batch. The completion owns the round's barrier reservation.
    /// Owned arguments and a 'static future: the shipper runs its
    /// synchronous prefix (sequence allocation, per-member lane enqueue)
    /// before returning, so SUBMISSION order — not poll order — fixes the
    /// per-member append order when several rounds are in flight.
    fn ship(
        &self,
        batch: Vec<ShipEntry>,
        covered_seq: u64,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ShipCompletion> + Send + 'static>>;

    /// Ship a batch captured under `expected_epoch`. A stable manager whose
    /// delegate can change must override this method and select plus reserve
    /// the matching delegate atomically.
    fn ship_at_epoch(
        &self,
        expected_epoch: u64,
        batch: Vec<ShipEntry>,
        covered_seq: u64,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ShipCompletion> + Send + 'static>> {
        if self.epoch() != expected_epoch {
            return Box::pin(std::future::ready(ShipCompletion::unreserved(None)));
        }
        self.ship(batch, covered_seq)
    }

    /// Rounds this shipper wants in flight at once. The loop applies
    /// credits strictly in submission order regardless of the depth.
    fn pipeline(&self) -> usize {
        1
    }

    /// True while the shipper can take one more batch. The stream window
    /// closes this on the slowest member's lane — appends or bytes — and
    /// the loop then waits on a completion exactly as it does at depth.
    fn admit(&self) -> bool {
        true
    }

    /// A degraded shipper refuses instantly; the ship loop skips capture.
    fn active(&self) -> bool;
    /// The log epoch this shipper writes. Sequences restart at zero each
    /// epoch, so the ship loop's truncation ledger must reset with it — a
    /// stale covered watermark from the previous epoch would tell fresh
    /// followers to delete entries they just fsync'd.
    fn epoch(&self) -> u64;
}

/// The bundle sink (`crate::node_log`): one PUT per node per flush
/// interval, carrying every dirty cell's captured L0 segments verbatim
/// (`crate::bundle`). `true` means the bundle is durable in the bucket and
/// every included frame may credit its cell's bucket coverage. Inactive
/// (or absent) means the per-cell upload path owns tiering, exactly as
/// before bundles existed.
pub trait BundleSink: Send + Sync + 'static {
    fn put_bundle<'a>(
        &'a self,
        entries: Vec<celld_ltx::bundle::BundleEntry>,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send + 'a>>;
    fn active(&self) -> bool;
    /// The un-drained rows for one cell-epoch, from the leader's own
    /// index of the bundles it wrote. Empty when bundles are off.
    fn rows_for(&self, cell: &str, epoch: u64) -> Vec<celld_ltx::LocatedRow>;
    /// One bundle object's complete bytes, for slicing rows out of.
    fn fetch_bundle<'a>(
        &'a self,
        source: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<Vec<u8>>> + Send + 'a>>;

    /// Fold one cell's stranded tail into the per-cell layout —
    /// recovery's gather, scoped to one cell, over both places the tail
    /// can live: this node's retained bundles and the live members'
    /// fragments. The successor of a quiet ending calls this before it
    /// restores, because restores read per-cell prefixes only and the
    /// takeover law requires the acked prefix there (#473). Idempotent:
    /// every upload is a PUT to the exact key the leader's own drain
    /// would have used.
    fn fold_cell<'a>(
        &'a self,
        cell: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<()>> + Send + 'a>>;
}

/// The compactor-facing fetcher: one cell-epoch's view over whatever sink
/// is currently installed. Reading the slot per call makes activation
/// order irrelevant — a cell activated before the sink existed still sees
/// bundles once it does.
struct SinkFetcher {
    registration: Arc<Mutex<RegistrationState>>,
    cell: String,
    epoch: u64,
}

impl celld_ltx::BundleFetcher for SinkFetcher {
    fn rows<'a>(
        &'a self,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<Output = celld_ltx::Result<Vec<celld_ltx::LocatedRow>>>
                + Send
                + 'a,
        >,
    > {
        Box::pin(async move {
            let sink = registered_durability(&self.registration)
                .and_then(|targets| targets.bundle_sink.clone());
            Ok(sink.map_or_else(Vec::new, |sink| sink.rows_for(&self.cell, self.epoch)))
        })
    }

    fn fetch<'a>(
        &'a self,
        located: &'a celld_ltx::LocatedRow,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = celld_ltx::Result<Vec<u8>>> + Send + 'a>>
    {
        Box::pin(async move {
            let sink = registered_durability(&self.registration)
                .and_then(|targets| targets.bundle_sink.clone());
            let Some(sink) = sink else {
                return Err(celld_ltx::Error::Other("no bundle sink".into()));
            };
            let bytes = sink
                .fetch_bundle(&located.source)
                .await
                .map_err(|e| celld_ltx::Error::Other(e.to_string().into()))?;
            Ok(celld_ltx::bundle::slice(&bytes, &located.row)?.to_vec())
        })
    }
}

struct RegisteredDurability {
    generation: u64,
    targets: Weak<RegisteredTargets>,
}

struct RegisteredTargets {
    shipper: Arc<dyn Shipper>,
    bundle_sink: Option<Arc<dyn BundleSink>>,
}

#[derive(Default)]
struct RegistrationState {
    next_generation: u64,
    current: Option<RegisteredDurability>,
}

fn registered_durability(
    registration: &Arc<Mutex<RegistrationState>>,
) -> Option<Arc<RegisteredTargets>> {
    let state = registration.lock().unwrap();
    state
        .current
        .as_ref()
        .and_then(|current| current.targets.upgrade())
}

/// Removes one coupled shipper and bundle-sink registration on drop.
///
/// A newer installation supersedes an older guard. The generation check keeps
/// the old guard from clearing the replacement when construction retries.
#[must_use = "keep the registration alive for the durability owner's lifetime"]
pub(crate) struct DurabilityRegistration {
    registration: Weak<Mutex<RegistrationState>>,
    generation: u64,
    _targets: Arc<RegisteredTargets>,
}

#[derive(Clone)]
#[doc(hidden)]
pub struct StopToken {
    state: Arc<StopState>,
}

struct StopState {
    stopped: AtomicBool,
    notify: Notify,
}

impl StopToken {
    #[allow(clippy::new_without_default)]
    #[doc(hidden)]
    pub fn new() -> Self {
        Self {
            state: Arc::new(StopState {
                stopped: AtomicBool::new(false),
                notify: Notify::new(),
            }),
        }
    }

    pub(crate) fn request_stop(&self) {
        self.state.stopped.store(true, Ordering::SeqCst);
        self.state.notify.notify_waiters();
    }

    pub(crate) fn is_stopped(&self) -> bool {
        self.state.stopped.load(Ordering::SeqCst)
    }

    pub(crate) async fn stopped(&self) {
        loop {
            let notified = self.state.notify.notified();
            if self.is_stopped() {
                return;
            }
            notified.await;
        }
    }
}

struct OwnedTask {
    id: u64,
    role: &'static str,
    handle: asyncrt::TaskHandle<()>,
}

struct TaskGroupInner {
    next_id: AtomicU64,
    tasks: Mutex<Vec<OwnedTask>>,
    #[cfg(celld_internal_tests)]
    started_roles: Mutex<std::collections::BTreeSet<&'static str>>,
    #[cfg(celld_internal_tests)]
    joined_failures: AtomicU64,
}

struct TaskCompletion {
    group: Weak<TaskGroupInner>,
    id: u64,
}

struct JoiningTask {
    group: Arc<TaskGroupInner>,
    task: Option<OwnedTask>,
}

impl Drop for JoiningTask {
    fn drop(&mut self) {
        if let Some(task) = self.task.take() {
            self.group.tasks.lock().unwrap().push(task);
        }
    }
}

impl Drop for TaskCompletion {
    fn drop(&mut self) {
        // A panic drops this guard before the runtime resolves the matching
        // task handle to an error. Keep that handle for `join`, so shutdown
        // reports the failed durability role instead of silently reaping it.
        if std::thread::panicking() {
            return;
        }
        let Some(group) = self.group.upgrade() else {
            return;
        };
        group
            .tasks
            .lock()
            .unwrap()
            .retain(|task| task.id != self.id);
    }
}

#[derive(Clone)]
pub(crate) struct TaskGroup {
    stop: StopToken,
    inner: Arc<TaskGroupInner>,
}

impl TaskGroup {
    pub(crate) fn new(stop: StopToken) -> Self {
        Self {
            stop,
            inner: Arc::new(TaskGroupInner {
                next_id: AtomicU64::new(0),
                tasks: Mutex::new(Vec::new()),
                #[cfg(celld_internal_tests)]
                started_roles: Mutex::new(std::collections::BTreeSet::new()),
                #[cfg(celld_internal_tests)]
                joined_failures: AtomicU64::new(0),
            }),
        }
    }

    pub(crate) fn spawn_owned(
        &self,
        role: &'static str,
        future: impl std::future::Future<Output = ()> + Send + 'static,
    ) -> bool {
        // Keep the lock until the handle is installed. A task can complete on
        // another executor thread immediately after spawn, so its completion
        // guard must not run before the matching handle becomes visible.
        let mut tasks = self.inner.tasks.lock().unwrap();
        if self.stop.is_stopped() {
            return false;
        }
        let id = self.inner.next_id.fetch_add(1, Ordering::SeqCst);
        #[cfg(celld_internal_tests)]
        self.inner.started_roles.lock().unwrap().insert(role);
        let completion = TaskCompletion {
            group: Arc::downgrade(&self.inner),
            id,
        };
        tasks.push(OwnedTask {
            id,
            role,
            handle: asyncrt::spawn(async move {
                let _completion = completion;
                future.await;
            }),
        });
        true
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.inner.tasks.lock().unwrap().is_empty()
    }

    pub(crate) fn stop_token(&self) -> StopToken {
        self.stop.clone()
    }

    pub(crate) async fn join(&self) {
        loop {
            let Some(task) = self.inner.tasks.lock().unwrap().pop() else {
                return;
            };
            let role = task.role;
            // The lease puts its handle back when this join future is
            // cancelled. A later shutdown join can therefore still prove
            // completion for every admitted task.
            let mut joining = JoiningTask {
                group: self.inner.clone(),
                task: Some(task),
            };
            let result = (&mut joining.task.as_mut().unwrap().handle).await;
            let _completed = joining.task.take().unwrap();
            if let Err(error) = result {
                #[cfg(celld_internal_tests)]
                self.inner.joined_failures.fetch_add(1, Ordering::SeqCst);
                warn!(role, %error, "durability task stopped with an error");
            }
        }
    }

    #[cfg(celld_internal_tests)]
    pub(crate) fn roles_for_world(&self) -> Vec<&'static str> {
        self.inner
            .started_roles
            .lock()
            .unwrap()
            .iter()
            .copied()
            .collect()
    }

    #[cfg(celld_internal_tests)]
    pub(crate) fn live_roles_for_world(&self) -> Vec<&'static str> {
        self.inner
            .tasks
            .lock()
            .unwrap()
            .iter()
            .map(|task| task.role)
            .collect()
    }
}

pub(crate) struct LtxTaskOwner {
    stop: StopToken,
    roots: TaskGroup,
    sync_tasks: TaskGroup,
    compaction_workers: TaskGroup,
    compaction_requeues: TaskGroup,
    replica_close_tasks: TaskGroup,
}

impl LtxTaskOwner {
    pub(crate) fn request_stop(&self) {
        self.stop.request_stop();
    }

    pub(crate) async fn join(&self) {
        // Roots stop admission into every dynamic group. Workers can create
        // delayed requeues, so join workers before the requeue group.
        self.roots.join().await;
        self.sync_tasks.join().await;
        self.compaction_workers.join().await;
        self.compaction_requeues.join().await;
        self.replica_close_tasks.join().await;
    }
}

impl Drop for DurabilityRegistration {
    fn drop(&mut self) {
        let Some(registration) = self.registration.upgrade() else {
            return;
        };
        let mut state = registration.lock().unwrap();
        if state
            .current
            .as_ref()
            .is_some_and(|current| current.generation == self.generation)
        {
            state.current = None;
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CompactionConfig {
    pub min_txids: u64,
    pub concurrency: usize,
}

struct CellCompaction {
    cell: String,
    epoch: u64,
    client: celld_ltx::BundleOverlayClient<ObjectStoreClient>,
    local_path: PathBuf,
    host: LtxHost,
    queue: mpsc::UnboundedSender<CompactionWork>,
    min_txids: u64,
    compacted_txid: AtomicU64,
    queued: AtomicBool,
    cancelled: AtomicBool,
    cancel: Notify,
    /// Serializes threshold compaction with the final handoff snapshot. The
    /// handoff path cancels background work, then waits here before it reads
    /// the quiesced database image.
    run: tokio::sync::Mutex<()>,
}

struct CompactionWork {
    cell: Weak<Cell>,
    queued_at_mono_ms: u64,
}

struct RemoteRestoreTiming {
    started_mono_ms: u64,
    from: u64,
    source_lookup_us: u64,
    plan_us: u64,
    download_us: u64,
    apply_us: u64,
    objects: usize,
    bytes: u64,
    levels: String,
}

struct HandoffSnapshot {
    max_txid: TXID,
    data: Vec<u8>,
}

/// One resident cell's replication state: the `celld_ltx::Db` shadowing its WAL
/// (behind a `std::sync::Mutex` because the `rusqlite` handle is `!Sync` and
/// must never cross an `.await`, so every capture+upload runs inside a
/// `spawn_blocking` closure) plus the durability tickets the output gate waits
/// on. `req_seq` counts durability requests; `synced_seq` is the highest ticket
/// a completed background sync captured. A write waits for `synced_seq >= its
/// ticket`, so concurrent writes to one cell ride a single batched upload —
/// and, because a sync credits only tickets whose writes committed before it
/// started (which the sync's `db.sync` captures), never one it did not upload.
struct Cell {
    /// Cell id + resident epoch — needed so fenced ack can refuse to advance
    /// `synced_seq` when ownership no longer names this node at this epoch.
    cell_id: String,
    epoch: u64,
    /// Shared with [`LtxRepl::ownership`] so a late [`LtxRepl::bind_ownership`]
    /// still applies to cells that activated earlier. Absent binding (unit
    /// tests) skips the confirm-time check.
    ownership: Arc<Mutex<Option<Arc<crate::ownership_store::BucketOwnership>>>>,
    replica: Mutex<Option<Replica<ObjectStoreClient>>>,
    /// The same epoch-prefix client the replica holds, for uploads that run
    /// off the replica mutex.
    client: ObjectStoreClient,
    req_seq: AtomicU64,
    synced_seq: AtomicU64,
    /// Highest ticket whose write is fsync'd on every ensemble member —
    /// the log tier's proof. The gate accepts either proof, so this stays 0
    /// forever when no shipper is installed.
    shipped_seq: AtomicU64,
    /// Highest ticket included in a submitted fleet round. It can run ahead
    /// of `shipped_seq` while the pipeline is in flight, so the next capture
    /// does not submit the same write again.
    submitted_seq: AtomicU64,
    /// Highest TXID credited by the fleet (or already covered by the bucket).
    shipped_txid: AtomicU64,
    /// Highest TXID included in a submitted fleet round. A pipeline reset
    /// rolls it back to `shipped_txid`, so the failed tail is retried once.
    submitted_txid: AtomicU64,
    durable_txid: AtomicU64,
    /// Highest TXID the PER-CELL prefix provably covers through this
    /// handle: the restored position at open, advanced only by the
    /// per-cell sync upload. `durable_txid` cannot serve this role —
    /// the bundle flush credits it, and the graceful seal already
    /// learned that every ack counter counts bundle credits. Together
    /// with `compacted_txid` (the drain's per-cell L1 fold) it bounds
    /// what a successor restore will actually see, which is what
    /// `note_undrained_tail` compares against (#473).
    percell_txid: AtomicU64,
    /// Set while a sync for this cell is in flight, so the loop never runs two
    /// at once for one cell (they would serialize on the mutex and waste work).
    syncing: AtomicBool,
    /// Wall-clock ms of the last completed sync, the pacing anchor: with a
    /// healthy shipper the bucket runs at most one upload per flush interval
    /// behind, which is the tier's stated lag budget.
    last_sync_ms: AtomicU64,
    /// Notified when `synced_seq` advances (or a sync fails), waking waiters.
    ready: Notify,
    compaction: Option<CellCompaction>,
}
type CellHandle = Arc<Cell>;

/// The default deadline for one durability proof, in seconds. A sustained
/// write burst (a large upload landing in one cell) can legitimately need
/// more than one capture+upload cycle to prove; on a slow or busy store a
/// fixed 10s fences the cell out from under an active request, so operators
/// can raise it via `CELLD_LTX_DURABILITY_TIMEOUT_SECS`.
const DEFAULT_DURABILITY_TIMEOUT_SECS: u64 = 10;

/// The cell-sized TRUNCATE checkpoint threshold, in pages. Chosen from a
/// measured threshold curve (2026-08-26): the read per sync is flat from
/// 64 to 128 pages (~68 KB against ~2.4 MB untruncated) and 128 pays half
/// the boundary snapshots of 64, while 256 and above let the stale-tail
/// reads back in. A 512 KB WAL cap per cell keeps every capture's read
/// small for the price of one boundary snapshot of a cell-sized database
/// per checkpoint cycle.
const DEFAULT_TRUNCATE_PAGES: u32 = 128;

pub struct LtxRepl {
    /// Local root: cell dbs live at `watch/<cell>/ltx/e<epoch>/db.sqlite`.
    watch: PathBuf,
    /// The object-metadata name for an LTX header timestamp. Azure refuses
    /// a hyphen in a metadata name, so the fleet bucket's dialect picks it.
    timestamp_metadata_key: TimestampMetadataKey,
    bucket: String,
    /// The bucket spec's key prefix: empty, or slash-terminated.
    prefix: String,
    endpoint: Option<String>,
    region: String,
    credentials: Option<StorageCredentials>,
    /// One connection pool for the whole node, shared by every cell client.
    store: Arc<dyn ObjectStore>,
    ltx_host: LtxHost,
    /// An explicit SQLite VFS for both managed connections. Production keeps
    /// this unset.
    vfs_name: Option<String>,
    cells: Arc<Mutex<BTreeMap<(String, u64), CellHandle>>>,
    stopped_cells: Arc<Mutex<BTreeMap<(String, u64), CellHandle>>>,
    /// Serializes a release admission with the final shutdown snapshot. A
    /// release that crosses shutdown must belong to either the retained close
    /// group or the stopped-cell snapshot, never neither and never both.
    replica_close_gate: Mutex<()>,
    /// Keys whose owned blocking close failed before it proved that it took
    /// the replica. A later release can admit one retry for the same handle.
    failed_release_closes: Arc<Mutex<BTreeSet<(String, u64)>>>,
    replica_close_stop: StopToken,
    replica_close_tasks: TaskGroup,
    /// Woken when a cell's `committed` advances, so the background loop syncs
    /// without polling; a slow tick backstops any missed notification.
    dirty: Arc<Notify>,
    /// Shared by every activation, so the restore bound is per node, not per
    /// cell. The generic LTX restore keeps its sequential compatibility path.
    restore_slots: Arc<Semaphore>,
    compaction_queue: Option<mpsc::UnboundedSender<CompactionWork>>,
    compaction_min_txids: u64,
    /// Preserved eviction snapshots, tracked in memory so the local-cache
    /// prune answers without walking the data directory. See
    /// [`crate::replication::PreservedCache`].
    preserved: Mutex<crate::replication::PreservedCache>,
    /// Woken when a gate ticket arrives, so the ship loop group-commits
    /// without polling.
    dirty_ship: Arc<Notify>,
    /// Cells whose last epoch ended quietly with acked rows outside the
    /// per-cell layout (`note_undrained_tail`'s predicate). The ending
    /// itself cannot write — release serves fenced nodes — so the
    /// SUCCESSOR folds: the next activation gathers the cell's stranded
    /// tail per-cell before it restores (#473). In-memory only; a
    /// process death hands the same duty to boot recovery, which drains
    /// whole predecessor sessions.
    dirty_tails: Mutex<BTreeSet<String>>,
    registration: Arc<Mutex<RegistrationState>>,
    stop: StopToken,
    task_owner: Mutex<Option<LtxTaskOwner>>,
    #[cfg(celld_internal_tests)]
    activation_install_pause: Mutex<Option<Arc<LtxActivationInstallPause>>>,
    #[cfg(celld_internal_tests)]
    close_local_replicas_pause: Mutex<Option<Arc<LtxReplicaClosePause>>>,
    #[cfg(celld_internal_tests)]
    panic_next_release_close: AtomicBool,
    /// The deadline for one durability proof, in milliseconds. Fixed at
    /// construction, so the hot write path pays no environment lookup.
    durability_timeout_ms: u64,
    /// The cell's TRUNCATE checkpoint threshold. Passive checkpoints never
    /// shrink the WAL FILE, so after every periodic restart the capture's
    /// tail read spans the stale high-water region — ~350 KB per sync on
    /// the fleet ledger at the upstream threshold. `DEFAULT_TRUNCATE_PAGES`
    /// unless `CELLD_LTX_TRUNCATE_PAGES` overrides it; 0 disables
    /// truncation (the upstream behavior). Queue cells always disable it
    /// because each truncate boundary emits a full image of their unbounded
    /// backlog.
    truncate_pages: Option<u32>,
    /// Bucket ownership adapter for confirm-time epoch checks (ClawQL fence).
    /// Installed after construction via [`Self::bind_ownership`]. Shared with
    /// every [`Cell`] so a bind after activation still takes effect.
    ownership: Arc<Mutex<Option<Arc<crate::ownership_store::BucketOwnership>>>>,
}

impl LtxRepl {
    /// Cfg-gated constructor over an injected store.
    #[cfg(celld_internal_tests)]
    pub fn start_with_store_for_test(watch: &Path, store: Arc<dyn ObjectStore>) -> Self {
        Self::start_with_store(watch, store, None, 0)
    }

    /// Build the production loop topology over an injected object store.
    #[cfg(celld_internal_tests)]
    pub fn start_with_store(
        watch: &Path,
        store: Arc<dyn ObjectStore>,
        compaction: Option<CompactionConfig>,
        flush_ms: u64,
    ) -> Self {
        Self::start_with_store_and_optional_vfs(watch, store, compaction, flush_ms, None)
    }

    /// Build the same loop topology and route managed SQLite through `vfs`.
    #[cfg(celld_internal_tests)]
    pub fn start_with_store_on_vfs(
        watch: &Path,
        store: Arc<dyn ObjectStore>,
        compaction: Option<CompactionConfig>,
        flush_ms: u64,
        vfs: &str,
    ) -> Self {
        Self::start_with_store_and_optional_vfs(
            watch,
            store,
            compaction,
            flush_ms,
            Some(vfs.to_string()),
        )
    }

    #[cfg(celld_internal_tests)]
    fn start_with_store_and_optional_vfs(
        watch: &Path,
        store: Arc<dyn ObjectStore>,
        compaction: Option<CompactionConfig>,
        flush_ms: u64,
        vfs_name: Option<String>,
    ) -> Self {
        Self::assemble(
            watch,
            store,
            TimestampMetadataKey::default(),
            "test".into(),
            String::new(),
            None,
            "auto".into(),
            None,
            compaction,
            flush_ms,
            deterministic_ltx_host(),
            vfs_name,
            DEFAULT_DURABILITY_TIMEOUT_SECS * 1_000,
        )
    }

    /// Cfg-gated constructor with additive L1 compaction enabled.
    #[cfg(celld_internal_tests)]
    pub fn start_with_compaction_for_test(
        watch: &Path,
        store: Arc<dyn ObjectStore>,
        min_txids: u64,
        concurrency: usize,
    ) -> Self {
        Self::assemble(
            watch,
            store,
            TimestampMetadataKey::default(),
            "test".into(),
            String::new(),
            None,
            "auto".into(),
            None,
            Some(CompactionConfig {
                min_txids,
                concurrency,
            }),
            0,
            deterministic_ltx_host(),
            None,
            DEFAULT_DURABILITY_TIMEOUT_SECS * 1_000,
        )
    }

    pub(crate) fn start(
        watch: &Path,
        backend: crate::bucket::StorageBackend,
        bucket: String,
        prefix: String,
        endpoint: Option<String>,
        region: String,
        credentials: Option<StorageCredentials>,
    ) -> anyhow::Result<Self> {
        let compaction = compaction_config_from_env()?;
        // Everything downstream of the store is backend-agnostic already,
        // so the dialect decides construction and the metadata name, and
        // nothing else.
        let store = match backend {
            crate::bucket::StorageBackend::Gcs => crate::bucket::gcs_replica_store(&bucket)?,
            crate::bucket::StorageBackend::Azure => crate::bucket::azure_replica_store(&bucket)?,
            crate::bucket::StorageBackend::S3 => {
                node_config(&bucket, endpoint.as_deref(), &region, credentials.as_ref())
                    .build_store()
                    .map_err(|error| anyhow!("build shared object store: {error}"))?
            }
            crate::bucket::StorageBackend::Local => {
                Arc::new(crate::local_store::LocalStore::open(&bucket)?)
            }
        };
        // Azure blob metadata names must be C# identifiers, so the standard
        // Litestream key cannot carry its hyphen there. External Litestream
        // tooling reads that key, therefore an az:// replica gives up
        // Litestream-tool timestamp restore. celld never reads it back.
        let timestamp_metadata_key = match backend {
            crate::bucket::StorageBackend::Azure => TimestampMetadataKey::Underscore,
            crate::bucket::StorageBackend::S3
            | crate::bucket::StorageBackend::Gcs
            | crate::bucket::StorageBackend::Local => TimestampMetadataKey::Litestream,
        };
        // The tiering flush interval: with a healthy shipper, at most one
        // upload per cell per interval; it is simultaneously the bucket lag
        // budget. 0 disables pacing.
        let flush_ms = crate::env_vars::with_default("CELLD_LOG_FLUSH_MS", 2000)? as u64;
        // Saturating: an absurd seconds value must clamp, not wrap through
        // `as_millis() as u64` into a short deadline.
        let durability_timeout_ms = crate::env_vars::positive_or(
            "CELLD_LTX_DURABILITY_TIMEOUT_SECS",
            DEFAULT_DURABILITY_TIMEOUT_SECS,
        )?
        .saturating_mul(1_000);
        Ok(Self::assemble(
            watch,
            store,
            timestamp_metadata_key,
            bucket,
            prefix,
            endpoint,
            region,
            credentials,
            compaction,
            flush_ms,
            production_ltx_host(),
            None,
            durability_timeout_ms,
        ))
    }

    /// The one constructor body for every field and every background loop.
    #[allow(clippy::too_many_arguments)]
    fn assemble(
        watch: &Path,
        store: Arc<dyn ObjectStore>,
        timestamp_metadata_key: TimestampMetadataKey,
        bucket: String,
        prefix: String,
        endpoint: Option<String>,
        region: String,
        credentials: Option<StorageCredentials>,
        compaction: Option<CompactionConfig>,
        flush_ms: u64,
        ltx_host: LtxHost,
        vfs_name: Option<String>,
        durability_timeout_ms: u64,
    ) -> Self {
        let cells: Arc<Mutex<BTreeMap<(String, u64), CellHandle>>> = Arc::default();
        let dirty = Arc::new(Notify::new());
        let dirty_ship = Arc::new(Notify::new());
        let registration: Arc<Mutex<RegistrationState>> = Arc::default();
        let stop = StopToken::new();
        let roots = TaskGroup::new(stop.clone());
        let sync_tasks = TaskGroup::new(stop.clone());
        let compaction_workers = TaskGroup::new(stop.clone());
        let compaction_requeues = TaskGroup::new(stop.clone());
        let replica_close_stop = StopToken::new();
        let replica_close_tasks = TaskGroup::new(replica_close_stop.clone());
        let preserved = Mutex::new(crate::replication::PreservedCache::new(
            ltx_host.filesystem(),
        ));
        // Retain every root until the unique durability owner claims them.
        // Dropping a task handle detaches the task, so a cloneable replicator
        // cannot be the final lifecycle capability.
        roots.spawn_owned(
            "ltx_sync",
            sync_loop(
                cells.clone(),
                dirty.clone(),
                Arc::new(Semaphore::new(SYNC_CONCURRENCY)),
                registration.clone(),
                stop.clone(),
                sync_tasks.clone(),
                flush_ms,
            ),
        );
        roots.spawn_owned(
            "ltx_ship",
            ship_loop(
                cells.clone(),
                dirty_ship.clone(),
                registration.clone(),
                stop.clone(),
            ),
        );
        roots.spawn_owned(
            "ltx_bundle",
            bundle_loop(cells.clone(), registration.clone(), stop.clone(), flush_ms),
        );
        let compaction_queue = compaction.map(|config| {
            start_compaction_loop(
                config,
                stop.clone(),
                &roots,
                compaction_workers.clone(),
                compaction_requeues.clone(),
            )
        });
        Self {
            watch: watch.to_path_buf(),
            timestamp_metadata_key,
            bucket,
            prefix,
            endpoint,
            region,
            credentials,
            store,
            ltx_host,
            vfs_name,
            cells,
            stopped_cells: Arc::new(Mutex::new(BTreeMap::new())),
            replica_close_gate: Mutex::new(()),
            failed_release_closes: Arc::new(Mutex::new(BTreeSet::new())),
            replica_close_stop,
            replica_close_tasks: replica_close_tasks.clone(),
            dirty,
            restore_slots: Arc::new(Semaphore::new(RESTORE_DOWNLOAD_CONCURRENCY)),
            compaction_queue,
            compaction_min_txids: compaction.map_or(0, |config| config.min_txids),
            preserved,
            dirty_ship,
            dirty_tails: Mutex::new(BTreeSet::new()),
            registration,
            stop: stop.clone(),
            task_owner: Mutex::new(Some(LtxTaskOwner {
                stop,
                roots,
                sync_tasks,
                compaction_workers,
                compaction_requeues,
                replica_close_tasks,
            })),
            #[cfg(celld_internal_tests)]
            activation_install_pause: Mutex::new(None),
            #[cfg(celld_internal_tests)]
            close_local_replicas_pause: Mutex::new(None),
            #[cfg(celld_internal_tests)]
            panic_next_release_close: AtomicBool::new(false),
            durability_timeout_ms,
            ownership: Arc::new(Mutex::new(None)),
            truncate_pages: Some(
                crate::env_vars::optional::<u32>("CELLD_LTX_TRUNCATE_PAGES")
                    .ok()
                    .flatten()
                    .unwrap_or(DEFAULT_TRUNCATE_PAGES),
            ),
        }
    }

    pub(crate) fn take_task_owner(&self) -> LtxTaskOwner {
        self.task_owner
            .lock()
            .unwrap()
            .take()
            .expect("the LTX task owner was already claimed")
    }

    pub(crate) fn shutdown_local_fallback(&self) {
        self.stop.request_stop();
        self.registration.lock().unwrap().current = None;
        let _close_gate = self.replica_close_gate.lock().unwrap();
        self.replica_close_stop.request_stop();
        // A capture holds the replica mutex across filesystem work. Closing a
        // replica here would turn the process-deadline fallback into another
        // unbounded wait. Detach every handle without touching its replica, so
        // awaited shutdown can close it after all admitted workers have joined.
        // The close gate makes this snapshot atomic with release admission.
        let cells = std::mem::take(&mut *self.cells.lock().unwrap());
        self.stopped_cells.lock().unwrap().extend(cells);
    }

    pub(crate) fn start_close_local_replicas(&self) -> Option<asyncrt::TaskHandle<()>> {
        let _close_gate = self.replica_close_gate.lock().unwrap();
        let mut cells = std::mem::take(&mut *self.cells.lock().unwrap());
        cells.append(&mut *self.stopped_cells.lock().unwrap());
        let mut failed_release_closes = self.failed_release_closes.lock().unwrap();
        for key in cells.keys() {
            failed_release_closes.remove(key);
        }
        drop(failed_release_closes);
        if cells.is_empty() {
            return None;
        }
        #[cfg(celld_internal_tests)]
        let pause = self.take_replica_close_pause_for_world();
        Some(asyncrt::blocking(move || {
            #[cfg(celld_internal_tests)]
            pause_replica_close_for_world(pause);
            for ((cell, epoch), handle) in cells {
                close_replica_or_warn(&handle, &cell, epoch);
            }
        }))
    }

    /// Bind the bucket ownership adapter so fenced LTX confirms can refuse to
    /// advance `synced_seq` when this node's epoch is no longer current.
    /// Call once after constructing [`crate::ownership_store::BucketOwnership`].
    pub fn bind_ownership(&self, ownership: Arc<crate::ownership_store::BucketOwnership>) {
        *self.ownership.lock().unwrap() = Some(ownership);
    }

    fn ownership_handle(&self) -> Arc<Mutex<Option<Arc<crate::ownership_store::BucketOwnership>>>> {
        self.ownership.clone()
    }

    /// Install one fleet shipper and its optional bundle sink as one unit.
    ///
    /// Fleet-durable proofs begin only after the log record is open in the
    /// bucket, so the caller guarantees that order. The registration stores
    /// weak references because the manager already owns this replicator.
    pub(crate) fn register_durability(
        &self,
        shipper: Arc<dyn Shipper>,
        bundle_sink: Option<Arc<dyn BundleSink>>,
    ) -> Option<DurabilityRegistration> {
        let targets = Arc::new(RegisteredTargets {
            shipper,
            bundle_sink,
        });
        let mut state = self.registration.lock().unwrap();
        // Shutdown publishes stop before it clears this slot under the same
        // mutex. A registration that linearizes first is cleared by shutdown;
        // one that linearizes later observes stop and cannot resurrect it.
        if self.stop.is_stopped() {
            return None;
        }
        state.next_generation = state
            .next_generation
            .checked_add(1)
            .expect("durability registration generation exhausted");
        let generation = state.next_generation;
        state.current = Some(RegisteredDurability {
            generation,
            targets: Arc::downgrade(&targets),
        });
        drop(state);
        self.dirty_ship.notify_one();
        self.dirty.notify_one();
        Some(DurabilityRegistration {
            registration: Arc::downgrade(&self.registration),
            generation,
            _targets: targets,
        })
    }

    /// The ensemble-change barrier: every frame ever handed to a shipper is
    /// durable in the bucket. Old followers' fragments are abandonable
    /// garbage exactly when this holds.
    pub fn all_shipped_tiered(&self) -> bool {
        self.cells.lock().unwrap().values().all(|cell| {
            cell.durable_txid.load(Ordering::SeqCst) >= cell.shipped_txid.load(Ordering::SeqCst)
        })
    }

    /// Recovery's primitive: PUT one gathered L0 segment to the exact key
    /// the dead leader's own upload would have used. Idempotent by key.
    /// The highest TXID the cell's per-cell prefix already covers, over
    /// every level. Recovery uses it to skip re-uploading rows the drain
    /// points (compaction, eviction sync) have already folded in — one
    /// LIST per cell instead of one PUT per historical row.
    pub async fn covered_txid(&self, cell: &str, epoch: u64) -> u64 {
        let client = self.client_for(cell, epoch);
        let mut covered = 0_u64;
        for level in 0..=1 {
            if let Ok(files) = client.ltx_files(level, TXID(0)).await {
                for file in files {
                    covered = covered.max(file.max_txid.0);
                }
            }
        }
        covered
    }

    pub async fn upload_raw_l0(
        &self,
        cell: &str,
        epoch: u64,
        min_txid: u64,
        max_txid: u64,
        bytes: &[u8],
    ) -> anyhow::Result<()> {
        self.client_for(cell, epoch)
            .write_ltx_file(0, TXID(min_txid), TXID(max_txid), bytes)
            .await
            .map_err(|error| {
                anyhow!("upload recovered l0 {cell} e{epoch} t{min_txid}-{max_txid}: {error}")
            })?;
        Ok(())
    }

    /// Merge contiguous single-transaction LTX segments into one segment
    /// covering the whole range. Recovery uses it to upload each cell's
    /// gathered tail as ONE object instead of one per row: the lab's chaos
    /// soak measured per-kill outages growing 133 s -> 353 s because every
    /// crash added hundreds of single-row L0 objects for the object
    /// store's same-key throttling to fight and the next restore plan to
    /// read. Returns None when the rows are not a contiguous ascending
    /// chain — the caller falls back to per-row uploads, never guessing.
    pub fn merge_l0_rows(rows: &[(u64, Vec<u8>)]) -> Option<Vec<u8>> {
        if rows.len() < 2 {
            return None;
        }
        if rows.windows(2).any(|pair| pair[1].0 != pair[0].0 + 1) {
            return None;
        }
        let readers: Vec<std::io::Cursor<&[u8]>> = rows
            .iter()
            .map(|(_, bytes)| std::io::Cursor::new(bytes.as_slice()))
            .collect();
        let mut compactor = celld_ltx::compactor::Compactor::new(Vec::new(), readers);
        // The gathered frames are no-checksum WAL-segment files, so the
        // merged header must be too — a checksummed output header fails
        // encode validation against checksum-less inputs (the same flag
        // ReplicaCompactor sets for the L0->L1 fold).
        compactor.header_flags = celld_ltx::ltx::HEADER_FLAG_NO_CHECKSUM;
        match compactor.compact() {
            Ok(()) => Some(compactor.into_writer()),
            Err(error) => {
                // The fallback is safe (per-row uploads) but must never be
                // silent again: a swallowed error here hid a dead merge
                // through a full fleet round.
                warn!(%error, rows = rows.len(), "recovery tail merge failed; per-row fallback");
                None
            }
        }
    }

    fn db_path(&self, cell: &str, epoch: u64) -> PathBuf {
        self.watch
            .join(cell)
            .join("ltx")
            .join(format!("e{epoch}"))
            .join("db.sqlite")
    }

    fn truncate_pages_for_cell(&self, cell: &str) -> Option<u32> {
        let queue = cell
            .split_once(':')
            .is_some_and(|(class, _)| class == crate::deploy::QUEUE_CLASS);
        if queue {
            // A Queue database grows with its backlog. A fixed WAL threshold
            // therefore turns every TRUNCATE boundary into an allocation and
            // LTX object proportional to every undelivered message (#472).
            // PASSIVE checkpoints still backfill the database, and the sparse
            // capture path reads the live tail without retaining the stale WAL
            // region, so Queue cells do not need that small-cell tradeoff.
            Some(0)
        } else {
            self.truncate_pages
        }
    }

    /// A per-cell client over the shared store, keyed to the cell's epoch
    /// prefix. `cells/<cell>/ltx/e<epoch>` matches [`Self::db_path`]'s remote
    /// twin so the same coordinates address local and replica state.
    fn client_for(&self, cell: &str, epoch: u64) -> ObjectStoreClient {
        let mut config = node_config(
            &self.bucket,
            self.endpoint.as_deref(),
            &self.region,
            self.credentials.as_ref(),
        );
        config.path = format!("{}cells/{cell}/ltx/e{epoch}", self.prefix);
        config.timestamp_metadata_key = self.timestamp_metadata_key;
        ObjectStoreClient::with_store(config, self.store.clone())
    }

    /// Highest epoch under `cells/<cell>/ltx/` that holds any LTX — the newest
    /// durable copy to restore on takeover.
    async fn highest_nonempty_epoch(&self, cell: &str) -> anyhow::Result<Option<u64>> {
        use celld_ltx::object_store::path::Path as ObjPath;
        let base = ObjPath::from(format!("{}cells/{cell}/ltx", self.prefix));
        let listing = self.store.list_with_delimiter(Some(&base)).await?;
        let mut best: Option<u64> = None;
        for prefix in listing.common_prefixes {
            if let Some(epoch) = prefix
                .filename()
                .and_then(|name| name.strip_prefix('e'))
                .and_then(|value| value.parse::<u64>().ok())
            {
                best = Some(best.map_or(epoch, |current| current.max(epoch)));
            }
        }
        Ok(best)
    }

    /// Does the bucket hold any LTX for this cell at this epoch? The fail-closed
    /// eviction gate: never delete the last local copy of state the bucket
    /// cannot restore.
    pub async fn epoch_replicated(&self, cell: &str, epoch: u64) -> bool {
        let client = self.client_for(cell, epoch);
        matches!(client.has_any_object().await, Ok(true))
    }

    pub async fn activate(
        &self,
        options: ActivationOptions<'_>,
    ) -> anyhow::Result<ActivationResult> {
        anyhow::ensure!(
            !self.stop.is_stopped(),
            "LTX replication stopped before activation started"
        );
        let ActivationOptions {
            cell,
            epoch,
            fresh,
            took_over,
            resume_local,
            // Consumed by the interlock before the fold; the field stays
            // on the options because the core's claim still names it.
            prior: _,
        } = options;
        {
            let _close_gate = self.replica_close_gate.lock().unwrap();
            anyhow::ensure!(
                !self
                    .stopped_cells
                    .lock()
                    .unwrap()
                    .contains_key(&(cell.to_string(), epoch)),
                "managed replica close is incomplete for {cell} epoch {epoch}"
            );
        }
        let dst = self.db_path(cell, epoch);
        self.ltx_host.create_dir_all(dst.parent().unwrap())?;

        // The takeover interlock moved OUT of this path (lease-fold): the
        // decision core gates foreign takeovers on the folded lease state
        // it already reads (Effect::RecoverNodeLog), and the boot order
        // recovers this node's own predecessor before the lease installs,
        // so by the time any activation reaches here the bucket is
        // provably complete for both the takeover and the named-me path.

        // Reuse a preserved local eviction snapshot only as the previous
        // epoch's baseline. Eviction removes the LTX metadata, so reopening
        // that SQLite image starts a new writer generation at TXID 1. Pairing
        // it with the same remote epoch would mix that new lineage with the
        // old tail (#158). A clean process reload is the separate
        // `resume_local` path: it retains both the live database and its LTX
        // metadata, so it can safely continue the existing epoch.
        // `.evicted` is the current name; `.hibernated` is what releases
        // before 2026-08-05 wrote. Accept both, so an upgrade reuses the
        // snapshots already on disk instead of restoring every cell from the
        // bucket. Writes always use the new name, so the old one dies out.
        let legacy = |path: &PathBuf| path.with_extension("hibernated");
        let previous = celld_logic::restore::previous_epoch_reusable(epoch, took_over)
            .then(|| self.db_path(cell, epoch - 1).with_extension("evicted"));
        let is_file = |path: &PathBuf| {
            self.ltx_host
                .metadata(path)
                .is_ok_and(|metadata| metadata.is_file)
        };
        let first_present = |path: PathBuf| {
            if is_file(&path) {
                Some(path)
            } else {
                Some(legacy(&path)).filter(is_file)
            }
        };
        let local_snapshot = (!fresh && !resume_local)
            .then(|| previous.and_then(first_present))
            .flatten();

        let mut restored = resume_local;
        let mut remote_restore = None;
        if resume_local {
            anyhow::ensure!(
                is_file(&dst),
                "clean reload database is missing: {}",
                dst.display()
            );
            info!(cell, epoch, "resumed clean local replica");
        } else if let Some(snapshot) = local_snapshot {
            self.ltx_host.rename(&snapshot, &dst)?;
            self.preserved
                .lock()
                .expect("preserved cache poisoned")
                .forget(&snapshot);
            info!(cell, epoch, "reused local eviction snapshot");
            restored = true;
        } else if !fresh {
            // Restore the newest durable epoch's full contiguous chain. The
            // epoch seal that once capped this read is deleted: the
            // cut it fixed defended only never-acked resurrection — not a
            // promise anyone holds — and under the log tier late arrival of
            // ACKED rows into a per-cell prefix is normal (recovery gathers,
            // the drain folds, the healing pass repairs), so a permanent cap
            // turned ordering slips into permanent loss. Without it the
            // healed rows are simply picked up here.
            //
            // A predecessor epoch that ended quietly left fleet-acked rows
            // in node bundles, and this restore reads per-cell prefixes
            // only. Fold that tail first — this activation holds the new
            // epoch's authority, so the write the fenced ending could not
            // make is lawful here, and the fold must precede the source
            // lookup because the tail can name an epoch the per-cell
            // listing has never seen. Failing the activation on a failed
            // fold is deliberate: restoring past it would serve a
            // truncated database as read-write (#473).
            if self.dirty_tails.lock().unwrap().contains(cell) {
                let sink = registered_durability(&self.registration)
                    .and_then(|targets| targets.bundle_sink.clone())
                    .ok_or_else(|| {
                        anyhow!("{cell} has an un-drained bundle tail and no bundle sink")
                    })?;
                sink.fold_cell(cell)
                    .await
                    .map_err(|error| anyhow!("fold bundle tail for {cell}: {error}"))?;
                self.dirty_tails.lock().unwrap().remove(cell);
            }
            let remote_started_mono_ms = asyncrt::mono_ms();
            let source_lookup_started_mono_ms = asyncrt::mono_ms();
            let source_epoch = self.highest_nonempty_epoch(cell).await?;
            let source_lookup_us = asyncrt::mono_ms()
                .saturating_sub(source_lookup_started_mono_ms)
                .saturating_mul(1_000);
            if let Some(from) = source_epoch {
                anyhow::ensure!(
                    from < epoch,
                    "refusing to restore {cell} from used epoch {from} into writer epoch {epoch}"
                );
                let client = self.client_for(cell, from);
                let _ = self.ltx_host.remove_file(&dst);
                let stats = replica::restore_timed_with_host_and_download_slots(
                    &client,
                    &dst,
                    TXID(0),
                    self.ltx_host.clone(),
                    self.restore_slots.clone(),
                )
                .await
                .map_err(|error| anyhow!("restore {cell} e{from}: {error}"))?;
                let levels = stats
                    .plan
                    .by_level
                    .iter()
                    .map(|(level, count)| format!("L{level}:{count}"))
                    .collect::<Vec<_>>()
                    .join(" ");
                remote_restore = Some(RemoteRestoreTiming {
                    started_mono_ms: remote_started_mono_ms,
                    from,
                    source_lookup_us,
                    plan_us: stats.plan_us,
                    download_us: stats.download_us,
                    apply_us: stats.apply_us,
                    objects: stats.plan.objects,
                    bytes: stats.plan.bytes,
                    levels,
                });
                info!(cell, from, to = epoch, "restored remote replica");
                restored = true;
            }
        }

        // Open the managed Db (creates a fresh WAL db when nothing was restored)
        // and pair it with this epoch's client. Registration is immediate: the
        // cell can be proved durable on its very first write. The just-opened
        // db's position is the replica's seed -- 0 for a fresh cell, the
        // restored max otherwise, and equal to the remote under epoch fencing --
        // so the first sync skips the `calc_pos` listing that otherwise storms a
        // rate-limiting store. On the rare decode error we leave it unseeded and
        // fall back to that listing.
        let db_open_started_mono_ms = asyncrt::mono_ms();
        let dst_ = dst.clone();
        let ltx_host = self.ltx_host.clone();
        let vfs_name = self.vfs_name.clone();
        let truncate_pages = self.truncate_pages_for_cell(cell);
        let (db, seed) = asyncrt::blocking(move || {
            #[cfg(celld_internal_tests)]
            let mut db =
                crate::fault::with_connection_role("celld_ltx_db", || match vfs_name.as_deref() {
                    Some(vfs_name) => Db::open_with_host_and_vfs(&dst_, ltx_host, vfs_name),
                    None => Db::open_with_host(&dst_, ltx_host),
                })?;
            #[cfg(not(celld_internal_tests))]
            let mut db = {
                debug_assert!(vfs_name.is_none());
                Db::open_with_host(&dst_, ltx_host)?
            };
            if let Some(pages) = truncate_pages {
                db.truncate_page_n = pages;
            }
            let seed = db.pos().ok();
            anyhow::Ok((db, seed))
        })
        .await?
        .map_err(|error| anyhow!("open managed db {}: {error}", dst.display()))?;
        let db_open_us = asyncrt::mono_ms()
            .saturating_sub(db_open_started_mono_ms)
            .saturating_mul(1_000);
        if let Some(timing) = remote_restore {
            info!(
                event = "restore_plan",
                cell,
                epoch = timing.from,
                to = epoch,
                objects = timing.objects,
                bytes = timing.bytes,
                levels = %timing.levels,
                total_us = asyncrt::mono_ms()
                    .saturating_sub(timing.started_mono_ms)
                    .saturating_mul(1_000),
                source_lookup_us = timing.source_lookup_us,
                plan_us = timing.plan_us,
                download_us = timing.download_us,
                apply_us = timing.apply_us,
                db_open_us,
                "computed restore plan"
            );
        }
        let mut replica = Replica::new(db, self.client_for(cell, epoch));
        if let Some(pos) = seed {
            replica.seed_pos(pos);
        }
        let handle = Arc::new(Cell {
            cell_id: cell.to_string(),
            epoch,
            ownership: self.ownership_handle(),
            replica: Mutex::new(Some(replica)),
            client: self.client_for(cell, epoch),
            req_seq: AtomicU64::new(0),
            synced_seq: AtomicU64::new(0),
            shipped_seq: AtomicU64::new(0),
            submitted_seq: AtomicU64::new(0),
            // Frames at or below the seed came from the bucket (or a proven
            // snapshot); the followers only ever need what follows.
            shipped_txid: AtomicU64::new(seed.map_or(0, |pos| pos.txid.0)),
            submitted_txid: AtomicU64::new(seed.map_or(0, |pos| pos.txid.0)),
            last_sync_ms: AtomicU64::new(asyncrt::wall_ms().max(0) as u64),
            durable_txid: AtomicU64::new(seed.map_or(0, |pos| pos.txid.0)),
            // The restore read the per-cell prefix, so the seed IS the
            // per-cell coverage at open.
            percell_txid: AtomicU64::new(seed.map_or(0, |pos| pos.txid.0)),
            syncing: AtomicBool::new(false),
            ready: Notify::new(),
            compaction: self.compaction_queue.as_ref().map(|queue| CellCompaction {
                cell: cell.to_string(),
                epoch,
                // The overlay lets compaction read bundle-resident frames
                // beside the per-cell objects; its output stays pure
                // per-cell L1s, which is the continuous drain.
                client: celld_ltx::BundleOverlayClient::new(
                    self.client_for(cell, epoch),
                    Some(Arc::new(SinkFetcher {
                        registration: self.registration.clone(),
                        cell: cell.to_string(),
                        epoch,
                    })),
                ),
                local_path: Db::meta_path_for_path(&dst),
                host: self.ltx_host.clone(),
                queue: queue.clone(),
                min_txids: self.compaction_min_txids,
                compacted_txid: AtomicU64::new(0),
                queued: AtomicBool::new(false),
                cancelled: AtomicBool::new(false),
                cancel: Notify::new(),
                run: tokio::sync::Mutex::new(()),
            }),
        });
        #[cfg(celld_internal_tests)]
        self.pause_activation_install_for_world().await;
        // Shutdown publishes stop before it takes the close gate and this map.
        // An activation that linearizes first is in shutdown's snapshot; one
        // that linearizes later closes its just-opened database and cannot
        // recreate a post-owner persistence resource. A failed release also
        // keeps its key in the stopped map, so the same gate prevents a second
        // managed handle from installing on the path before owner cleanup.
        // Keep the on-disk image: a `resume_local` activation owns the clean-reload
        // baseline, and a restored activation can own LTX metadata that this
        // losing path cannot safely classify for deletion.
        let (admitted, close_incomplete) = {
            let _close_gate = self.replica_close_gate.lock().unwrap();
            let mut cells = self.cells.lock().unwrap();
            let close_incomplete = self
                .stopped_cells
                .lock()
                .unwrap()
                .contains_key(&(cell.to_string(), epoch));
            if self.stop.is_stopped() || close_incomplete {
                (false, close_incomplete)
            } else {
                cells.insert((cell.to_string(), epoch), handle.clone());
                (true, false)
            }
        };
        if !admitted {
            close_replica(&handle).map_err(|error| {
                anyhow!("close stopped activation for {cell} epoch {epoch}: {error}")
            })?;
            if close_incomplete {
                anyhow::bail!("managed replica close is incomplete for {cell} epoch {epoch}");
            }
            anyhow::bail!("LTX replication stopped before activation installed");
        }
        if let Some(pos) = seed {
            maybe_queue_compaction(&handle, pos.txid.0);
        }

        Ok(ActivationResult {
            path: dst,
            restored,
        })
    }

    /// The output gate's primitive: take a durability ticket and return once a
    /// background sync that captured this write has completed, coalescing
    /// concurrent writes to one cell into a single upload. The write committed
    /// before this call, so any sync starting after our ticket captures it —
    /// we wait for `synced_seq >= my ticket`, not for a position, sidestepping
    /// the total_changes↔LTX-txid mismatch that a position compare would hit.
    /// Returns `position` (which the completed sync provably covered) for the
    /// core's coverage check.
    pub async fn await_durable(
        &self,
        cell: &str,
        epoch: u64,
        position: u64,
    ) -> anyhow::Result<(u64, celld_logic::ProofSource)> {
        let Some(handle) = self
            .cells
            .lock()
            .unwrap()
            .get(&(cell.to_string(), epoch))
            .cloned()
        else {
            anyhow::bail!("ltx cell not resident: {cell} epoch {epoch}");
        };
        let ticket = handle.req_seq.fetch_add(1, Ordering::SeqCst) + 1;
        self.dirty.notify_one();
        self.dirty_ship.notify_one();
        let started = asyncrt::mono_ms();
        let deadline = started.saturating_add(self.durability_timeout_ms);
        loop {
            // Register the waiter before checking, so a sync that completes
            // between the check and the await is not missed. Either proof
            // releases the gate: the bucket upload, or every ensemble
            // member's fsync — whichever lands first.
            let ready = handle.ready.notified();
            // Prefer the fleet proof when both hold. Ownership is still
            // re-checked at confirm (below) and again by VerifyOwnership in
            // the output gate — fleet no longer skips the epoch fence.
            let shipped = handle.shipped_seq.load(Ordering::SeqCst) >= ticket;
            if handle.synced_seq.load(Ordering::SeqCst) >= ticket || shipped {
                // ClawQL H2: refuse to report durable if ownership moved
                // between the sync/ship credit and this waiter waking.
                if fenced_ack_enabled() && !ownership_still_current(&handle).await {
                    anyhow::bail!(
                        "ltx durability refused for {cell} epoch {epoch}: ownership no longer current at confirm"
                    );
                }
                let source = if shipped {
                    celld_logic::ProofSource::Fleet
                } else {
                    celld_logic::ProofSource::Bucket
                };
                tracing::debug!(
                    target: "timing",
                    event = "durable_wait",
                    cell,
                    wait_us = asyncrt::mono_ms().saturating_sub(started).saturating_mul(1_000),
                    proof = if shipped { "fleet" } else { "bucket" },
                    "durability proof reached"
                );
                return Ok((position, source));
            }
            if asyncrt::timeout_at(deadline, ready).await.is_err() {
                anyhow::bail!("ltx durability timed out for {cell} epoch {epoch}");
            }
        }
    }

    /// A direct, synchronous durability pass for the rare eviction
    /// gates (not the hot write path). Also advances the cell's durable position
    /// so any output-gate waiters ride it.
    pub async fn sync_wait(&self, cell: &str, epoch: u64, _timeout: Duration) -> SyncWait {
        let Some(handle) = self
            .cells
            .lock()
            .unwrap()
            .get(&(cell.to_string(), epoch))
            .cloned()
        else {
            return SyncWait::Unsupported;
        };
        match sync_cell(handle.clone()).await {
            Some(true) => SyncWait::Durable,
            Some(false) => SyncWait::Failed,
            None => SyncWait::Unsupported,
        }
    }

    /// Return the configured durability deadline to a private deterministic
    /// world, so a bounded-liveness assertion uses the production value.
    #[cfg(all(test, celld_internal_tests))]
    pub(crate) fn durability_timeout_ms_for_world(&self) -> u64 {
        self.durability_timeout_ms
    }

    /// Close this cell after a final durability pass and install its database
    /// as the previous-epoch cache entry which the next activation consumes.
    ///
    /// A remote restore creates a live database at the successor epoch. Closing
    /// that database in place makes the next epoch ignore it because only a
    /// `.evicted` file is a certified reactivation base. The activation then
    /// downloads the same older snapshot again (#479). Use [`Self::close_in_place`]
    /// only when the caller cannot authorize a final durability pass.
    pub async fn release(&self, cell: &str, epoch: u64) -> anyhow::Result<()> {
        self.final_durability_barrier(cell, epoch).await?;

        // Cleanup does not transfer ownership, so it does not need the L9
        // handoff snapshot that eviction publishes. The durable L0 chain and
        // this certified local base cover both a later node and this node's
        // successor activation.
        self.remove_local(cell, epoch, true);
        Ok(())
    }

    /// Close this cell's managed database, leaving every file in place.
    ///
    /// Background work can retain the handle after registry removal. The method
    /// installs the close in the durability owner's task group before it waits
    /// for completion. Therefore, a cancelled caller cannot detach the close,
    /// and local shutdown joins the same operation instead of closing twice.
    /// If the blocking task fails before it takes the replica, the method
    /// returns an error and retains the handle. A later call retries the close,
    /// and the final owner shutdown also closes a retained handle.
    ///
    /// No durability pass here, deliberately. This runs on the stops that are
    /// not an orderly handoff, and a fenced node has lost the authority that
    /// would make writing more of this cell's history safe. `evict` below
    /// still syncs, and still refuses to drop a handle whose final pass
    /// failed, because that is the path where the node keeps the cell and is
    /// giving it up on purpose. The caller must require a successful result
    /// before it reuses the local path for another activation. Use
    /// [`Self::release`] when the caller can authorize a final durability pass.
    pub async fn close_in_place(&self, cell: &str, epoch: u64) -> anyhow::Result<()> {
        let key = (cell.to_string(), epoch);
        let (completed, admitted) = {
            // Keep the gate through active-to-stopped transfer and task
            // admission. Shutdown closes admission and snapshots both maps
            // under this same gate, so it cannot miss an in-flight release.
            let _close_gate = self.replica_close_gate.lock().unwrap();
            let handle = match self.cells.lock().unwrap().remove(&key) {
                Some(handle) => handle,
                None => {
                    let stopped = self.stopped_cells.lock().unwrap().get(&key).cloned();
                    let Some(handle) = stopped else {
                        return Ok(());
                    };
                    if !self.failed_release_closes.lock().unwrap().remove(&key) {
                        return Err(anyhow!(
                            "managed replica close is incomplete for {cell} epoch {epoch}; wait for it or finish local shutdown"
                        ));
                    }
                    handle
                }
            };
            self.note_undrained_tail(cell, &handle);
            self.stopped_cells
                .lock()
                .unwrap()
                .insert(key.clone(), handle.clone());
            if self.replica_close_stop.is_stopped() {
                self.failed_release_closes.lock().unwrap().insert(key);
                return Err(anyhow!(
                    "managed replica close was deferred to local shutdown for {cell} epoch {epoch}"
                ));
            }
            #[cfg(celld_internal_tests)]
            let pause = self.take_replica_close_pause_for_world();
            #[cfg(celld_internal_tests)]
            let panic_close = self.take_release_close_panic_for_world();
            let stopped_cells = self.stopped_cells.clone();
            let failed_release_closes = self.failed_release_closes.clone();
            let close_key = key.clone();
            let close_cell = cell.to_string();
            let close_handle = handle.clone();
            let (completed_tx, completed_rx) = tokio::sync::oneshot::channel();
            let admitted = self.replica_close_tasks.spawn_owned(
                "ltx_replica_close",
                async move {
                    let task_handle = close_handle.clone();
                    let close_result = asyncrt::blocking(move || {
                        #[cfg(celld_internal_tests)]
                        assert!(!panic_close, "injected managed release-close panic");
                        #[cfg(celld_internal_tests)]
                        pause_replica_close_for_world(pause);
                        close_replica(&task_handle)
                    })
                    .await;
                    let (close_result, retry_during_shutdown) = match close_result {
                        Ok(result) => (result, false),
                        Err(error) => (
                            Err(anyhow!("managed replica close task failed: {error}")),
                            true,
                        ),
                    };
                    if retry_during_shutdown {
                        failed_release_closes
                            .lock()
                            .unwrap()
                            .insert(close_key.clone());
                    } else {
                        let mut stopped = stopped_cells.lock().unwrap();
                        if stopped
                            .get(&close_key)
                            .is_some_and(|current| Arc::ptr_eq(current, &close_handle))
                        {
                            stopped.remove(&close_key);
                        }
                    }
                    if let Err(error) = close_result {
                        if retry_during_shutdown {
                            // The blocking lane failed before it proved that
                            // it took the replica. Keep the stopped entry so a
                            // later release or final shutdown retries it.
                            warn!(cell = close_cell, epoch, %error, "managed replica close task failed during removal");
                            let _ = completed_tx.send(Err(error.to_string()));
                        } else {
                            // close_replica took and dropped the database even
                            // when read-lock release failed, so this path needs
                            // no second close attempt.
                            warn!(cell = close_cell, epoch, %error, "close managed replica failed during removal");
                            let _ = completed_tx.send(Ok(()));
                        }
                    } else {
                        let _ = completed_tx.send(Ok(()));
                    }
                },
            );
            (completed_rx, admitted)
        };
        if admitted {
            completed
                .await
                .map_err(|_| anyhow!("managed replica close task ended without completion"))?
                .map_err(anyhow::Error::msg)
        } else {
            // Shutdown already owns the stopped entry and closes it from its
            // final snapshot. No new runtime can activate after this point.
            self.failed_release_closes.lock().unwrap().insert(key);
            Err(anyhow!(
                "managed replica close was deferred to local shutdown for {cell} epoch {epoch}"
            ))
        }
    }

    pub async fn evict(
        &self,
        cell: &str,
        epoch: u64,
        preserve_local: bool,
    ) -> anyhow::Result<EvictionRestoreArtifact> {
        // The runtime is closed before this pass, so it is the definitive
        // durability barrier. Do not discard its result: releasing ownership
        // after a failed final capture can acknowledge a write and then hand a
        // successor an older replica. Keep the Db
        // and its replication handle intact so the caller can retry the same
        // closed epoch.
        self.final_durability_barrier(cell, epoch).await?;
        let handle = self
            .cells
            .lock()
            .unwrap()
            .get(&(cell.to_string(), epoch))
            .cloned()
            .ok_or_else(|| anyhow!("ltx cell not resident: {cell} epoch {epoch}"))?;
        let snapshot = self.prepare_handoff_snapshot(&handle).await?;
        let artifact = match snapshot {
            Some(snapshot) => {
                self.publish_handoff_snapshot_with_retry(cell, epoch, &snapshot)
                    .await
            }
            None => EvictionRestoreArtifact::L0Chain,
        };

        // Keep the local Db until the snapshot succeeds or its retry window
        // ends. The definitive barrier above makes the L0 chain sufficient, so
        // a failed optimization cannot pin ownership after that boundary.
        self.remove_local(cell, epoch, preserve_local);
        Ok(artifact)
    }

    async fn final_durability_barrier(&self, cell: &str, epoch: u64) -> anyhow::Result<()> {
        let barrier_started_mono_ms = asyncrt::mono_ms();
        match self.sync_wait(cell, epoch, Duration::from_secs(10)).await {
            SyncWait::Durable => {}
            SyncWait::Unsupported => {
                return Err(anyhow!(
                    "final durability is unsupported for {cell} epoch {epoch}"
                ));
            }
            SyncWait::Failed => {
                return Err(anyhow!("final durability failed for {cell} epoch {epoch}"));
            }
        }
        info!(
            event = "final_durability_barrier",
            cell,
            epoch,
            elapsed_ms = asyncrt::mono_ms().saturating_sub(barrier_started_mono_ms),
            "final durability barrier passed"
        );
        Ok(())
    }

    /// Discard a reset runtime without another durability attempt.
    ///
    /// The proof that triggered Reset already failed. Retrying it here can keep
    /// the unproved database resident and contradicts Reset's keep-nothing
    /// contract, so this path removes the handle and every live local file.
    pub(crate) fn discard(&self, cell: &str, epoch: u64) {
        self.remove_local(cell, epoch, false);
    }

    fn remove_local(&self, cell: &str, epoch: u64, preserve_local: bool) {
        let removed = self
            .cells
            .lock()
            .unwrap()
            .remove(&(cell.to_string(), epoch));
        if let Some(handle) = &removed {
            self.note_undrained_tail(cell, handle);
        }
        let close_result = removed.map_or(Ok(()), |handle| close_replica(&handle));
        self.finish_remove_local(cell, epoch, preserve_local, close_result);
    }

    /// Record an ending that leaves acked rows outside the per-cell
    /// layout. Acked is the max of the fleet credit and the tiering
    /// credit — the bundle flush advances `durable_txid`, so neither
    /// alone is per-cell coverage. Covered is what a successor restore
    /// will actually see: the per-cell watermark plus the drain's L1
    /// fold. Anything acked above covered sits only in node bundles,
    /// where no restore looks (#473). Conservative on purpose: a stale
    /// `compacted_txid` marks a cell whose fold then finds nothing,
    /// which costs one bundle-prefix scan, never a lost row.
    fn note_undrained_tail(&self, cell: &str, handle: &Cell) {
        let acked = handle
            .shipped_txid
            .load(Ordering::SeqCst)
            .max(handle.durable_txid.load(Ordering::SeqCst));
        let covered = handle.percell_txid.load(Ordering::SeqCst).max(
            handle.compaction.as_ref().map_or(0, |compaction| {
                compaction.compacted_txid.load(Ordering::SeqCst)
            }),
        );
        if acked > covered {
            self.dirty_tails.lock().unwrap().insert(cell.to_string());
        }
    }

    fn finish_remove_local(
        &self,
        cell: &str,
        epoch: u64,
        preserve_local: bool,
        close_result: anyhow::Result<()>,
    ) {
        let preserve_local = match close_result {
            Ok(()) => preserve_local,
            Err(error) => {
                warn!(
                    cell,
                    epoch,
                    %error,
                    "close managed replica failed; discarding local snapshot"
                );
                // A failed close cannot qualify the live database as a
                // reusable baseline. An orderly eviction already published
                // its final snapshot, and every other caller requested no
                // local reuse, so force any next epoch through remote restore.
                false
            }
        };
        let db = self.db_path(cell, epoch);
        if preserve_local {
            let preserved = db.with_extension("evicted");
            if let Err(error) = self.ltx_host.rename(&db, &preserved) {
                warn!(cell, epoch, %error, "preserve local snapshot failed");
            } else {
                if let Err(error) = self
                    .preserved
                    .lock()
                    .expect("preserved cache poisoned")
                    .insert(preserved)
                {
                    warn!(cell, epoch, %error, "index preserved local snapshot failed");
                }
            }
        }
        // Clear the WAL/meta siblings and the live db regardless: a reactivation
        // restores or reuses the `.hibernated` copy.
        for suffix in ["-wal", "-shm"] {
            let mut sibling = db.clone().into_os_string();
            sibling.push(suffix);
            let _ = self.ltx_host.remove_file(&PathBuf::from(sibling));
        }
        let _ = self.ltx_host.remove_dir_all(&Db::meta_path_for_path(&db));
        if !preserve_local {
            let _ = self.ltx_host.remove_file(&db);
        }
    }

    /// Read one full snapshot after the final L0 proof.
    ///
    /// A retry reuses these bytes. Recreating the image for each failed PUT
    /// would spend local I/O without changing the closed database.
    async fn prepare_handoff_snapshot(
        &self,
        handle: &CellHandle,
    ) -> anyhow::Result<Option<HandoffSnapshot>> {
        cancel_compaction(handle);
        let _compaction_run = match &handle.compaction {
            Some(compaction) => Some(compaction.run.lock().await),
            None => None,
        };

        let snapshot_handle = handle.clone();
        asyncrt::blocking(move || -> anyhow::Result<Option<HandoffSnapshot>> {
            let mut replica_slot = snapshot_handle.replica.lock().unwrap();
            let replica = replica_slot
                .as_mut()
                .ok_or_else(|| anyhow!("handoff snapshot replica is closed"))?;
            let durable_txid = replica.pos().txid;
            if durable_txid == TXID(0) {
                return Ok(None);
            }
            let db = replica
                .db_mut()
                .ok_or_else(|| anyhow!("handoff snapshot database is unavailable"))?;
            let mut data = Vec::new();
            let position = db
                .snapshot_to_writer(&mut data)
                .map_err(|error| anyhow!("create handoff snapshot: {error}"))?;
            anyhow::ensure!(
                position.txid == durable_txid,
                "handoff snapshot position {} does not match durable position {}",
                position.txid.0,
                durable_txid.0,
            );
            Ok(Some(HandoffSnapshot {
                max_txid: position.txid,
                data,
            }))
        })
        .await
        .map_err(|error| anyhow!("join handoff snapshot task: {error}"))?
    }

    /// Retry the optional L9 upload inside the configured durability window.
    ///
    /// The L0 barrier passed before this function starts. Therefore, the
    /// snapshot reduces restore work but does not decide whether the state is
    /// safe to release.
    async fn publish_handoff_snapshot_with_retry(
        &self,
        cell: &str,
        epoch: u64,
        snapshot: &HandoffSnapshot,
    ) -> EvictionRestoreArtifact {
        let deadline = asyncrt::mono_ms().saturating_add(self.durability_timeout_ms);
        let mut attempts = 0_u64;
        let last_error = loop {
            attempts = attempts.saturating_add(1);
            let error = match asyncrt::timeout_at(
                deadline,
                self.publish_handoff_snapshot(cell, epoch, snapshot),
            )
            .await
            {
                Ok(Ok(())) => return EvictionRestoreArtifact::Snapshot,
                Ok(Err(error)) => error,
                Err(error) => anyhow!("publish handoff snapshot: {error}"),
            };
            let now = asyncrt::mono_ms();
            if now >= deadline {
                break error;
            }
            // Start at the actor's existing 50 ms retry cadence, then back off
            // linearly. The deadline caps both the delay and the request.
            let delay_ms = crate::replication::CELL_RELEASE_RETRY_BASE_MS
                .saturating_mul(attempts)
                .min(deadline.saturating_sub(now));
            asyncrt::sleep(Duration::from_millis(delay_ms)).await;
            if asyncrt::mono_ms() >= deadline {
                break error;
            }
        };
        warn!(
            event = "eviction_snapshot_skipped",
            cell,
            epoch,
            attempts,
            error = %last_error,
            "releasing the cell with its proven L0 chain after the snapshot retry window"
        );
        EvictionRestoreArtifact::L0Chain
    }

    /// Publish one full L9 snapshot of a closed cell. The additive L0 chain
    /// stays remote, so this upload is a restore optimization after the proof.
    async fn publish_handoff_snapshot(
        &self,
        cell: &str,
        epoch: u64,
        snapshot: &HandoffSnapshot,
    ) -> anyhow::Result<()> {
        let started_mono_ms = asyncrt::mono_ms();
        let info = self
            .client_for(cell, epoch)
            .write_ltx_file(
                replica::SNAPSHOT_LEVEL,
                TXID(1),
                snapshot.max_txid,
                &snapshot.data,
            )
            .await
            .map_err(|error| anyhow!("publish handoff snapshot: {error}"))?;
        anyhow::ensure!(
            info.level == replica::SNAPSHOT_LEVEL
                && info.min_txid == TXID(1)
                && info.max_txid == snapshot.max_txid,
            "handoff snapshot metadata does not match the closed database",
        );
        info!(
            event = "ltx_handoff_snapshot",
            cell,
            epoch,
            max_txid = snapshot.max_txid.0,
            bytes = info.size,
            elapsed_ms = asyncrt::mono_ms().saturating_sub(started_mono_ms),
            "published authoritative handoff snapshot"
        );
        Ok(())
    }

    /// Copy the live epoch into a private read-only snapshot for inspection.
    pub fn snapshot_active(
        &self,
        cell: &str,
        epoch: u64,
    ) -> anyhow::Result<Option<RestoredSnapshot>> {
        let source = self.db_path(cell, epoch);
        if !self
            .ltx_host
            .metadata(&source)
            .is_ok_and(|metadata| metadata.is_file)
        {
            return Ok(None);
        }
        let directory = self.watch.join(format!(".inspect-{cell}-e{epoch}"));
        let _ = self.ltx_host.remove_dir_all(&directory);
        self.ltx_host.create_dir_all(&directory)?;
        let path = directory.join("db.sqlite");
        sqlite_snapshot(&source, &path, self.vfs_name.as_deref())?;
        Ok(Some(RestoredSnapshot::new(
            epoch,
            path,
            directory,
            self.ltx_host.filesystem(),
        )))
    }

    /// Restore the newest durable replica into a private snapshot without
    /// claiming or activating the cell.
    pub async fn restore_snapshot(&self, cell: &str) -> anyhow::Result<Option<RestoredSnapshot>> {
        let Some(epoch) = self.highest_nonempty_epoch(cell).await? else {
            return Ok(None);
        };
        let directory = self.watch.join(format!(".restore-{cell}"));
        let _ = self.ltx_host.remove_dir_all(&directory);
        self.ltx_host.create_dir_all(&directory)?;
        let path = directory.join("db.sqlite");
        replica::restore_with_host_and_download_slots(
            &self.client_for(cell, epoch),
            &path,
            TXID(0),
            self.ltx_host.clone(),
            self.restore_slots.clone(),
        )
        .await
        .map_err(|error| anyhow!("restore snapshot {cell} e{epoch}: {error}"))?;
        Ok(Some(RestoredSnapshot::new(
            epoch,
            path,
            directory,
            self.ltx_host.filesystem(),
        )))
    }

    pub fn prune_local_cache(&self, max_bytes: u64) -> std::io::Result<(usize, usize, u64)> {
        self.preserved
            .lock()
            .expect("preserved cache poisoned")
            .prune(&self.watch, max_bytes)
    }

    /// Close the replicator handle while retaining the live database and WAL
    /// exactly where the local path encodes them.
    pub fn close_for_reload(&self, cell: &str, epoch: u64) -> anyhow::Result<()> {
        let removed = self
            .cells
            .lock()
            .unwrap()
            .remove(&(cell.to_string(), epoch));
        if let Some(handle) = removed {
            close_replica_for_reload(&handle, cell, epoch)?;
        }
        let path = self.db_path(cell, epoch);
        anyhow::ensure!(
            self.ltx_host
                .metadata(&path)
                .is_ok_and(|metadata| metadata.is_file),
            "resident database is missing: {}",
            path.display()
        );
        Ok(())
    }

    /// Enumerate live-named databases. Cached `.evicted` files are separate
    /// and remain under the ordinary cache byte limit.
    pub fn local_cells(&self) -> Vec<celld_logic::LocalCell> {
        let mut cells = Vec::new();
        let filesystem = self.ltx_host.filesystem();
        let Ok(cell_dirs) = filesystem.read_dir(&self.watch) else {
            return cells;
        };
        for cell_dir in cell_dirs {
            if !cell_dir.is_dir {
                continue;
            }
            let Some(cell) = cell_dir.file_name.to_str().map(str::to_owned) else {
                continue;
            };
            let Ok(epochs) = filesystem.read_dir(&cell_dir.path.join("ltx")) else {
                continue;
            };
            for epoch_dir in epochs {
                let Some(epoch) = epoch_dir
                    .file_name
                    .to_str()
                    .and_then(|name| name.strip_prefix('e'))
                    .and_then(|epoch| epoch.parse::<u64>().ok())
                else {
                    continue;
                };
                if filesystem
                    .metadata(&epoch_dir.path.join("db.sqlite"))
                    .is_ok_and(|metadata| metadata.is_file)
                {
                    cells.push(celld_logic::LocalCell {
                        id: cell.clone(),
                        epoch,
                    });
                }
            }
        }
        cells.sort();
        cells.dedup();
        cells
    }

    /// Delete stale live-named epochs after the runtime has identified and
    /// closed its exact resident set. Remote replicas remain authoritative.
    pub fn prune_stale_live(
        &self,
        keep: &std::collections::BTreeSet<(String, u64)>,
    ) -> anyhow::Result<usize> {
        let stale: Vec<_> = self
            .local_cells()
            .into_iter()
            .filter(|cell| !keep.contains(&(cell.id.clone(), cell.epoch)))
            .collect();
        for cell in &stale {
            let db = self.db_path(&cell.id, cell.epoch);
            if let Some(parent) = db.parent() {
                self.ltx_host.remove_dir_all(parent)?;
                let mut preserved = self.preserved.lock().expect("preserved cache poisoned");
                preserved.forget(&db.with_extension("evicted"));
                preserved.forget(&db.with_extension("hibernated"));
            }
        }
        let remaining: std::collections::BTreeSet<_> = self
            .local_cells()
            .into_iter()
            .map(|cell| (cell.id, cell.epoch))
            .collect();
        anyhow::ensure!(
            &remaining == keep,
            "clean reload inventory mismatch after pruning: expected {}, found {}",
            keep.len(),
            remaining.len()
        );
        Ok(stale.len())
    }

    /// There is no external process, so the in-process replicator is healthy while celld runs.
    pub fn process_status(&self) -> std::io::Result<Option<std::process::ExitStatus>> {
        Ok(None)
    }
}

/// ClawQL fork: require a confirm GET after each LTX PUT before the output
/// gate may treat the write as durable under a bucket proof. Default on.
fn fenced_ack_enabled() -> bool {
    crate::env_vars::flag("CELLD_FENCED_ACK", true).unwrap_or(true)
}

/// Confirm GET after PUT. Default on whenever fenced ack is on. Set
/// `CELLD_FENCED_ACK_CONFIRM_GET=0` to measure PUT-return-only + epoch check
/// (if R2/S3 PUT success already means durable store, the GET may be pure
/// cost). Epoch-at-confirm still runs when fenced ack is on.
fn fenced_ack_confirm_get_enabled() -> bool {
    fenced_ack_enabled()
        && crate::env_vars::flag("CELLD_FENCED_ACK_CONFIRM_GET", true).unwrap_or(true)
}

/// ClawQL H2: at confirm time the ownership record must still name this node
/// at this cell's resident epoch. A stale incarnation can PUT+GET its own
/// orphaned prefix successfully; refusing here keeps `synced_seq` from
/// advancing so the output gate never releases a fetch on an orphaned write.
async fn ownership_still_current(handle: &CellHandle) -> bool {
    let Some(ownership) = handle.ownership.lock().unwrap().clone() else {
        return true;
    };
    match ownership.read_owner(&handle.cell_id).await {
        Ok(Some(record))
            if record.node.as_deref() == Some(ownership.node_id())
                && record.epoch == handle.epoch =>
        {
            true
        }
        Ok(record) => {
            warn!(
                cell = %handle.cell_id,
                epoch = handle.epoch,
                ?record,
                "ltx fenced-ack: ownership no longer ours at confirm; refusing synced_seq advance"
            );
            false
        }
        Err(error) => {
            warn!(
                %error,
                cell = %handle.cell_id,
                epoch = handle.epoch,
                "ltx fenced-ack: ownership read failed at confirm; refusing synced_seq advance"
            );
            false
        }
    }
}

/// One capture+upload for a cell: advance its durable position on success and
/// wake its waiters. Everything committed before the capture is durable once
/// uploaded, so the target is read before `db.sync`.
///
/// The capture runs under the replica mutex on a blocking thread; the upload
/// runs OFF the mutex. A slow bucket PUT held the lock for its whole round
/// trip, and the log tier's ship capture queued behind it — the lab measured
/// 4-6 s ack spikes at every flush collision. Uploads are idempotent
/// overwrites keyed by TXID, and `syncing` already guarantees one pass per
/// cell, so staging then uploading lock-free is the same protocol
/// `Replica::sync` runs, minus the contention.
///
/// `Some(true)` means success, `Some(false)` means failure, and `None` means
/// that the replica lost its database.
async fn sync_cell(handle: CellHandle) -> Option<bool> {
    // Tickets taken before the capture: their writes committed before
    // `db.sync` runs, so it captures them. Read before the capture so a
    // ticket taken during the sync is credited by the next one, not this.
    type Staged = (u64, Vec<(u64, Vec<u8>)>);
    let handle_ = handle.clone();
    let staged: Option<Result<Staged, ()>> = asyncrt::blocking(move || {
        let captured = handle_.req_seq.load(Ordering::SeqCst);
        let mut replica = handle_.replica.lock().unwrap();
        let from = replica.as_mut()?.pos().txid.0 + 1;
        let db = replica.as_mut()?.db_mut()?;
        if let Err(error) = db.sync() {
            warn!(%error, "ltx wal capture failed");
            return Some(Err(()));
        }
        let dpos = match db.pos() {
            Ok(pos) => pos,
            Err(error) => {
                warn!(%error, "ltx position read failed");
                return Some(Err(()));
            }
        };
        let mut files = Vec::new();
        for txid in from..=dpos.txid.0 {
            match db.read_ltx_file(0, TXID(txid), TXID(txid)) {
                Ok(bytes) => files.push((txid, bytes)),
                Err(error) => {
                    warn!(%error, txid, "read staged l0 failed");
                    return Some(Err(()));
                }
            }
        }
        Some(Ok((captured, files)))
    })
    .await
    .unwrap_or(Some(Err(())));
    let (captured, files) = match staged {
        None => return None,
        Some(Err(())) => {
            handle.ready.notify_waiters();
            return Some(false);
        }
        Some(Ok(staged)) => staged,
    };
    let last = files.last().map(|(txid, _)| *txid);
    // A paced fleet normally keeps this tail in node bundles instead of the
    // per-cell prefix. A handoff must materialize that prefix before it can
    // delete the local copy, but one PUT per transaction makes the drain cost
    // grow with the hot cell's lifetime. Fold the contiguous tail exactly as
    // dead-node recovery does, so the durability cut has one remote write.
    // A malformed or discontinuous tail keeps the conservative per-row path.
    let merged = LtxRepl::merge_l0_rows(&files);
    let uploads: Vec<(u64, u64, &[u8])> = match (files.first(), files.last(), merged.as_ref()) {
        (Some((min_txid, _)), Some((max_txid, _)), Some(bytes)) => {
            vec![(*min_txid, *max_txid, bytes.as_slice())]
        }
        _ => files
            .iter()
            .map(|(txid, bytes)| (*txid, *txid, bytes.as_slice()))
            .collect(),
    };
    for (min_txid, max_txid, bytes) in &uploads {
        if let Err(error) = handle
            .client
            .write_ltx_file(0, TXID(*min_txid), TXID(*max_txid), bytes)
            .await
        {
            warn!(%error, min_txid, max_txid, "ltx upload failed");
            handle
                .last_sync_ms
                .store(asyncrt::wall_ms().max(0) as u64, Ordering::SeqCst);
            handle.ready.notify_waiters();
            return Some(false);
        }
        // ClawQL fork (H1 fenced ack): PUT success alone was not enough under
        // the measured during_call losses. Confirm the object is readable
        // before advancing synced_seq. Toggle with CELLD_FENCED_ACK_CONFIRM_GET
        // for PUT-only vs PUT+GET latency A/B (epoch check still applies).
        if fenced_ack_confirm_get_enabled() {
            match handle
                .client
                .open_ltx_file(0, TXID(*min_txid), TXID(*max_txid))
                .await
            {
                Ok(got) if got.len() == bytes.len() => {}
                Ok(_) => {
                    warn!(
                        min_txid,
                        max_txid, "ltx fenced-ack: uploaded object size mismatch on confirm GET"
                    );
                    handle
                        .last_sync_ms
                        .store(asyncrt::wall_ms().max(0) as u64, Ordering::SeqCst);
                    handle.ready.notify_waiters();
                    return Some(false);
                }
                Err(error) => {
                    warn!(%error, min_txid, max_txid, "ltx fenced-ack: confirm GET failed");
                    handle
                        .last_sync_ms
                        .store(asyncrt::wall_ms().max(0) as u64, Ordering::SeqCst);
                    handle.ready.notify_waiters();
                    return Some(false);
                }
            }
        }
    }
    // ClawQL fork (H2): committed object is not enough — this node's epoch
    // must still be current at confirmation time. Otherwise a wedged stale
    // incarnation credits synced_seq, the gate releases, and the fetch leaves
    // on an orphaned lineage (4/5 measured losses were stall cascades).
    if fenced_ack_enabled() && !ownership_still_current(&handle).await {
        handle
            .last_sync_ms
            .store(asyncrt::wall_ms().max(0) as u64, Ordering::SeqCst);
        handle.ready.notify_waiters();
        return Some(false);
    }
    if let Some(last) = last {
        // Advance the replica's uploaded watermark; `syncing` serializes
        // passes, so nothing else moved it meanwhile.
        // A close can win after staging, so credit only a still-open replica.
        // The durable watermark remains valid when the replica is closed.
        if let Some(replica) = handle.replica.lock().unwrap().as_mut() {
            replica.seed_pos(Pos::new(TXID(last), 0));
        }
        handle.durable_txid.fetch_max(last, Ordering::SeqCst);
        handle.percell_txid.fetch_max(last, Ordering::SeqCst);
    }
    handle.synced_seq.fetch_max(captured, Ordering::SeqCst);
    maybe_queue_compaction(&handle, handle.durable_txid.load(Ordering::SeqCst));
    handle
        .last_sync_ms
        .store(asyncrt::wall_ms().max(0) as u64, Ordering::SeqCst);
    handle.ready.notify_waiters();
    Some(true)
}

fn maybe_queue_compaction(handle: &CellHandle, durable_txid: u64) {
    let Some(compaction) = &handle.compaction else {
        return;
    };
    if compaction.cancelled.load(Ordering::SeqCst)
        || durable_txid.saturating_sub(compaction.compacted_txid.load(Ordering::SeqCst))
            < compaction.min_txids
        || compaction
            .queued
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
    {
        return;
    }
    if compaction
        .queue
        .send(CompactionWork {
            cell: Arc::downgrade(handle),
            queued_at_mono_ms: asyncrt::mono_ms(),
        })
        .is_err()
    {
        compaction.queued.store(false, Ordering::SeqCst);
    }
}

fn cancel_compaction(handle: &CellHandle) {
    let Some(compaction) = &handle.compaction else {
        return;
    };
    compaction.cancelled.store(true, Ordering::SeqCst);
    compaction.cancel.notify_waiters();
}

fn start_compaction_loop(
    config: CompactionConfig,
    stop: StopToken,
    roots: &TaskGroup,
    workers: TaskGroup,
    requeues: TaskGroup,
) -> mpsc::UnboundedSender<CompactionWork> {
    let (queue, mut work) = mpsc::unbounded_channel::<CompactionWork>();
    let slots = Arc::new(Semaphore::new(config.concurrency));
    roots.spawn_owned("ltx_compaction_dispatcher", async move {
        loop {
            let next = asyncrt::select_biased! {
                "a stop signal that ties queued compaction work starts no new worker";
                _ = stop.stopped() => break,
                next = work.recv() => next,
            };
            let Some(work) = next else { break };
            let permit = asyncrt::select_biased! {
                "a stop signal that ties slot acquisition starts no new compaction";
                _ = stop.stopped() => break,
                permit = slots.clone().acquire_owned() => permit,
            };
            let Ok(permit) = permit else {
                break;
            };
            let Some(cell) = work.cell.upgrade() else {
                continue;
            };
            let requeues = requeues.clone();
            workers.spawn_owned("ltx_compaction_worker", async move {
                let _permit = permit;
                compact_cell(
                    cell,
                    work.queued_at_mono_ms,
                    "threshold",
                    true,
                    Some(requeues),
                )
                .await;
            });
        }
    });
    queue
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CompactionOutcome {
    Advanced,
    Current,
    Failed,
    Cancelled,
}

async fn compact_cell(
    handle: CellHandle,
    queued_at_mono_ms: u64,
    trigger: &'static str,
    cancellable: bool,
    requeues: Option<TaskGroup>,
) -> CompactionOutcome {
    let Some(compaction) = &handle.compaction else {
        return CompactionOutcome::Current;
    };
    let cancelled = compaction.cancel.notified();
    tokio::pin!(cancelled);
    if cancellable && compaction.cancelled.load(Ordering::SeqCst) {
        compaction.queued.store(false, Ordering::SeqCst);
        return CompactionOutcome::Cancelled;
    }
    let _run = compaction.run.lock().await;
    if cancellable && compaction.cancelled.load(Ordering::SeqCst) {
        compaction.queued.store(false, Ordering::SeqCst);
        return CompactionOutcome::Cancelled;
    }

    let queue_ms = asyncrt::mono_ms().saturating_sub(queued_at_mono_ms);
    let started = asyncrt::mono_ms();
    let compactor = ReplicaCompactor::new(&compaction.client)
        .with_host(compaction.host.clone())
        .with_verification(true)
        .with_local_path(&compaction.local_path)
        .with_limits(COMPACTION_MAX_FILES, COMPACTION_MAX_INPUT_BYTES);
    let worker = compactor.compact(1);
    tokio::pin!(worker);
    let result = if cancellable {
        asyncrt::select_biased! {
            "a cancellation that ties compaction completion discards the cancelled round";
            _ = &mut cancelled => None,
            result = &mut worker => Some(result),
        }
    } else {
        Some(worker.as_mut().await)
    };

    let outcome = match result {
        Some(Ok(Some(output))) => {
            let info = output.info;
            compaction
                .compacted_txid
                .store(info.max_txid.0, Ordering::SeqCst);
            info!(
                event = "ltx_compaction",
                trigger,
                cell = %compaction.cell,
                epoch = compaction.epoch,
                source_level = 0,
                destination_level = info.level,
                min_txid = info.min_txid.0,
                max_txid = info.max_txid.0,
                input_objects = output.input_files,
                input_bytes = output.input_bytes,
                local_input_objects = output.local_input_files,
                remote_input_objects = output.input_files - output.local_input_files,
                output_bytes = info.size,
                queue_ms,
                elapsed_ms = asyncrt::mono_ms().saturating_sub(started),
                result = "ok",
                "compacted an additive LTX level"
            );
            CompactionOutcome::Advanced
        }
        Some(Ok(None)) => {
            compaction
                .compacted_txid
                .store(handle.durable_txid.load(Ordering::SeqCst), Ordering::SeqCst);
            info!(
                event = "ltx_compaction",
                trigger,
                cell = %compaction.cell,
                epoch = compaction.epoch,
                source_level = 0,
                destination_level = 1,
                queue_ms,
                elapsed_ms = asyncrt::mono_ms().saturating_sub(started),
                result = "no_work",
                "the additive LTX level is current"
            );
            CompactionOutcome::Current
        }
        Some(Err(error)) => {
            warn!(
                event = "ltx_compaction",
                trigger,
                cell = %compaction.cell,
                epoch = compaction.epoch,
                source_level = 0,
                destination_level = 1,
                queue_ms,
                elapsed_ms = asyncrt::mono_ms().saturating_sub(started),
                result = "error",
                %error,
                "additive LTX compaction failed"
            );
            CompactionOutcome::Failed
        }
        None => {
            info!(
                event = "ltx_compaction",
                trigger,
                cell = %compaction.cell,
                epoch = compaction.epoch,
                source_level = 0,
                destination_level = 1,
                queue_ms,
                elapsed_ms = asyncrt::mono_ms().saturating_sub(started),
                result = "cancelled",
                "cancelled an additive LTX compaction"
            );
            CompactionOutcome::Cancelled
        }
    };
    compaction.queued.store(false, Ordering::SeqCst);

    if matches!(
        outcome,
        CompactionOutcome::Advanced | CompactionOutcome::Current
    ) && !compaction.cancelled.load(Ordering::SeqCst)
    {
        // Pace consecutive rounds for one cell: a restart with a large tail
        // otherwise drains back-to-back for minutes. The pause matches the
        // round it follows (capped), so a cell compacts at half duty cycle
        // while the worker slot frees for other cells immediately. The owner
        // retains this delayed task, but the task does not retain the permit.
        let pause = Duration::from_millis(asyncrt::mono_ms().saturating_sub(started))
            .min(Duration::from_secs(2));
        let handle_ = Arc::downgrade(&handle);
        let Some(requeues) = requeues else {
            return outcome;
        };
        let stop = requeues.stop_token();
        requeues.spawn_owned("ltx_compaction_requeue", async move {
            asyncrt::select_biased! {
                "a stop signal that ties the requeue pause prevents another compaction round";
                _ = stop.stopped() => return,
                _ = asyncrt::sleep(pause) => {},
            }
            let Some(handle_) = handle_.upgrade() else {
                return;
            };
            let durable_txid = handle_.durable_txid.load(Ordering::SeqCst);
            maybe_queue_compaction(&handle_, durable_txid);
        });
    }
    outcome
}

fn compaction_config_from_env() -> anyhow::Result<Option<CompactionConfig>> {
    // On by default. A mixed fleet must set `0` until every node can read
    // v0.5.2 block objects. An old reader cannot take over a cell after its
    // first L1 publication.
    let enabled = crate::env_vars::flag("CELLD_LTX_COMPACTION", true)?;
    if !enabled {
        return Ok(None);
    }

    let min_txids = crate::env_vars::with_default("CELLD_LTX_COMPACTION_MIN_TXIDS", 256)?;
    let concurrency = crate::env_vars::with_default("CELLD_LTX_COMPACTIONS", 2)?;
    anyhow::ensure!(
        min_txids >= 2,
        "CELLD_LTX_COMPACTION_MIN_TXIDS must be at least 2"
    );
    anyhow::ensure!(concurrency > 0, "CELLD_LTX_COMPACTIONS must be positive");
    Ok(Some(CompactionConfig {
        min_txids: min_txids as u64,
        concurrency,
    }))
}

/// The node's background sync loop: wake on a dirty cell (or a slow tick) and
/// launch a sync for every cell whose committed position runs ahead of its
/// durable one. Each cell's sync is an independent, self-rescheduling task —
/// the loop does *not* wait for the batch to finish — so one slow cell's upload
/// never stalls the others (a cell keeps its own cadence up to the concurrency
/// bound). A cell's writes reported between its syncs still clear on one upload:
/// the batching win, without the cross-cell head-of-line blocking.
async fn sync_loop(
    cells: Arc<Mutex<BTreeMap<(String, u64), CellHandle>>>,
    dirty: Arc<Notify>,
    slots: Arc<Semaphore>,
    registration: Arc<Mutex<RegistrationState>>,
    stop: StopToken,
    sync_tasks: TaskGroup,
    flush_ms: u64,
) {
    loop {
        asyncrt::select_biased! {
            "a stop signal that ties a sync-loop wake prevents another cell scan";
            _ = stop.stopped() => break,
            _ = async {
                asyncrt::select_biased! {
                    "a dirty notification wins a tie with the fallback tick to retain wake order";
                    _ = dirty.notified() => {},
                    _ = asyncrt::sleep(Duration::from_millis(25)) => {},
                }
            } => {},
        }
        if stop.is_stopped() {
            break;
        }
        // The upload-cadence dial. With a healthy shipper installed, acks
        // ride the followers, so uploads become tiering and are PACED: an
        // immediate upload would hold the replica mutex for a bucket round
        // trip and the ship capture would queue behind it, putting the
        // bucket back on the ack path — the lab measured exactly that.
        // Without a shipper (or degraded), uploads run immediately: they
        // are the ack path again.
        let registered = registered_durability(&registration);
        let paced = flush_ms > 0
            && registered
                .as_ref()
                .is_some_and(|targets| targets.shipper.active());
        // With an active bundle sink, the bundle loop owns paced tiering
        // entirely — one PUT per node-flush instead of one per cell. This
        // loop then serves only the unpaced (degraded) mode and the direct
        // sync_wait callers, which are the drain points.
        let bundling = paced
            && registered
                .as_ref()
                .and_then(|targets| targets.bundle_sink.as_ref())
                .is_some_and(|sink| sink.active());
        let now = asyncrt::wall_ms().max(0) as u64;
        let work: Vec<CellHandle> = {
            let map = cells.lock().unwrap();
            map.values()
                .filter(|c| {
                    c.req_seq.load(Ordering::SeqCst) > c.synced_seq.load(Ordering::SeqCst)
                        && !bundling
                        && (!paced
                            || now.saturating_sub(c.last_sync_ms.load(Ordering::SeqCst))
                                >= flush_ms)
                })
                .cloned()
                .collect()
        };
        for cell in work {
            // Claim the cell; skip if a sync is already in flight for it.
            if cell
                .syncing
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_err()
            {
                continue;
            }
            let slots = slots.clone();
            let dirty = dirty.clone();
            let worker_stop = stop.clone();
            sync_tasks.spawn_owned("ltx_cell_sync", async move {
                // Keep syncing this cell while it stays dirty, rather than
                // notifying the main loop to re-scan every completion — that made
                // the loop wake O(cells) times and starved throughput as cells
                // accumulated. This is not a busy loop: each iteration awaits an
                // object-store upload (~one round-trip). A *failed* sync would
                // not, so it backs off, keeping the only tight iterations the
                // ones that actually uploaded.
                loop {
                    if worker_stop.is_stopped() {
                        break;
                    }
                    let ok = {
                        let _permit = slots.acquire().await;
                        sync_cell(cell.clone()).await
                    };
                    // Registry removal closes the replica while this owned
                    // task can still own the Cell. A closed slot cannot become
                    // dirty again, so stop instead of retrying it forever.
                    if ok.is_none() {
                        break;
                    }
                    if cell.req_seq.load(Ordering::SeqCst) <= cell.synced_seq.load(Ordering::SeqCst)
                    {
                        break;
                    }
                    // Under pacing, one upload per wake: the next round waits
                    // for the flush interval instead of re-syncing here.
                    if paced {
                        break;
                    }
                    if ok != Some(true) {
                        asyncrt::select_biased! {
                            "a stop signal that ties retry backoff prevents another sync attempt";
                            _ = worker_stop.stopped() => break,
                            _ = asyncrt::sleep(Duration::from_millis(50)) => {},
                        }
                    }
                }
                cell.syncing.store(false, Ordering::SeqCst);
                // A write landing in the clear window is picked up next tick;
                // nudge the loop so it does not wait the full interval.
                if !worker_stop.is_stopped()
                    && cell.req_seq.load(Ordering::SeqCst) > cell.synced_seq.load(Ordering::SeqCst)
                {
                    dirty.notify_one();
                }
            });
        }
    }
}

/// The bundle loop: paced like the per-cell tiering it replaces, but the
/// unit is the node, not the cell. Every dirty cell's captured L0 segments
/// go up as ONE object per flush interval — the Class A collapse — and the
/// per-cell prefixes stay untouched until a drain point needs them. The
/// crediting mirrors sync_cell: `durable_txid` means bucket-covered,
/// whether by a per-cell object or a bundle row; the replica's own
/// position deliberately does NOT advance, so the direct sync_wait drain
/// still knows exactly which frames lack per-cell objects.
async fn bundle_loop(
    cells: Arc<Mutex<BTreeMap<(String, u64), CellHandle>>>,
    registration: Arc<Mutex<RegistrationState>>,
    stop: StopToken,
    flush_ms: u64,
) {
    if flush_ms == 0 {
        return;
    }
    let mut tick = asyncrt::interval(Duration::from_millis(flush_ms));
    tick.set_missed_tick_behavior(asyncrt::MissedTickBehavior::Delay);
    loop {
        asyncrt::select_biased! {
            "a stop signal that ties the bundle tick prevents another bucket flush";
            _ = stop.stopped() => break,
            _ = tick.tick() => {},
        }
        let installed =
            registered_durability(&registration).and_then(|targets| targets.bundle_sink.clone());
        let Some(active) = installed.filter(|sink| sink.active()) else {
            continue;
        };
        let work: Vec<((String, u64), CellHandle)> = {
            let map = cells.lock().unwrap();
            map.iter()
                .filter(|(_, cell)| {
                    cell.req_seq.load(Ordering::SeqCst) > cell.synced_seq.load(Ordering::SeqCst)
                })
                .map(|(key, cell)| (key.clone(), cell.clone()))
                .collect()
        };
        if work.is_empty() {
            continue;
        }
        type Credits = Vec<(CellHandle, u64, u64)>;
        let (entries, credits): (Vec<celld_ltx::bundle::BundleEntry>, Credits) =
            asyncrt::blocking(move || {
                let mut entries = Vec::new();
                let mut credits = Vec::new();
                for ((cell, epoch), handle) in work {
                    let tickets = handle.req_seq.load(Ordering::SeqCst);
                    let mut replica = handle.replica.lock().unwrap();
                    let Some(db) = managed_db_mut(&mut replica) else {
                        continue;
                    };
                    if db.sync().is_err() {
                        continue;
                    }
                    let Ok(pos) = db.pos() else { continue };
                    let from = handle.durable_txid.load(Ordering::SeqCst) + 1;
                    let mut complete = true;
                    for txid in from..=pos.txid.0 {
                        match db.read_ltx_file(0, TXID(txid), TXID(txid)) {
                            Ok(bytes) => entries.push(celld_ltx::bundle::BundleEntry {
                                cell: cell.clone(),
                                cell_epoch: epoch,
                                txid,
                                bytes,
                            }),
                            Err(error) => {
                                warn!(%error, txid, "read staged l0 for bundle failed");
                                complete = false;
                                break;
                            }
                        }
                    }
                    drop(replica);
                    if complete {
                        credits.push((handle, tickets, pos.txid.0));
                    }
                }
                (entries, credits)
            })
            .await
            .unwrap_or_default();
        if credits.is_empty() {
            continue;
        }
        let count = entries.len();
        if entries.is_empty() || active.put_bundle(entries).await {
            if count > 0 {
                info!(
                    event = "log_bundle_flush",
                    entries = count,
                    cells = credits.len(),
                    "flushed a bundle"
                );
            }
            for (handle, tickets, position) in credits {
                // Same H2 fence as sync_cell: do not credit a wedged stale
                // incarnation's bundle upload once ownership has moved.
                if fenced_ack_enabled() && !ownership_still_current(&handle).await {
                    handle.ready.notify_waiters();
                    continue;
                }
                handle.durable_txid.fetch_max(position, Ordering::SeqCst);
                handle.synced_seq.fetch_max(tickets, Ordering::SeqCst);
                handle
                    .last_sync_ms
                    .store(asyncrt::wall_ms().max(0) as u64, Ordering::SeqCst);
                // Bundle credits also queue the overlay compactor.
                maybe_queue_compaction(&handle, position);
                handle.ready.notify_waiters();
            }
        }
    }
}

/// The log tier's group-commit loop, `sync_loop`'s fleet twin: wake on a
/// gate ticket, capture every dirty cell's new L0 segments in one blocking
/// pass, ship them as one batch, and credit the tickets the capture covered.
/// Ordered member lanes keep each follower's pipelined fragment contiguous,
/// and nothing on this path waits for the bucket.
/// Advance a lap clock and return the elapsed microseconds — the ship
/// loop's closed-book accounting primitive: every await and every stretch
/// of work between two laps lands in exactly one bucket, so the buckets
/// plus the residual sum to the loop's wall time.
fn lap_us(lap: &mut u64) -> u64 {
    let now = asyncrt::mono_us();
    let delta = now.saturating_sub(*lap);
    *lap = now;
    delta
}

async fn ship_loop(
    cells: Arc<Mutex<BTreeMap<(String, u64), CellHandle>>>,
    dirty_ship: Arc<Notify>,
    registration: Arc<Mutex<RegistrationState>>,
    stop: StopToken,
) {
    // The truncation ledger is a core decision
    // (celld_logic::log_tier::ShipLedger): outstanding batches carry the
    // cells and top TXIDs, a batch is covered once every cell's durable
    // position passes its top TXID — bundle credits do this within a
    // flush interval — and the covered watermark rides the next append as
    // the followers' truncate_to. This is what bounds follower disks, and
    // the ledger's epoch reset is what keeps a stale watermark from
    // truncating a fresh fragment.
    let mut ledger: celld_logic::log_tier::ShipLedger<Vec<(CellHandle, u64)>> =
        celld_logic::log_tier::ShipLedger::default();
    // Rounds in flight, completed strictly in submission order. A later
    // round's ack waits here until every earlier round has credited or
    // failed, so a gate never releases past an unresolved earlier round.
    let mut inflight: futures_util::stream::FuturesOrdered<
        std::pin::Pin<Box<dyn std::future::Future<Output = ShipRound> + Send>>,
    > = futures_util::stream::FuturesOrdered::new();
    let mut current: Option<Arc<dyn Shipper>> = None;
    let mut current_epoch = None;
    let mut last_submit = asyncrt::mono_ms();
    let capture_workers = crate::env_vars::positive_or("CELLD_LOG_CAPTURE_WORKERS", 8_usize)
        .unwrap_or(8)
        .max(1);
    // The loop's own time ledger: idle (nothing to do), stall (admission
    // or depth closed, waiting on a round), apply, scan, capture wall,
    // submit. Emitted cumulatively about once a second; wall minus the
    // sum is the loop's untracked residual and must stay small.
    let mut lap = asyncrt::mono_us();
    let (mut idle_us, mut stall_us, mut apply_us, mut scan_us) = (0_u64, 0_u64, 0_u64, 0_u64);
    let (mut capture_us, mut submit_us) = (0_u64, 0_u64);
    let mut loop_rounds = 0_u64;
    let mut ledger_emit = asyncrt::mono_us();
    'shipping: loop {
        if asyncrt::mono_us().saturating_sub(ledger_emit) >= 1_000_000 {
            info!(
                event = "log_ship_loop",
                wall_us = asyncrt::mono_us().saturating_sub(ledger_emit),
                idle_us,
                stall_us,
                apply_us,
                scan_us,
                capture_us,
                submit_us,
                rounds = loop_rounds,
                "ship loop time ledger"
            );
            ledger_emit = asyncrt::mono_us();
            idle_us = 0;
            stall_us = 0;
            apply_us = 0;
            scan_us = 0;
            capture_us = 0;
            submit_us = 0;
            loop_rounds = 0;
        }
        if inflight.is_empty() {
            let _ = lap_us(&mut lap);
            asyncrt::select_biased! {
                "a stop signal that ties an idle ship-loop wake prevents another scan";
                _ = stop.stopped() => break 'shipping,
                _ = async {
                    asyncrt::select_biased! {
                        "a dirty notification wins a tie with the fallback tick to retain wake order";
                        _ = dirty_ship.notified() => {},
                        _ = asyncrt::sleep(Duration::from_millis(25)) => {},
                    }
                } => {},
            }
            idle_us += lap_us(&mut lap);
        } else {
            let depth = current
                .as_ref()
                .map_or(1, |shipper| shipper.pipeline().max(1));
            let admitted = current.as_ref().is_none_or(|shipper| shipper.admit());
            if inflight.len() >= depth || !admitted {
                let _ = lap_us(&mut lap);
                let round = asyncrt::select_biased! {
                    "a stop signal that ties a completed ship round prevents another ledger update";
                    _ = stop.stopped() => break 'shipping,
                    round = futures_util::StreamExt::next(&mut inflight) => round,
                };
                stall_us += lap_us(&mut lap);
                if let Some(round) = round {
                    if !apply_round(&mut ledger, round) {
                        inflight = futures_util::stream::FuturesOrdered::new();
                        reset_submitted(&cells);
                    }
                }
                apply_us += lap_us(&mut lap);
                continue;
            }
            let _ = lap_us(&mut lap);
            let event = asyncrt::select_biased! {
                "a stop signal that ties active shipping work ends the ship loop first";
                _ = stop.stopped() => break 'shipping,
                event = async {
                    asyncrt::select_biased! {
                        "a completed ship round wins a tie so its ordered ledger update runs first";
                        round = futures_util::StreamExt::next(&mut inflight) => {
                            futures_util::future::Either::Left(round)
                        },
                        _ = async {
                            asyncrt::select_biased! {
                                "a dirty notification wins a tie with the fallback tick to retain wake order";
                                _ = dirty_ship.notified() => {},
                                _ = asyncrt::sleep(Duration::from_millis(25)) => {},
                            }
                        } => futures_util::future::Either::Right(()),
                    }
                } => event,
            };
            idle_us += lap_us(&mut lap);
            if let futures_util::future::Either::Left(round) = event {
                if let Some(round) = round {
                    if !apply_round(&mut ledger, round) {
                        inflight = futures_util::stream::FuturesOrdered::new();
                        reset_submitted(&cells);
                    }
                }
                apply_us += lap_us(&mut lap);
                continue;
            }
        }
        let installed = registered_durability(&registration).map(|targets| targets.shipper.clone());
        let Some(active) = installed.filter(|shipper| shipper.active()) else {
            // The shipper is gone or degraded: outstanding rounds can never
            // credit under it, so they die uncredited — conservative, the
            // gates ride the bucket proof.
            if !inflight.is_empty() {
                inflight = futures_util::stream::FuturesOrdered::new();
                reset_submitted(&cells);
            }
            current = None;
            current_epoch = None;
            continue;
        };
        let capture_epoch = active.epoch();
        if current_epoch != Some(capture_epoch) {
            // An ensemble swap orphans the old shipper's rounds: their
            // credits belong to the retired epoch and must not apply.
            if !inflight.is_empty() {
                inflight = futures_util::stream::FuturesOrdered::new();
                reset_submitted(&cells);
            }
            current = Some(active.clone());
            current_epoch = Some(capture_epoch);
        }
        ledger.observe_epoch(capture_epoch);
        let work: Vec<((String, u64), CellHandle)> = {
            let map = cells.lock().unwrap();
            map.iter()
                .filter(|(_, cell)| {
                    let req = cell.req_seq.load(Ordering::SeqCst);
                    req > cell.submitted_seq.load(Ordering::SeqCst)
                        && req > cell.synced_seq.load(Ordering::SeqCst)
                })
                .map(|(key, cell)| (key.clone(), cell.clone()))
                .collect()
        };
        scan_us += lap_us(&mut lap);
        if work.is_empty() {
            continue;
        }
        let round = asyncrt::mono_ms();
        // Capture fans out across cells: each chunk syncs and reads its
        // cells exactly as the serial walk did — per-cell contiguity and
        // the completeness check are per cell, so cross-cell order is
        // free — and the fan-out is what keeps a network disk's per-cell
        // sync latency out of the round's serial cost (#140, stage 2).
        let workers = work.len().clamp(1, capture_workers);
        let mut chunks: Vec<Vec<((String, u64), CellHandle)>> =
            (0..workers).map(|_| Vec::new()).collect();
        for (index, item) in work.into_iter().enumerate() {
            chunks[index % workers].push(item);
        }
        type Credits = Vec<(CellHandle, u64, u64)>;
        let spawned = asyncrt::mono_us();
        let captures = futures_util::future::join_all(chunks.into_iter().map(|chunk| {
            asyncrt::blocking(move || {
                // The closed-book ledger: pool_wait is the blocking-pool
                // queue delay before this chunk ran at all; phases below
                // sum to the chunk's busy time.
                let pool_wait_us = asyncrt::mono_us().saturating_sub(spawned);
                let mut entries = Vec::new();
                let mut credits = Vec::new();
                let mut sync_us = 0_u64;
                let mut lock_us = 0_u64;
                let mut read_us = 0_u64;
                let mut timing = celld_ltx::db::SyncTiming::default();
                let mut snap_reasons = [0_u32; 8];
                let mut read_kinds = [0_u32; 4];
                let mut read_bytes = 0_u64;
                // The null-work probe: eight clock reads cost well under a
                // microsecond of intrinsic work, so this value is the
                // scheduler's preemption tax on this worker — the
                // discriminator between a phase that is slow and a phase
                // that was interrupted.
                let probe_started = asyncrt::mono_us();
                for _ in 0..8 {
                    std::hint::black_box(asyncrt::mono_us());
                }
                let probe_us = asyncrt::mono_us().saturating_sub(probe_started);
                for ((cell, epoch), handle) in chunk {
                    // Tickets taken before the capture are covered by it —
                    // the same discipline as sync_cell.
                    let tickets = handle.req_seq.load(Ordering::SeqCst);
                    let lock_started = asyncrt::mono_us();
                    let mut replica = handle.replica.lock().unwrap();
                    let sync_started = asyncrt::mono_us();
                    lock_us += sync_started.saturating_sub(lock_started);
                    let Some(db) = managed_db_mut(&mut replica) else {
                        continue;
                    };
                    let synced = db.sync();
                    sync_us += asyncrt::mono_us().saturating_sub(sync_started);
                    let cell_timing = db.last_sync_timing();
                    timing.prepare_us += cell_timing.prepare_us;
                    timing.verify_us += cell_timing.verify_us;
                    timing.encode_write_us += cell_timing.encode_write_us;
                    timing.fsync_us += cell_timing.fsync_us;
                    timing.checkpoint_us += cell_timing.checkpoint_us;
                    timing.pos_us += cell_timing.pos_us;
                    timing.wal_read_us += cell_timing.wal_read_us;
                    timing.map_collect_us += cell_timing.map_collect_us;
                    timing.ltx_encode_us += cell_timing.ltx_encode_us;
                    timing.file_write_us += cell_timing.file_write_us;
                    timing.wal_len_bytes += cell_timing.wal_len_bytes;
                    if cell_timing.snapshot {
                        timing.snapshot = true;
                        snap_reasons[cell_timing.snapshot_reason.min(7) as usize] += 1;
                    }
                    read_kinds[cell_timing.wal_read_kind.min(3) as usize] += 1;
                    read_bytes += cell_timing.wal_read_bytes;
                    if synced.is_err() {
                        continue;
                    }
                    let Ok(pos) = db.pos() else { continue };
                    let from = handle.submitted_txid.load(Ordering::SeqCst) + 1;
                    let mut complete = true;
                    let read_started = asyncrt::mono_us();
                    for txid in from..=pos.txid.0 {
                        match db.read_ltx_file(0, TXID(txid), TXID(txid)) {
                            Ok(bytes) => entries.push(ShipEntry {
                                cell: cell.clone(),
                                epoch,
                                txid,
                                bytes,
                            }),
                            // A pruned L0 the bucket already holds is not a
                            // gap the followers need filled; anything else
                            // leaves the cell uncredited for this round.
                            Err(_) if txid <= handle.durable_txid.load(Ordering::SeqCst) => {}
                            Err(_) => {
                                complete = false;
                                break;
                            }
                        }
                    }
                    read_us += asyncrt::mono_us().saturating_sub(read_started);
                    drop(replica);
                    if complete {
                        credits.push((handle, tickets, pos.txid.0));
                    }
                }
                (
                    entries,
                    credits,
                    sync_us,
                    lock_us,
                    read_us,
                    pool_wait_us,
                    timing,
                    snap_reasons,
                    read_kinds,
                    read_bytes,
                    probe_us,
                )
            })
        }))
        .await;
        let mut entries: Vec<ShipEntry> = Vec::new();
        let mut credits: Credits = Vec::new();
        let mut sync_us_total = 0_u64;
        let mut lock_us_total = 0_u64;
        let mut read_us_total = 0_u64;
        let mut pool_wait_us_max = 0_u64;
        let mut timing_total = celld_ltx::db::SyncTiming::default();
        let mut snap_reason_totals = [0_u32; 8];
        let mut read_kind_totals = [0_u32; 4];
        let mut read_bytes_total = 0_u64;
        let mut probe_us_max = 0_u64;
        for capture in captures {
            let (
                chunk_entries,
                chunk_credits,
                chunk_sync_us,
                chunk_lock_us,
                chunk_read_us,
                chunk_pool_wait_us,
                chunk_timing,
                chunk_snap_reasons,
                chunk_read_kinds,
                chunk_read_bytes,
                chunk_probe_us,
            ) = capture.unwrap_or_default();
            entries.extend(chunk_entries);
            credits.extend(chunk_credits);
            sync_us_total += chunk_sync_us;
            lock_us_total += chunk_lock_us;
            read_us_total += chunk_read_us;
            pool_wait_us_max = pool_wait_us_max.max(chunk_pool_wait_us);
            timing_total.prepare_us += chunk_timing.prepare_us;
            timing_total.verify_us += chunk_timing.verify_us;
            timing_total.encode_write_us += chunk_timing.encode_write_us;
            timing_total.fsync_us += chunk_timing.fsync_us;
            timing_total.checkpoint_us += chunk_timing.checkpoint_us;
            timing_total.pos_us += chunk_timing.pos_us;
            timing_total.wal_read_us += chunk_timing.wal_read_us;
            timing_total.map_collect_us += chunk_timing.map_collect_us;
            timing_total.ltx_encode_us += chunk_timing.ltx_encode_us;
            timing_total.file_write_us += chunk_timing.file_write_us;
            timing_total.wal_len_bytes += chunk_timing.wal_len_bytes;
            if chunk_timing.snapshot {
                timing_total.snapshot = true;
            }
            for (slot, count) in snap_reason_totals.iter_mut().zip(chunk_snap_reasons) {
                *slot += count;
            }
            for (slot, count) in read_kind_totals.iter_mut().zip(chunk_read_kinds) {
                *slot += count;
            }
            read_bytes_total += chunk_read_bytes;
            probe_us_max = probe_us_max.max(chunk_probe_us);
        }
        if credits.is_empty() {
            continue;
        }
        ledger.advance(|cells| {
            cells
                .iter()
                .all(|(handle, txid)| handle.durable_txid.load(Ordering::SeqCst) >= *txid)
        });
        let covered_seq = ledger.covered_seq();
        let captured_ms = asyncrt::mono_ms().saturating_sub(round);
        capture_us += lap_us(&mut lap);
        if entries.is_empty() {
            // Every pending frame is already bucket-covered: nothing ships,
            // and the credits release directly.
            info!(
                event = "log_ship_round",
                entries = 0_usize,
                cells = credits.len(),
                bytes = 0_usize,
                capture_ms = captured_ms,
                ship_ms = 0_u64,
                "shipped a log batch"
            );
            for (handle, tickets, position) in credits {
                handle.shipped_txid.fetch_max(position, Ordering::SeqCst);
                handle.shipped_seq.fetch_max(tickets, Ordering::SeqCst);
                handle.submitted_txid.fetch_max(position, Ordering::SeqCst);
                handle.submitted_seq.fetch_max(tickets, Ordering::SeqCst);
                handle.ready.notify_waiters();
            }
            continue;
        }
        let entry_count = entries.len();
        let byte_count = entries.iter().map(|entry| entry.bytes.len()).sum::<usize>();
        let since_last = asyncrt::mono_ms().saturating_sub(last_submit);
        last_submit = asyncrt::mono_ms();
        // The shipper's synchronous prefix runs HERE, at submission: the
        // sequence range and every member lane enqueue happen before the
        // future is queued, so pipelined rounds stay ordered per member.
        let shipped = active.ship_at_epoch(capture_epoch, entries, covered_seq);
        for (handle, tickets, position) in &credits {
            handle.submitted_txid.fetch_max(*position, Ordering::SeqCst);
            handle.submitted_seq.fetch_max(*tickets, Ordering::SeqCst);
        }
        let submitted = asyncrt::mono_ms();
        inflight.push_back(Box::pin(async move {
            ShipRound {
                completion: shipped.await,
                credits,
                covered_seq,
                entries: entry_count,
                bytes: byte_count,
                capture_ms: captured_ms,
                sync_ms: sync_us_total / 1000,
                lock_ms: lock_us_total / 1000,
                gap_ms: since_last,
                submitted,
                read_us: read_us_total,
                pool_wait_us: pool_wait_us_max,
                sync_timing: timing_total,
                snap_reasons: snap_reason_totals,
                read_kinds: read_kind_totals,
                read_bytes: read_bytes_total,
                probe_us: probe_us_max,
            }
        }));
        submit_us += lap_us(&mut lap);
        loop_rounds += 1;
    }
}

/// One pipelined round's completion, applied strictly in submission order.
struct ShipRound {
    completion: ShipCompletion,
    credits: Vec<(CellHandle, u64, u64)>,
    covered_seq: u64,
    entries: usize,
    bytes: usize,
    capture_ms: u64,
    /// Worker-summed per-cell db.sync time inside the capture.
    sync_ms: u64,
    /// Worker-summed replica-lock wait inside the capture.
    lock_ms: u64,
    /// Time since the previous round's submission — the cadence.
    gap_ms: u64,
    submitted: u64,
    /// The closed-book capture interior, worker-summed per round:
    /// frame reads, the worst chunk's blocking-pool queue delay, and the
    /// per-phase split of every db.sync (the log-lazy-local-sync
    /// attribution ledger).
    read_us: u64,
    pool_wait_us: u64,
    sync_timing: celld_ltx::db::SyncTiming,
    snap_reasons: [u32; 8],
    read_kinds: [u32; 4],
    read_bytes: u64,
    probe_us: u64,
}

/// Apply one completed round. `false` means the round failed: the caller
/// must discard every later in-flight round uncredited — their frames may
/// be durable on the followers, which is safe, but crediting them would
/// release gates past an unresolved earlier round.
fn apply_round(
    ledger: &mut celld_logic::log_tier::ShipLedger<Vec<(CellHandle, u64)>>,
    round: ShipRound,
) -> bool {
    let Some(last_seq) = round.completion.last_seq() else {
        return false;
    };
    if last_seq > round.covered_seq {
        ledger.shipped(
            last_seq,
            round
                .credits
                .iter()
                .map(|(handle, _, position)| (handle.clone(), *position))
                .collect(),
        );
    }
    info!(
        event = "log_ship_round",
        entries = round.entries,
        cells = round.credits.len(),
        bytes = round.bytes,
        capture_ms = round.capture_ms,
        sync_ms = round.sync_ms,
        lock_ms = round.lock_ms,
        gap_ms = round.gap_ms,
        ship_ms = asyncrt::mono_ms().saturating_sub(round.submitted),
        read_us = round.read_us,
        pool_wait_us = round.pool_wait_us,
        prep_us = round.sync_timing.prepare_us,
        verify_us = round.sync_timing.verify_us,
        encode_us = round.sync_timing.encode_write_us,
        fsync_us = round.sync_timing.fsync_us,
        ckpt_us = round.sync_timing.checkpoint_us,
        pos_us = round.sync_timing.pos_us,
        wal_read_us = round.sync_timing.wal_read_us,
        map_collect_us = round.sync_timing.map_collect_us,
        ltx_encode_us = round.sync_timing.ltx_encode_us,
        file_write_us = round.sync_timing.file_write_us,
        wal_len_bytes = round.sync_timing.wal_len_bytes,
        snapshot = round.sync_timing.snapshot,
        snap_first = round.snap_reasons[1],
        snap_truncated = round.snap_reasons[2],
        snap_salt = round.snap_reasons[3],
        snap_lastpage = round.snap_reasons[4],
        snap_ckpt = round.snap_reasons[5],
        snap_boundary = round.snap_reasons[6],
        snap_other = round.snap_reasons[7],
        read_tail = round.read_kinds[0],
        read_snap = round.read_kinds[1],
        read_start = round.read_kinds[2],
        read_fallback = round.read_kinds[3],
        read_bytes = round.read_bytes,
        probe_us = round.probe_us,
        "shipped a log batch"
    );
    for (handle, tickets, position) in round.credits {
        handle.shipped_txid.fetch_max(position, Ordering::SeqCst);
        handle.shipped_seq.fetch_max(tickets, Ordering::SeqCst);
        handle.ready.notify_waiters();
    }
    true
}

/// Discarding a pipeline makes every uncredited range eligible for capture
/// again. The credited watermarks are monotone, so concurrent bucket progress
/// remains intact while a failed fleet tail rolls back.
fn reset_submitted(cells: &Arc<Mutex<BTreeMap<(String, u64), CellHandle>>>) {
    for handle in cells.lock().unwrap().values() {
        handle
            .submitted_txid
            .store(handle.shipped_txid.load(Ordering::SeqCst), Ordering::SeqCst);
        handle
            .submitted_seq
            .store(handle.shipped_seq.load(Ordering::SeqCst), Ordering::SeqCst);
    }
}

/// Node-level object-store config (no per-cell prefix). `build_store` on this
/// yields the one shared client; per-cell clients set only `path`.
fn node_config(
    bucket: &str,
    endpoint: Option<&str>,
    region: &str,
    credentials: Option<&StorageCredentials>,
) -> ObjectStoreConfig {
    let endpoint = endpoint.unwrap_or_default().to_string();
    // Static credentials come from the managed control plane when present,
    // else the `AWS_*` env the node already carries. Without this,
    // `build_store` sees empty keys and object_store walks the refreshable
    // chain instead: web identity, ECS task credentials, EKS Pod Identity,
    // then the instance credential provider, which off-EC2 sends unsigned
    // requests (R2 answers "404 page not found"). A node that carries none of
    // those variables still reaches that unsigned case, and a node that
    // carries some of them silently replicates under an identity the control
    // plane did not issue.
    let env = |key: &str| std::env::var(key).ok().filter(|value| !value.is_empty());
    let access_key_id = credentials
        .map(|c| c.access_key_id.clone())
        .filter(|value| !value.is_empty())
        .or_else(|| env("AWS_ACCESS_KEY_ID"))
        .unwrap_or_default();
    let secret_access_key = credentials
        .map(|c| c.secret_access_key.clone())
        .filter(|value| !value.is_empty())
        .or_else(|| env("AWS_SECRET_ACCESS_KEY"))
        .unwrap_or_default();
    // Temporary R2/STS credentials require the session token, or signing fails.
    let session_token = credentials
        .and_then(|c| c.session_token.clone())
        .filter(|value| !value.is_empty())
        .or_else(|| env("AWS_SESSION_TOKEN"))
        .unwrap_or_default();
    ObjectStoreConfig {
        bucket: bucket.to_string(),
        path: String::new(),
        region: region.to_string(),
        // A custom endpoint (R2/MinIO) uses path-style addressing, matching
        // `ObjectStoreConfig::from_url`'s default for non-AWS hosts.
        force_path_style: !endpoint.is_empty(),
        endpoint,
        access_key_id,
        secret_access_key,
        session_token,
        skip_verify: false,
        part_size: 0,
        timestamp_metadata_key: TimestampMetadataKey::default(),
    }
}

fn production_ltx_host() -> LtxHost {
    execution_domain_ltx_host()
}

#[cfg(celld_internal_tests)]
fn deterministic_ltx_host() -> LtxHost {
    execution_domain_ltx_host()
}

fn execution_domain_ltx_host() -> LtxHost {
    let filesystem = asyncrt::fs();
    let age_filesystem = filesystem.clone();
    let read_filesystem = filesystem.clone();
    LtxHost::new(
        asyncrt::wall_ms,
        move |path| file_age(age_filesystem.as_ref(), path),
        move |path| {
            let filesystem = read_filesystem.clone();
            async move {
                asyncrt::blocking(move || filesystem.read(&path))
                    .await
                    .map_err(|error| std::io::Error::other(error.to_string()))?
            }
        },
        |job| async move {
            asyncrt::blocking(job)
                .await
                .map_err(|error| HostTaskError::new(error.to_string()))
        },
    )
    .with_filesystem(filesystem)
}

fn file_age(filesystem: &dyn celld_ltx::FileSystem, path: &Path) -> std::io::Result<Duration> {
    let modified = filesystem.metadata(path)?.modified_unix_millis;
    Ok(Duration::from_millis(
        asyncrt::wall_ms().saturating_sub(modified).max(0) as u64,
    ))
}

fn close_replica_or_warn(handle: &CellHandle, cell: &str, epoch: u64) {
    if let Err(error) = close_replica(handle) {
        warn!(cell, epoch, %error, "close managed replica failed during removal");
    }
}

fn managed_db_mut(replica: &mut Option<Replica<ObjectStoreClient>>) -> Option<&mut celld_ltx::Db> {
    replica.as_mut()?.db_mut()
}

fn close_replica_for_reload(handle: &CellHandle, cell: &str, epoch: u64) -> anyhow::Result<()> {
    close_replica(handle)
        .map_err(|error| anyhow!("close managed replica for {cell} epoch {epoch}: {error}"))
}

/// Stop new file users and close the managed database before its live path is
/// renamed or retained for another process. An upload or a compaction can keep
/// the `Cell` alive after registry removal, but none can keep the database once
/// this function takes it through the same mutex used by every capture.
fn close_replica(handle: &CellHandle) -> anyhow::Result<()> {
    cancel_compaction(handle);
    let replica = handle.replica.lock().unwrap().take();
    if let Some(db) = replica.and_then(Replica::into_db) {
        db.close().map_err(|error| anyhow!(error))?;
    }
    Ok(())
}

impl Drop for LtxRepl {
    fn drop(&mut self) {
        self.shutdown_local_fallback();
    }
}

#[cfg(celld_internal_tests)]
include!(env!("CELLD_INTERNAL_LTX_REPL_OBSERVERS"));
