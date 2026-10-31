//! Host facilities that can affect LTX scheduling or timestamps.

use std::ffi::OsString;
use std::future::Future;
use std::io;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

type HostFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;
type BlockingJob = Box<dyn FnOnce() + Send>;
type NowUnixMillis = dyn Fn() -> i64 + Send + Sync;
type FileAge = dyn Fn(&Path) -> io::Result<Duration> + Send + Sync;
type ReadFile = dyn Fn(PathBuf) -> HostFuture<io::Result<Vec<u8>>> + Send + Sync;
type RunBlocking = dyn Fn(BlockingJob) -> HostFuture<Result<(), HostTaskError>> + Send + Sync;

/// The filesystem metadata that the LTX engine uses.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HostMetadata {
    pub len: u64,
    pub is_dir: bool,
    pub is_file: bool,
    /// The modification time as Unix milliseconds, or zero when it is not
    /// available from the host filesystem.
    pub modified_unix_millis: i64,
}

/// One directory entry returned by the injected filesystem.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HostDirEntry {
    pub path: PathBuf,
    pub file_name: OsString,
    pub is_dir: bool,
}

/// The operations on one open injected file.
pub trait HostFileIo: Send {
    fn write_all(&mut self, bytes: &[u8]) -> io::Result<()>;
    fn read_exact_at(&mut self, offset: u64, len: usize) -> io::Result<Vec<u8>>;
    fn sync_all(&mut self) -> io::Result<()>;
    /// The file's current length, from the open handle (an `fstat`, not a
    /// path walk).
    fn file_len(&mut self) -> io::Result<u64>;
}

/// One open file owned by an injected filesystem.
pub struct HostFile {
    inner: Box<dyn HostFileIo>,
}

impl HostFile {
    pub fn write_all(&mut self, bytes: &[u8]) -> io::Result<()> {
        self.inner.write_all(bytes)
    }

    pub fn read_exact_at(&mut self, offset: u64, len: usize) -> io::Result<Vec<u8>> {
        self.inner.read_exact_at(offset, len)
    }

    pub fn sync_all(&mut self) -> io::Result<()> {
        self.inner.sync_all()
    }

    pub fn file_len(&mut self) -> io::Result<u64> {
        self.inner.file_len()
    }

    pub fn from_io(inner: impl HostFileIo + 'static) -> Self {
        Self {
            inner: Box::new(inner),
        }
    }
}

/// The complete local-file surface used by celld and the LTX engine.
pub trait FileSystem: Send + Sync {
    fn read(&self, path: &Path) -> io::Result<Vec<u8>>;
    fn read_dir(&self, path: &Path) -> io::Result<Vec<HostDirEntry>>;
    fn metadata(&self, path: &Path) -> io::Result<HostMetadata>;
    fn create(&self, path: &Path) -> io::Result<HostFile>;
    fn open(&self, path: &Path) -> io::Result<HostFile>;
    fn write(&self, path: &Path, bytes: &[u8]) -> io::Result<()>;
    fn sync_all(&self, path: &Path) -> io::Result<()>;
    fn rename(&self, from: &Path, to: &Path) -> io::Result<()>;
    fn remove_file(&self, path: &Path) -> io::Result<()>;
    fn remove_dir_all(&self, path: &Path) -> io::Result<()>;
    fn create_dir_all(&self, path: &Path) -> io::Result<()>;
}

/// The telemetry-only microsecond clock for the capture ledger
/// (`db::SyncTiming`). Nothing branches on these values — they exist so
/// the closed-book attribution ledger can sum — so deterministic
/// schedules are unchanged; the host owns the ambient primitive exactly
/// as it owns the filesystem and the wall clock.
#[allow(clippy::disallowed_methods)]
pub(crate) fn telemetry_us() -> u64 {
    use std::sync::OnceLock;
    static EPOCH: OnceLock<std::time::Instant> = OnceLock::new();
    EPOCH
        .get_or_init(std::time::Instant::now)
        .elapsed()
        .as_micros() as u64
}

/// The ordinary direct-filesystem backend.
#[derive(Default)]
pub struct DirectFileSystem;

struct DirectFile {
    file: std::fs::File,
}

