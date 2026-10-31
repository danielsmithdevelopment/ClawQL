//! client — the `ReplicaClient` trait.
//!
//! Ported from litestream@v0.5.11 `replica_client.go`. The trait is the storage
//! abstraction that every backend implements.
//!
//! # Buffered I/O
//! Go's `ReplicaClient` uses `io.Reader`/`io.ReadCloser`. We take/return owned
//! byte buffers (`&[u8]` / `Vec<u8>`) instead. L0 files are bounded in size;
//! large snapshots remain buffered.

use crate::error::Result;
use crate::ltx::FileInfo;
use crate::TXID;
use async_trait::async_trait;

pub mod bundle;
pub mod file;
pub mod object_store;

/// Client for reading and writing LTX files on a replica backend.
///
/// Ported from the `ReplicaClient` interface (replica_client.go:19-51). Methods
/// take a compaction `level` (0 = L0, the only level in the one-shot scope).
#[async_trait]
pub trait ReplicaClient: Send + Sync {
    /// Returns all LTX files for `level`, sorted ascending by `min_txid`, that
    /// start at or after `seek`.
    async fn ltx_files(&self, level: i32, seek: TXID) -> Result<Vec<FileInfo>>;

    /// Returns at most `limit` LTX files at or after `seek`.
    ///
    /// Remote clients can stop their object listing after they collect the
    /// requested prefix. The default keeps compatibility with local and custom
    /// clients.
    async fn ltx_files_bounded(
        &self,
        level: i32,
        seek: TXID,
        limit: usize,
    ) -> Result<Vec<FileInfo>> {
        let mut files = self.ltx_files(level, seek).await?;
        files.truncate(limit);
        Ok(files)
    }

    /// Reads an LTX file. Returns an `io::ErrorKind::NotFound` error (wrapped)
    /// if the file does not exist.
    async fn open_ltx_file(&self, level: i32, min_txid: TXID, max_txid: TXID) -> Result<Vec<u8>>;

    /// Writes an LTX file to the replica and returns its metadata.
    async fn write_ltx_file(
        &self,
        level: i32,
        min_txid: TXID,
        max_txid: TXID,
        data: &[u8],
    ) -> Result<FileInfo>;

    /// Deletes the given LTX files.
    async fn delete_ltx_files(&self, files: &[FileInfo]) -> Result<()>;

    /// Deletes all files on the replica.
    async fn delete_all(&self) -> Result<()>;
}
