//! replica.rs — single-replica sync loop + restore orchestration.
//! Ported from litestream@v0.5.11 `replica.go`.
//!
//! A [`Replica`] connects a managed [`crate::db::Db`] to a replication
//! destination via a [`ReplicaClient`]. It drives two halves of replication:
//!
//! * **sync** (`replica.go:132-180`): copy each new L0 LTX file the capture loop
//!   wrote locally up to the remote replica, advancing the replicated position
//!   one TXID at a time. `calc_pos` (`replica.go:208-214`) recovers the starting
//!   position from the newest file already on the replica.
//! * **restore** (`replica.go:533-725`): download the LTX files from the replica
//!   in TXID order, merge them (the compactor in `ltx.NewCompactor`,
//!   ltx@v0.5.1 compactor.go), and reconstruct the SQLite database file the way
//!   `Decoder.DecodeDatabaseTo` (ltx@v0.5.1 decoder.go:223-268) does — pages
//!   `1..=commit`, lock page zero-filled, written verbatim — to a temp file that
//!   is fsync'd and atomically renamed into place.
//!
//! ## Scope: L0-only, single replica
//! The real `litestream v0.5.11` L0-only architecture stores **everything at
//! level 0** — the snapshot (MinTXID==1) and every incremental — under
//! `ltx/0/`. The snapshot level (`SnapshotLevel = 9`,
//! compaction_level.go:9) is empty without compaction. [`calc_restore_plan`] is
//! ported faithfully (snapshot anchor at `SnapshotLevel` + per-level cursors so
//! adding compaction later "just works"), but in this scope the plan is the
//! contiguous L0 chain `1..=N`.
//!
//! ## Deferred work that needs a background runtime or additional scope
//! * **Follow mode** (`replica.go:730-987`, `applyLTXFile`/`fillFollowGap`): the
//!   continuous tail-restore loop. The current API performs one restore.
//! * **The background monitor goroutine + backoff** (`replica.go:326-441`) and
//!   `Start`/`Stop`: need a Tokio task owning the `Db`; the
//!   synchronous `sync()` primitive it would call is implemented here.
//! * **V3 (v0.3.x generation) restore** (`RestoreV3`, replica.go:990-1096) is not
//!   included because celld has no earlier replica generation to support.
//! * **Timestamp / `-txid` targeted restore plumbing through the public API**:
//!   [`calc_restore_plan`] honors a target TXID, but the
//!   timestamp path and `RestoreOptions` surface stay minimal for the one-shot.

// Restore phase durations are diagnostics in this stand-alone public crate.
// celld injects its scheduling facilities at the engine boundary.
#![allow(clippy::disallowed_methods)]

use crate::client::ReplicaClient;
use crate::db::Db;
use crate::error::{new_ltx_error, Error, Result};
use crate::ltx::{self, FileInfo};
use crate::{Pos, TXID};
use futures_util::stream;
use futures_util::StreamExt;
use futures_util::TryStreamExt;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Semaphore;

/// Keep enough reads in flight to hide an object store's round-trip latency,
/// while the caller's semaphore bounds aggregate restore traffic.
const RESTORE_DOWNLOAD_CONCURRENCY: usize = 64;

/// The compaction level which full snapshots are held at.
///
/// Ported from `SnapshotLevel` (compaction_level.go:9). In the L0-only one-shot
/// scope no files land here (snapshots are written at L0), but
/// [`calc_restore_plan`] still probes it first so the algorithm stays a faithful
/// port that works the moment compaction is added.
pub use crate::compaction_level::SNAPSHOT_LEVEL;

/// The number of compaction levels that one restore-plan calculation can list
/// concurrently. A caller-supplied semaphore still bounds all remote requests.
const RESTORE_PLAN_CONCURRENCY: usize = SNAPSHOT_LEVEL as usize + 1;

/// Whether a sync error means the cached replica position can no longer be
/// trusted and must be re-derived from the store on the next sync.
///
/// True only for errors that say the local/replica state itself diverged. A
/// transient store or IO error is not one of these: a fenced single writer's
/// position is still valid, and its re-upload is an idempotent overwrite. See
/// [`Replica::sync`] for why celld narrows Litestream's clear-on-any-error.
fn pos_untrustworthy(err: &Error) -> bool {
    matches!(
        err,
        Error::NoSnapshots
            | Error::ChecksumMismatch
            | Error::LTXCorrupted
            | Error::LTXMissing
            | Error::TxNotAvailable
    )
}