#[allow(clippy::disallowed_methods)]
impl HostFileIo for DirectFile {
    fn write_all(&mut self, bytes: &[u8]) -> io::Result<()> {
        std::io::Write::write_all(&mut self.file, bytes)
    }

    fn read_exact_at(&mut self, offset: u64, len: usize) -> io::Result<Vec<u8>> {
        use std::io::{Read as _, Seek as _, SeekFrom};
        self.file.seek(SeekFrom::Start(offset))?;
        let mut bytes = vec![0; len];
        self.file.read_exact(&mut bytes)?;
        Ok(bytes)
    }

    fn sync_all(&mut self) -> io::Result<()> {
        self.file.sync_all()
    }

    fn file_len(&mut self) -> io::Result<u64> {
        Ok(self.file.metadata()?.len())
    }
}

#[allow(clippy::disallowed_methods)]
impl FileSystem for DirectFileSystem {
    fn read(&self, path: &Path) -> io::Result<Vec<u8>> {
        std::fs::read(path)
    }

    fn read_dir(&self, path: &Path) -> io::Result<Vec<HostDirEntry>> {
        std::fs::read_dir(path)?
            .map(|entry| {
                let entry = entry?;
                let file_type = entry.file_type()?;
                Ok(HostDirEntry {
                    path: entry.path(),
                    file_name: entry.file_name(),
                    is_dir: file_type.is_dir(),
                })
            })
            .collect()
    }

    fn metadata(&self, path: &Path) -> io::Result<HostMetadata> {
        let metadata = std::fs::metadata(path)?;
        let modified_unix_millis = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or(0);
        Ok(HostMetadata {
            len: metadata.len(),
            is_dir: metadata.is_dir(),
            is_file: metadata.is_file(),
            modified_unix_millis,
        })
    }

    fn create(&self, path: &Path) -> io::Result<HostFile> {
        Ok(HostFile::from_io(DirectFile {
            file: std::fs::File::create(path)?,
        }))
    }

    fn open(&self, path: &Path) -> io::Result<HostFile> {
        Ok(HostFile::from_io(DirectFile {
            file: std::fs::File::open(path)?,
        }))
    }

    fn write(&self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        std::fs::write(path, bytes)
    }

    fn sync_all(&self, path: &Path) -> io::Result<()> {
        std::fs::File::open(path)?.sync_all()
    }

    fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
        std::fs::rename(from, to)
    }

    fn remove_file(&self, path: &Path) -> io::Result<()> {
        std::fs::remove_file(path)
    }

    fn remove_dir_all(&self, path: &Path) -> io::Result<()> {
        std::fs::remove_dir_all(path)
    }

    fn create_dir_all(&self, path: &Path) -> io::Result<()> {
        std::fs::create_dir_all(path)
    }
}

/// A failure to dispatch or join one host blocking job.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HostTaskError {
    message: String,
}

impl HostTaskError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for HostTaskError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for HostTaskError {}

struct Inner {
    now_unix_millis: Arc<NowUnixMillis>,
    file_age: Arc<FileAge>,
    read_file: Arc<ReadFile>,
    run_blocking: Arc<RunBlocking>,
    filesystem: Arc<dyn FileSystem>,
}

/// The clock and executor facilities used by the LTX engine.
///
/// The default uses the host clock, filesystem, and Tokio executor. A caller
/// can inject one object when it needs to own these observations and jobs.
#[derive(Clone)]
pub struct LtxHost {
    inner: Arc<Inner>,
}

impl LtxHost {
    /// Creates an injected host from four cohesive facilities.
    pub fn new<N, A, R, RF, B, BF>(now: N, age: A, read: R, blocking: B) -> Self
    where
        N: Fn() -> i64 + Send + Sync + 'static,
        A: Fn(&Path) -> io::Result<Duration> + Send + Sync + 'static,
        R: Fn(PathBuf) -> RF + Send + Sync + 'static,
        RF: Future<Output = io::Result<Vec<u8>>> + Send + 'static,
        B: Fn(BlockingJob) -> BF + Send + Sync + 'static,
        BF: Future<Output = Result<(), HostTaskError>> + Send + 'static,
    {
        Self {
            inner: Arc::new(Inner {
                now_unix_millis: Arc::new(now),
                file_age: Arc::new(age),
                read_file: Arc::new(move |path| Box::pin(read(path))),
                run_blocking: Arc::new(move |job| Box::pin(blocking(job))),
                filesystem: Arc::new(DirectFileSystem),
            }),
        }
    }

