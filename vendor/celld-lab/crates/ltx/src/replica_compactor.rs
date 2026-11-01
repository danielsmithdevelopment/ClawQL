//! Additive LTX compaction through a [`ReplicaClient`].
//!
//! This module ports the storage-independent part of Litestream v0.5.16's
//! `Compactor`. It creates a destination object but never deletes a source.

use crate::client::ReplicaClient;
use crate::compaction_level::SNAPSHOT_LEVEL;
use crate::compactor::Compactor;
use crate::error::{Error, Result};
use crate::ltx::{FileInfo, HEADER_FLAG_NO_CHECKSUM};
use crate::ltx_file_path;
use crate::LtxHost;
use crate::TXID;
use std::io::{BufReader, BufWriter, Cursor, Read, Write};
use std::path::Path;
use std::path::PathBuf;

/// The immutable object and source volume from one compaction attempt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompactionOutput {
    /// The published destination object.
    pub info: FileInfo,
    /// The number of source objects in the merge.
    pub input_files: usize,
    /// The sum of the source object sizes.
    pub input_bytes: u64,
    /// The number of source objects read from the local LTX directory.
    pub local_input_files: usize,
}

/// Destination coverage proved by the same attempt that selects its output.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompactionResult {
    pub covered_txid: TXID,
    pub output: Option<CompactionOutput>,
}

/// Compacts LTX objects between two adjacent replica levels.
pub struct ReplicaCompactor<'a, C> {
    client: &'a C,
    verify: bool,
    max_files: usize,
    max_input_bytes: u64,
    /// The epoch's first txid. An epoch that continues a chain it paged in
    /// starts at its cut, not at 1, so an empty destination level continues
    /// from here rather than from the first txid that never existed here.
    base: TXID,
    local_path: Option<PathBuf>,
    host: LtxHost,
}

impl<'a, C: ReplicaClient> ReplicaCompactor<'a, C> {
    pub fn new(client: &'a C) -> Self {
        Self {
            client,
            verify: false,
            max_files: usize::MAX,
            max_input_bytes: u64::MAX,
            base: TXID(1),
            local_path: None,
            host: LtxHost::default(),
        }
    }

    /// The txid the epoch's chain starts at (see the `base` field).
    pub fn with_base(mut self, base: TXID) -> Self {
        self.base = base;
        self
    }

    /// Checks destination continuity again after publication. Every attempt
    /// checks the existing destination before it selects a source.
    pub fn with_verification(mut self, verify: bool) -> Self {
        self.verify = verify;
        self
    }

    /// Limits the source count and buffered input bytes. An indivisible source
    /// above the byte budget compacts alone through scratch files.
    pub fn with_limits(mut self, max_files: usize, max_input_bytes: u64) -> Self {
        self.max_files = max_files;
        self.max_input_bytes = max_input_bytes;
        self
    }

    /// Uses the local LTX directory before it reads an object from the replica.
    pub fn with_local_path(mut self, path: impl AsRef<Path>) -> Self {
        self.local_path = Some(path.as_ref().to_path_buf());
        self
    }

    /// Uses an injected clock and executor host.
    pub fn with_host(mut self, host: LtxHost) -> Self {
        self.host = host;
        self
    }

    /// Compacts one new object prefix from `destination_level - 1`.
    ///
    /// The method returns `Ok(None)` when the destination already covers every
    /// available source object. It publishes one immutable destination object
    /// and leaves every source object intact.
    pub async fn compact(&self, destination_level: i32) -> Result<Option<CompactionOutput>> {
        Ok(self.compact_with_progress(destination_level).await?.output)
    }