/// Connects a database to a replication destination via a [`ReplicaClient`].
///
/// Ported from `Replica` (replica.go:30-59). The Go type also owns the
/// background-monitor machinery (`wg`/`cancel`/`f`) and tunables
/// (`SyncInterval`/`MonitorEnabled`); those drive the deferred monitor loop and
/// are intentionally omitted here (see module docs).
pub struct Replica<C: ReplicaClient> {
    /// The database being replicated. `None` for a restore-only replica (the Go
    /// `NewReplicaWithClient(nil, client)` restore-only shape).
    db: Option<Db>,

    /// Client used to connect to the remote replica.
    pub client: C,

    /// Current replicated position (`replica.go:33-34` `pos`).
    pos: Pos,

    /// Whether `pos` is known and needs no `calc_pos` listing to re-derive.
    /// Seeded true at activation (see [`Self::seed_pos`]); reset false only when
    /// a divergence error says the position can no longer be trusted. Upstream
    /// has no equivalent -- it lists whenever `pos` is zero -- which is the
    /// listing celld's fencing lets it skip.
    pos_known: bool,
}

impl<C: ReplicaClient> Replica<C> {
    /// Creates a replica that owns `db` and replicates through `client`.
    ///
    /// Ported from `NewReplicaWithClient` (replica.go:73-77).
    pub fn new(db: Db, client: C) -> Self {
        Replica {
            db: Some(db),
            client,
            pos: Pos::ZERO,
            pos_known: false,
        }
    }

    /// Creates a restore-only replica with no attached database (Go's
    /// `NewReplicaWithClient(nil, client)`).
    pub fn new_client_only(client: C) -> Self {
        Replica {
            db: None,
            client,
            pos: Pos::ZERO,
            pos_known: false,
        }
    }

    /// Returns a reference to the attached database, if any.
    /// Ported from `Replica.DB` (replica.go:89).
    pub fn db(&self) -> Option<&Db> {
        self.db.as_ref()
    }

    /// Consumes the replica and returns the attached database, if any. Lets a
    /// host perform a clean [`Db::close`] (which consumes the `Db`) after a final
    /// sync — the shutdown ordering the deferred monitor loop would otherwise own
    /// (replica.go `Stop` → `db.Close`).
    pub fn into_db(self) -> Option<Db> {
        self.db
    }

    /// Returns a mutable reference to the attached database, if any. Lets a
    /// caller drive `db.sync()` (the local capture half) before `replica.sync()`
    /// (the upload half) — the `SyncAndWait` ordering (db.go:500-512).
    pub fn db_mut(&mut self) -> Option<&mut Db> {
        self.db.as_mut()
    }

    /// The current replicated position. Ported from `Replica.Pos`
    /// (replica.go:237-241).
    pub fn pos(&self) -> Pos {
        self.pos
    }

    /// Sets the current replicated position. Ported from `Replica.SetPos`
    /// (replica.go:244-248).
    fn set_pos(&mut self, pos: Pos) {
        self.pos = pos;
    }

    /// Seed the replicated position from the caller's known-durable state and
    /// mark it known, so the next sync skips the `calc_pos` listing. A fresh
    /// cell seeds 0; a just-restored cell seeds its restored max. celld always
    /// knows this at activation -- local equals remote under epoch fencing --
    /// so the listing that only existed to re-discover the position, and that
    /// storms a rate-limiting store, is not issued on the activation path.
    pub fn seed_pos(&mut self, pos: Pos) {
        self.pos = pos;
        self.pos_known = true;
    }

    /// Copies new L0 LTX files from the local capture directory to the replica.
    ///
    /// Ported from `Replica.Sync` (replica.go:132-180). On any error the cached
    /// position is cleared so the next sync recomputes it from the replica
    /// (replica.go:137-143). Requires an attached database.
    pub async fn sync(&mut self) -> Result<()> {
        match self.sync_inner().await {
            Ok(()) => Ok(()),
            Err(e) => {
                // Litestream clears the cached position on *any* error so the
                // next sync re-derives it with a `calc_pos` listing
                // (replica.go:137-143) -- safe there only because it is single-
                // node with no fencing. celld fences one writer per epoch
                // through the store, so within an epoch a transient store/IO
                // error does not invalidate our own position; re-uploads are
                // idempotent overwrites. Forget the position only when the
                // error says the state itself diverged, else a rate-limiting or
                // slow store turns every write into a listing.
                if pos_untrustworthy(&e) {
                    self.pos = Pos::ZERO;
                    self.pos_known = false;
                }
                Err(e)
            }
        }
    }

