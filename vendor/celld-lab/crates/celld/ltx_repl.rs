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
use celld_ltx::client::epochs::EpochChain;
use celld_ltx::object_store::ObjectStore;
use celld_ltx::replica;
use celld_ltx::replica_compactor::{CompactionResult, ReplicaCompactor};
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
use crate::replication::RestoredSnapshot;
use crate::replication::StorageCredentials;
use crate::replication::SyncWait;
use crate::replication::{EvictionAbandon, EvictionRestoreArtifact};
use celld_logic::durability::{proof_deadline, ProofProgress, ProofWait};

/// Max cells uploading concurrently across the node. Caps blocking-pool threads
/// and in-flight object-store requests under high write fan-out.
const SYNC_CONCURRENCY: usize = 64;

/// The upload slots this node starts with. The simulation narrows them to
/// put a second cell's upload in the queue on purpose, which is the state
/// the durability wait's queued regime exists for.
fn sync_concurrency() -> usize {
    #[cfg(celld_internal_tests)]
    if let Some(slots) = sync_concurrency_for_world() {
        return slots;
    }
    SYNC_CONCURRENCY
}

/// Max LTX object downloads across every restore on this node. A hot cell can
/// contain thousands of L0 files, so serial reads turn a takeover into minutes
/// of terminal failures. This shared ceiling hides round-trip latency without
/// multiplying the bound by the activation count.
const RESTORE_DOWNLOAD_CONCURRENCY: usize = 64;

/// A cheap clone of one cell-epoch client. Without the wrapper, the replica,
/// uploader, and compactor each retain a full copy of the immutable string
/// configuration. Keep this wrapper private instead of adding a blanket
/// `ReplicaClient for Arc<_>` implementation to the public LTX crate.
///
/// The implementation below must forward every method of `ReplicaClient`,
/// including the three that the trait provides a default for. A method that
/// this wrapper does not forward still compiles, and it then silently replaces
/// the object store behavior with the default: `write_ltx_file_from_file`
/// refuses every oversized compaction, `read_range` downloads a whole object
/// for each paged fault, and `ltx_files_bounded` lists a whole prefix.
/// `shared_object_store_client_forwards_the_provided_methods` guards this.
#[derive(Clone)]
struct SharedObjectStoreClient(Arc<ObjectStoreClient>);

#[async_trait::async_trait]
impl ReplicaClient for SharedObjectStoreClient {
    async fn ltx_files(
        &self,
        level: i32,
        seek: TXID,
    ) -> celld_ltx::Result<Vec<celld_ltx::FileInfo>> {
        self.0.ltx_files(level, seek).await
    }

    async fn ltx_files_bounded(
        &self,
        level: i32,
        seek: TXID,
        limit: usize,
    ) -> celld_ltx::Result<Vec<celld_ltx::FileInfo>> {
        self.0.ltx_files_bounded(level, seek, limit).await
    }

    async fn open_ltx_file(
        &self,
        level: i32,
        min_txid: TXID,
        max_txid: TXID,
    ) -> celld_ltx::Result<Vec<u8>> {
        self.0.open_ltx_file(level, min_txid, max_txid).await
    }

    async fn read_range(
        &self,
        level: i32,
        min_txid: TXID,
        max_txid: TXID,
        offset: u64,
        len: u64,
    ) -> celld_ltx::Result<Vec<u8>> {
        self.0
            .read_range(level, min_txid, max_txid, offset, len)
            .await
    }

    async fn write_ltx_file(
        &self,
        level: i32,
        min_txid: TXID,
        max_txid: TXID,
        data: &[u8],
    ) -> celld_ltx::Result<celld_ltx::FileInfo> {
        self.0.write_ltx_file(level, min_txid, max_txid, data).await
    }

    async fn write_ltx_file_from_file(
        &self,
        level: i32,
        min_txid: TXID,
        max_txid: TXID,
        file: celld_ltx::host::HostFile,
        host: LtxHost,
    ) -> celld_ltx::Result<celld_ltx::FileInfo> {
        self.0
            .write_ltx_file_from_file(level, min_txid, max_txid, file, host)
            .await
    }

    async fn delete_ltx_files(&self, files: &[celld_ltx::FileInfo]) -> celld_ltx::Result<()> {
        self.0.delete_ltx_files(files).await
    }

    async fn delete_all(&self) -> celld_ltx::Result<()> {
        self.0.delete_all().await
    }
}

/// One attempt consumes at most this many source objects. This bound keeps a
/// first compaction of an old, write-hot cell from reading its complete L0
/// history into memory.
const COMPACTION_MAX_FILES: usize = 256;

/// Bound buffered source data. An indivisible object above this budget uses
/// scratch files and bounded range reads instead of stalling the level.
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

/// The compactor-facing fetcher: one cell-epoch's view over whatever sink
/// is currently installed. Reading the slot per call makes activation
/// order irrelevant — a cell activated before the sink existed still sees
/// bundles once it does.
struct SinkFetcher {
    registration: Arc<Mutex<RegistrationState>>,
    cell: String,
    epoch: u64,
    // One snapshot per compaction round. Opening every L0 row must not
    // repeat a persisted-index fallback for the same slow cell.
    rows: tokio::sync::Mutex<Option<Vec<celld_ltx::LocatedRow>>>,
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
            let mut rows = self.rows.lock().await;
            if let Some(rows) = rows.as_ref() {
                return Ok(rows.clone());
            }
            let sink =
                registered_durability(&self.registration).map(|targets| targets.manager.clone());
            let fetched = match sink {
                Some(sink) => sink
                    .rows_for(&self.cell, self.epoch)
                    .await
                    .map_err(|error| celld_ltx::Error::Other(error.to_string().into()))?,
                None => Vec::new(),
            };
            *rows = Some(fetched.clone());
            Ok(fetched)
        })
    }

    fn fetch<'a>(
        &'a self,
        located: &'a celld_ltx::LocatedRow,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = celld_ltx::Result<Vec<u8>>> + Send + 'a>>
    {
        Box::pin(async move {
            let sink =
                registered_durability(&self.registration).map(|targets| targets.manager.clone());
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

    fn fetch_range<'a>(
        &'a self,
        located: &'a celld_ltx::LocatedRow,
        offset: u64,
        len: u64,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = celld_ltx::Result<Vec<u8>>> + Send + 'a>>
    {
        Box::pin(async move {
            let sink = registered_durability(&self.registration)
                .map(|targets| targets.manager.clone())
                .ok_or_else(|| celld_ltx::Error::Other("no bundle sink".into()))?;
            sink.fetch_bundle_range(located, offset, len)
                .await
                .map_err(|error| celld_ltx::Error::Other(error.to_string().into()))
        })
    }
}

struct RegisteredDurability {
    generation: u64,
    targets: Weak<RegisteredTargets>,
}

struct RegisteredTargets {
    shipper: Arc<dyn Shipper>,
    manager: Arc<crate::node_log::NodeLogManager>,
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
    tasks: TaskGroup,
    replica_close_tasks: TaskGroup,
}

impl LtxTaskOwner {
    pub(crate) fn request_stop(&self) {
        self.tasks.stop.request_stop();
    }

    pub(crate) async fn join(&self) {
        // Roots and their descendants share admission and completion tracking.
        // Once stopped, no successor can enter; joining this group therefore
        // needs no ordering between sync, compaction, and delayed requeues.
        self.tasks.join().await;
        // Release closes remain admissible after background work stops, until
        // shutdown seals their separate admission gate.
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
    /// L0 bytes since the last fold that queue one independently of the txid
    /// distance, so large rows do not accumulate a long uncompacted tail.
    pub min_bytes: u64,
    pub concurrency: usize,
}

/// The node settings that [`LtxRepl`] fixes at construction from the
/// environment, after parsing. [`LtxConfig::from_env`] is their only reader.
///
/// The settings travel as one value because a test process has one
/// environment. Every node of a simulated fleet runs in that process, so a
/// constructor that read the environment itself gave every node the same
/// values. A test that needed one node with its own value for a setting
/// such as the grace then needed a builder that overwrote a field after
/// construction, one per setting, and that test entered through a path
/// production never takes. Here production and a test both pass a config
/// to the same constructor body; only the source of the values differs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct LtxConfig {
    /// How old the newest object of a superseded epoch must be before epoch
    /// GC deletes the epoch, or `None` when epoch GC is off
    /// (`CELLD_LTX_RETENTION_SECS`, unset or `0`). `Some(0)` is on with no
    /// grace, a value the environment cannot express.
    pub(crate) epoch_gc_grace_ms: Option<u64>,
    /// Bytes per second a paged cell hydrates in the background, 0 for none
    /// (`CELLD_LTX_HYDRATE_MBPS`).
    pub(crate) hydrate_bytes_per_s: u64,
    /// The operator's switch for paged restore (`CELLD_LTX_PAGED`).
    pub(crate) paged_restore: bool,
    /// The chain size, in bytes, from which a restore pages instead of
    /// cloning (`CELLD_LTX_PAGED_MIN_MB`).
    pub(crate) paged_min_bytes: u64,
    /// The TRUNCATE checkpoint threshold of a non-Queue cell, 0 to disable
    /// truncation (`CELLD_LTX_TRUNCATE_PAGES`).
    pub(crate) truncate_pages: u32,
}

impl LtxConfig {
    /// Read the settings from the process environment.
    pub(crate) fn from_env() -> Self {
        Self::from_lookup(crate::env_vars::value)
    }

    /// Read the settings through `lookup`, which answers like
    /// [`crate::env_vars::value`]. A test supplies values here without
    /// mutating the process environment, which every parallel test shares.
    ///
    /// An unreadable or unparsable value falls back to the default instead
    /// of failing construction. `env_vars::validate` rejects some of these
    /// values at startup, but not all of them: it does not check
    /// `CELLD_LTX_HYDRATE_MBPS` or `CELLD_LTX_PAGED_MIN_MB`, and it checks
    /// `CELLD_LTX_TRUNCATE_PAGES` as a `u64`. A production node can
    /// therefore reach a fallback.
    fn from_lookup(lookup: impl Fn(&str) -> anyhow::Result<Option<String>>) -> Self {
        let optional_u64 = |name: &str| {
            lookup(name).and_then(|value| crate::env_vars::parse_optional::<u64>(name, value))
        };
        Self {
            epoch_gc_grace_ms: optional_u64("CELLD_LTX_RETENTION_SECS")
                .unwrap_or(None)
                .filter(|secs| *secs > 0)
                .map(|secs| secs.saturating_mul(1000)),
            hydrate_bytes_per_s: optional_u64("CELLD_LTX_HYDRATE_MBPS")
                .unwrap_or(None)
                .unwrap_or(DEFAULT_HYDRATE_MBPS)
                .saturating_mul(1 << 20),
            paged_restore: lookup("CELLD_LTX_PAGED")
                .and_then(|value| {
                    crate::env_vars::parse_flag("CELLD_LTX_PAGED", value.as_deref(), true)
                })
                .unwrap_or(true),
            paged_min_bytes: optional_u64("CELLD_LTX_PAGED_MIN_MB")
                .unwrap_or(None)
                .unwrap_or(DEFAULT_PAGED_MIN_MB)
                .saturating_mul(1 << 20),
            truncate_pages: lookup("CELLD_LTX_TRUNCATE_PAGES")
                .and_then(|value| {
                    crate::env_vars::parse_optional::<u32>("CELLD_LTX_TRUNCATE_PAGES", value)
                })
                .ok()
                .flatten()
                .unwrap_or(DEFAULT_TRUNCATE_PAGES),
        }
    }
}

struct CellCompaction {
    cell: String,
    epoch: u64,
    client: celld_ltx::BundleOverlayClient<SharedObjectStoreClient>,
    fetcher: Arc<SinkFetcher>,
    local_path: PathBuf,
    host: LtxHost,
    queue: mpsc::UnboundedSender<CompactionWork>,
    /// The epoch's first txid: 1, or the cut a paged epoch continues from.
    base_txid: u64,
    min_txids: u64,
    min_bytes: u64,
    /// L0 bytes uploaded since the last fold, the size trigger's measure.
    pending_bytes: AtomicU64,
    compacted_txid: AtomicU64,
    /// Ship rounds also queue work, so the failure delay must gate admission
    /// rather than only delaying the worker's own requeue task.
    retry_after_ms: AtomicU64,
    failures: AtomicU64,
    queued: AtomicBool,
    /// Set for good when the replica closes or a handoff completes. Nothing
    /// clears it.
    cancelled: AtomicBool,
    /// Set while a handoff snapshot holds compaction off, and cleared when
    /// that handoff attempt ends. See `HandoffCompactionPause`.
    handoff_paused: AtomicBool,
    cancel: Notify,
    #[cfg(all(test, celld_internal_tests))]
    finish_pause: Mutex<Option<Arc<CompactionFinishPauseForWorld>>>,
    /// Serializes threshold compaction with the final handoff snapshot. The
    /// handoff path pauses background work, then waits here before it reads
    /// the quiesced database image.
    run: tokio::sync::Mutex<()>,
}

impl CellCompaction {
    /// Whether a round must not start or continue: the replica closed, or a
    /// handoff snapshot holds compaction off.
    fn halted(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst) || self.handoff_paused.load(Ordering::SeqCst)
    }
}

/// Compaction held off for one handoff attempt, from the snapshot's start
/// until `evict` returns.
///
/// The pause is scoped to the attempt because the attempt can end without a
/// handoff. An abandoned eviction, or one whose release retries run past the
/// eviction deadline, restarts the cell in place on the same handle
/// (`StartRuntime` with no `Restore`). Any other failed attempt is retried,
/// and each retry takes a new pause. The pause used to be the permanent
/// `cancelled` flag, which nothing cleared, so the cell refused every
/// threshold fold and every epoch GC opener fold for the rest of its
/// activation. A reset at each failing return was rejected because a
/// new return path can forget it. The pause has its own flag so that its drop
/// cannot undo a `close_replica` cancel that raced the eviction.
///
/// A round that waited on the run lock behind the pause can still see a
/// stale cancel wake after an abandoned attempt and end `Cancelled` without
/// a requeue. Its fold then waits for the next threshold crossing or the
/// next epoch GC pass, instead of the rest of the activation.
struct HandoffCompactionPause(CellHandle);

impl HandoffCompactionPause {
    fn new(handle: &CellHandle) -> Option<Self> {
        let compaction = handle.compaction.as_ref()?;
        compaction.handoff_paused.store(true, Ordering::SeqCst);
        compaction.cancel.notify_waiters();
        Some(Self(handle.clone()))
    }

    /// End the pause with the handoff. Compaction stays cancelled for good,
    /// because a fold after the handoff would upload into an epoch that a
    /// successor has already superseded.
    fn handed_off(self) {
        cancel_compaction(&self.0);
    }
}

impl Drop for HandoffCompactionPause {
    fn drop(&mut self) {
        if let Some(compaction) = &self.0.compaction {
            compaction.handoff_paused.store(false, Ordering::SeqCst);
        }
    }
}

struct CompactionWork {
    cell: Weak<Cell>,
    queued_at_mono_ms: u64,
    /// The `trigger` label of the round's log event. It travels with the
    /// work, so an operator can tell a forced epoch opener from a threshold
    /// round.
    trigger: &'static str,
}

struct RemoteRestoreTiming {
    started_mono_ms: u64,
    from: u64,
    source_lookup_us: u64,
    plan_us: u64,
    /// The page map's build, on a paged activation; zero on a download.
    map_us: u64,
    download_us: u64,
    apply_us: u64,
    objects: usize,
    bytes: u64,
    levels: String,
    paged: bool,
}

/// A paged VFS registration that unregisters itself unless the activation
/// reaches its handle: every failure after the registration (the managed
/// db's open, the seed, the marker's upload, admission) otherwise leaked a
/// registration and the page map it holds, once per retry.
struct PagedRegistration(Option<String>);

impl PagedRegistration {
    fn keep(mut self) {
        self.0 = None;
    }
}

impl Drop for PagedRegistration {
    fn drop(&mut self) {
        if let Some(name) = self.0.take() {
            let _ = celld_ltx::paged_vfs::unregister_paged_vfs(&name);
        }
    }
}

/// `L0:n L1:m ...` for a plan, as the restore_plan event prints it.
fn by_level(plan: &[celld_ltx::FileInfo]) -> String {
    let mut counts = std::collections::BTreeMap::new();
    for info in plan {
        *counts.entry(info.level).or_insert(0usize) += 1;
    }
    counts
        .iter()
        .map(|(level, count)| format!("L{level}:{count}"))
        .collect::<Vec<_>>()
        .join(" ")
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
    /// A handoff snapshot of this cell did not publish inside the durability
    /// deadline, or its size showed that it cannot. Every later eviction of
    /// this epoch proves durability through the L0 chain instead of building
    /// and timing out on the same snapshot again.
    snapshot_declined: AtomicBool,
    /// The paged VFS registered for this activation (paged restore only). The
    /// local db is then a sparse cache of the cut: every reader of the file
    /// must go through this VFS, the file is not a reusable eviction baseline,
    /// and a handoff snapshot built from it would publish hole-zeros as data.
    paged_vfs: Option<String>,
    hydration: Option<Arc<CellHydration>>,
    replica: Mutex<Option<Replica<SharedObjectStoreClient>>>,
    /// The same epoch-prefix client the replica holds, for uploads that run
    /// off the replica mutex.
    client: SharedObjectStoreClient,
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
    /// A captured round can credit after removal, so stopped-tail checks
    /// retain this live watermark rather than a snapshot of the last credit.
    shipped_txid: Arc<AtomicU64>,
    /// Highest TXID included in a submitted fleet round. A pipeline reset
    /// rolls it back to `shipped_txid`, so the failed tail is retried once.
    submitted_txid: AtomicU64,
    /// A staged upload can finish after the active handle is removed. Retain
    /// only this monotone proof with its dirty tail, not the closed runtime.
    durable_txid: Arc<AtomicU64>,
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
    /// The highest `req_seq` a capture of this cell has begun for, and the
    /// monotonic ms when that capture began. A waiter reads them to learn
    /// whether the upload covering its ticket is in flight (the fixed proof
    /// budget then runs from the capture) or still queued behind other cells'
    /// uploads (the wait extends while the node proves anything). See
    /// `celld_logic::durability`. A retry of the same tickets keeps the
    /// original start, so a persistently failing upload still gives up one
    /// budget after it first began.
    capture_seq: AtomicU64,
    capture_started_ms: AtomicU64,
    /// Node-wide: monotonic ms of the last proof any cell landed, shared by
    /// every handle. The queued-wait rule anchors on it.
    node_proof_ms: Arc<AtomicU64>,
    /// Notified when `synced_seq` advances (or a sync fails), waking waiters.
    ready: Notify,
    compaction: Option<CellCompaction>,
    #[cfg(all(test, celld_internal_tests))]
    sync_credit_pause: Mutex<Option<Arc<SyncCreditPauseForWorld>>>,
    #[cfg(all(test, celld_internal_tests))]
    observer_cell: String,
    #[cfg(all(test, celld_internal_tests))]
    observer_epoch: u64,
    #[cfg(all(test, celld_internal_tests))]
    durability_ticket_receipts: Mutex<Vec<LtxDurabilityTicketReceiptForWorldV1>>,
    #[cfg(all(test, celld_internal_tests))]
    upload_round_receipts: Mutex<Vec<LtxUploadRoundReceiptForWorldV1>>,
    #[cfg(all(test, celld_internal_tests))]
    fleet_credit_receipts: Mutex<Vec<LtxFleetCreditReceiptForWorldV1>>,
    #[cfg(all(test, celld_internal_tests))]
    fleet_capture_receipts: Mutex<Vec<LtxFleetCaptureReceiptForWorld>>,
}
type CellHandle = Arc<Cell>;

/// The successor still needs a per-cell fold, but epoch replacement needs
/// only bucket coverage. Keep the ending bound and both live proofs together:
/// a late upload can release the epoch barrier, but a late fleet credit must
/// extend that barrier before any old fragments become abandonable.
struct RetainedTail {
    acked_txid: u64,
    shipped_txid: Arc<AtomicU64>,
    durable_txid: Arc<AtomicU64>,
}

/// Both direct L0 drains and L1 folds publish per-cell coverage. Reading only
/// the direct watermark makes recovery re-upload rows that L1 already holds.
fn percell_coverage(handle: &Cell) -> u64 {
    handle.percell_txid.load(Ordering::SeqCst).max(
        handle.compaction.as_ref().map_or(0, |compaction| {
            compaction.compacted_txid.load(Ordering::SeqCst)
        }),
    )
}

/// Credit an upload that the per-cell prefix holds through `txid`. A per-cell
/// object is also bucket coverage, so both watermarks move together. Per-cell
/// coverage is published first: a concurrent stop reads the bucket credit
/// before coverage, and the reverse order can invent an undrained tail in a
/// bucket-only session with no log record, which makes its next restore fail.
fn credit_percell_upload(handle: &Cell, txid: u64) {
    handle.percell_txid.fetch_max(txid, Ordering::SeqCst);
    handle.durable_txid.fetch_max(txid, Ordering::SeqCst);
}

/// Whether the bucket covers every cell row in one shipped batch, so that
/// followers can truncate it. The ledger holds each handle after the cell
/// stops, so every path that leaves rows only in the bucket, and every path
/// that deletes them, must credit `durable_txid`, or this batch and every
/// later batch stay on follower disks until the next epoch.
fn ship_batch_covered(cells: &[(CellHandle, u64)]) -> bool {
    cells
        .iter()
        .all(|(handle, txid)| handle.durable_txid.load(Ordering::SeqCst) >= *txid)
}

/// A capture covering tickets up to `captured` has begun for this cell. Only
/// a capture that reaches new tickets moves the start: a retry of the same
/// tickets keeps the budget it has already spent.
fn note_capture(handle: &Cell, captured: u64) {
    if handle.capture_seq.load(Ordering::SeqCst) < captured {
        handle
            .capture_started_ms
            .store(asyncrt::mono_ms(), Ordering::SeqCst);
        handle.capture_seq.fetch_max(captured, Ordering::SeqCst);
    }
}

/// A proof landed for this cell: the node is making progress.
fn note_proof(handle: &Cell) {
    handle
        .node_proof_ms
        .fetch_max(asyncrt::mono_ms(), Ordering::SeqCst);
}

/// A writer that refuses to grow past its budget, so an oversized snapshot
/// stops at the budget instead of materializing the whole database.
struct BoundedWriter<'a> {
    data: &'a mut Vec<u8>,
    budget: usize,
}

