//! A [`ReplicaClient`] overlay that makes bundle-resident L0 segments
//! visible beside a real per-cell client.
//!
//! celld-original, not a Litestream port, and self-contained like
//! `crate::bundle`: nothing else in this crate depends on it. The overlay
//! is how the additive compactor drains bundles — it lists and opens
//! bundle rows as if they were ordinary per-cell L0 files (the bytes ARE
//! ordinary L0 bytes, verbatim), and its writes pass through to the inner
//! client, so compaction output is pure per-cell layout. The host supplies
//! a [`BundleFetcher`] that knows where this cell-epoch's un-drained rows
//! live and how to read them; with no fetcher the overlay is the inner
//! client, exactly.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use async_trait::async_trait;

use crate::bundle::BundleRow;
use crate::client::ReplicaClient;
use crate::error::Result;
use crate::ltx::FileInfo;
use crate::TXID;

/// A bundle row plus the opaque source (for celld: the bundle object key)
/// it can be fetched from.
#[derive(Clone, Debug)]
pub struct LocatedRow {
    pub source: String,
    pub row: BundleRow,
}

/// Where this cell-epoch's un-drained bundle rows live. Object-safe by
/// boxed futures, because hosts hold it behind `Arc<dyn _>`.
pub trait BundleFetcher: Send + Sync {
    /// The rows for this client's cell-epoch, any order, duplicates
    /// allowed (the overlay dedupes by TXID).
    fn rows<'a>(&'a self) -> Pin<Box<dyn Future<Output = Result<Vec<LocatedRow>>> + Send + 'a>>;
    /// One row's verbatim L0 bytes.
    fn fetch<'a>(
        &'a self,
        located: &'a LocatedRow,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<u8>>> + Send + 'a>>;
}

pub struct BundleOverlayClient<C: ReplicaClient> {
    inner: C,
    fetcher: Option<Arc<dyn BundleFetcher>>,
}

impl<C: ReplicaClient> BundleOverlayClient<C> {
    pub fn new(inner: C, fetcher: Option<Arc<dyn BundleFetcher>>) -> Self {
        Self { inner, fetcher }
    }

    async fn overlay_rows(&self) -> Result<Vec<LocatedRow>> {
        match &self.fetcher {
            Some(fetcher) => fetcher.rows().await,
            None => Ok(Vec::new()),
        }
    }
}

#[async_trait]
impl<C: ReplicaClient> ReplicaClient for BundleOverlayClient<C> {
    async fn ltx_files(&self, level: i32, seek: TXID) -> Result<Vec<FileInfo>> {
        let mut files = self.inner.ltx_files(level, seek).await?;
        if level == 0 {
            for located in self.overlay_rows().await? {
                let txid = located.row.txid();
                if txid < seek || files.iter().any(|f| f.min_txid == txid) {
                    continue;
                }
                files.push(FileInfo {
                    level: 0,
                    min_txid: txid,
                    max_txid: txid,
                    pre_apply_checksum: Default::default(),
                    post_apply_checksum: Default::default(),
                    size: located.row.len as i64,
                    created_at: None,
                });
            }
            files.sort_by_key(|f| f.min_txid);
            files.dedup_by_key(|f| f.min_txid);
        }
        Ok(files)
    }

    async fn open_ltx_file(&self, level: i32, min_txid: TXID, max_txid: TXID) -> Result<Vec<u8>> {
        // The drained per-cell copy is byte-identical when it exists, so
        // try the inner client first and fall back to the bundle.
        match self.inner.open_ltx_file(level, min_txid, max_txid).await {
            Ok(bytes) => Ok(bytes),
            Err(inner_error) => {
                if level == 0 && min_txid == max_txid {
                    for located in self.overlay_rows().await? {
                        if located.row.txid() == min_txid {
                            if let Some(fetcher) = &self.fetcher {
                                return fetcher.fetch(&located).await;
                            }
                        }
                    }
                }
                Err(inner_error)
            }
        }
    }

    async fn write_ltx_file(
        &self,
        level: i32,
        min_txid: TXID,
        max_txid: TXID,
        data: &[u8],
    ) -> Result<FileInfo> {
        self.inner
            .write_ltx_file(level, min_txid, max_txid, data)
            .await
    }

    async fn delete_ltx_files(&self, files: &[FileInfo]) -> Result<()> {
        // Bundle rows cannot be carved out of their object; deleting the
        // per-cell twins (when present) is the inner client's business, and
        // a row-only "file" simply has nothing to delete.
        self.inner.delete_ltx_files(files).await
    }

    async fn delete_all(&self) -> Result<()> {
        self.inner.delete_all().await
    }
}