    async fn sync_inner(&mut self) -> Result<()> {
        // Re-derive the replica position with a listing only when it is not
        // already known (replica.go:146-152). celld seeds it at activation from
        // local state that equals the remote under epoch fencing, so a listing
        // -- which only ever re-discovered a position the owner already knows --
        // never runs on the hot path, and a fresh cell's pointless list of an
        // empty prefix is skipped entirely.
        if !self.pos_known {
            let pos = self
                .calc_pos()
                .await
                .map_err(|e| Error::Other(format!("calc pos: {e}").into()))?;
            self.set_pos(pos);
            self.pos_known = true;
        }

        // Find current position of the database (replica.go:155-160).
        let dpos = {
            let db = self
                .db
                .as_mut()
                .ok_or_else(|| Error::Other("no database attached to replica".into()))?;
            db.pos().map_err(|e| {
                Error::Other(format!("cannot determine current position: {e}").into())
            })?
        };
        if dpos.is_zero() {
            return Err(Error::Other("no position, waiting for data".into()));
        }

        // Replicate all L0 LTX files since the last replica position
        // (replica.go:169-174). Each successful upload advances pos by one TXID;
        // re-reading `self.pos()` each iteration mirrors the Go loop exactly.
        loop {
            let tx_id = TXID(self.pos().txid.0 + 1);
            if tx_id > dpos.txid {
                break;
            }
            self.upload_ltx_file(0, tx_id, tx_id).await?;
            self.set_pos(Pos::new(tx_id, 0));
        }

        Ok(())
    }

    /// Uploads a single local LTX file to the replica.
    ///
    /// Ported from `Replica.uploadLTXFile` (replica.go:182-205). A failure to
    /// open the local file is wrapped as an `LTXError{op:"open"}` so the monitor
    /// can classify auto-recoverable corruption (replica.go:186). The write
    /// itself is delegated to the client.
    async fn upload_ltx_file(&mut self, level: i32, min_txid: TXID, max_txid: TXID) -> Result<()> {
        let db = self
            .db
            .as_ref()
            .ok_or_else(|| Error::Other("no database attached to replica".into()))?;
        let filename = db.ltx_path(level as u32, min_txid, max_txid);

        let data = match db.read_ltx_file(level as u32, min_txid, max_txid) {
            Ok(b) => b,
            Err(e) => {
                return Err(Error::Ltx(Box::new(new_ltx_error(
                    "open", &filename, level, min_txid.0, max_txid.0, e,
                ))));
            }
        };

        self.client
            .write_ltx_file(level, min_txid, max_txid, &data)
            .await
            .map_err(|e| Error::Other(format!("write ltx file: {e}").into()))?;

        Ok(())
    }

    /// Returns the last position saved to the replica for level 0.
    ///
    /// Ported from `Replica.calcPos` (replica.go:208-214) + `MaxLTXFileInfo`
    /// (replica.go:218-233): scans the L0 listing for the highest `max_txid`.
    async fn calc_pos(&self) -> Result<Pos> {
        let info = self
            .max_ltx_file_info(0)
            .await
            .map_err(|e| Error::Other(format!("max ltx file: {e}").into()))?;
        Ok(Pos::new(info.max_txid, info.post_apply_checksum))
    }

    /// Metadata about the last LTX file for a given level (highest `max_txid`),
    /// or a zero `FileInfo` if none exist. Ported from `Replica.MaxLTXFileInfo`
    /// (replica.go:218-233).
    async fn max_ltx_file_info(&self, level: i32) -> Result<FileInfo> {
        let files = self.client.ltx_files(level, TXID(0)).await?;
        let mut info = FileInfo::default();
        for item in files {
            if item.max_txid > info.max_txid {
                info = item;
            }
        }
        Ok(info)
    }

    /// Restores the database from this replica's client into `output_path`.
    ///
    /// Convenience wrapper over [`restore`] using this replica's client and the
    /// most-recent state (no target TXID). Mirrors the common
    /// `Replica.Restore(ctx, opt)` call with `OutputPath` set and no TXID
    /// (replica.go:533).
    pub async fn restore(&self, output_path: impl AsRef<Path>) -> Result<RestorePlanStats> {
        restore(&self.client, output_path, TXID(0)).await
    }