    /// Returns the proved destination bound even when no source is available.
    /// An empty listing does not prove coverage of a concurrently durable tail.
    pub async fn compact_with_progress(&self, destination_level: i32) -> Result<CompactionResult> {
        if !(1..SNAPSHOT_LEVEL).contains(&destination_level) {
            return Err(invalid("the destination compaction level is invalid"));
        }
        if self.max_files == 0 || self.max_input_bytes == 0 {
            return Err(invalid("the compaction limits must be positive"));
        }

        let destination = self.client.ltx_files(destination_level, TXID(0)).await?;
        self.verify_files(&destination)?;
        let previous_max = destination
            .iter()
            .map(|file| file.max_txid)
            .max()
            .unwrap_or(TXID(0));
        let Some(next) = previous_max.0.checked_add(1) else {
            return Ok(CompactionResult {
                covered_txid: previous_max,
                output: None,
            });
        };
        let seek = TXID(next.max(self.base.0));
        let source_level = destination_level - 1;
        let mut available = self
            .client
            .ltx_files_bounded(source_level, seek, self.max_files)
            .await?;
        // The listing offset compares minimum txids. A direct drain can start
        // before `seek` and still contain the only copy of its uncovered tail.
        // Keep the bounded listing for ordinary rows, but search behind the
        // offset before reporting a gap or no work.
        if available.first().is_none_or(|file| file.min_txid != seek) {
            available = self.client.ltx_files(source_level, TXID(0)).await?;
        }
        available.sort_by_key(|file| (file.min_txid, std::cmp::Reverse(file.max_txid)));
        let mut source = Vec::new();
        let mut input_bytes = 0u64;
        let mut next = seek;
        for file in available {
            if file.max_txid < next {
                continue;
            }
            if file.min_txid > next {
                if source.is_empty() {
                    return Err(invalid(
                        "the compaction source does not continue the destination level",
                    ));
                }
                break;
            }
            let size = u64::try_from(file.size)
                .map_err(|_| invalid("a compaction source has a negative size"))?;
            if source.len() == self.max_files {
                break;
            }
            let total = input_bytes
                .checked_add(size)
                .ok_or_else(|| invalid("the compaction source size overflows"))?;
            if total > self.max_input_bytes {
                if source.is_empty() {
                    let output = self
                        .compact_large_source(destination_level, seek, file)
                        .await?;
                    return Ok(CompactionResult {
                        covered_txid: output.info.max_txid,
                        output: Some(output),
                    });
                }
                break;
            }
            input_bytes = total;
            let reaches_end = file.max_txid == TXID(u64::MAX);
            next = TXID(file.max_txid.0.saturating_add(1));
            source.push(file);
            if reaches_end {
                break;
            }
        }
        if source.is_empty() {
            return Ok(CompactionResult {
                covered_txid: previous_max,
                output: None,
            });
        }

        let min_txid = seek;
        let max_txid = source
            .iter()
            .map(|file| file.max_txid)
            .max()
            .ok_or_else(|| invalid("the compaction source is empty"))?;
        let ranges: Vec<_> = source
            .iter()
            .map(|file| (file.min_txid, file.max_txid))
            .collect();
        let mut readers = Vec::with_capacity(source.len());
        let mut local_input_files = 0usize;
        for file in &source {
            let bytes = match &self.local_path {
                Some(path) => {
                    let filename = ltx_file_path(
                        &path.to_string_lossy(),
                        file.level as u32,
                        file.min_txid,
                        file.max_txid,
                    );
                    match self.host.read_file(filename).await {
                        Ok(bytes) => {
                            local_input_files += 1;
                            bytes
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                            self.client
                                .open_ltx_file(file.level, file.min_txid, file.max_txid)
                                .await?
                        }
                        Err(error) => return Err(Error::Io(error)),
                    }
                }
                None => {
                    self.client
                        .open_ltx_file(file.level, file.min_txid, file.max_txid)
                        .await?
                }
            };
            readers.push(Cursor::new(bytes));
        }

        // The merge is pure CPU over as much as 64 MiB and must not hold a
        // runtime worker: a restart drain runs rounds back-to-back, and on a
        // 4-vCPU node two pegged workers starved co-owned cells' durable
        // writes (2026-08-12 fleet roll).
        let (header, output) = self
            .host
            .run_blocking(move || {
                let mut compactor = Compactor::new(Vec::new(), readers);
                compactor.header_flags = HEADER_FLAG_NO_CHECKSUM;
                compactor.compact_from(min_txid, &ranges)?;
                Ok::<_, Error>((compactor.header(), compactor.into_writer()))
            })
            .await
            .map_err(|_| invalid("the compaction merge task panicked"))??;
        if header.min_txid != min_txid || header.max_txid != max_txid {
            return Err(invalid(
                "a compaction source key does not match its LTX header",
            ));
        }
        let info = self
            .client
            .write_ltx_file(destination_level, min_txid, max_txid, &output)
            .await?;

        if self.verify {
            self.verify_level(destination_level).await?;
        }
        Ok(CompactionResult {
            covered_txid: info.max_txid,
            output: Some(CompactionOutput {
                info,
                input_files: source.len(),
                input_bytes,
                local_input_files,
            }),
        })
    }