impl std::io::Write for BoundedWriter<'_> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        if self.data.len().saturating_add(buf.len()) > self.budget {
            self.data.resize(self.budget, 0);
            return Err(std::io::Error::other("handoff snapshot exceeds its budget"));
        }
        self.data.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// Bytes per millisecond of deadline that a handoff snapshot may occupy:
/// 8 MiB/s, below the fleet-to-bucket rate seen on every lab run, so a
/// snapshot inside the budget uploads inside the deadline with margin. The
/// default deadline therefore carries 80 MiB; a larger database hands off
/// through its L0 chain. Without this bound a 120 MB cell built its image,
/// timed out, and retried forever, unreachable, on the 2026-09-03 fleet.
const SNAPSHOT_BYTES_PER_MS: u64 = 8 * 1024;

/// The default deadline for one durability proof, in seconds. A sustained
/// write burst (a large upload landing in one cell) can legitimately need
/// more than one capture+upload cycle to prove; on a slow or busy store a
/// fixed 10s fences the cell out from under an active request, so operators
/// can raise it via `CELLD_LTX_DURABILITY_TIMEOUT_SECS`.
const DEFAULT_DURABILITY_TIMEOUT_SECS: u64 = 10;

/// The TRUNCATE checkpoint threshold, in pages. Chosen from a measured
/// threshold curve (2026-08-26): the read per sync is flat from 64 to 128
/// pages (~68 KB against ~2.4 MB untruncated) and 128 pays half the
/// boundary snapshots of 64, while 256 and above let the stale-tail reads
/// back in. A 512 KB WAL cap keeps every capture's read small for the price
/// of one boundary snapshot of the database per checkpoint cycle — which is
/// only a small-cell price: the Db also requires the WAL to outgrow the
/// database before it truncates, so a whale pays that image once per
/// database's worth of writes, not once per 512 KB (its chain grew as the
/// square of its size on the 2026-09-02 fleet before that bound).
const DEFAULT_TRUNCATE_PAGES: u32 = 128;

/// The chain size from which a restore pages, in MiB. A clone of this much
/// takes a few seconds at fleet bandwidth and fits a node's memory with
/// room to spare; the 5 GB whale's clone did not (OOM at 7.75 GB RSS on an
/// 8 GB node), and its paged takeover moved 90 MiB.
const DEFAULT_PAGED_MIN_MB: u64 = 256;

/// The default background hydration rate of a paged cell, in MiB/s. A 2 GB
/// whale fills in about two minutes; a fault of the foreground never waits
/// on a hydration step, which fetches outside the hydration lock.
const DEFAULT_HYDRATE_MBPS: u64 = 16;

/// Pages one hydration step faults before it yields to the pacer: one run.
const HYDRATE_STEP_PAGES: u32 = 256;

/// The background fill of a paged cell: cancelled when the cell closes.
struct CellHydration {
    cancelled: AtomicBool,
    complete: AtomicBool,
}

/// How long a read of a stream's retired mark answers coverage questions
/// before the next question reads it again.
const RETIRED_MARK_TTL_MS: u64 = 5 * 60 * 1000;

/// How long a read that found no retired mark answers before the next
/// question reads it again. A mark is read only for a stream this node does
/// not hold and only for a row its per-cell prefix does not cover, which is
/// rare outside recovery, so a short wait costs little; it bounds how long a
/// node keeps the rows of an epoch another owner retired.
const RETIRED_MARK_ABSENT_TTL_MS: u64 = 30 * 1000;

/// Restores of an unowned snapshot before a missing object is an error. Each
/// retry lists the epochs again, so it fails only when the bucket keeps losing
/// an object that every fresh chain still needs.
const RESTORE_SNAPSHOT_ATTEMPTS: usize = 3;

/// The body of `cells/<stream>/ltx/retired.json`.
#[derive(serde::Serialize, serde::Deserialize)]
struct RetiredMark {
    retired_below: u64,
}

/// What one epoch-GC pass did for one stream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EpochGcOutcome {
    /// The chain's base; the stream's rows below it are covered.
    pub retired_below: u64,
    /// The epoch prefixes this pass deleted.
    pub deleted: Vec<u64>,
    /// No further pass for this activation can delete more.
    pub settled: bool,
}

/// One superseded epoch below a stream's chain base.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EpochBelowBase {
    pub listed: celld_logic::epoch_gc::ListedEpoch,
    /// Bytes under the epoch's prefix.
    pub bytes: u64,
}

fn retired_mark_key(prefix: &str, cell: &str) -> celld_ltx::object_store::path::Path {
    celld_ltx::object_store::path::Path::from(format!("{prefix}cells/{cell}/ltx/retired.json"))
}