    /// Detects when the local database has been restored to an earlier state
    /// than the replica (a lower TXID) and, if so, seeds the local L0 directory
    /// with the replica's newest L0 file so the next sync snapshots forward.
    ///
    /// Ported from `DB.checkDatabaseBehindReplica` (db.go:1211-1294), issue #781.
    /// In upstream this runs inside `DB.init()` because the `DB` owns its
    /// `Replica`; our synchronous `Db` does not, so the orchestration lives here
    /// on `Replica` and a host calls it once after [`Db::open`], before the first
    /// sync. The file-writing tail is [`Db::seed_l0_baseline`].
    ///
    /// Without this, a hard recovery (restore an old snapshot, reopen, write new
    /// data) would silently drop the new writes: the fresh local DB snapshots at
    /// TXID 1, but [`Replica::sync`] computes the replica position from the
    /// remote's higher `MaxTXID`, so its upload loop (`pos+1 ..= db.pos`) never
    /// runs (`pos+1` already exceeds the local DB's TXID). Seeding the remote
    /// baseline makes the next [`Db::sync`] see a continuity break and snapshot at
    /// the current (post-restore-plus-writes) state, which then uploads.
    ///
    /// No-op (returns `Ok`) when there is no remote data, when the database is at
    /// or ahead of the replica, or when there is no attached database.
    pub async fn check_database_behind_replica(&mut self) -> Result<()> {
        // Replica position from remote (db.go:1224-1230). Done first so a
        // restore-only replica with no DB is a clean no-op.
        let replica_info = self.max_ltx_file_info(0).await?;
        if replica_info.max_txid == TXID(0) {
            return Ok(()); // no remote replica data yet
        }

        let db = match self.db.as_mut() {
            Some(db) => db,
            None => return Ok(()),
        };

        // Database position from local L0 files (db.go:1218-1222).
        let db_pos = db
            .pos()
            .map_err(|e| Error::Other(format!("get database position: {e}").into()))?;

        // If the database is ahead or equal, nothing to do (db.go:1232-1235).
        if db_pos.txid >= replica_info.max_txid {
            return Ok(());
        }

        // Fetch the latest L0 LTX file from the replica (db.go:1251-1257).
        let min_txid = replica_info.min_txid;
        let max_txid = replica_info.max_txid;
        let data = self
            .client
            .open_ltx_file(0, min_txid, max_txid)
            .await
            .map_err(|e| Error::Other(format!("open remote L0 file: {e}").into()))?;

        // Seed it as the local baseline (db.go:1259-1293).
        db.seed_l0_baseline(min_txid, max_txid, &data)?;

        // Drop the now-stale cached replica position so the next sync recomputes
        // it from the remote (mirrors clearing pos on a state change).
        self.pos = Pos::ZERO;
        Ok(())
    }
}

/// Restores a database from `client` into `output_path`, optionally up to a
/// target `txid` (`TXID(0)` = most recent state).
///
/// Ported from `Replica.Restore` (replica.go:533-725), LTX path only. Steps:
///   1. refuse to overwrite an existing output (replica.go:591-595);
///   2. [`calc_restore_plan`] → the ordered snapshot+incremental file list;
///   3. download + merge them (compactor semantics) and reconstruct the database
///      image the way `Decoder.DecodeDatabaseTo` does;
///   4. write to `<output>.tmp`, fsync, and atomically rename (replica.go:657-694).
///
/// The V3 generation path and follow mode are out of scope (see module docs).
pub async fn restore<C: ReplicaClient>(
    client: &C,
    output_path: impl AsRef<Path>,
    txid: TXID,
) -> Result<RestorePlanStats> {
    restore_with_host_and_download_slots(
        client,
        output_path,
        txid,
        crate::LtxHost::default(),
        Arc::new(Semaphore::new(1)),
    )
    .await
}

/// What a restore read: the plan's shape, for the caller's telemetry.
#[derive(Debug, Clone)]
pub struct RestorePlanStats {
    pub objects: usize,
    pub bytes: u64,
    /// Object count per compaction level, ordered by level.
    pub by_level: BTreeMap<i32, usize>,
}

/// Wall-clock phases for one successful restore.
#[derive(Debug, Clone)]
pub struct RestoreTimingStats {
    pub plan: RestorePlanStats,
    pub plan_us: u64,
    pub download_us: u64,
    pub apply_us: u64,
}

/// Restores a database like [`restore`], but downloads independent LTX files
/// concurrently. All restores that share `download_slots` share one hard I/O
/// ceiling, so a cold cohort cannot multiply the limit per cell.
pub async fn restore_with_download_slots<C: ReplicaClient>(
    client: &C,
    output_path: impl AsRef<Path>,
    txid: TXID,
    download_slots: Arc<Semaphore>,
) -> Result<RestorePlanStats> {
    restore_with_host_and_download_slots(
        client,
        output_path,
        txid,
        crate::LtxHost::default(),
        download_slots,
    )
    .await
}

/// Restores a database through an injected local filesystem.
pub async fn restore_with_host_and_download_slots<C: ReplicaClient>(
    client: &C,
    output_path: impl AsRef<Path>,
    txid: TXID,
    host: crate::LtxHost,
    download_slots: Arc<Semaphore>,
) -> Result<RestorePlanStats> {
    Ok(
        restore_timed_with_host_and_download_slots(client, output_path, txid, host, download_slots)
            .await?
            .plan,
    )
}