    // A direct drain can produce one object larger than the entire input
    // budget. Deferring it forever stalls the level; buffering it defeats the
    // node's memory limit. Spool remote bytes and the output to anonymous files
    // and merge one page at a time. The codec retains only its page index.
    async fn compact_large_source(
        &self,
        destination_level: i32,
        min: TXID,
        source: FileInfo,
    ) -> Result<CompactionOutput> {
        let host = self.host.clone();
        let local = self.local_path.as_ref().map(|path| {
            PathBuf::from(ltx_file_path(
                &path.to_string_lossy(),
                source.level as u32,
                source.min_txid,
                source.max_txid,
            ))
        });
        let (mut input, local_input_files) = self
            .host
            .run_blocking(move || match local {
                Some(path) => match host.open(&path) {
                    Ok(file) => Ok((Some(file), 1)),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok((None, 0)),
                    Err(error) => Err(error),
                },
                None => Ok((None, 0)),
            })
            .await
            .map_err(|_| invalid("the compaction file task panicked"))??;
        if input.is_none() {
            let mut scratch = self.scratch_file().await?;
            let mut offset = 0;
            while offset < source.size as u64 {
                let len = (source.size as u64 - offset).min(1 << 20);
                let bytes = self
                    .client
                    .read_range(source.level, source.min_txid, source.max_txid, offset, len)
                    .await?;
                if bytes.len() as u64 != len {
                    return Err(invalid("a compaction source range is short"));
                }
                scratch = self
                    .host
                    .run_blocking(move || {
                        scratch.write_all(&bytes)?;
                        Ok::<_, Error>(scratch)
                    })
                    .await
                    .map_err(|_| invalid("the compaction file task panicked"))??;
                offset += len;
            }
            input = Some(scratch);
        }
        let input = input.ok_or_else(|| invalid("the compaction source is empty"))?;
        let output = self.scratch_file().await?;
        let expected = (source.min_txid, source.max_txid);
        let output = self
            .host
            .run_blocking(move || {
                let reader = ScratchReader::new(input)?;
                if reader.len != source.size as u64 {
                    return Err(invalid("a compaction source size changed"));
                }
                // Buffered adapters avoid a syscall for every codec field.
                let mut compactor = Compactor::new(
                    BufWriter::new(ScratchWriter(output)),
                    vec![BufReader::new(reader)],
                );
                compactor.header_flags = HEADER_FLAG_NO_CHECKSUM;
                compactor.compact_from(min, &[expected])?;
                let output = compactor
                    .into_writer()
                    .into_inner()
                    .map_err(|error| Error::Io(error.into_error()))?;
                Ok::<_, Error>(output.0)
            })
            .await
            .map_err(|_| invalid("the compaction merge task panicked"))??;
        let info = self
            .client
            .write_ltx_file_from_file(
                destination_level,
                min,
                source.max_txid,
                output,
                self.host.clone(),
            )
            .await?;
        if self.verify {
            self.verify_level(destination_level).await?;
        }
        Ok(CompactionOutput {
            info,
            input_files: 1,
            input_bytes: source.size as u64,
            local_input_files,
        })
    }

    async fn scratch_file(&self) -> Result<crate::host::HostFile> {
        let filesystem = self.host.filesystem();
        let directory = self.local_path.clone();
        self.host
            .run_blocking(move || filesystem.temporary_file(directory.as_deref()))
            .await
            .map_err(|_| invalid("the compaction file task panicked"))?
            .map_err(Error::Io)
    }

    /// Verifies that a destination level has neither gaps nor overlaps.
    pub async fn verify_level(&self, level: i32) -> Result<()> {
        let files = self.client.ltx_files(level, TXID(0)).await?;
        self.verify_files(&files)
    }

    fn verify_files(&self, files: &[FileInfo]) -> Result<()> {
        if files.first().is_some_and(|file| file.min_txid != self.base)
            || files.iter().any(|file| file.min_txid > file.max_txid)
        {
            return Err(invalid("the compaction level is not contiguous"));
        }
        for pair in files.windows(2) {
            if pair[0].max_txid.0.checked_add(1) != Some(pair[1].min_txid.0) {
                return Err(invalid("the compaction level is not contiguous"));
            }
        }
        Ok(())
    }
}

fn invalid(message: &'static str) -> Error {
    Error::Other(message.into())
}

struct ScratchReader {
    file: crate::host::HostFile,
    offset: u64,
    len: u64,
}

impl ScratchReader {
    fn new(mut file: crate::host::HostFile) -> std::io::Result<Self> {
        let len = file.file_len()?;
        Ok(Self {
            file,
            offset: 0,
            len,
        })
    }
}

impl Read for ScratchReader {
    fn read(&mut self, bytes: &mut [u8]) -> std::io::Result<usize> {
        let len = (self.len - self.offset).min(bytes.len() as u64) as usize;
        if len == 0 {
            return Ok(0);
        }
        bytes[..len].copy_from_slice(&self.file.read_exact_at(self.offset, len)?);
        self.offset += len as u64;
        Ok(len)
    }
}

struct ScratchWriter(crate::host::HostFile);

impl Write for ScratchWriter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.write_all(bytes)?;
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