    /// Selects the filesystem used by synchronous local LTX operations.
    pub fn with_filesystem(mut self, filesystem: Arc<dyn FileSystem>) -> Self {
        Arc::get_mut(&mut self.inner)
            .expect("a fresh LtxHost has one owner")
            .filesystem = filesystem;
        self
    }

    pub fn filesystem(&self) -> Arc<dyn FileSystem> {
        self.inner.filesystem.clone()
    }

    pub fn read(&self, path: &Path) -> io::Result<Vec<u8>> {
        self.inner.filesystem.read(path)
    }

    pub fn read_dir(&self, path: &Path) -> io::Result<Vec<HostDirEntry>> {
        self.inner.filesystem.read_dir(path)
    }

    pub fn metadata(&self, path: &Path) -> io::Result<HostMetadata> {
        self.inner.filesystem.metadata(path)
    }

    pub fn create(&self, path: &Path) -> io::Result<HostFile> {
        self.inner.filesystem.create(path)
    }

    pub fn open(&self, path: &Path) -> io::Result<HostFile> {
        self.inner.filesystem.open(path)
    }

    pub fn write(&self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        self.inner.filesystem.write(path, bytes)
    }

    pub fn sync_all(&self, path: &Path) -> io::Result<()> {
        self.inner.filesystem.sync_all(path)
    }

    pub fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
        self.inner.filesystem.rename(from, to)
    }

    pub fn remove_file(&self, path: &Path) -> io::Result<()> {
        self.inner.filesystem.remove_file(path)
    }

    pub fn remove_dir_all(&self, path: &Path) -> io::Result<()> {
        self.inner.filesystem.remove_dir_all(path)
    }

    pub fn create_dir_all(&self, path: &Path) -> io::Result<()> {
        self.inner.filesystem.create_dir_all(path)
    }

    /// Returns the current wall time as Unix milliseconds.
    pub fn now_unix_millis(&self) -> i64 {
        (self.inner.now_unix_millis)()
    }

    /// Returns the age of one file according to the host wall-clock view.
    pub fn file_age(&self, path: &Path) -> io::Result<Duration> {
        (self.inner.file_age)(path)
    }

    /// Reads one compactor input through the host executor.
    pub async fn read_file(&self, path: impl Into<PathBuf>) -> io::Result<Vec<u8>> {
        (self.inner.read_file)(path.into()).await
    }

    /// Runs one CPU or filesystem job through the host blocking executor.
    pub async fn run_blocking<T, F>(&self, operation: F) -> Result<T, HostTaskError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        let (send, receive) = tokio::sync::oneshot::channel();
        let job = Box::new(move || {
            let output = std::panic::catch_unwind(std::panic::AssertUnwindSafe(operation))
                .map_err(|_| HostTaskError::new("the host blocking job panicked"));
            let _ = send.send(output);
        });
        (self.inner.run_blocking)(job).await?;
        receive
            .await
            .map_err(|_| HostTaskError::new("the host blocking job stopped without a result"))?
    }
}

// This is the lower crate's stand-alone production backend. celld injects an
// execution-domain-backed host on every engine path.
#[allow(clippy::disallowed_methods)]
impl Default for LtxHost {
    fn default() -> Self {
        Self::new(
            || {
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|duration| duration.as_millis() as i64)
                    .unwrap_or(0)
            },
            |path| {
                let modified = std::fs::metadata(path)?.modified()?;
                Ok(SystemTime::now()
                    .duration_since(modified)
                    .unwrap_or(Duration::ZERO))
            },
            |path| async move { tokio::fs::read(path).await },
            |job| async move {
                tokio::task::spawn_blocking(job)
                    .await
                    .map_err(|error| HostTaskError::new(error.to_string()))
            },
        )
    }
}