/// Restores a database and reports the plan, download, and local apply times.
pub async fn restore_timed_with_download_slots<C: ReplicaClient>(
    client: &C,
    output_path: impl AsRef<Path>,
    txid: TXID,
    download_slots: Arc<Semaphore>,
) -> Result<RestoreTimingStats> {
    restore_timed_with_host_and_download_slots(
        client,
        output_path,
        txid,
        crate::LtxHost::default(),
        download_slots,
    )
    .await
}

/// Restores a database through an injected local filesystem and reports the
/// plan, download, and local apply times.
pub async fn restore_timed_with_host_and_download_slots<C: ReplicaClient>(
    client: &C,
    output_path: impl AsRef<Path>,
    txid: TXID,
    host: crate::LtxHost,
    download_slots: Arc<Semaphore>,
) -> Result<RestoreTimingStats> {
    let output_path = output_path.as_ref();
    ensure_restore_output_absent(&host, output_path)?;
    let plan_started = Instant::now();
    let infos = calc_restore_plan_with_slots(client, txid, download_slots.clone()).await?;
    let plan_us = plan_started.elapsed().as_micros() as u64;
    restore_from_plan_inner(client, output_path, infos, host, download_slots, plan_us).await
}

/// Restores a database from a plan which [`calc_restore_plan`] produced.
///
/// This path lets a caller reuse the exact plan that fixed an epoch seal. It
/// therefore avoids a second remote listing before it downloads the files.
pub async fn restore_from_plan_with_download_slots<C: ReplicaClient>(
    client: &C,
    output_path: impl AsRef<Path>,
    plan: Vec<FileInfo>,
    download_slots: Arc<Semaphore>,
) -> Result<RestoreTimingStats> {
    let output_path = output_path.as_ref();
    let host = crate::LtxHost::default();
    ensure_restore_output_absent(&host, output_path)?;
    restore_from_plan_inner(client, output_path, plan, host, download_slots, 0).await
}

fn ensure_restore_output_absent(host: &crate::LtxHost, output_path: &Path) -> Result<()> {
    // Ensure output path does not already exist (replica.go:591-595).
    match host.metadata(output_path) {
        Ok(_) => {
            return Err(Error::Other(
                format!(
                    "cannot restore, output path already exists: {}",
                    output_path.display()
                )
                .into(),
            ));
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.into()),
    }
    Ok(())
}

async fn restore_from_plan_inner<C: ReplicaClient>(
    client: &C,
    output_path: &Path,
    infos: Vec<FileInfo>,
    host: crate::LtxHost,
    download_slots: Arc<Semaphore>,
    plan_us: u64,
) -> Result<RestoreTimingStats> {
    // Validate the whole plan before starting I/O. An invalid later entry must
    // not cause a partial download burst before the restore fails.
    for info in &infos {
        if info.size < ltx::HEADER_SIZE as i64 {
            return Err(Error::Other(
                format!(
                    "invalid ltx file: level={} min={} max={} has size {} bytes (minimum {})",
                    info.level,
                    info.min_txid,
                    info.max_txid,
                    info.size,
                    ltx::HEADER_SIZE
                )
                .into(),
            ));
        }
    }

    let mut stats = RestorePlanStats {
        objects: infos.len(),
        bytes: infos.iter().map(|info| info.size.max(0) as u64).sum(),
        by_level: BTreeMap::new(),
    };
    for info in &infos {
        *stats.by_level.entry(info.level).or_insert(0) += 1;
    }

    // Files are independent reads. `buffered` overlaps them but yields them in
    // plan order, which preserves the compactor input contract. The shared
    // semaphore is the node-level ceiling across every concurrent restore.
    let download_started = Instant::now();
    let files: Vec<Vec<u8>> = stream::iter(infos)
        .map(|info| {
            let download_slots = download_slots.clone();
            async move {
                let _permit = download_slots
                    .acquire_owned()
                    .await
                    .expect("restore download semaphore closed");
                client
                    .open_ltx_file(info.level, info.min_txid, info.max_txid)
                    .await
                    .map_err(|e| Error::Other(format!("open ltx file: {e}").into()))
            }
        })
        .buffered(RESTORE_DOWNLOAD_CONCURRENCY)
        .try_collect()
        .await?;
    let download_us = download_started.elapsed().as_micros() as u64;

    if files.is_empty() {
        return Err(Error::Other("no matching backup files available".into()));
    }

    // Merge the files (compactor) and reconstruct the SQLite database image.
    let apply_started = Instant::now();
    let image = build_database_image(&files)?;

    // Create the parent directory if needed (replica.go:649-655).
    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            host.create_dir_all(parent)?;
        }
    }

    // Output to a temp file & atomically rename (replica.go:657-694).
    let tmp_output_path = append_ext(output_path, "tmp");
    write_file_atomic(&host, &tmp_output_path, output_path, &image)?;
    let apply_us = apply_started.elapsed().as_micros() as u64;

    Ok(RestoreTimingStats {
        plan: stats,
        plan_us,
        download_us,
        apply_us,
    })
}