/// Read one stream's retired mark from the bucket; `None` when it has none.
pub(crate) async fn read_retired_mark(
    store: &dyn ObjectStore,
    prefix: &str,
    cell: &str,
) -> anyhow::Result<Option<u64>> {
    match store.get(&retired_mark_key(prefix, cell)).await {
        Ok(result) => {
            let bytes = result.bytes().await?;
            Ok(Some(
                serde_json::from_slice::<RetiredMark>(&bytes)?.retired_below,
            ))
        }
        Err(celld_ltx::object_store::Error::NotFound { .. }) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// The most superseded epochs one owner pass summarizes and deletes. A cell
/// with thousands of them spends one listing per epoch, so a pass takes the
/// oldest few and the next pass continues.
const EPOCH_GC_EPOCHS_PER_PASS: usize = 64;

/// A read-only view of one stream's epochs for epoch GC.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EpochScan {
    /// The newest listed epoch.
    pub newest: u64,
    /// The restore chain over every listed epoch, oldest first.
    pub chain: Vec<u64>,
    /// The oldest listed epochs below the chain's base, ascending, at most
    /// the scan's bound.
    pub below: Vec<EpochBelowBase>,
    /// More epochs below the base exist than the scan summarized.
    pub more_below: bool,
}

/// Scan one stream's epochs the way a restore sees them: build the restore
/// chain over every listed epoch with the restore code, require its restore
/// plan to resolve, and summarize each epoch below its base. `None` when the
/// stream has no epoch or no complete chain. The owner's pass and
/// `celld cell gc --dry-run` share this, so the dry run reports what the
/// owner would decide.
pub async fn scan_epochs(
    store: &dyn ObjectStore,
    prefix: &str,
    cell: &str,
    max_below: usize,
    client_for: impl Fn(u64) -> ObjectStoreClient,
) -> anyhow::Result<Option<EpochScan>> {
    use celld_ltx::object_store::path::Path as ObjPath;
    use futures_util::StreamExt as _;
    let base_path = ObjPath::from(format!("{prefix}cells/{cell}/ltx"));
    let mut listed: Vec<u64> = store
        .list_with_delimiter(Some(&base_path))
        .await?
        .common_prefixes
        .iter()
        .filter_map(|p| p.filename()?.strip_prefix('e')?.parse().ok())
        .collect();
    listed.sort_unstable();
    let Some(&newest) = listed.last() else {
        return Ok(None);
    };
    let clients = listed.iter().map(|e| (*e, client_for(*e))).collect();
    let chain = match EpochChain::build(clients).await {
        Ok(chain) => chain,
        Err(celld_ltx::Error::TxNotAvailable) => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if replica::calc_restore_plan(&chain, TXID(0)).await.is_err() {
        return Ok(None);
    }
    let chain: Vec<u64> = chain.spans().into_iter().map(|(e, _)| e).collect();
    let base = chain.first().copied().unwrap_or(newest);
    let mut below = Vec::new();
    let superseded: Vec<u64> = listed.into_iter().filter(|e| *e < base).collect();
    let more_below = superseded.len() > max_below;
    for epoch in superseded.into_iter().take(max_below) {
        let path = ObjPath::from(format!("{prefix}cells/{cell}/ltx/e{epoch}"));
        let mut objects = store.list(Some(&path));
        let (mut newest_ms, mut bytes) = (0_u64, 0_u64);
        while let Some(object) = objects.next().await {
            let object = object?;
            newest_ms = newest_ms.max(object.last_modified.timestamp_millis().max(0) as u64);
            bytes = bytes.saturating_add(object.size);
        }
        below.push(EpochBelowBase {
            listed: celld_logic::epoch_gc::ListedEpoch { epoch, newest_ms },
            bytes,
        });
    }
    Ok(Some(EpochScan {
        newest,
        chain,
        below,
        more_below,
    }))
}

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
    /// The node's root task group, for the per-cell background hydration.
    tasks: TaskGroup,
    /// Woken when a cell's `committed` advances, so the background loop syncs
    /// without polling; a slow tick backstops any missed notification.
    dirty: Arc<Notify>,
    /// Shared by every activation, so the restore bound is per node, not per
    /// cell. The generic LTX restore keeps its sequential compatibility path.
    restore_slots: Arc<Semaphore>,
    compaction_queue: Option<mpsc::UnboundedSender<CompactionWork>>,
    compaction_min_txids: u64,
    compaction_min_bytes: u64,
    /// Restore a taken-over cell by paging its pages in on demand (a fault-in
    /// SQLite VFS) instead of downloading the whole chain, and continue its
    /// chain from the cut. On unless `CELLD_LTX_PAGED=0`.
    paged_restore: AtomicBool,
    /// Whether every live lease in the fleet reads a paged epoch
    /// (`celld_logic::format`). Off until the fleet sampler has seen every
    /// lease at `BUCKET_FORMAT`, so a node in a rolling update clones a whale
    /// the way the old release does instead of writing an epoch the old
    /// release cannot restore. `CELLD_LTX_PAGED` is the operator's switch;
    /// this one is the fleet's.
    paged_fleet: AtomicBool,
    /// The chain size, in bytes, from which a restore pages instead of
    /// cloning (`CELLD_LTX_PAGED_MIN_MB`). Below it the clone is cheaper:
    /// one download the node can afford, no fault path, no hydration.
    paged_min_bytes: AtomicU64,
    /// Bytes per second a paged cell hydrates in the background, 0 for none
    /// (`CELLD_LTX_HYDRATE_MBPS`). A hydrated cell reads only its file.
    hydrate_bytes_per_s: u64,
    /// One paged cell hydrates at a time: a node with several whales pages
    /// them all and fills them in turn.
    hydrations: Arc<Semaphore>,
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
    dirty_tails: Mutex<BTreeMap<String, BTreeMap<u64, RetainedTail>>>,
    registration: Arc<Mutex<RegistrationState>>,
    stop: StopToken,
    task_owner: Mutex<Option<LtxTaskOwner>>,
    #[cfg(celld_internal_tests)]
    activation_install_pause: Mutex<Option<Arc<LtxActivationInstallPause>>>,
    #[cfg(celld_internal_tests)]
    close_local_replicas_pause: Mutex<Option<Arc<LtxReplicaClosePause>>>,
    #[cfg(celld_internal_tests)]
    panic_next_release_close: AtomicBool,
    /// The budget for one durability proof, in milliseconds. Fixed at
    /// construction, so the hot write path pays no environment lookup.
    durability_timeout_ms: u64,
    /// Monotonic ms of the last proof any cell on this node landed. Every
    /// cell handle shares it; see `Cell::node_proof_ms`.
    node_proof_ms: Arc<AtomicU64>,
    /// The largest handoff snapshot the durability deadline can carry. A
    /// larger database hands off through its L0 chain without an attempt.
    snapshot_budget_bytes: AtomicU64,
    /// The highest txid this process has put in the bucket per cell epoch,
    /// through a per-cell ship, a handoff snapshot, a recovered segment, or
    /// an epoch marker, plus any bucket listing it had to do. Bundle GC and
    /// the recovery gather ask for this watermark once per cell per pass;
    /// answering from the bucket cost ten LISTs per cell, so a pass of a
    /// 2 s budget judged about one bundle against roughly one new bundle a
    /// second, and the retained backlog grew for the life of the process.
    /// On 2026-09-03 a dead session's recovery read 209 of them.
    covered_by_cell: Mutex<BTreeMap<(String, u64), u64>>,
    /// Each stream's retired mark (`cells/<stream>/ltx/retired.json`) as
    /// last read or written, with the monotonic time of that read. A
    /// coverage question for a stream this node does not hold reads the mark
    /// when the per-cell answer does not reach the row, so a read is reused
    /// for [`RETIRED_MARK_TTL_MS`], or [`RETIRED_MARK_ABSENT_TTL_MS`] when it
    /// found none; a mark only rises, so a stale one only under-reports and
    /// keeps a row.
    retired_marks: Mutex<BTreeMap<String, (Option<u64>, u64)>>,
    /// How old the newest object of a superseded epoch must be before epoch
    /// GC deletes the epoch, or `None` when epoch GC is off
    /// (`CELLD_LTX_RETENTION_SECS`, unset or `0`). Deletion is off by default:
    /// turning it on is the operator's decision, not a side effect of an
    /// upgrade.
    epoch_gc_grace_ms: Option<u64>,
    /// The cell's TRUNCATE checkpoint threshold. Passive checkpoints never
    /// shrink the WAL FILE, so after every periodic restart the capture's
    /// tail read spans the stale high-water region — ~350 KB per sync on
    /// the fleet ledger at the upstream threshold. `DEFAULT_TRUNCATE_PAGES`
    /// unless `CELLD_LTX_TRUNCATE_PAGES` overrides it; 0 disables
    /// truncation (the upstream behavior). Queue cells always disable it
    /// because each truncate boundary emits a full image of their unbounded
    /// backlog.
    truncate_pages: Option<u32>,
}

impl LtxRepl {
    /// Cfg-gated constructor over an injected store.
    #[cfg(celld_internal_tests)]
    pub fn start_with_store_for_test(watch: &Path, store: Arc<dyn ObjectStore>) -> Self {
        Self::start_with_store(watch, store, None, 0)
    }

    /// Build the production loop topology over an injected object store,
    /// with the settings that production reads from the environment.
    #[cfg(celld_internal_tests)]
    pub fn start_with_store(
        watch: &Path,
        store: Arc<dyn ObjectStore>,
        compaction: Option<CompactionConfig>,
        flush_ms: u64,
    ) -> Self {
        Self::start_with_store_and_optional_vfs(
            watch,
            store,
            compaction,
            flush_ms,
            None,
            LtxConfig::from_env(),
        )
    }

    /// Build the same loop topology with `config`, and route managed SQLite
    /// through `vfs`. A simulated fleet passes each node its own config.
    #[cfg(celld_internal_tests)]
    pub(crate) fn start_with_store_on_vfs(
        watch: &Path,
        store: Arc<dyn ObjectStore>,
        compaction: Option<CompactionConfig>,
        flush_ms: u64,
        vfs: &str,
        config: LtxConfig,
    ) -> Self {
        Self::start_with_store_and_optional_vfs(
            watch,
            store,
            compaction,
            flush_ms,
            Some(vfs.to_string()),
            config,
        )
    }

    #[cfg(celld_internal_tests)]
    fn start_with_store_and_optional_vfs(
        watch: &Path,
        store: Arc<dyn ObjectStore>,
        compaction: Option<CompactionConfig>,
        flush_ms: u64,
        vfs_name: Option<String>,
        config: LtxConfig,
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
            config,
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
                min_bytes: COMPACTION_MAX_INPUT_BYTES / 2,
                concurrency,
            }),
            0,
            deterministic_ltx_host(),
            None,
            DEFAULT_DURABILITY_TIMEOUT_SECS * 1_000,
            LtxConfig::from_env(),
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
            LtxConfig::from_env(),
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
        config: LtxConfig,
    ) -> Self {
        let cells: Arc<Mutex<BTreeMap<(String, u64), CellHandle>>> = Arc::default();
        let dirty = Arc::new(Notify::new());
        let dirty_ship = Arc::new(Notify::new());
        let registration: Arc<Mutex<RegistrationState>> = Arc::default();
        let stop = StopToken::new();
        let tasks = TaskGroup::new(stop.clone());
        let replica_close_stop = StopToken::new();
        let replica_close_tasks = TaskGroup::new(replica_close_stop.clone());
        let preserved = Mutex::new(crate::replication::PreservedCache::new(
            ltx_host.filesystem(),
        ));
        // Retain every root until the unique durability owner claims them.
        // Dropping a task handle detaches the task, so a cloneable replicator
        // cannot be the final lifecycle capability.
        tasks.spawn_owned(
            "ltx_sync",
            sync_loop(
                cells.clone(),
                dirty.clone(),
                Arc::new(Semaphore::new(sync_concurrency())),
                registration.clone(),
                stop.clone(),
                tasks.clone(),
                flush_ms,
            ),
        );
        tasks.spawn_owned(
            "ltx_ship",
            ship_loop(
                cells.clone(),
                dirty_ship.clone(),
                registration.clone(),
                stop.clone(),
                crate::queue_batching::timing().log_ms,
            ),
        );
        tasks.spawn_owned(
            "ltx_bundle",
            bundle_loop(cells.clone(), registration.clone(), stop.clone(), flush_ms),
        );
        let compaction_queue =
            compaction.map(|config| start_compaction_loop(config, tasks.clone()));
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
            tasks: tasks.clone(),
            dirty,
            restore_slots: Arc::new(Semaphore::new(RESTORE_DOWNLOAD_CONCURRENCY)),
            compaction_queue,
            compaction_min_txids: compaction.map_or(0, |config| config.min_txids),
            compaction_min_bytes: compaction.map_or(u64::MAX, |config| config.min_bytes),
            paged_restore: AtomicBool::new(config.paged_restore),
            paged_fleet: AtomicBool::new(false),
            paged_min_bytes: AtomicU64::new(config.paged_min_bytes),
            hydrate_bytes_per_s: config.hydrate_bytes_per_s,
            hydrations: Arc::new(Semaphore::new(1)),
            preserved,
            dirty_ship,
            dirty_tails: Mutex::new(BTreeMap::new()),
            registration,
            stop: stop.clone(),
            task_owner: Mutex::new(Some(LtxTaskOwner {
                tasks,
                replica_close_tasks,
            })),
            #[cfg(celld_internal_tests)]
            activation_install_pause: Mutex::new(None),
            #[cfg(celld_internal_tests)]
            close_local_replicas_pause: Mutex::new(None),
            #[cfg(celld_internal_tests)]
            panic_next_release_close: AtomicBool::new(false),
            durability_timeout_ms,
            node_proof_ms: Arc::new(AtomicU64::new(0)),
            snapshot_budget_bytes: AtomicU64::new(
                durability_timeout_ms.saturating_mul(SNAPSHOT_BYTES_PER_MS),
            ),
            covered_by_cell: Mutex::new(BTreeMap::new()),
            retired_marks: Mutex::new(BTreeMap::new()),
            epoch_gc_grace_ms: config.epoch_gc_grace_ms,
            truncate_pages: Some(config.truncate_pages),
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

    /// Install the manager's shipping and bundle operations as one unit.
    ///
    /// The shipper gates fleet proofs on its open bucket log record.
    /// Registration can precede that opening. The registration stores
    /// weak references because the manager already owns this replicator.
    pub(crate) fn register_durability(
        &self,
        manager: Arc<crate::node_log::NodeLogManager>,
    ) -> Option<DurabilityRegistration> {
        self.register_targets(RegisteredTargets {
            shipper: manager.clone(),
            manager,
        })
    }

    #[cfg(all(test, celld_internal_tests))]
    pub(crate) fn register_durability_for_world(
        &self,
        manager: Arc<crate::node_log::NodeLogManager>,
        shipper: Arc<dyn Shipper>,
    ) -> Option<DurabilityRegistration> {
        self.register_targets(RegisteredTargets { shipper, manager })
    }

    fn register_targets(&self, targets: RegisteredTargets) -> Option<DurabilityRegistration> {
        let targets = Arc::new(targets);
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

    /// Wait for the active replicas' shipped frames to reach the bucket.
    /// This excludes stopped cells, so abandoning a fragment also requires
    /// `all_fragment_rows_tiered` to check their retained coverage proofs.
    pub fn all_shipped_tiered(&self) -> bool {
        Self::all_cells_shipped_tiered(&self.cells.lock().unwrap())
    }

    fn all_cells_shipped_tiered(cells: &BTreeMap<(String, u64), CellHandle>) -> bool {
        cells.values().all(|cell| {
            cell.durable_txid.load(Ordering::SeqCst) >= cell.shipped_txid.load(Ordering::SeqCst)
        })
    }

    /// The epoch-change barrier includes stopped cells. Their staged uploads
    /// can complete after removal, so consult their retained live watermarks.
    /// Requiring their fold markers to disappear would strand fleet repair
    /// until each stopped cell receives another activation or the node exits.
    pub(crate) fn all_fragment_rows_tiered(&self) -> bool {
        let cells = self.cells.lock().unwrap();
        Self::all_cells_shipped_tiered(&cells)
            && self.dirty_tails.lock().unwrap().values().all(|epochs| {
                epochs.values().all(|tail| {
                    tail.durable_txid.load(Ordering::SeqCst)
                        >= tail
                            .acked_txid
                            .max(tail.shipped_txid.load(Ordering::SeqCst))
                })
            })
    }

    /// The final process-seal barrier. A cell that leaves the active map can
    /// still have fleet-acked rows outside the per-cell layout. Ending a cell
    /// installs that fact in `dirty_tails` before it removes the active handle,
    /// and this method reads the same two stores in that order. Therefore, the
    /// final check observes either the undrained active handle or its marker.
    pub(crate) fn all_tails_tiered(&self) -> bool {
        let cells = self.cells.lock().unwrap();
        Self::all_cells_shipped_tiered(&cells) && self.dirty_tails.lock().unwrap().is_empty()
    }

    /// The highest TXID the cell's per-cell prefix already covers, over
    /// every level, or `u64::MAX` for a retired epoch. The caller passes the
    /// highest row it needs covered. Recovery uses the answer to skip
    /// re-uploading rows the drain points (compaction, eviction sync) have
    /// already folded in, bundle GC and the graceful seal's scan to decide
    /// which bundle rows are safe to drop, and the compaction overlay to
    /// skip rows the prefix holds.
    ///
    /// An epoch below the stream's retired mark is covered through every
    /// txid: the chain's base holds all of its acknowledged rows, and epoch
    /// GC may have deleted its prefix, so a listing would answer zero and
    /// keep its bundles and re-upload its rows forever. The mark is read only
    /// when the per-cell answer does not reach `needed`, so a covered row
    /// costs no mark read on any fleet, and a mark read never stands between
    /// a question and a per-cell answer that already settles it. Every node
    /// reads the mark, whether or not it runs epoch GC itself: while a fleet
    /// rolls the setting out, a node without it must still seal over, drop,
    /// and not re-upload the rows of an epoch another node deleted. An
    /// absent mark is cached for [`RETIRED_MARK_ABSENT_TTL_MS`], which bounds
    /// how long such a node lags a new mark.
    ///
    /// A stream this node holds a handle for answers from its per-cell
    /// watermark alone and reads no mark. A busy cell's bundle rows sit above
    /// that watermark until the next drain point, so reading the mark there
    /// would cost a GET on every bundle-GC tick for every active cell, on
    /// every fleet. Holding the handle means the epoch is this node's current
    /// one, or a fenced node's whose successor may have retired it, because
    /// teardown is asynchronous; that answer is lower than the truth, which
    /// keeps rows and is safe. Once the handle goes, its coverage moves to
    /// the remembered watermark and the mark decides rows above it. The
    /// compaction overlay therefore reads no mark while its cell is
    /// resident, and a fenced compactor can write merged rows back under a
    /// retired prefix; no restore reads a prefix below the base, and a later
    /// owner pass deletes it again once the grace passes, measured from the
    /// rewritten objects. The current owner keeps it when it is the epoch
    /// just before its own, because a plan never deletes that epoch.
    ///
    /// This is safe only because the base holds every acknowledged row of
    /// every epoch below it. A successor claims a cell only after the prior
    /// owner's node-log session is recovered and sealed, and recovery puts
    /// every acknowledged row in the per-cell prefix first, so the
    /// successor's restore, and with it the base, contains those rows; a
    /// local wake restores from the file its own rows were shipped from. A
    /// recovery upload that lands after the seal can only repeat rows the
    /// base already holds.
    pub async fn covered_txid(&self, cell: &str, epoch: u64, needed: u64) -> u64 {
        let key = (cell.to_string(), epoch);
        // Held is decided by the handle, not its value: a fresh cell that has
        // not reached a drain point holds a zero watermark and must not fall
        // through to the mark on every tick either.
        let (held, resident) = {
            let cells = self.cells.lock().unwrap();
            let handle = cells.get(&key);
            (
                handle.is_some(),
                handle
                    .map(|handle| percell_coverage(handle))
                    .filter(|covered| *covered > 0),
            )
        };
        // A handoff snapshot raises the remembered watermark while the
        // evicting handle is still resident, so the higher of the two holds.
        let known = self.covered_by_cell.lock().unwrap().get(&key).copied();
        if held {
            return resident.max(known).unwrap_or(0);
        }
        let covered = match resident.max(known) {
            Some(covered) => covered,
            // Nothing this process put there: a cell it never served, or one
            // it has not shipped yet. Ask the bucket once, with one listing
            // of the epoch's whole prefix rather than one per level, and
            // remember the answer; the watermark only rises, so a remembered
            // value never over-reports. A restarting node recovers thousands
            // of cells it never served, so this listing, and a mark read for
            // a row it does not cover, is its recovery cost.
            None => match self.client_for(cell, epoch).max_txid_all_levels().await {
                Ok(txid) => {
                    // Zero is a useful answer too: undrained cells otherwise
                    // force the same empty-prefix LIST on every GC tick. A
                    // read error is not zero coverage and must remain
                    // retryable.
                    self.note_covered(cell, epoch, txid.0);
                    txid.0
                }
                Err(_) => 0,
            },
        };
        if covered >= needed {
            return covered;
        }
        if celld_logic::epoch_gc::retired(epoch, self.retired_mark(cell).await) {
            return u64::MAX;
        }
        covered
    }

    /// Remember that the bucket holds this cell epoch through `txid`.
    fn note_covered(&self, cell: &str, epoch: u64, txid: u64) {
        let mut covered = self.covered_by_cell.lock().unwrap();
        let entry = covered.entry((cell.to_string(), epoch)).or_insert(0);
        *entry = (*entry).max(txid);
    }

    fn retired_mark_key(&self, cell: &str) -> celld_ltx::object_store::path::Path {
        retired_mark_key(&self.prefix, cell)
    }

    /// The stream's retired mark, by its exact stream name. A read error
    /// answers the cached mark, or none: a missing mark keeps rows, which
    /// costs space, never data.
    pub async fn retired_mark(&self, cell: &str) -> Option<u64> {
        let now = asyncrt::mono_ms();
        if let Some((mark, read_at)) = self.retired_marks.lock().unwrap().get(cell) {
            let ttl = if mark.is_some() {
                RETIRED_MARK_TTL_MS
            } else {
                RETIRED_MARK_ABSENT_TTL_MS
            };
            if now.saturating_sub(*read_at) < ttl {
                return *mark;
            }
        }
        let Ok(mark) = read_retired_mark(self.store.as_ref(), &self.prefix, cell).await else {
            // A failed read answers the cached mark and restarts its wait:
            // 30 s with nothing cached, and 5 min for an expired cached mark,
            // which a failed reread keeps. A store outage therefore does not
            // cost a GET on every question, and a stale answer is only low.
            return self.remember_retired(cell, None, now);
        };
        self.remember_retired(cell, mark, now)
    }

    /// Record that the stream's epochs below `below` are retired. The owner
    /// writes this before it deletes any of them, so a prefix is never gone
    /// while its bundle rows still look uncovered. The write is not
    /// conditional: an owner that stalled after its checks can write an
    /// older, lower base over a successor's mark. Every written base was a
    /// real base once, so a lower mark only makes some rows look uncovered
    /// again, which costs a re-upload and a later pass, not data.
    async fn record_retired(&self, cell: &str, below: u64) -> anyhow::Result<()> {
        let body = serde_json::to_vec(&RetiredMark {
            retired_below: below,
        })?;
        self.store
            .put(&self.retired_mark_key(cell), body.into())
            .await
            .map_err(|error| anyhow!("record retired epochs of {cell} below e{below}: {error}"))?;
        self.remember_retired(cell, Some(below), asyncrt::mono_ms());
        Ok(())
    }

    /// Cache a mark read or written at `at`. The cached value never falls,
    /// because an older read racing a newer write must not lower it.
    /// Returns the mark the cache now holds.
    fn remember_retired(&self, cell: &str, mark: Option<u64>, at: u64) -> Option<u64> {
        let mut marks = self.retired_marks.lock().unwrap();
        let entry = marks.entry(cell.to_string()).or_insert((None, at));
        entry.0 = entry.0.max(mark);
        entry.1 = at;
        entry.0
    }

    /// The epoch-GC grace in milliseconds, or `None` when epoch GC is off.
    pub(crate) fn epoch_gc_grace_ms(&self) -> Option<u64> {
        self.epoch_gc_grace_ms
    }

    /// The streams this node holds, with the epoch it holds each at.
    pub(crate) fn resident_epochs(&self) -> Vec<(String, u64)> {
        self.cells.lock().unwrap().keys().cloned().collect()
    }

    /// Delete one stream's superseded epoch prefixes, as the owner of
    /// `epoch` (denoland/celld#240).
    ///
    /// The steps run in a fixed order, and the order is the fence:
    ///
    /// 1. Build the restore chain over every listed epoch, the owner's
    ///    included, with the restore code. Stop unless its newest span is
    ///    `epoch` and the chain's full restore plan resolves. The first
    ///    proves the owner's own opener is listed, so a successor that claims
    ///    the cell after step 2 lists it too and restores from a base at or
    ///    above this one. A successor that claimed before step 2 fails it.
    /// 2. `confirm_owner`: read the ownership record and require this node
    ///    at `epoch`. Reading before step 1 would let a fenced owner delete
    ///    the base of a successor that restored while its epoch was still
    ///    empty.
    /// 3. Record the stream's retired mark, so coverage treats the rows of
    ///    every epoch below the base as covered before any prefix is gone.
    /// 4. Delete the planned prefixes. A crash here leaves the mark, and the
    ///    next owner deletes the rest.
    ///
    /// A conditional write on the ownership record would add nothing: the
    /// cell can move between any check and the delete. What makes the late
    /// delete safe is that an epoch below the base never re-enters a chain.
    /// The argument assumes a list-after-write consistent store.
    pub async fn gc_superseded_epochs<F, Fut>(
        &self,
        cell: &str,
        epoch: u64,
        grace_ms: u64,
        confirm_owner: F,
    ) -> anyhow::Result<Option<EpochGcOutcome>>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = anyhow::Result<bool>>,
    {
        // The cheap facts first, so a cell that cannot decide anything costs
        // no listing. A cell that is not resident here has no owner here to
        // run this pass. A paged cell reads pages from its activation chain's
        // objects until its fill completes, and a paged cell whose fill is
        // off never completes one, so only a positive completion unpins it.
        let pinned_reads = match self.cells.lock().unwrap().get(&(cell.to_string(), epoch)) {
            None => return Ok(None),
            Some(handle) => {
                handle.paged_vfs.is_some()
                    && handle
                        .hydration
                        .as_ref()
                        .is_none_or(|fill| !fill.complete.load(Ordering::SeqCst))
            }
        };
        // The plan below refuses pinned reads too; returning here skips the
        // listings it would not use.
        if pinned_reads {
            return Ok(None);
        }
        let Some(scan) = scan_epochs(
            self.store.as_ref(),
            &self.prefix,
            cell,
            EPOCH_GC_EPOCHS_PER_PASS,
            |e| self.client_for(cell, e),
        )
        .await?
        else {
            return Ok(None);
        };
        if scan.newest != epoch {
            if scan.newest < epoch {
                self.queue_epoch_opener(cell, epoch);
            }
            return Ok(None);
        }
        let below: Vec<_> = scan.below.iter().map(|b| b.listed).collect();
        // The grace compares the store's upload times with this node's
        // clock, so skew shortens or lengthens it. It is a margin for a slow
        // unowned reader, not part of the safety argument.
        let now_ms = asyncrt::wall_ms().max(0) as u64;
        let Some(plan) = celld_logic::epoch_gc::plan(
            epoch,
            &scan.chain,
            &below,
            self.retired_mark(cell).await,
            pinned_reads,
            now_ms,
            grace_ms,
        ) else {
            return Ok(None);
        };
        if !confirm_owner().await? {
            return Ok(None);
        }
        if plan.record {
            self.record_retired(cell, plan.retired_below).await?;
        }
        for victim in &plan.delete {
            self.client_for(cell, *victim)
                .delete_all()
                .await
                .map_err(|error| anyhow!("delete {cell} e{victim}: {error}"))?;
            self.note_covered(cell, *victim, u64::MAX);
        }
        // Only the previous epoch may stay below the base once the grace has
        // passed; the next activation's pass deletes it.
        let settled = !scan.more_below
            && below
                .iter()
                .all(|l| plan.delete.contains(&l.epoch) || l.epoch + 1 == epoch);
        Ok(Some(EpochGcOutcome {
            retired_below: plan.retired_below,
            deleted: plan.delete,
            settled,
        }))
    }

    /// Folds a cloned activation's durable rows into its first L1 object, the
    /// opener that epoch GC waits for. Under bundled tiering a write reaches
    /// only the node's bundles, and the first per-cell object is otherwise
    /// the threshold fold (`CELLD_LTX_COMPACTION_MIN_TXIDS`) or a handoff
    /// snapshot. A cell with fewer writes per activation then never lists
    /// its opener and never deletes a superseded epoch; the 2026-09-30 GCE
    /// run measured that. The fold opens at TXID 1, so it makes the owner's
    /// epoch the chain's base, and the next pass decides. A paged epoch
    /// already lists its marker, and a cell without a durable row has
    /// nothing to fold. A handoff snapshot would upload the whole database
    /// where the fold uploads only the rows the activation wrote, and it
    /// would pause compaction and wait out a running round while it reads
    /// the image.
    ///
    /// A failed forced fold retries only on the next epoch GC pass that runs
    /// after the failure backoff; a pass inside the backoff enqueues nothing.
    /// The failure requeue in `compact_cell` goes through the threshold
    /// check, which a cell below the threshold does not pass, and that is
    /// intended; a threshold round after the backoff can also produce the
    /// opener. An unconditional requeue would turn one GC pass into a
    /// standing retry loop on the failure backoff, whether or not a pass
    /// still wants the opener, so a store fault would put every such cell
    /// into that loop.
    fn queue_epoch_opener(&self, cell: &str, epoch: u64) {
        let Some(handle) = self
            .cells
            .lock()
            .unwrap()
            .get(&(cell.to_string(), epoch))
            .cloned()
        else {
            return;
        };
        let Some(compaction) = &handle.compaction else {
            return;
        };
        if compaction.base_txid == 1
            && compaction.compacted_txid.load(Ordering::SeqCst) == 0
            && handle.durable_txid.load(Ordering::SeqCst) > 0
        {
            enqueue_compaction(&handle, "epoch_opener");
        }
    }

    /// Highest contiguous TXID prefix proved by the live per-cell L0/L1 objects.
    ///
    /// Unlike `covered_txid`, this is an activation safety proof. A maximum
    /// past a hole cannot seed a replica because doing so would preserve the
    /// hole forever. Store errors also fail the proof instead of becoming zero.
    /// A zero would claim that the local directory can replay the complete
    /// epoch even though the store did not provide the required durable bound.
    async fn contiguous_covered_txid(&self, cell: &str, epoch: u64) -> anyhow::Result<u64> {
        let client = self.client_for(cell, epoch);
        let mut files = Vec::new();
        for level in 0..=1 {
            files.extend(
                client
                    .ltx_files(level, TXID(0))
                    .await
                    .map_err(|error| anyhow!("list {cell} e{epoch} L{level}: {error}"))?,
            );
        }
        files.sort_unstable_by_key(|file| (file.min_txid.0, file.max_txid.0));

        let mut covered = 0_u64;
        for file in files {
            if file.min_txid.0 > covered.saturating_add(1) {
                break;
            }
            covered = covered.max(file.max_txid.0);
        }
        Ok(covered)
    }

    /// Recovery's primitive: PUT one gathered L0 segment to the exact key
    /// the dead leader's own upload would have used. Idempotent by key.
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
        self.note_covered(cell, epoch, max_txid);
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
    /// Every epoch under `cells/<cell>/ltx/` that holds any LTX, ascending. A
    /// restore composes them into one chain: a paged epoch continues the
    /// chain it paged in instead of opening with a snapshot, so the objects a
    /// restore needs can span epochs.
    async fn nonempty_epochs(&self, cell: &str) -> anyhow::Result<Vec<u64>> {
        use celld_ltx::object_store::path::Path as ObjPath;
        let base = ObjPath::from(format!("{}cells/{cell}/ltx", self.prefix));
        let listing = self.store.list_with_delimiter(Some(&base)).await?;
        let mut epochs: Vec<u64> = listing
            .common_prefixes
            .iter()
            .filter_map(|prefix| {
                prefix
                    .filename()
                    .and_then(|name| name.strip_prefix('e'))
                    .and_then(|value| value.parse::<u64>().ok())
            })
            .collect();
        epochs.sort_unstable();
        Ok(epochs)
    }

    /// The restore view over a cell's epochs below `epoch`: the chain from the
    /// newest non-empty epoch down to the one that opens with a snapshot.
    async fn epoch_chain(
        &self,
        cell: &str,
        epoch: u64,
    ) -> anyhow::Result<Option<EpochChain<ObjectStoreClient>>> {
        let epochs = self.nonempty_epochs(cell).await?;
        let Some(&newest) = epochs.last() else {
            return Ok(None);
        };
        anyhow::ensure!(
            newest < epoch,
            "refusing to restore {cell} from used epoch {newest} into writer epoch {epoch}"
        );
        let clients = epochs
            .into_iter()
            .map(|e| (e, self.client_for(cell, e)))
            .collect();
        Ok(Some(EpochChain::build(clients).await?))
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
        self.activate_with(options, true).await
    }

    /// `activate`, where `allow_paged` false always clones: a facet's
    /// database is opened by a plain connection that has no fault-in VFS.
    pub(crate) async fn activate_with(
        &self,
        options: ActivationOptions<'_>,
        allow_paged: bool,
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

        // Sample before a restore can replace the path. A non-certified live
        // database can contain rows which a crash or self-fence staged but did
        // not upload, so its local position needs a remote bound.
        let dst_existed = is_file(&dst);
        let mut restored = resume_local;
        let mut remote_restore = None;
        let mut paged_vfs_name: Option<String> = None;
        let mut registration = PagedRegistration(None);
        // A paged activation continues its chain from the cut: (last txid of
        // the chain, page count at the cut).
        let mut continuation: Option<(TXID, u32)> = None;
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
            if self.dirty_tails.lock().unwrap().contains_key(cell) {
                let sink = registered_durability(&self.registration)
                    .map(|targets| targets.manager.clone())
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
            let chain = self.epoch_chain(cell, epoch).await?;
            let source_lookup_us = asyncrt::mono_ms()
                .saturating_sub(source_lookup_started_mono_ms)
                .saturating_mul(1_000);
            if let Some(chain) = chain {
                let spans = chain.spans();
                let from = spans.last().map_or(0, |(e, _)| *e);
                let _ = self.ltx_host.remove_file(&dst);
                // Page the cell in on demand instead of downloading its
                // chain when the chain is large enough to be worth it: build
                // the page map from the plan, then open the db through a
                // fault-in VFS over an empty local file. The first request
                // reads only the pages it touches. The epoch then continues
                // the chain it paged in (`seed_continuation`) rather than
                // opening with a whole-database snapshot. A smaller chain is
                // cloned: the plan is over the chain's cached listings, so
                // deciding costs no request.
                let mut paged_plan = None;
                if allow_paged
                    && self.paged_restore.load(Ordering::Relaxed)
                    && self.paged_fleet.load(Ordering::Relaxed)
                {
                    let plan_started = asyncrt::mono_ms();
                    let plan = replica::calc_restore_plan(&chain, TXID(0))
                        .await
                        .map_err(|error| anyhow!("paged plan {cell} e{from}: {error}"))?;
                    let plan_us = asyncrt::mono_ms()
                        .saturating_sub(plan_started)
                        .saturating_mul(1_000);
                    let bytes: u64 = plan.iter().map(|info| info.size.max(0) as u64).sum();
                    let min = self.paged_min_bytes.load(Ordering::Relaxed);
                    if bytes >= min {
                        paged_plan = Some((plan, plan_us));
                    } else {
                        info!(
                            cell,
                            from,
                            to = epoch,
                            bytes,
                            min,
                            "cloned below the paged threshold"
                        );
                    }
                }
                if let Some((plan, plan_us)) = paged_plan {
                    let map_started = asyncrt::mono_ms();
                    let map = celld_ltx::paged::build_page_map(&chain, &plan)
                        .await
                        .map_err(|error| anyhow!("paged map {cell} e{from}: {error}"))?;
                    let map_us = asyncrt::mono_ms()
                        .saturating_sub(map_started)
                        .saturating_mul(1_000);
                    let mut readers: Vec<(TXID, Box<dyn celld_ltx::paged::RangeReader>)> =
                        Vec::with_capacity(spans.len());
                    for (span_epoch, lo) in &spans {
                        let reader = self
                            .client_for(cell, *span_epoch)
                            .blocking_range_reader()
                            .await
                            .map_err(|error| {
                                anyhow!("paged reader {cell} e{span_epoch}: {error}")
                            })?;
                        readers.push((*lo, reader));
                    }
                    // The epoch continues at the txid after the cut. Its
                    // marker, a zero-page object at that txid, is uploaded
                    // before the cell serves: an empty epoch could not pass
                    // the eviction barrier, and a fenced owner's late
                    // snapshot in a lower epoch would outrank its chain
                    // (CelldPersistencePaged.tla, `BreakNoMarker`).
                    continuation = Some((TXID(chain.max_txid().0 + 1), map.commit));
                    let reader = celld_ltx::paged::EpochChainReader::new(readers);
                    let source = celld_ltx::paged::PageSource::new(map, Box::new(reader));
                    let name = celld_ltx::paged_vfs::next_registration_name();
                    celld_ltx::paged_vfs::register_paged_vfs(
                        &name,
                        self.vfs_name.as_deref(),
                        &dst,
                        std::sync::Arc::new(source),
                    )
                    .map_err(|error| anyhow!("register paged vfs {cell}: {error}"))?;
                    registration = PagedRegistration(Some(name.clone()));
                    remote_restore = Some(RemoteRestoreTiming {
                        started_mono_ms: remote_started_mono_ms,
                        from,
                        source_lookup_us,
                        plan_us,
                        map_us,
                        download_us: 0,
                        apply_us: 0,
                        objects: plan.len(),
                        bytes: plan.iter().map(|info| info.size.max(0) as u64).sum(),
                        levels: by_level(&plan),
                        paged: true,
                    });
                    info!(
                        cell,
                        from,
                        to = epoch,
                        chain = ?spans.iter().map(|(e, _)| *e).collect::<Vec<_>>(),
                        cut = chain.max_txid().0,
                        vfs = %name,
                        "paged remote replica"
                    );
                    paged_vfs_name = Some(name);
                    restored = true;
                } else {
                    let stats = replica::restore_timed_with_host_and_download_slots(
                        &chain,
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
                        map_us: 0,
                        download_us: stats.download_us,
                        apply_us: stats.apply_us,
                        objects: stats.plan.objects,
                        bytes: stats.plan.bytes,
                        paged: false,
                        levels,
                    });
                    info!(cell, from, to = epoch, "restored remote replica");
                    restored = true;
                }
            }
        }

        let remote_seed = if !restored && dst_existed {
            Some(self.contiguous_covered_txid(cell, epoch).await?)
        } else {
            None
        };

        // Open the managed Db (creates a fresh WAL db when nothing was restored)
        // and pair it with this epoch's client. Registration is immediate: the
        // cell can be proved durable on its very first write. The just-opened
        // db's position is the replica's candidate seed -- 0 for a fresh cell
        // and the restored max for a proved image. An uncertified reused image
        // is clamped to its remote contiguous prefix above. The first sync can
        // therefore skip the `calc_pos` listing that otherwise storms a
        // rate-limiting store without skipping a staged local row. On the rare
        // decode error, proved images fall back to that listing and uncertified
        // images fail closed because their local bound is unknown.
        let db_open_started_mono_ms = asyncrt::mono_ms();
        let dst_ = dst.clone();
        let ltx_host = self.ltx_host.clone();
        // The paged VFS (this activation) takes precedence over the fault VFS.
        let vfs_name = paged_vfs_name.clone().or_else(|| self.vfs_name.clone());
        let truncate_pages = self.truncate_pages_for_cell(cell);
        // Capture must finish opening before the application's SQLite connection
        // or schema setup runs. An earlier write can hide a torn WAL header and
        // let capture resume from a stale LTX cursor after a crash.
        let (db, mut seed, marker) = asyncrt::blocking(move || {
            let open_db = |ltx_host: LtxHost| match vfs_name.as_deref() {
                Some(vfs_name) => Db::open_with_host_and_vfs(&dst_, ltx_host, vfs_name),
                None => Db::open_with_host(&dst_, ltx_host),
            };
            #[cfg(celld_internal_tests)]
            let mut db = crate::fault::with_connection_role("celld_ltx_db", || open_db(ltx_host))?;
            #[cfg(not(celld_internal_tests))]
            let mut db = open_db(ltx_host)?;
            if let Some(pages) = truncate_pages {
                db.truncate_page_n = pages;
            }
            let marker = match continuation {
                Some((txid, commit)) => Some((txid, db.seed_continuation(txid, commit)?)),
                None => None,
            };
            let seed = db.pos().ok();
            anyhow::Ok((db, seed, marker))
        })
        .await?
        .map_err(|error| anyhow!("open managed db {}: {error}", dst.display()))?;
        let client = SharedObjectStoreClient(Arc::new(self.client_for(cell, epoch)));
        if let Some((txid, bytes)) = marker {
            client
                .write_ltx_file(0, txid, txid, &bytes)
                .await
                .map_err(|error| anyhow!("upload the epoch marker for {cell} e{epoch}: {error}"))?;
            self.note_covered(cell, epoch, txid.0);
        }
        if let Some(covered) = remote_seed {
            let local = seed.ok_or_else(|| {
                anyhow!("cannot prove local replica position for {cell} epoch {epoch}")
            })?;
            if local.txid.0 > covered {
                seed = Some(Pos::new(TXID(covered), 0));
            }
        }
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
                map_us = timing.map_us,
                download_us = timing.download_us,
                apply_us = timing.apply_us,
                paged = timing.paged,
                db_open_us,
                "computed restore plan"
            );
        }
        let mut replica = Replica::new(db, client.clone());
        if let Some(pos) = seed {
            replica.seed_pos(pos);
        }
        let hydration = paged_vfs_name
            .as_ref()
            .filter(|_| self.hydrate_bytes_per_s > 0)
            .map(|_| {
                Arc::new(CellHydration {
                    cancelled: AtomicBool::new(false),
                    complete: AtomicBool::new(false),
                })
            });
        let handle = Arc::new(Cell {
            snapshot_declined: AtomicBool::new(false),
            paged_vfs: paged_vfs_name.clone(),
            hydration: hydration.clone(),
            replica: Mutex::new(Some(replica)),
            client: client.clone(),
            req_seq: AtomicU64::new(0),
            synced_seq: AtomicU64::new(0),
            shipped_seq: AtomicU64::new(0),
            submitted_seq: AtomicU64::new(0),
            // Frames at or below the seed came from the bucket (or a proven
            // snapshot); the followers only ever need what follows.
            shipped_txid: Arc::new(AtomicU64::new(seed.map_or(0, |pos| pos.txid.0))),
            submitted_txid: AtomicU64::new(seed.map_or(0, |pos| pos.txid.0)),
            last_sync_ms: AtomicU64::new(asyncrt::wall_ms().max(0) as u64),
            capture_seq: AtomicU64::new(0),
            capture_started_ms: AtomicU64::new(0),
            node_proof_ms: self.node_proof_ms.clone(),
            durable_txid: Arc::new(AtomicU64::new(seed.map_or(0, |pos| pos.txid.0))),
            // The restore read the per-cell prefix, so the seed IS the
            // per-cell coverage at open.
            percell_txid: AtomicU64::new(seed.map_or(0, |pos| pos.txid.0)),
            syncing: AtomicBool::new(false),
            ready: Notify::new(),
            #[cfg(all(test, celld_internal_tests))]
            sync_credit_pause: Mutex::new(None),
            #[cfg(all(test, celld_internal_tests))]
            observer_cell: cell.to_string(),
            #[cfg(all(test, celld_internal_tests))]
            observer_epoch: epoch,
            #[cfg(all(test, celld_internal_tests))]
            durability_ticket_receipts: Mutex::new(Vec::new()),
            #[cfg(all(test, celld_internal_tests))]
            upload_round_receipts: Mutex::new(Vec::new()),
            #[cfg(all(test, celld_internal_tests))]
            fleet_credit_receipts: Mutex::new(Vec::new()),
            #[cfg(all(test, celld_internal_tests))]
            fleet_capture_receipts: Mutex::new(Vec::new()),
            compaction: self.compaction_queue.as_ref().map(|queue| {
                let fetcher = Arc::new(SinkFetcher {
                    registration: self.registration.clone(),
                    cell: cell.to_string(),
                    epoch,
                    rows: tokio::sync::Mutex::new(None),
                });
                CellCompaction {
                    cell: cell.to_string(),
                    epoch,
                    // The overlay lets compaction read bundle-resident frames
                    // beside the per-cell objects; its output stays pure
                    // per-cell L1s, which is the continuous drain.
                    client: celld_ltx::BundleOverlayClient::new(
                        client.clone(),
                        Some(fetcher.clone()),
                    ),
                    fetcher,
                    local_path: Db::meta_path_for_path(&dst),
                    host: self.ltx_host.clone(),
                    queue: queue.clone(),
                    base_txid: continuation.map_or(1, |(txid, _)| txid.0),
                    min_txids: self.compaction_min_txids,
                    min_bytes: self.compaction_min_bytes,
                    pending_bytes: AtomicU64::new(0),
                    compacted_txid: AtomicU64::new(0),
                    retry_after_ms: AtomicU64::new(0),
                    failures: AtomicU64::new(0),
                    queued: AtomicBool::new(false),
                    cancelled: AtomicBool::new(false),
                    handoff_paused: AtomicBool::new(false),
                    cancel: Notify::new(),
                    #[cfg(all(test, celld_internal_tests))]
                    finish_pause: Mutex::new(None),
                    run: tokio::sync::Mutex::new(()),
                }
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
                registration.keep();
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
        if let (Some(name), Some(hydration)) = (&paged_vfs_name, hydration) {
            self.spawn_hydration(cell, epoch, name.clone(), dst.clone(), hydration);
        }

        Ok(ActivationResult {
            path: dst,
            restored,
            vfs: paged_vfs_name,
        })
    }

    /// The paged VFS name of a resident activation, when its restore paged.
    /// The runtime opens the actor's connection through it; a plain open of a
    /// paged cell's sparse database file reads holes as data.
    /// Fills a paged cell's file in the background, a run per step at
    /// `CELLD_LTX_HYDRATE_MBPS`, one cell at a time per node, until the cut
    /// is complete or the cell closes. Steps fault through the VFS's own
    /// read path, so hydration is foreground faulting at a pace.
    fn spawn_hydration(
        &self,
        cell: &str,
        epoch: u64,
        name: String,
        path: PathBuf,
        hydration: Arc<CellHydration>,
    ) {
        let cell = cell.to_string();
        let permits = self.hydrations.clone();
        let step_ms =
            (u64::from(HYDRATE_STEP_PAGES) * 4096 * 1_000 / self.hydrate_bytes_per_s).max(1);
        self.tasks.spawn_owned("ltx-hydration", async move {
            let Ok(_permit) = permits.acquire().await else {
                return;
            };
            let started_mono_ms = asyncrt::mono_ms();
            let mut hydrator = match asyncrt::blocking({
                let name = name.clone();
                move || celld_ltx::paged_vfs::Hydrator::open(&name, &path)
            })
            .await
            {
                Ok(Ok(hydrator)) => hydrator,
                Ok(Err(error)) => {
                    warn!(cell, epoch, %error, "paged hydration could not open the cell");
                    return;
                }
                Err(_) => return,
            };
            let mut steps = 0u64;
            loop {
                if hydration.cancelled.load(Ordering::SeqCst) {
                    return;
                }
                let step = asyncrt::blocking(move || {
                    let progress = hydrator.step(HYDRATE_STEP_PAGES);
                    (hydrator, progress)
                })
                .await;
                let progress = match step {
                    Ok((hydrator_, Ok(progress))) => {
                        hydrator = hydrator_;
                        progress
                    }
                    Ok((_, Err(error))) => {
                        warn!(cell, epoch, %error, "paged hydration stopped");
                        return;
                    }
                    Err(_) => return,
                };
                steps += 1;
                if progress.complete() {
                    hydration.complete.store(true, Ordering::SeqCst);
                    info!(
                        event = "paged_hydrated",
                        cell,
                        epoch,
                        pages = progress.total,
                        faults = progress.faults,
                        steps,
                        elapsed_ms = asyncrt::mono_ms().saturating_sub(started_mono_ms),
                        "paged cell holds its whole cut"
                    );
                    return;
                }
                asyncrt::sleep(Duration::from_millis(step_ms)).await;
            }
        });
    }

    /// How much of the cut a paged activation's file holds, for a world
    /// that waits on the background fill.
    #[cfg(all(test, celld_internal_tests))]
    pub fn hydration_for_test(
        &self,
        cell: &str,
        epoch: u64,
    ) -> Option<celld_ltx::paged_vfs::Hydration> {
        celld_ltx::paged_vfs::hydration(&self.paged_vfs_name(cell, epoch)?)
    }

    /// The test chain-size threshold for paging, so a world can
    /// page a small cut or clone one.
    #[cfg(all(test, celld_internal_tests))]
    pub fn set_paged_min_bytes_for_test(&self, bytes: u64) {
        self.paged_min_bytes.store(bytes, Ordering::Relaxed);
    }

    /// The test switch for paged restore, so a world runs its
    /// schedules over the fault path without the process environment. It
    /// pages every cut; `set_paged_min_bytes_for_test` restores a threshold.
    #[cfg(all(test, celld_internal_tests))]
    pub fn set_paged_restore_for_test(&self, on: bool) {
        self.paged_restore.store(on, Ordering::Relaxed);
        self.paged_fleet.store(on, Ordering::Relaxed);
        self.paged_min_bytes.store(0, Ordering::Relaxed);
    }

    /// The fleet's answer to "can every live node read a paged epoch". The
    /// fleet sampler sets it from the leases; returns the prior value so the
    /// caller logs a transition once.
    pub fn set_paged_fleet(&self, ready: bool) -> bool {
        self.paged_fleet.swap(ready, Ordering::Relaxed)
    }

    /// Whether this node would page a large takeover now.
    pub fn paged_fleet(&self) -> bool {
        self.paged_fleet.load(Ordering::Relaxed)
    }

    /// The VFS the actor's connection must open through, for a resident
    /// activation: `Some` when it paged, `None` when its file is whole. An
    /// activation that is no longer resident is an error, not `None`: a
    /// plain open of an absent or sparse file would create or read the
    /// wrong database.
    pub fn activation_vfs(&self, cell: &str, epoch: u64) -> anyhow::Result<Option<String>> {
        let cells = self.cells.lock().unwrap();
        let handle = cells
            .get(&(cell.to_string(), epoch))
            .ok_or_else(|| anyhow!("{cell} epoch {epoch} is not resident"))?;
        Ok(handle.paged_vfs.clone())
    }

    pub fn paged_vfs_name(&self, cell: &str, epoch: u64) -> Option<String> {
        self.cells
            .lock()
            .unwrap()
            .get(&(cell.to_string(), epoch))
            .and_then(|handle| handle.paged_vfs.clone())
    }

    /// Run the managed database's real checkpoint at a controlled test cut.
    /// A second SQLite connection keeps the managed reader's lock held and
    /// cannot exercise its truncate path. The test driver selects timing;
    /// the shipping Db still owns capture, lock release, and checkpoint order.
    /// Observe the result on the native lane before waking its async caller.
    /// A later writer can repair a failed WAL header before that caller runs,
    /// so delayed classification against the current image loses the cause.
    #[cfg(all(test, celld_internal_tests))]
    pub(crate) async fn checkpoint_for_world<T, F>(
        &self,
        cell: &str,
        epoch: u64,
        mode: celld_ltx::CheckpointMode,
        observe: F,
    ) -> anyhow::Result<T>
    where
        T: Send + 'static,
        F: FnOnce(anyhow::Result<()>) -> anyhow::Result<T> + Send + 'static,
    {
        let handle = self
            .cells
            .lock()
            .unwrap()
            .get(&(cell.to_owned(), epoch))
            .cloned()
            .ok_or_else(|| anyhow!("checkpoint requires a resident {cell} epoch {epoch}"))?;
        asyncrt::blocking(move || {
            let mut replica = handle.replica.lock().unwrap();
            let result = managed_db_mut(&mut replica)
                .ok_or_else(|| anyhow!("checkpoint lost its managed database"))
                .and_then(|db| db.checkpoint(mode).map_err(anyhow::Error::new));
            observe(result)
        })
        .await
        .map_err(|error| anyhow!("checkpoint task failed: {error}"))?
    }

    // Reopening a frozen image must use the same execution-domain host as
    // activation. A direct test host would bypass clock and filesystem adapters.
    #[cfg(all(test, celld_internal_tests))]
    pub(crate) fn host_for_world(&self) -> LtxHost {
        self.ltx_host.clone()
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
        #[cfg(all(test, celld_internal_tests))]
        handle.record_durability_ticket_for_world(position, ticket);
        self.dirty.notify_one();
        self.dirty_ship.notify_one();
        let source = self
            .wait_for_durability_ticket(&handle, cell, epoch, ticket)
            .await?;
        Ok((position, source))
    }

    /// Prove that every write before handoff nomination reached either the
    /// bucket or the live durability ensemble. The fleet proof is sufficient
    /// to close the runtime because ownership still names this donor. The
    /// eviction barrier publishes the closed database before ownership can
    /// move, so a process loss between these phases still enters ordinary
    /// dead-node recovery.
    pub async fn handoff_wait(
        &self,
        cell: &str,
        epoch: u64,
    ) -> anyhow::Result<celld_logic::ProofSource> {
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
        self.wait_for_durability_ticket(&handle, cell, epoch, ticket)
            .await
    }

    /// The eviction gate: prove the cell is safe to give up, while the node
    /// can still change its mind.
    ///
    /// This runs in `Phase::EnsuringDurability`. The cell still serves there,
    /// and a request that arrives cancels the eviction and puts the cell back
    /// into service at its own epoch. `stop_cell` then takes close exclusion,
    /// drops the runtime, and only afterwards calls `evict`, which publishes
    /// the handoff snapshot and asks the bucket to confirm it. A request that
    /// arrives during that second half finds `Phase::Cleaning` and waits for a
    /// whole reactivation at a new epoch, so every second the eviction spends
    /// after the close is a second in which an idle sweep can still evict a
    /// cell that traffic made live again. A revocable eviction therefore does
    /// the remote work it can do here, where the answer can still be acted on.
    ///
    /// `handoff_wait` reports which mechanism proved the cell durable, and
    /// that names the successor's restore source. A bucket proof means the
    /// per-cell tiering is the acknowledgement path, so the objects under
    /// `cells/<cell>/ltx/e<epoch>` are already there. Ask the bucket whether
    /// they survived: an upload this process completed does not prove that
    /// they did. A fleet proof means the paced shipper is active, and
    /// `bundle_loop` then leaves the per-cell prefix untouched by design, so
    /// that prefix is legitimately empty and an unconditional question here
    /// would refuse every fleet-posture eviction.
    ///
    /// The fleet proof therefore keeps the window this closes for the bucket
    /// proof. Moving the handoff snapshot forward would not close it: the
    /// snapshot is a full image at one txid, `evict` publishes it as the
    /// successor's authoritative restore artifact, and a cell that keeps
    /// serving can commit past it. A cancelled eviction would then leave an
    /// image in the bucket that a later restore reads as complete. The cost
    /// of the remaining window is revocability and not durability, because
    /// `evict` still refuses to give up state the bucket cannot restore.
    /// Closing it needs the core to accept a request during `Phase::Cleaning`,
    /// which is an open decision (#818). Do not read the scoping as a claim
    /// that the fleet path needs no gate.
    ///
    /// A drain passes `revocable: false`. It has nowhere to put a cell back,
    /// so the answer could change nothing, and a drain that spent one bucket
    /// LIST per resident cell would pay for it out of its shutdown budget.
    pub async fn handoff_gate(
        &self,
        cell: &str,
        epoch: u64,
        revocable: bool,
    ) -> anyhow::Result<()> {
        let proof = self.handoff_wait(cell, epoch).await?;
        if revocable
            && matches!(proof, celld_logic::ProofSource::Bucket)
            && !self.epoch_replicated(cell, epoch).await
        {
            return Err(anyhow!(
                "no replica objects for {cell} epoch {epoch}; refusing to \
                 evict state the bucket cannot restore"
            ));
        }
        Ok(())
    }

    async fn wait_for_durability_ticket(
        &self,
        handle: &CellHandle,
        cell: &str,
        epoch: u64,
        ticket: u64,
    ) -> anyhow::Result<celld_logic::ProofSource> {
        let wait = ProofWait {
            started_ms: asyncrt::mono_ms(),
            ticket,
            budget_ms: self.durability_timeout_ms,
        };
        let started = wait.started_ms;
        loop {
            // Register the waiter before checking, so a sync that completes
            // between the check and the await is not missed. Either proof
            // releases the gate: the bucket upload, or every ensemble
            // member's fsync — whichever lands first.
            let ready = handle.ready.notified();
            // Prefer the fleet proof when both hold: it is the arbitrated
            // one, and it spares the caller an ownership read.
            let shipped = handle.shipped_seq.load(Ordering::SeqCst) >= ticket;
            if handle.synced_seq.load(Ordering::SeqCst) >= ticket || shipped {
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
                return Ok(source);
            }
            // The deadline moves: a proof landing anywhere on the node while
            // this write is queued, or this cell's capture beginning, each
            // push it out (`celld_logic::durability`). So a timer firing is
            // a cue to recompute, and only a deadline that is still in the
            // past fails the proof.
            let deadline = proof_deadline(
                &wait,
                &ProofProgress {
                    node_proof_ms: handle.node_proof_ms.load(Ordering::SeqCst),
                    capture_seq: handle.capture_seq.load(Ordering::SeqCst),
                    capture_started_ms: handle.capture_started_ms.load(Ordering::SeqCst),
                },
            );
            if asyncrt::mono_ms() >= deadline {
                anyhow::bail!("ltx durability timed out for {cell} epoch {epoch}");
            }
            let _ = asyncrt::timeout_at(deadline, ready).await;
        }
    }

    /// A direct, synchronous durability pass for the rare eviction
    /// gates (not the hot write path). Also advances the cell's durable position
    /// so any output-gate waiters ride it.
    pub async fn sync_wait(&self, cell: &str, epoch: u64, timeout: Duration) -> SyncWait {
        let Some(handle) = self
            .cells
            .lock()
            .unwrap()
            .get(&(cell.to_string(), epoch))
            .cloned()
        else {
            return SyncWait::Unsupported;
        };
        match asyncrt::timeout(timeout, sync_cell(handle.clone())).await {
            Ok(Some(true)) => SyncWait::Durable,
            Ok(Some(false)) | Err(_) => SyncWait::Failed,
            Ok(None) => SyncWait::Unsupported,
        }
    }

    /// Return the configured durability deadline to a deterministic
    /// world, so a bounded-liveness assertion uses the production value.
    #[cfg(all(test, celld_internal_tests))]
    pub(crate) fn durability_timeout_ms_for_world(&self) -> u64 {
        self.durability_timeout_ms
    }

    /// Lower the handoff snapshot budget, so a test world can hand off a
    /// small database the way production hands off a whale.
    #[cfg(all(test, celld_internal_tests))]
    pub(crate) fn set_handoff_snapshot_budget_for_world(&self, bytes: u64) {
        self.snapshot_budget_bytes.store(bytes, Ordering::Relaxed);
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
            let handle = match self.remove_active_and_record_tail(cell, epoch) {
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
            self.note_undrained_tail(cell, epoch, &handle);
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

    /// Take the cell, or give it back.
    ///
    /// `abandon` carries the core's answer to "a request arrived for this
    /// cell". Reading it is the whole revocable half of an eviction stop, and
    /// where it can be read is fixed by what is already visible to a
    /// successor:
    ///
    /// - Before `prepare_handoff_snapshot`, nothing remote has happened and
    ///   the isolate turn this pass waited for can be the slow part on a
    ///   loaded node. Abandoning here costs nothing.
    /// - Before `publish_handoff_snapshot`, the snapshot exists only in this
    ///   process. Abandoning here throws away one local capture.
    /// - After that PUT there is no way back. The snapshot is a full image at
    ///   one txid, and `restore_plan` takes the highest snapshot at or below
    ///   its target and then extends it only with the per-cell files above it.
    ///   A resumed cell commits past that txid, and under a fleet proof those
    ///   rows go to node bundles and not to the per-cell prefix, so a restore
    ///   would read the image as a complete database that stops short of an
    ///   acknowledged write. The rows are recoverable while the node-log
    ///   session stays open, but that is a second mechanism and not a proof,
    ///   so this pass does not rely on it.
    ///
    /// The PUT and the visibility LIST therefore stay unrevocable in both
    /// postures. A request that arrives during those two round trips still
    /// waits for the cell to start again at a new epoch.
    pub async fn evict(
        &self,
        cell: &str,
        epoch: u64,
        preserve_local: bool,
        abandon: Option<&crate::replication::EvictionAbandon>,
    ) -> anyhow::Result<EvictionRestoreArtifact> {
        // The runtime is closed before this pass, so the snapshot is the
        // definitive durability barrier. The paced shipper normally stores a
        // hot tail in node bundles. Re-reading every local L0 row to duplicate
        // that tail under the cell prefix made shutdown cost grow with the
        // cell's lifetime. One full snapshot has constant object count and
        // gives the successor the same closed database.
        let barrier_started_mono_ms = asyncrt::mono_ms();
        let handle = self
            .cells
            .lock()
            .unwrap()
            .get(&(cell.to_string(), epoch))
            .cloned()
            .ok_or_else(|| anyhow!("ltx cell not resident: {cell} epoch {epoch}"))?;
        let abandoned = || {
            anyhow::Error::new(crate::replication::EvictionAbandoned {
                cell: cell.to_string(),
                epoch,
            })
        };
        if abandon.is_some_and(EvictionAbandon::requested) {
            return Err(abandoned());
        }
        let (snapshot, compaction_pause) = self.prepare_handoff_snapshot(&handle).await?;
        if abandon.is_some_and(EvictionAbandon::requested) {
            return Err(abandoned());
        }
        let deadline = barrier_started_mono_ms.saturating_add(self.durability_timeout_ms);
        let mut artifact = None;
        if let Some(snapshot) = snapshot {
            let published = asyncrt::timeout_at(
                deadline,
                self.publish_handoff_snapshot(cell, epoch, &snapshot),
            )
            .await;
            if matches!(published, Ok(Ok(()))) && self.epoch_replicated(cell, epoch).await {
                // The snapshot is a per-cell object through its txid, so it
                // covers every fleet-acked row of this closed database. No
                // later sync or bundle flush credits a removed handle, so
                // without this credit the ship ledger's batch for these rows
                // never counts as covered and followers keep it, and every
                // later batch, until the next epoch. Removal below also
                // records a false undrained tail without the per-cell credit.
                // A failed snapshot does not credit: the L0 fallback reads
                // `durable_txid` to choose which rows to upload.
                credit_percell_upload(&handle, snapshot.max_txid.0);
                artifact = Some(EvictionRestoreArtifact::Snapshot);
            } else {
                handle.snapshot_declined.store(true, Ordering::Relaxed);
                warn!(
                    event = "eviction_snapshot_fallback",
                    cell,
                    epoch,
                    "the authoritative snapshot failed, so the handoff requires its L0 chain"
                );
            }
        }
        let artifact = match artifact {
            Some(artifact) => artifact,
            None => {
                let remaining_ms = deadline.saturating_sub(asyncrt::mono_ms());
                if remaining_ms == 0
                    || !matches!(
                        self.sync_wait(cell, epoch, Duration::from_millis(remaining_ms))
                            .await,
                        SyncWait::Durable
                    )
                {
                    return Err(anyhow!("final durability failed for {cell} epoch {epoch}"));
                }
                if !self.epoch_replicated(cell, epoch).await {
                    return Err(anyhow!(
                        "no replica objects for {cell} epoch {epoch}; refusing to evict state the bucket cannot restore"
                    ));
                }
                EvictionRestoreArtifact::L0Chain
            }
        };
        info!(
            event = "eviction_durability_barrier",
            cell,
            epoch,
            artifact = ?artifact,
            elapsed_ms = asyncrt::mono_ms().saturating_sub(barrier_started_mono_ms),
            "final durability barrier passed"
        );

        // Keep the local Db until one authoritative restore artifact is
        // remotely visible. A failed snapshot and failed L0 fallback retain
        // the handle, so the actor cannot release ownership. Every such
        // return drops the compaction pause, so a cell that the actor
        // restarts in place folds again, and a retried attempt takes a new
        // pause. Only this handoff keeps compaction off for good.
        if let Some(pause) = compaction_pause {
            pause.handed_off();
        }
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

    /// Remove a stream and every stream nested below it, in the bucket and
    /// locally: `ctx.facets.delete()` of a facet and its descendants. The
    /// caller has removed their resident handles with [`Self::delete_local`].
    pub(crate) async fn delete_streams(&self, cell: &str) -> anyhow::Result<()> {
        use celld_ltx::object_store::path::Path as ObjPath;
        use futures_util::StreamExt as _;
        use futures_util::TryStreamExt as _;
        self.forget_deleted_tails(cell);
        let base = ObjPath::from(format!("{}cells/{cell}", self.prefix));
        let locations: Vec<_> = self
            .store
            .list(Some(&base))
            .map_ok(|meta| meta.location)
            .try_collect()
            .await?;
        let mut deleted = self
            .store
            .delete_stream(futures_util::stream::iter(locations.into_iter().map(Ok)).boxed());
        while let Some(result) = deleted.next().await {
            result?;
        }
        let local = self.watch.join(cell);
        if self.ltx_host.filesystem().metadata(&local).is_ok() {
            self.ltx_host.remove_dir_all(&local)?;
        }
        Ok(())
    }

    /// Drop the undrained tails of a deleted stream and every stream below it.
    /// A tail names rows that the next activation folds into the bucket, so a
    /// kept tail restores deleted rows into a recreated facet of the same
    /// name. Its live bucket watermark also stays in each shipped batch that
    /// carried those rows, and no fold will credit it now, so the deletion
    /// credits the ending's acknowledged bound.
    fn forget_deleted_tails(&self, cell: &str) {
        let below = format!("{cell}/");
        self.dirty_tails.lock().unwrap().retain(|stream, epochs| {
            let deleted = stream == cell || stream.starts_with(&below);
            if deleted {
                for tail in epochs.values() {
                    let acked = tail
                        .acked_txid
                        .max(tail.shipped_txid.load(Ordering::SeqCst));
                    tail.durable_txid.fetch_max(acked, Ordering::SeqCst);
                }
            }
            !deleted
        });
    }

    /// Whether a stream is resident: a stop that is retried after the stream
    /// stopped must not stop it again.
    pub(crate) fn is_resident(&self, cell: &str, epoch: u64) -> bool {
        self.cells
            .lock()
            .unwrap()
            .contains_key(&(cell.to_string(), epoch))
    }

    /// Discard a reset runtime without another durability attempt.
    ///
    /// The proof that triggered Reset already failed. Retrying it here can keep
    /// the unproved database resident and contradicts Reset's keep-nothing
    /// contract, so this path removes the handle and every live local file.
    /// Its fleet-acked rows are still acknowledged writes, so it keeps them
    /// uncredited behind an undrained tail until a successor fold uploads them.
    pub(crate) fn discard(&self, cell: &str, epoch: u64) {
        self.remove_local(cell, epoch, false);
    }

    /// Remove the handle of a stream that `ctx.facets.delete()` destroys.
    ///
    /// No upload or successor fold covers a deleted stream's rows, but each
    /// shipped batch that carries them still names this handle. Without a
    /// credit, the ship ledger never releases that batch, and followers keep it
    /// and every later batch until the next epoch (denoland/celld#246). The
    /// position staged at the close bounds every row a capture can ship from
    /// this handle, so crediting it releases every such batch. No undrained
    /// tail is recorded, because a fold would restore the deleted rows into a
    /// recreated facet. [`Self::discard`] must not credit the same way: a reset
    /// cell's acknowledged rows still need that fold.
    pub(crate) fn delete_local(&self, cell: &str, epoch: u64) {
        let removed = self
            .cells
            .lock()
            .unwrap()
            .remove(&(cell.to_string(), epoch));
        let Some(handle) = removed.clone() else {
            return;
        };
        match self.close_removed(cell, epoch, removed, false) {
            Some(staged) => {
                handle.durable_txid.fetch_max(staged, Ordering::SeqCst);
            }
            // Crediting a guess could release a batch above it. Keeping the
            // batch costs follower disk until the next epoch, never a row.
            None => warn!(
                cell,
                epoch, "deleted stream has no staged position; its shipped batches stay retained"
            ),
        }
    }

    fn remove_local(&self, cell: &str, epoch: u64, preserve_local: bool) {
        let removed = self.remove_active_and_record_tail(cell, epoch);
        self.close_removed(cell, epoch, removed, preserve_local);
    }

    /// Close a handle that has left the active map, and return the position
    /// staged at the close.
    fn close_removed(
        &self,
        cell: &str,
        epoch: u64,
        removed: Option<CellHandle>,
        preserve_local: bool,
    ) -> Option<u64> {
        if let Some(handle) = &removed {
            self.note_covered(cell, epoch, percell_coverage(handle));
        }
        // A paged activation's file is a sparse cache of the cut, never a
        // certified reactivation baseline, and its VFS registration ends with
        // the activation. The io methods hold their own Arcs, so open files
        // outliving the unregistration stay safe.
        let paged_vfs = removed.as_ref().and_then(|handle| handle.paged_vfs.clone());
        let preserve_local = preserve_local && paged_vfs.is_none();
        if let Some(hydration) = removed
            .as_ref()
            .and_then(|handle| handle.hydration.as_ref())
        {
            hydration.cancelled.store(true, Ordering::SeqCst);
        }
        let (staged, close_result) =
            removed.map_or((None, Ok(())), |handle| close_replica_staged(&handle));
        if let Some(name) = paged_vfs {
            let _ = celld_ltx::paged_vfs::unregister_paged_vfs(&name);
        }
        self.finish_remove_local(cell, epoch, preserve_local, close_result);
        staged
    }

    /// Move an active handle out only after its undrained-tail marker is
    /// visible. The graceful-seal check takes these locks in the same order,
    /// so it cannot observe the handle as absent before it can observe the
    /// marker that replaces it.
    fn remove_active_and_record_tail(&self, cell: &str, epoch: u64) -> Option<CellHandle> {
        let key = (cell.to_string(), epoch);
        let mut cells = self.cells.lock().unwrap();
        let handle = cells.get(&key)?;
        self.note_undrained_tail(cell, epoch, handle);
        cells.remove(&key)
    }

    /// Record an ending that leaves acked rows outside the per-cell
    /// layout. Retain each epoch's bound and live fleet and bucket watermarks
    /// without keeping the replica or database alive. Acked is the max of
    /// the fleet credit and the tiering credit — the bundle flush advances
    /// `durable_txid`, so neither alone is per-cell coverage. The live fleet
    /// watermark also retains a captured round's later credit. Covered is
    /// what a successor restore
    /// will actually see: the per-cell watermark plus the drain's L1
    /// fold. Acked rows above it can remain only in node bundles or follower
    /// fragments, so restore must gather them first. Conservative on
    /// purpose: a stale `compacted_txid` costs another recovery check,
    /// never a lost row.
    fn note_undrained_tail(&self, cell: &str, epoch: u64, handle: &Cell) {
        let acked = handle
            .shipped_txid
            .load(Ordering::SeqCst)
            .max(handle.durable_txid.load(Ordering::SeqCst));
        let covered = percell_coverage(handle);
        if acked > covered {
            let mut tails = self.dirty_tails.lock().unwrap();
            let epochs = tails.entry(cell.to_string()).or_default();
            let acked_txid = epochs
                .get(&epoch)
                .map_or(acked, |tail| tail.acked_txid.max(acked));
            epochs.insert(
                epoch,
                RetainedTail {
                    acked_txid,
                    shipped_txid: handle.shipped_txid.clone(),
                    durable_txid: handle.durable_txid.clone(),
                },
            );
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

    /// Capture one full snapshot after the runtime closes.
    ///
    /// A retry reuses these bytes. Recreating the image for each failed PUT
    /// would spend local I/O without changing the closed database.
    ///
    /// The returned pause holds compaction off until the caller drops it or
    /// hands the cell off. It comes back with the snapshot because a
    /// snapshot read without the pause can race a fold of the same rows.
    async fn prepare_handoff_snapshot(
        &self,
        handle: &CellHandle,
    ) -> anyhow::Result<(Option<HandoffSnapshot>, Option<HandoffCompactionPause>)> {
        // A paged activation's local file is sparse. The snapshot page
        // collector reads non-WAL pages from the file directly, so a handoff
        // snapshot built here would publish hole-zeros as authoritative data.
        // Skip it; the eviction then proves durability through the L0 chain,
        // which is complete by construction (every write synced through WAL).
        if handle.paged_vfs.is_some() {
            return Ok((None, None));
        }
        let pause = HandoffCompactionPause::new(handle);
        let _compaction_run = match &handle.compaction {
            Some(compaction) => Some(compaction.run.lock().await),
            None => None,
        };
        // A declined snapshot still pauses compaction and waits out a running
        // round, so the retry of a failed attempt, or a later eviction after
        // an abandoned one, holds compaction off exactly as the first attempt
        // did. The first attempt's permanent cancel used to cover these
        // attempts. Returning before the run lock would let a round that was
        // already folding keep running into the L0-chain proof.
        if handle.snapshot_declined.load(Ordering::Relaxed) {
            return Ok((None, pause));
        }

        let snapshot_handle = handle.clone();
        // The deadline covers the snapshot's upload. A database the deadline
        // cannot carry at a conservative store rate is not attempted, so a
        // whale does not allocate and time out on its whole image at every
        // retry; the L0 chain is its restore artifact, as for a paged cell.
        let budget = usize::try_from(self.snapshot_budget_bytes.load(Ordering::Relaxed))
            .unwrap_or(usize::MAX);
        let snapshot = asyncrt::blocking(move || -> anyhow::Result<Option<HandoffSnapshot>> {
            let mut replica_slot = snapshot_handle.replica.lock().unwrap();
            let replica = replica_slot
                .as_mut()
                .ok_or_else(|| anyhow!("handoff snapshot replica is closed"))?;
            let db = replica
                .db_mut()
                .ok_or_else(|| anyhow!("handoff snapshot database is unavailable"))?;
            db.sync()
                .map_err(|error| anyhow!("capture handoff database: {error}"))?;
            let durable_txid = db.pos()?.txid;
            if durable_txid == TXID(0) {
                return Ok(None);
            }
            let mut data = Vec::new();
            let position = match db.snapshot_to_writer(&mut BoundedWriter {
                data: &mut data,
                budget,
            }) {
                Ok(position) => position,
                Err(_) if data.len() >= budget => {
                    snapshot_handle
                        .snapshot_declined
                        .store(true, Ordering::Relaxed);
                    return Ok(None);
                }
                Err(error) => return Err(anyhow!("create handoff snapshot: {error}")),
            };
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
        .map_err(|error| anyhow!("join handoff snapshot task: {error}"))??;
        Ok((snapshot, pause))
    }

    /// Publish one full L9 snapshot of a closed cell. A successful visibility
    /// check makes this snapshot the authoritative handoff proof.
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
        self.note_covered(cell, epoch, snapshot.max_txid.0);
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
        // A paged activation's file is a sparse cache behind its VFS. A copy
        // of it in place would open the destination through the same
        // registration, and every page the backup writes there would mark
        // the cell's own hydration set without the cell's file holding it
        // (CelldPagedVfs.tla, `BreakSecondFileShares`): the live cell then
        // reads holes. Inspect a paged cell through the bucket instead.
        anyhow::ensure!(
            self.paged_vfs_name(cell, epoch).is_none(),
            "{cell} epoch {epoch} is paged in; inspect it from the bucket"
        );
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
    ///
    /// This reader holds no ownership, so the owner's epoch GC can delete an
    /// epoch this restore planned against. A missing planned object therefore
    /// rebuilds the chain from a fresh epoch listing and restores again; the
    /// new chain starts at a base at or above the deleted epochs. Replanning
    /// over the old chain would pick the same deleted objects, because the
    /// chain caches its listings.
    pub async fn restore_snapshot(&self, cell: &str) -> anyhow::Result<Option<RestoredSnapshot>> {
        let mut attempts_left = RESTORE_SNAPSHOT_ATTEMPTS;
        loop {
            // GC can delete a listed epoch while the chain lists its levels,
            // which leaves a continuation without its base; list again.
            let chain = match self.epoch_chain(cell, u64::MAX).await {
                Ok(Some(chain)) => chain,
                Ok(None) => return Ok(None),
                Err(_) if attempts_left > 1 => {
                    attempts_left -= 1;
                    continue;
                }
                Err(error) => return Err(error),
            };
            // A base deleted between the epoch listing and its level listing
            // does not fail the build: the walk skips the empty epoch and
            // returns a continuation whose oldest span starts past TXID 1.
            if chain.spans().first().is_none_or(|(_, lo)| *lo != TXID(1)) && attempts_left > 1 {
                attempts_left -= 1;
                continue;
            }
            let epoch = chain.spans().last().map_or(0, |(e, _)| *e);
            let directory = self.watch.join(format!(".restore-{cell}"));
            let _ = self.ltx_host.remove_dir_all(&directory);
            self.ltx_host.create_dir_all(&directory)?;
            let path = directory.join("db.sqlite");
            match replica::restore_with_host_and_download_slots(
                &chain,
                &path,
                TXID(0),
                self.ltx_host.clone(),
                self.restore_slots.clone(),
            )
            .await
            {
                Ok(_) => {
                    return Ok(Some(RestoredSnapshot::new(
                        epoch,
                        path,
                        directory,
                        self.ltx_host.filesystem(),
                    )))
                }
                Err(celld_ltx::Error::LTXMissing | celld_ltx::Error::TxNotAvailable)
                    if attempts_left > 1 =>
                {
                    attempts_left -= 1
                }
                Err(error) => return Err(anyhow!("restore snapshot {cell} e{epoch}: {error}")),
            }
        }
    }

    pub fn prune_local_cache(&self, max_bytes: u64) -> std::io::Result<(usize, usize, u64)> {
        self.preserved
            .lock()
            .expect("preserved cache poisoned")
            .prune(&self.watch, max_bytes)
    }

    /// Prove the stopped database position durable, then close the replicator
    /// while retaining the live database and WAL at their encoded path.
    pub async fn close_for_reload(&self, cell: &str, epoch: u64) -> anyhow::Result<()> {
        // Admission is already stopped, so this capture covers the exact
        // position that a clean reload preserves. Closing first can let the
        // next activation trust a local position that the bucket cannot
        // restore, and an aggregate shipper watermark cannot detect that gap.
        self.final_durability_barrier(cell, epoch).await?;
        // A paged cell's file is a sparse cache behind a VFS this process
        // registered; the next process has neither, so it cannot resume the
        // file in place (CelldPersistencePaged.tla, `BreakReloadKeepsPaged`).
        // Discard it after the proof, so the successor pages the complete
        // position in again from the bucket.
        if self.paged_vfs_name(cell, epoch).is_some() {
            self.remove_local(cell, epoch, false);
            return Ok(());
        }
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
                let is_file = |name: &str| {
                    filesystem
                        .metadata(&epoch_dir.path.join(name))
                        .is_ok_and(|metadata| metadata.is_file)
                };
                // `.evicted` is what an eviction preserves; `.hibernated`
                // is the pre-2026-08-05 name of the same copy.
                let live = is_file("db.sqlite");
                if live || is_file("db.evicted") || is_file("db.hibernated") {
                    cells.push(celld_logic::LocalCell {
                        id: cell.clone(),
                        epoch,
                        live,
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
            .filter(|cell| cell.live && !keep.contains(&(cell.id.clone(), cell.epoch)))
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
        note_capture(&handle_, captured);
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
        if let Some(compaction) = &handle.compaction {
            compaction
                .pending_bytes
                .fetch_add(bytes.len() as u64, Ordering::SeqCst);
        }
        #[cfg(all(test, celld_internal_tests))]
        let round_ordinal = handle.begin_upload_round_for_world(captured, *min_txid, *max_txid);
        if let Err(error) = handle
            .client
            .write_ltx_file(0, TXID(*min_txid), TXID(*max_txid), bytes)
            .await
        {
            #[cfg(all(test, celld_internal_tests))]
            handle.finish_upload_round_for_world(
                round_ordinal,
                LtxUploadRoundStatusForWorldV1::Failed,
            );
            warn!(%error, min_txid, max_txid, "ltx upload failed");
            handle
                .last_sync_ms
                .store(asyncrt::wall_ms().max(0) as u64, Ordering::SeqCst);
            handle.ready.notify_waiters();
            return Some(false);
        }
        #[cfg(all(test, celld_internal_tests))]
        handle.finish_upload_round_for_world(
            round_ordinal,
            LtxUploadRoundStatusForWorldV1::Completed,
        );
    }
    if let Some(last) = last {
        // Advance the replica's uploaded watermark; `syncing` serializes
        // passes, so nothing else moved it meanwhile.
        // A close can win after staging, so credit only a still-open replica.
        // The durable watermark remains valid when the replica is closed.
        if let Some(replica) = handle.replica.lock().unwrap().as_mut() {
            replica.seed_pos(Pos::new(TXID(last), 0));
        }
        credit_percell_upload(&handle, last);
        #[cfg(all(test, celld_internal_tests))]
        handle.pause_after_sync_credit_for_world().await;
    }
    handle.synced_seq.fetch_max(captured, Ordering::SeqCst);
    maybe_queue_compaction(&handle, handle.durable_txid.load(Ordering::SeqCst));
    handle
        .last_sync_ms
        .store(asyncrt::wall_ms().max(0) as u64, Ordering::SeqCst);
    note_proof(&handle);
    handle.ready.notify_waiters();
    Some(true)
}

fn maybe_queue_compaction(handle: &CellHandle, durable_txid: u64) {
    let Some(compaction) = &handle.compaction else {
        return;
    };
    let due_by_txids = durable_txid
        .saturating_sub(compaction.compacted_txid.load(Ordering::SeqCst))
        >= compaction.min_txids;
    let due_by_bytes = compaction.pending_bytes.load(Ordering::SeqCst) >= compaction.min_bytes;
    if due_by_txids || due_by_bytes {
        enqueue_compaction(handle, "threshold");
    }
}

/// Queues one round regardless of the thresholds, behind the same
/// cancellation, backoff and single-flight guards as a threshold round.
fn enqueue_compaction(handle: &CellHandle, trigger: &'static str) {
    let Some(compaction) = &handle.compaction else {
        return;
    };
    if compaction.halted()
        || asyncrt::mono_ms() < compaction.retry_after_ms.load(Ordering::SeqCst)
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
            trigger,
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
    tasks: TaskGroup,
) -> mpsc::UnboundedSender<CompactionWork> {
    let (queue, mut work) = mpsc::unbounded_channel::<CompactionWork>();
    let slots = Arc::new(Semaphore::new(config.concurrency));
    let stop = tasks.stop_token();
    tasks
        .clone()
        .spawn_owned("ltx_compaction_dispatcher", async move {
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
                let requeues = tasks.clone();
                tasks.spawn_owned("ltx_compaction_worker", async move {
                    let _permit = permit;
                    compact_cell(
                        cell,
                        work.queued_at_mono_ms,
                        work.trigger,
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
    if cancellable && compaction.halted() {
        compaction.queued.store(false, Ordering::SeqCst);
        return CompactionOutcome::Cancelled;
    }
    let _run = compaction.run.lock().await;
    if cancellable && compaction.halted() {
        compaction.queued.store(false, Ordering::SeqCst);
        return CompactionOutcome::Cancelled;
    }

    let source_position = || {
        (
            handle.durable_txid.load(Ordering::SeqCst),
            handle.percell_txid.load(Ordering::SeqCst),
        )
    };
    let source_at_start = source_position();
    let queue_ms = asyncrt::mono_ms().saturating_sub(queued_at_mono_ms);
    let started = asyncrt::mono_ms();
    // The run lock keeps the snapshot stable through listing and every row
    // open. The next round must see bundles published since this one began.
    *compaction.fetcher.rows.lock().await = None;
    let compactor = ReplicaCompactor::new(&compaction.client)
        .with_host(compaction.host.clone())
        .with_verification(true)
        .with_local_path(&compaction.local_path)
        .with_limits(COMPACTION_MAX_FILES, COMPACTION_MAX_INPUT_BYTES)
        .with_base(TXID(compaction.base_txid));
    let result = {
        let worker = compactor.compact_with_progress(1);
        tokio::pin!(worker);
        if cancellable {
            asyncrt::select_biased! {
                "a cancellation that ties compaction completion discards the cancelled round";
                _ = &mut cancelled => None,
                result = &mut worker => Some(result),
            }
        } else {
            Some(worker.as_mut().await)
        }
    };

    *compaction.fetcher.rows.lock().await = None;
    #[cfg(all(test, celld_internal_tests))]
    {
        let pause = compaction.finish_pause.lock().unwrap().take();
        if let Some(pause) = pause {
            pause.reached.store(true, Ordering::SeqCst);
            pause.release.notified().await;
        }
    }
    let outcome = match result {
        Some(Ok(CompactionResult {
            output: Some(output),
            ..
        })) => {
            let info = output.info;
            compaction
                .compacted_txid
                .store(info.max_txid.0, Ordering::SeqCst);
            // The fold consumed the tail it saw; bytes that landed during it
            // count toward the next one only approximately, which delays it
            // by at most one window.
            compaction.pending_bytes.store(0, Ordering::SeqCst);
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
        Some(Ok(CompactionResult {
            covered_txid,
            output: None,
        })) => {
            compaction
                .compacted_txid
                .store(covered_txid.0, Ordering::SeqCst);
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
                max_txid = covered_txid.0,
                "the additive LTX level has no visible source tail"
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
    let failure_pause = if outcome == CompactionOutcome::Failed {
        let failures = compaction.failures.fetch_add(1, Ordering::SeqCst);
        let pause = Duration::from_secs((30u64 << failures.min(4)).min(300));
        compaction.retry_after_ms.store(
            asyncrt::mono_ms().saturating_add(pause.as_millis() as u64),
            Ordering::SeqCst,
        );
        Some(pause)
    } else {
        compaction.failures.store(0, Ordering::SeqCst);
        compaction.retry_after_ms.store(0, Ordering::SeqCst);
        None
    };
    // Publish the delay before admitting another ship-triggered attempt.
    compaction.queued.store(false, Ordering::SeqCst);

    // A no-work result proves coverage only through the sources that the
    // overlay can see, which can end below durable_txid. Self-requeueing
    // would spin on the same empty listing. Preserve a publication that raced
    // this attempt: its queue request can lose the queued CAS. Read its two
    // watermarks after clearing queued, so a later publisher queues itself.
    // A failed round schedules its own retry after the backoff, so a cell
    // with no later ship round still retries.
    let requeue = match outcome {
        CompactionOutcome::Advanced | CompactionOutcome::Failed => true,
        CompactionOutcome::Current => source_position() != source_at_start,
        CompactionOutcome::Cancelled => false,
    };
    // Only the permanent cancel drops the requeue. A handoff pause can lift
    // before the requeue fires, and `enqueue_compaction` re-checks `halted`
    // then, so gating on the pause here would lose a round that completed
    // during an abandoned eviction.
    if requeue && !compaction.cancelled.load(Ordering::SeqCst) {
        // Pace consecutive rounds for one cell: a restart with a large tail
        // otherwise drains back-to-back for minutes. The pause matches the
        // round it follows (capped), so a cell compacts at half duty cycle
        // while the worker slot frees for other cells immediately. The owner
        // retains this delayed task, but the task does not retain the permit.
        let pause = failure_pause.unwrap_or_else(|| {
            Duration::from_millis(asyncrt::mono_ms().saturating_sub(started))
                .min(Duration::from_secs(2))
        });
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
    let min_mb: u64 = crate::env_vars::with_default("CELLD_LTX_COMPACTION_MIN_MB", 32)?;
    let concurrency = crate::env_vars::with_default("CELLD_LTX_COMPACTIONS", 2)?;
    anyhow::ensure!(
        min_mb > 0 && min_mb << 20 <= COMPACTION_MAX_INPUT_BYTES,
        "CELLD_LTX_COMPACTION_MIN_MB must be between 1 and {}",
        COMPACTION_MAX_INPUT_BYTES >> 20
    );
    anyhow::ensure!(
        min_txids >= 2,
        "CELLD_LTX_COMPACTION_MIN_TXIDS must be at least 2"
    );
    anyhow::ensure!(concurrency > 0, "CELLD_LTX_COMPACTIONS must be positive");
    Ok(Some(CompactionConfig {
        min_txids: min_txids as u64,
        min_bytes: min_mb << 20,
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
                .is_some_and(|targets| targets.manager.bundle_active());
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
        let installed = registered_durability(&registration).map(|targets| targets.manager.clone());
        let Some(active) = installed.filter(|sink| sink.bundle_active()) else {
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
                    note_capture(&handle, tickets);
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
                handle.durable_txid.fetch_max(position, Ordering::SeqCst);
                handle.synced_seq.fetch_max(tickets, Ordering::SeqCst);
                handle
                    .last_sync_ms
                    .store(asyncrt::wall_ms().max(0) as u64, Ordering::SeqCst);
                // Bundle credits also queue the overlay compactor.
                maybe_queue_compaction(&handle, position);
                note_proof(&handle);
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
    group_commit_ms: u64,
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
    const CAPTURE_WORKERS: usize = 8;
    // The loop's own time ledger: idle (nothing to do), stall (admission
    // or depth closed, waiting on a round), apply, scan, capture wall,
    // submit. Emitted cumulatively about once a second; wall minus the
    // sum is the loop's untracked residual and must stay small.
    let mut lap = asyncrt::mono_us();
    let (mut idle_us, mut stall_us, mut apply_us, mut scan_us) = (0_u64, 0_u64, 0_u64, 0_u64);
    let (mut group_us, mut capture_us, mut submit_us) = (0_u64, 0_u64, 0_u64);
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
                group_us,
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
            group_us = 0;
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
        // Producer grouping shares a transaction within one Queue. This wait
        // also gathers writes from different Queues into one fleet capture.
        // Only pending Queue writes trigger it; other cell classes alone do
        // not add the wait. This preliminary scan is only a delay decision;
        // the authoritative work and shipper epoch are read after the wait.
        let queue_pending = if group_commit_ms == 0 {
            false
        } else {
            let map = cells.lock().unwrap();
            map.iter().any(|((cell, _), handle)| {
                cell.split_once(':')
                    .is_some_and(|(class, _)| class == crate::deploy::QUEUE_CLASS)
                    && {
                        let req = handle.req_seq.load(Ordering::SeqCst);
                        req > handle.submitted_seq.load(Ordering::SeqCst)
                            && req > handle.synced_seq.load(Ordering::SeqCst)
                    }
            })
        };
        if queue_pending {
            let _ = lap_us(&mut lap);
            asyncrt::select_biased! {
                "a stop signal that ties the group-commit window prevents another capture";
                _ = stop.stopped() => break 'shipping,
                _ = asyncrt::sleep(Duration::from_millis(group_commit_ms)) => {},
            }
            group_us += lap_us(&mut lap);
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
        let workers = work.len().clamp(1, CAPTURE_WORKERS);
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
                let mut snap_reasons = [0_u32; 9];
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
                    note_capture(&handle, tickets);
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
                    timing.checkpoint_runs += cell_timing.checkpoint_runs;
                    timing.checkpoint_wal_frames += cell_timing.checkpoint_wal_frames;
                    timing.checkpoint_backfilled += cell_timing.checkpoint_backfilled;
                    timing.checkpoint_busy += cell_timing.checkpoint_busy;
                    timing.checkpoint_busy_errors += cell_timing.checkpoint_busy_errors;
                    timing.checkpoint_restarts += cell_timing.checkpoint_restarts;
                    timing.pos_us += cell_timing.pos_us;
                    timing.wal_read_us += cell_timing.wal_read_us;
                    timing.map_collect_us += cell_timing.map_collect_us;
                    timing.ltx_encode_us += cell_timing.ltx_encode_us;
                    timing.file_write_us += cell_timing.file_write_us;
                    timing.wal_len_bytes += cell_timing.wal_len_bytes;
                    if cell_timing.snapshot {
                        timing.snapshot = true;
                        snap_reasons[cell_timing.snapshot_reason.min(8) as usize] += 1;
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
        let mut snap_reason_totals = [0_u32; 9];
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
            timing_total.checkpoint_runs += chunk_timing.checkpoint_runs;
            timing_total.checkpoint_wal_frames += chunk_timing.checkpoint_wal_frames;
            timing_total.checkpoint_backfilled += chunk_timing.checkpoint_backfilled;
            timing_total.checkpoint_busy += chunk_timing.checkpoint_busy;
            timing_total.checkpoint_busy_errors += chunk_timing.checkpoint_busy_errors;
            timing_total.checkpoint_restarts += chunk_timing.checkpoint_restarts;
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
        ledger.advance(|cells| ship_batch_covered(cells));
        let covered_seq = ledger.covered_seq();
        let captured_ms = asyncrt::mono_ms().saturating_sub(round);
        capture_us += lap_us(&mut lap);
        let entry_count = entries.len();
        let byte_count = entries.iter().map(|entry| entry.bytes.len()).sum::<usize>();
        let since_last = asyncrt::mono_ms().saturating_sub(last_submit);
        // No entries can mean that an earlier in-flight round owns every
        // frame, not only that the bucket already covers them. Queue the
        // empty credit through the same ordered pipeline, so an earlier
        // failure discards it instead of releasing an unproved fleet ticket.
        #[cfg(all(test, celld_internal_tests))]
        let observer_rounds = credits
            .iter()
            .map(|(handle, tickets, position)| {
                let count = entries
                    .iter()
                    .filter(|entry| {
                        entry.cell == handle.observer_cell && entry.epoch == handle.observer_epoch
                    })
                    .count();
                handle.begin_fleet_capture_for_world(*tickets, *position, count, capture_epoch)
            })
            .collect::<Vec<_>>();
        let append = if entries.is_empty() {
            None
        } else {
            last_submit = asyncrt::mono_ms();
            // The shipper's synchronous prefix runs HERE, at submission: the
            // sequence range and every member lane enqueue happen before the
            // future is queued, so pipelined rounds stay ordered per member.
            Some(active.ship_at_epoch(capture_epoch, entries, covered_seq))
        };
        for (handle, tickets, position) in &credits {
            handle.submitted_txid.fetch_max(*position, Ordering::SeqCst);
            handle.submitted_seq.fetch_max(*tickets, Ordering::SeqCst);
        }
        let submitted = asyncrt::mono_ms();
        inflight.push_back(Box::pin(async move {
            ShipRound {
                #[cfg(all(test, celld_internal_tests))]
                observer_rounds,
                completion: match append {
                    Some(append) => ShipRoundCompletion::Append(append.await),
                    None => ShipRoundCompletion::OrderedEmpty,
                },
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

/// The proof carried by one ordered ship-loop round. `FuturesOrdered` holds an
/// `OrderedEmpty` no-op behind each earlier append, and a failed append
/// discards the complete later tail before the no-op can apply.
enum ShipRoundCompletion {
    Append(ShipCompletion),
    OrderedEmpty,
}

/// One pipelined round's completion, applied strictly in submission order.
struct ShipRound {
    #[cfg(all(test, celld_internal_tests))]
    observer_rounds: Vec<LtxFleetCaptureForWorld>,
    completion: ShipRoundCompletion,
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
    snap_reasons: [u32; 9],
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
    let proof_last_seq = match &round.completion {
        ShipRoundCompletion::Append(completion) => {
            let Some(last_seq) = completion.last_seq() else {
                #[cfg(all(test, celld_internal_tests))]
                for observer in &round.observer_rounds {
                    observer.finish(LtxFleetCaptureStatusForWorld::Failed);
                }
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
            Some(last_seq)
        }
        // No append completed for this round. Its credits are safe because
        // the ordered queue first applied every earlier append, or because
        // the bucket already held the captured position. Do not invent a
        // fleet sequence for this credit.
        ShipRoundCompletion::OrderedEmpty => None,
    };
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
        ckpt_n = round.sync_timing.checkpoint_runs,
        ckpt_frames = round.sync_timing.checkpoint_wal_frames,
        ckpt_done = round.sync_timing.checkpoint_backfilled,
        ckpt_busy = round.sync_timing.checkpoint_busy,
        ckpt_busy_err = round.sync_timing.checkpoint_busy_errors,
        ckpt_restart = round.sync_timing.checkpoint_restarts,
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
        snap_prebarrier = round.snap_reasons[8],
        read_tail = round.read_kinds[0],
        read_snap = round.read_kinds[1],
        read_start = round.read_kinds[2],
        read_fallback = round.read_kinds[3],
        read_bytes = round.read_bytes,
        probe_us = round.probe_us,
        proof_last_seq = ?proof_last_seq,
        "shipped a log batch"
    );
    #[cfg(all(test, celld_internal_tests))]
    for observer in &round.observer_rounds {
        observer.finish(LtxFleetCaptureStatusForWorld::Applied);
    }
    for (handle, tickets, position) in round.credits {
        #[cfg(all(test, celld_internal_tests))]
        handle.record_fleet_credit_for_world(tickets, position, proof_last_seq);
        handle.shipped_txid.fetch_max(position, Ordering::SeqCst);
        handle.shipped_seq.fetch_max(tickets, Ordering::SeqCst);
        note_proof(&handle);
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

fn managed_db_mut(
    replica: &mut Option<Replica<SharedObjectStoreClient>>,
) -> Option<&mut celld_ltx::Db> {
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
    close_replica_staged(handle).1
}

/// Close the managed database, and return the position staged at the close
/// with the close result. Every capture syncs and reads its position under the
/// replica mutex that the close takes the database from, so no capture can
/// ship a later position from this handle. A failed close still returns the
/// position, because no capture can reach the database after the take.
fn close_replica_staged(handle: &CellHandle) -> (Option<u64>, anyhow::Result<()>) {
    cancel_compaction(handle);
    let replica = handle.replica.lock().unwrap().take();
    let Some(mut db) = replica.and_then(Replica::into_db) else {
        return (None, Ok(()));
    };
    let staged = db.pos().ok().map(|pos| pos.txid.0);
    (staged, db.close().map_err(|error| anyhow!(error)))
}

impl Drop for LtxRepl {
    fn drop(&mut self) {
        self.shutdown_local_fallback();
    }
}

#[cfg(celld_internal_tests)]
include!(env!("CELLD_INTERNAL_LTX_REPL_OBSERVERS"));
