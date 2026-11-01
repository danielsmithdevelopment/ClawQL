// The stand-alone file replica is an external ReplicaClient backend. Celld
// production uses the injected local node filesystem and an object client.
#![allow(clippy::disallowed_methods)]

//! client::file — file-backed `ReplicaClient`.
//!
//! Ported from litestream@v0.5.11 `file/replica_client.go` (the v0.5 methods
//! only; the `*V3` legacy generation shim is not included). On-disk
//! layout matches upstream: `<root>/ltx/<level>/<minTXID>-<maxTXID>.ltx`, the
//! same tree the golden fixtures were captured from.

use crate::error::{Error, Result};
use crate::ltx::{self, FileInfo};
use crate::{ltx_file_path, ltx_level_dir, TXID};
use async_trait::async_trait;
use std::time::{Duration, UNIX_EPOCH};

use super::ReplicaClient;

/// A `ReplicaClient` that stores LTX files on the local filesystem.
#[derive(Debug, Clone)]
pub struct FileReplicaClient {
    path: String,
}

impl FileReplicaClient {
    /// Creates a client rooted at `path` (the replica destination directory).
    pub fn new(path: impl Into<String>) -> Self {
        FileReplicaClient { path: path.into() }
    }
}

#[async_trait]
impl ReplicaClient for FileReplicaClient {
    async fn ltx_files(&self, level: i32, seek: TXID) -> Result<Vec<FileInfo>> {
        let dir = ltx_level_dir(&self.path, level as u32);
        let mut rd = match tokio::fs::read_dir(&dir).await {
            Ok(rd) => rd,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e.into()),
        };

        let mut infos = Vec::new();
        while let Some(entry) = rd.next_entry().await? {
            let name = entry.file_name().to_string_lossy().into_owned();
            // ModTime is the timestamp set at write time; skip non-LTX names.
            let (min_txid, max_txid) = match ltx::parse_filename(&name) {
                Ok(t) => t,
                Err(_) => continue,
            };
            if min_txid < seek {
                continue;
            }
            let meta = entry.metadata().await?;
            infos.push(FileInfo {
                level,
                min_txid,
                max_txid,
                size: meta.len() as i64,
                created_at: meta.modified().ok(),
                ..Default::default()
            });
        }

        // Iterator contract: ascending by (level, min_txid, max_txid)
        // (ltx.NewFileInfoSliceIterator sorts the slice).
        infos.sort_by(|a, b| {
            (a.level, a.min_txid.0, a.max_txid.0).cmp(&(b.level, b.min_txid.0, b.max_txid.0))
        });
        Ok(infos)
    }

    async fn open_ltx_file(&self, level: i32, min_txid: TXID, max_txid: TXID) -> Result<Vec<u8>> {
        let path = ltx_file_path(&self.path, level as u32, min_txid, max_txid);
        // NotFound is preserved so callers can classify auto-recoverable errors.
        tokio::fs::read(&path).await.map_err(Error::Io)
    }

    async fn write_ltx_file(
        &self,
        level: i32,
        min_txid: TXID,
        max_txid: TXID,
        data: &[u8],
    ) -> Result<FileInfo> {
        // Peek the LTX header timestamp (preserved as the file's creation time).
        let header = ltx::Header::parse(data)?;
        let created_at = Some(UNIX_EPOCH + Duration::from_millis(header.timestamp.max(0) as u64));

        let filename = ltx_file_path(&self.path, level as u32, min_txid, max_txid);
        let dir = ltx_level_dir(&self.path, level as u32);
        tokio::fs::create_dir_all(&dir).await?;

        // Write to a temp file then atomically rename; clean the temp on error.
        let tmp = format!("{filename}.tmp");
        if let Err(e) = write_then_rename(&tmp, &filename, data).await {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(e);
        }

        Ok(FileInfo {
            level,
            min_txid,
            max_txid,
            size: data.len() as i64,
            created_at,
            ..Default::default()
        })
    }

    async fn read_range(
        &self,
        level: i32,
        min: TXID,
        max: TXID,
        offset: u64,
        len: u64,
    ) -> Result<Vec<u8>> {
        use tokio::io::{AsyncReadExt, AsyncSeekExt};
        let mut file =
            tokio::fs::File::open(ltx_file_path(&self.path, level as u32, min, max)).await?;
        file.seek(std::io::SeekFrom::Start(offset)).await?;
        let mut bytes = Vec::new();
        file.take(len).read_to_end(&mut bytes).await?;
        Ok(bytes)
    }

    async fn write_ltx_file_from_file(
        &self,
        level: i32,
        min_txid: TXID,
        max_txid: TXID,
        file: crate::host::HostFile,
        host: crate::LtxHost,
    ) -> Result<FileInfo> {
        use tokio::io::AsyncWriteExt;
        let (mut file, first, size) = super::read_upload_chunk(file, &host, 0, 1 << 20).await?;
        let header = ltx::Header::parse(&first)?;
        let filename = ltx_file_path(&self.path, level as u32, min_txid, max_txid);
        tokio::fs::create_dir_all(ltx_level_dir(&self.path, level as u32)).await?;
        // The named temporary file owns cleanup on errors and cancellation.
        let temporary = tempfile::NamedTempFile::new_in(ltx_level_dir(&self.path, level as u32))?;
        let mut output = tokio::fs::File::from_std(temporary.reopen()?);
        output.write_all(&first).await?;
        let mut offset = first.len() as u64;
        drop(first);
        while offset < size {
            let (next_file, bytes, _) =
                super::read_upload_chunk(file, &host, offset, 1 << 20).await?;
            file = next_file;
            output.write_all(&bytes).await?;
            offset += bytes.len() as u64;
        }
        output.sync_all().await?;
        drop(output);
        temporary
            .persist(&filename)
            .map_err(|error| Error::Io(error.error))?;
        Ok(FileInfo {
            level,
            min_txid,
            max_txid,
            size: size as i64,
            created_at: Some(UNIX_EPOCH + Duration::from_millis(header.timestamp.max(0) as u64)),
            ..Default::default()
        })
    }

    async fn delete_ltx_files(&self, files: &[FileInfo]) -> Result<()> {
        for info in files {
            let path = ltx_file_path(&self.path, info.level as u32, info.min_txid, info.max_txid);
            match tokio::fs::remove_file(&path).await {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.into()),
            }
        }
        Ok(())
    }

    async fn delete_all(&self) -> Result<()> {
        match tokio::fs::remove_dir_all(&self.path).await {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}

/// Writes `data` to `tmp`, fsyncs it, and renames it onto `final_path`.
async fn write_then_rename(tmp: &str, final_path: &str, data: &[u8]) -> Result<()> {
    use tokio::io::AsyncWriteExt;
    let mut f = tokio::fs::File::create(tmp).await?;
    f.write_all(data).await?;
    f.sync_all().await?;
    drop(f);
    tokio::fs::rename(tmp, final_path).await?;
    Ok(())
}