/// Returns the ordered list of LTX files needed to restore the database at
/// `txid` (`TXID(0)` = latest).
///
/// Ported from `CalcRestorePlan` (replica.go:1419-1536). Anchors on the latest
/// snapshot at or before the target, then walks compaction levels
/// `SnapshotLevel-1 ..= 0` with per-level cursors, repeatedly choosing the file
/// that extends the longest contiguous TXID range. In the L0-only scope the
/// snapshot anchor lives at L0 (MinTXID==1) and the only cursor with files is
/// level 0, so the result is the contiguous chain `1..=N` (capped at `txid`).
pub async fn calc_restore_plan<C: ReplicaClient>(client: &C, txid: TXID) -> Result<Vec<FileInfo>> {
    calc_restore_plan_with_slots(
        client,
        txid,
        Arc::new(Semaphore::new(RESTORE_PLAN_CONCURRENCY)),
    )
    .await
}

/// Calculates a restore plan while a shared semaphore bounds remote listings.
pub async fn calc_restore_plan_with_slots<C: ReplicaClient>(
    client: &C,
    txid: TXID,
    request_slots: Arc<Semaphore>,
) -> Result<Vec<FileInfo>> {
    let mut infos: Vec<FileInfo> = Vec::new();

    // Every level is independent. List them together instead of paying ten
    // object-store round trips in series. The shared request slots keep a cold
    // cohort from multiplying this fan-out by its activation count.
    let levels: Vec<(i32, Vec<FileInfo>)> = stream::iter((0..=SNAPSHOT_LEVEL).rev())
        .map(|level| {
            let request_slots = request_slots.clone();
            async move {
                let _permit = request_slots
                    .acquire_owned()
                    .await
                    .expect("restore request semaphore closed");
                Ok::<_, Error>((level, client.ltx_files(level, TXID(0)).await?))
            }
        })
        .buffered(RESTORE_PLAN_CONCURRENCY)
        .try_collect()
        .await?;
    let mut levels = levels.into_iter().collect::<BTreeMap<_, _>>();

    // Start with the latest snapshot before the target TXID (replica.go:1430-1452).
    let snapshot_files = levels.remove(&SNAPSHOT_LEVEL).unwrap_or_default();
    let mut snapshot: Option<FileInfo> = None;
    for info in snapshot_files {
        if txid != TXID(0) && info.max_txid > txid {
            continue;
        }
        snapshot = Some(info);
    }
    if let Some(s) = snapshot {
        infos.push(s);
    }

    // Collect candidates across all compaction levels and pick the next file
    // from any level that extends the longest contiguous TXID range
    // (replica.go:1454-1515).
    let max_level = SNAPSHOT_LEVEL - 1;
    let start_txid = slice_max_txid(&infos);
    let mut current_max = start_txid;
    if txid != TXID(0) && current_max >= txid {
        return Ok(infos);
    }

    // Build a cursor per level, highest level first (replica.go:1463-1473).
    let mut cursors: Vec<RestoreLevelCursor> = Vec::with_capacity((max_level + 1) as usize);
    for level in (0..=max_level).rev() {
        let files = levels.remove(&level).unwrap_or_default();
        cursors.push(RestoreLevelCursor::new(files));
    }

    loop {
        // Choose the best candidate across all level cursors (replica.go:1483-1494).
        let mut next_idx: Option<usize> = None;
        for i in 0..cursors.len() {
            cursors[i].refresh(current_max, txid);
            if cursors[i].candidate.is_none() {
                continue;
            }
            match next_idx {
                None => next_idx = Some(i),
                Some(ni) => {
                    let cand = cursors[i].candidate.as_ref().unwrap();
                    let best = cursors[ni].candidate.as_ref().unwrap();
                    if restore_candidate_better(best, cand) {
                        next_idx = Some(i);
                    }
                }
            }
        }

        let ni = match next_idx {
            Some(ni) => ni,
            None => break,
        };

        // Take the chosen candidate (replica.go:1500-1510).
        let cand = cursors[ni].candidate.take().unwrap();
        if cand.max_txid <= current_max {
            continue;
        }
        current_max = cand.max_txid;
        infos.push(cand);

        if txid != TXID(0) && current_max >= txid {
            break;
        }
    }

    // For a latest/most-recent restore, verify the tail is contiguous
    // (replica.go:1517-1526).
    if !infos.is_empty() && txid == TXID(0) {
        for cursor in cursors.iter_mut() {
            cursor.ensure_current();
            if let Some(cur) = &cursor.current {
                if cur.min_txid.0 > current_max.0 + 1 {
                    return Err(Error::Other(
                        format!(
                            "non-contiguous ltx files: have up to {} but next file starts at {}",
                            current_max, cur.min_txid
                        )
                        .into(),
                    ));
                }
            }
        }
    }

    if infos.is_empty() {
        return Err(Error::TxNotAvailable);
    }
    if txid != TXID(0) && slice_max_txid(&infos) < txid {
        return Err(Error::TxNotAvailable);
    }

    Ok(infos)
}

/// A single level's streaming view during restore planning.
///
/// Ported from `restoreLevelCursor` (replica.go:1538-1603). The Go version
/// streams from a `FileIterator`; here the client already returns a sorted
/// `Vec<FileInfo>`, so the "iterator" is the slice plus a read index.
struct RestoreLevelCursor {
    /// Files for this level, sorted ascending (the `LTXFiles` contract).
    files: Vec<FileInfo>,
    /// Read index into `files` (the iterator cursor).
    idx: usize,
    /// Last item read but not yet evaluated (`current`, replica.go:1542).
    current: Option<FileInfo>,
    /// Best eligible file at this level for the current `current_max`
    /// (`candidate`, replica.go:1544).
    candidate: Option<FileInfo>,
    /// True once the iterator is exhausted (`done`, replica.go:1546).
    done: bool,
}

impl RestoreLevelCursor {
    fn new(files: Vec<FileInfo>) -> Self {
        RestoreLevelCursor {
            files,
            idx: 0,
            current: None,
            candidate: None,
            done: false,
        }
    }

    /// Advances the iterator while files could be contiguous with `current_max`,
    /// keeping the best eligible candidate. Ported from `refresh`
    /// (replica.go:1549-1587).
    fn refresh(&mut self, current_max: TXID, txid: TXID) {
        if self.done {
            return;
        }
        if let Some(c) = &self.candidate {
            if c.max_txid <= current_max {
                self.candidate = None;
            }
        }

        loop {
            self.ensure_current();
            if self.done {
                return;
            }

            let info = self.current.clone().unwrap();
            if info.min_txid.0 > current_max.0 + 1 {
                return;
            }
            self.current = None;

            if info.max_txid <= current_max {
                continue;
            }
            if txid != TXID(0) && info.max_txid > txid {
                continue;
            }

            match &self.candidate {
                None => self.candidate = Some(info),
                Some(c) => {
                    if restore_candidate_better(c, &info) {
                        self.candidate = Some(info);
                    }
                }
            }
        }
    }

    /// Populates `current` with the next item, or marks `done`. Ported from
    /// `ensureCurrent` (replica.go:1589-1603).
    fn ensure_current(&mut self) {
        if self.done || self.current.is_some() {
            return;
        }
        if self.idx >= self.files.len() {
            self.done = true;
            return;
        }
        self.current = Some(self.files[self.idx].clone());
        self.idx += 1;
    }
}

/// True if `next` is a strictly better restore candidate than `curr`: longer
/// reach first (`MaxTXID`), then a smaller `MinTXID` (more coverage), then a
/// higher level (more compacted), then an earlier `created_at`.
///
/// Ported from `restoreCandidateBetter` (replica.go:1605-1616).
fn restore_candidate_better(curr: &FileInfo, next: &FileInfo) -> bool {
    if next.max_txid != curr.max_txid {
        return next.max_txid > curr.max_txid;
    }
    if next.min_txid != curr.min_txid {
        return next.min_txid < curr.min_txid;
    }
    if next.level != curr.level {
        return next.level > curr.level;
    }
    // CreatedAt.Before(curr): an unknown (None) timestamp is treated as not
    // earlier, matching Go's zero-time comparison being false here.
    match (next.created_at, curr.created_at) {
        (Some(n), Some(c)) => n < c,
        _ => false,
    }
}

/// Maximum `max_txid` across a slice, `TXID(0)` if empty. Mirrors
/// `FileInfoSlice.MaxTXID` (ltx.go:612-619); the slice here is already in plan
/// (ascending) order, but we scan defensively rather than assume.
fn slice_max_txid(infos: &[FileInfo]) -> TXID {
    infos.iter().map(|f| f.max_txid).max().unwrap_or(TXID(0))
}

/// Merges the LTX `files` (a snapshot followed by incrementals, in plan order)
/// and reconstructs the full SQLite database image.
///
/// This replaces Go's `ltx.NewCompactor(pw, rdrs)` + `Decoder.DecodeDatabaseTo`
/// (replica.go:667-682). The compactor's contract (ltx@v0.5.1 compactor.go):
///   * page sizes must match across inputs;
///   * the **last** input's `Commit` is the final database size;
///   * for each page number, the **latest** input that carries it wins
///     (compactor.go:198-228 iterates inputs newest-first);
///   * pages numbered beyond the final `Commit` are dropped (truncation).
///
/// `DecodeDatabaseTo` then writes pages `1..=Commit`, zero-filling the lock page
/// (decoder.go:236-254). Every input is fully decoded and checksum-verified, so
/// a corrupt download is caught here.
fn build_database_image(files: &[Vec<u8>]) -> Result<Vec<u8>> {
    let mut page_size = None;
    let mut commit = None;
    let mut merged: HashMap<u32, Vec<u8>> = HashMap::new();

    for data in files {
        let (decoded, pages) = ltx::decode_file_with_pages(data)?;
        let header = decoded.header;
        if let Some(expected) = page_size {
            if header.page_size != expected {
                return Err(Error::Other(
                    format!(
                        "input files have mismatched page sizes: {} != {}",
                        expected, header.page_size
                    )
                    .into(),
                ));
            }
        } else {
            page_size = Some(header.page_size);
        }
        let previous_commit = commit.unwrap_or(0);
        if header.commit > previous_commit {
            let present: HashSet<u32> = pages.iter().map(|(pgno, _)| *pgno).collect();
            let lock = ltx::lock_pgno(header.page_size);
            for pgno in (previous_commit + 1)..=header.commit {
                if pgno != lock && !present.contains(&pgno) && !merged.contains_key(&pgno) {
                    return Err(Error::Other(
                        format!(
                            "missing newly committed page {pgno} in LTX transaction {} (database grew from {previous_commit} to {} pages)",
                            header.max_txid, header.commit,
                        )
                        .into(),
                    ));
                }
            }
        }

        // Inputs arrive oldest to newest, so moving each page into the map makes
        // the latest input win without a second staging collection or clone.
        for (pgno, data) in pages {
            merged.insert(pgno, data);
        }
        commit = Some(header.commit);
    }

    let (Some(page_size), Some(commit)) = (page_size, commit) else {
        return Err(Error::Other(
            "cannot build a database from no LTX files".into(),
        ));
    };
    merged.retain(|pgno, _| *pgno <= commit);

    let page_size_usize = page_size as usize;
    let lock = ltx::lock_pgno(page_size);

    // Reconstruct the database image: pages 1..=commit, lock page zero-filled
    // (decoder.go:236-254). A non-lock page missing from the merge means the
    // backup chain is incomplete.
    let mut image = Vec::with_capacity(commit as usize * page_size_usize);
    let zero_page = vec![0u8; page_size_usize];
    for pgno in 1..=commit {
        if pgno == lock {
            image.extend_from_slice(&zero_page);
            continue;
        }
        match merged.get(&pgno) {
            Some(data) => image.extend_from_slice(data),
            None => {
                return Err(Error::Other(
                    format!("missing page {pgno} in restore plan (incomplete backup)").into(),
                ));
            }
        }
    }

    Ok(image)
}

/// Appends `ext` to `path` as a literal suffix (`p` → `p.tmp`), the way Go's
/// `opt.OutputPath + ".tmp"` does (NOT `Path::set_extension`, which would replace
/// an existing extension).
fn append_ext(path: &Path, ext: &str) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(".");
    s.push(ext);
    PathBuf::from(s)
}

/// Writes `data` to `tmp_path`, fsyncs, then renames onto `final_path` — the
/// crash-consistent atomic-write idiom (replica.go:661-694). On any failure the
/// temp file is removed.
fn write_file_atomic(
    host: &crate::LtxHost,
    tmp_path: &Path,
    final_path: &Path,
    data: &[u8],
) -> Result<()> {
    let result = (|| -> Result<()> {
        let mut file = host.create(tmp_path)?;
        file.write_all(data)?;
        file.sync_all()?;
        drop(file);
        host.rename(tmp_path, final_path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = host.remove_file(tmp_path);
    }
    result
}

#[doc(hidden)]
pub mod internal {
    use super::*;

    pub const RESTORE_PLAN_CONCURRENCY: usize = super::RESTORE_PLAN_CONCURRENCY;

    pub async fn upload_ltx_file<C: ReplicaClient>(
        replica: &mut Replica<C>,
        level: i32,
        min_txid: TXID,
        max_txid: TXID,
    ) -> Result<()> {
        replica.upload_ltx_file(level, min_txid, max_txid).await
    }

    pub fn build_database_image(files: &[Vec<u8>]) -> Result<Vec<u8>> {
        super::build_database_image(files)
    }

    pub fn pos_untrustworthy(error: &Error) -> bool {
        super::pos_untrustworthy(error)
    }
}
