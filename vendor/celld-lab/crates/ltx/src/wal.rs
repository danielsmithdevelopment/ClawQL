//! wal.rs — SQLite WAL header/frame parsing + cumulative SQLite checksums.
//!
//! Ported from litestream@v0.5.11 wal_reader.go:14-295 (read path) and the
//! `WALChecksum` helper in litestream@v0.5.11 litestream.go:110-119 (re-exported
//! from the crate root as [`crate::wal_checksum`]).
//!
//! A [`WalReader`] wraps a byte buffer and parses SQLite WAL frames, verifying
//! salt and cumulative-checksum integrity as it reads. It does **not** enforce
//! transaction boundaries (it may return uncommitted frames); honoring commit
//! records is the caller's responsibility (see [`WalReader::page_map`]).
//!
//! ## Byte format (read straight from the SQLite WAL spec; see wal_reader.go)
//!
//! WAL header (32 bytes, all fields big-endian at fixed offsets):
//! ```text
//!   [0..4]   magic       0x377f0682 => checksums LITTLE-endian
//!                        0x377f0683 => checksums BIG-endian
//!   [4..8]   version     must equal 3007000
//!   [8..12]  page size
//!   [12..16] checkpoint sequence number
//!   [16..20] salt-1
//!   [20..24] salt-2
//!   [24..28] checksum-1  (cumulative checksum of bytes [0..24])
//!   [28..32] checksum-2
//! ```
//!
//! WAL frame header (24 bytes, all fields big-endian):
//! ```text
//!   [0..4]   page number
//!   [4..8]   commit size in pages for a commit record, else 0
//!   [8..12]  salt-1  (must match the header salt-1)
//!   [12..16] salt-2  (must match the header salt-2)
//!   [16..20] checksum-1  (cumulative checksum through this frame's data)
//!   [20..24] checksum-2
//! ```
//!
//! A frame is `pageSize + 24` bytes. The cumulative checksum is seeded with the
//! header checksum and rolled forward over each frame's 8-byte header prefix and
//! then its page data, in the byte order chosen by the magic.

use std::collections::{HashMap, HashSet};

use crate::{wal_checksum, WAL_FRAME_HEADER_SIZE, WAL_HEADER_SIZE};

/// Required WAL format version (`3007000`), as found at header offset 4.
///
/// Ported from litestream@v0.5.11 wal_reader.go:118.
const WAL_VERSION: u32 = 3_007_000;

/// WAL header magic indicating checksums are computed **little-endian**.
///
/// Ported from litestream@v0.5.11 wal_reader.go:101.
const WAL_MAGIC_LITTLE_ENDIAN: u32 = 0x377f_0682;

/// WAL header magic indicating checksums are computed **big-endian**.
///
/// Ported from litestream@v0.5.11 wal_reader.go:103.
const WAL_MAGIC_BIG_ENDIAN: u32 = 0x377f_0683;

// ── Errors ────────────────────────────────────────────────────────────────────

/// Errors returned by [`WalReader`].
///
/// The Go reader leans on `io.EOF` as a control-flow sentinel: it signals the
/// clean end of the *valid* WAL, but also a short/partial read, a salt mismatch,
/// or a checksum mismatch — all of which mean "stop reading here, the rest of the
/// file is not a valid continuation." We model that single sentinel as
/// [`WalError::Eof`] so callers can branch on it exactly like Go's
/// `errors.Is(err, io.EOF)` (see [`WalError::is_eof`]). Non-EOF variants carry
/// the same human-readable messages as the Go `fmt.Errorf` strings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WalError {
    /// End of the valid WAL.
    ///
    /// Mirrors every `return ..., io.EOF` in wal_reader.go: a partial header, a
    /// failed header checksum, a short frame read, a salt mismatch, or a frame
    /// checksum mismatch. In all of these the WAL has no further valid frames.
    Eof,

    /// `invalid wal header magic: <hex>` — the magic was neither
    /// `0x377f0682` nor `0x377f0683`.
    ///
    /// Ported from litestream@v0.5.11 wal_reader.go:106.
    InvalidMagic(u32),

    /// `unsupported wal version: <n>` — header version field was not `3007000`.
    ///
    /// Ported from litestream@v0.5.11 wal_reader.go:119.
    UnsupportedVersion(u32),

    /// `WALReader.ReadFrame(): buffer size (<n>) must match page size (<m>)`.
    ///
    /// Ported from litestream@v0.5.11 wal_reader.go:139.
    BufferSize {
        /// Length of the buffer the caller supplied.
        got: usize,
        /// The WAL's page size.
        want: u32,
    },

    /// `offset (<n>) must be greater than the wal header size (<m>)` — passed to
    /// [`WalReader::new_with_offset`] with an offset at or before the header.
    ///
    /// Ported from litestream@v0.5.11 wal_reader.go:48.
    OffsetTooSmall {
        /// The requested offset.
        offset: i64,
        /// The WAL header size.
        header_size: i64,
    },

    /// `unaligned wal offset <n> for page size <m>` — the offset does not land on
    /// a frame boundary.
    ///
    /// Ported from litestream@v0.5.11 wal_reader.go:64.
    UnalignedOffset {
        /// The requested offset.
        offset: i64,
        /// The WAL's page size.
        page_size: u32,
    },

    /// The previous frame at the seek offset could not be re-read (its salt or
    /// checksum did not match). **Load-bearing**: `DB.sync` catches this and
    /// falls back to a full snapshot (db.go:1571-1577).
    ///
    /// Ported from `PrevFrameMismatchError` in litestream@v0.5.11
    /// wal_reader.go:284-294.
    PrevFrameMismatch,
}

impl WalError {
    /// Returns `true` for the [`WalError::Eof`] sentinel.
    ///
    /// This is the analog of Go's `errors.Is(err, io.EOF)`, which upstream
    /// callers such as `PageMap` use to detect the end of the WAL.
    #[inline]
    pub fn is_eof(&self) -> bool {
        matches!(self, WalError::Eof)
    }
}

impl std::fmt::Display for WalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            // Matches the Go string "EOF" (io.EOF.Error()).
            WalError::Eof => f.write_str("EOF"),
            // Go: fmt.Errorf("invalid wal header magic: %x", magic) — lowercase
            // hex, no leading zeros (matches Go's %x for a uint32).
            WalError::InvalidMagic(magic) => write!(f, "invalid wal header magic: {magic:x}"),
            WalError::UnsupportedVersion(v) => write!(f, "unsupported wal version: {v}"),
            WalError::BufferSize { got, want } => write!(
                f,
                "WALReader.ReadFrame(): buffer size ({got}) must match page size ({want})"
            ),
            WalError::OffsetTooSmall {
                offset,
                header_size,
            } => write!(
                f,
                "offset ({offset}) must be greater than the wal header size ({header_size})"
            ),
            WalError::UnalignedOffset { offset, page_size } => {
                write!(f, "unaligned wal offset {offset} for page size {page_size}")
            }
            WalError::PrevFrameMismatch => f.write_str("previous frame mismatch"),
        }
    }
}

impl std::error::Error for WalError {}

impl From<WalError> for crate::Error {
    /// Lifts a [`WalError`] into the crate-wide error type for callers that work
    /// in terms of [`crate::Error`]. EOF and the structured WAL errors become
    /// `Error::Other` carrying the same message.
    fn from(e: WalError) -> Self {
        crate::Error::Other(Box::new(e))
    }
}

/// `WalReader`'s `Result` alias.
type WalResult<T> = std::result::Result<T, WalError>;

// ── WalReader ───────────────────────────────────────────────────────────────

/// Reads SQLite WAL frames from an in-memory byte buffer, verifying salts and
/// the cumulative SQLite checksum as it goes.
///
/// This is the faithful analog of Go's `WALReader` (wal_reader.go:19-31). Go
/// wraps an `io.ReaderAt`; this implementation wraps a borrowed `&[u8]` and emulates
/// `ReadAt` semantics directly: a read whose requested length runs past the end
/// of the buffer yields fewer bytes, which the algorithm treats as `io.EOF`
/// exactly as Go does.
///
/// Ported from litestream@v0.5.11 wal_reader.go:19-187.
#[derive(Debug)]
pub struct WalReader<'a> {
    /// Backing WAL bytes: the whole file (as the Go `io.ReaderAt`) when
    /// `tail_base` is 0, otherwise the 32-byte header followed by the file's
    /// bytes from `tail_base` onward — the shape a tail read produces without
    /// a file-sized buffer between the header and the tail.
    data: &'a [u8],
    /// The file offset of `data[WAL_HEADER_SIZE..]`, or 0 for a whole-file
    /// image. See [`WalReader::new_with_offset_over_tail`].
    tail_base: usize,
    /// Index of the *next* frame to read (0-based). Go field `frameN`.
    frame_n: i64,

    /// `true` when checksums are big-endian (magic `0x377f0683`),
    /// `false` when little-endian (magic `0x377f0682`). Go field `bo`.
    big_endian: bool,
    /// Page size from the header. Go field `pageSize`.
    page_size: u32,
    /// Header salt-1 / salt-2; frames must match these. Go fields `salt1/salt2`.
    salt1: u32,
    salt2: u32,
    /// Running cumulative checksum. Seeded from the header checksum, then rolled
    /// forward frame by frame. Go fields `chksum1/chksum2`.
    chksum1: u32,
    chksum2: u32,
}

impl<'a> WalReader<'a> {
    /// Creates a new reader over `data`, parsing the WAL header immediately.
    ///
    /// Returns [`WalError::Eof`] if the buffer is too short to hold a header or
    /// the header checksum does not validate (a partial WAL-header write during
    /// checkpointing). Returns [`WalError::InvalidMagic`] /
    /// [`WalError::UnsupportedVersion`] for a malformed header.
    ///
    /// Ported from `NewWALReader` in litestream@v0.5.11 wal_reader.go:34-40.
    pub fn new(data: &'a [u8]) -> WalResult<Self> {
        let mut r = WalReader {
            data,
            tail_base: 0,
            frame_n: 0,
            big_endian: false,
            page_size: 0,
            salt1: 0,
            salt2: 0,
            chksum1: 0,
            chksum2: 0,
        };
        r.read_header()?;
        Ok(r)
    }

    /// Creates a new reader positioned at `offset`, loading the running checksum
    /// from the *previous* frame so reading can resume mid-WAL.
    ///
    /// `salt1`/`salt2` are the expected salts of the segment being resumed; they
    /// override the header salts in case the start of the file was overwritten by
    /// a later transaction. Returns:
    /// - [`WalError::OffsetTooSmall`] if `offset <= WAL_HEADER_SIZE` (we must be
    ///   able to read a previous frame),
    /// - [`WalError::UnalignedOffset`] if `offset` is not on a frame boundary,
    /// - [`WalError::PrevFrameMismatch`] if the previous frame cannot be re-read
    ///   (salt/checksum mismatch) — the caller falls back to a full snapshot.
    ///
    /// Ported from `NewWALReaderWithOffset` in litestream@v0.5.11
    /// wal_reader.go:42-75.
    pub fn new_with_offset(data: &'a [u8], offset: i64, salt1: u32, salt2: u32) -> WalResult<Self> {
        // Must not start on the first page — we need to read the previous frame.
        if offset <= WAL_HEADER_SIZE as i64 {
            return Err(WalError::OffsetTooSmall {
                offset,
                header_size: WAL_HEADER_SIZE as i64,
            });
        }
        let mut r = Self::new_with_offset_inner(data, 0)?;
        r.seek_to_offset(offset, salt1, salt2)?;
        Ok(r)
    }

    /// A reader over `data` with its header parsed and its tail base set;
    /// the two offset constructors share it and then seek.
    fn new_with_offset_inner(data: &'a [u8], tail_base: usize) -> WalResult<Self> {
        let mut r = WalReader {
            data,
            tail_base,
            frame_n: 0,
            big_endian: false,
            page_size: 0,
            salt1: 0,
            salt2: 0,
            chksum1: 0,
            chksum2: 0,
        };
        // Read header to determine page size & byte order.
        r.read_header()?;
        Ok(r)
    }

    /// Positions the reader at `offset` and seeds its running checksum from
    /// the previous frame (wal_reader.go:42-75): the salts override the
    /// header's in case the beginning of the file was overwritten, the offset
    /// must land on a frame start, and a previous frame that does not match
    /// is [`WalError::PrevFrameMismatch`] — the caller falls back to a full
    /// snapshot.
    fn seek_to_offset(&mut self, offset: i64, salt1: u32, salt2: u32) -> WalResult<()> {
        self.salt1 = salt1;
        self.salt2 = salt2;

        let frame_size = self.page_size as i64 + WAL_FRAME_HEADER_SIZE as i64;
        if (offset - WAL_HEADER_SIZE as i64) % frame_size != 0 {
            return Err(WalError::UnalignedOffset {
                offset,
                page_size: self.page_size,
            });
        }
        self.frame_n = (offset - WAL_HEADER_SIZE as i64) / frame_size;

        // Read the previous frame to load the running checksum. Any failure here
        // (salt/checksum mismatch surfaces as WalError::Eof from read_frame_inner)
        // means the previous frame doesn't match what we expect → mismatch.
        self.frame_n -= 1;
        let mut buf = vec![0u8; self.page_size as usize];
        if self.read_frame_inner(&mut buf, false).is_err() {
            return Err(WalError::PrevFrameMismatch);
        }
        Ok(())
    }

    /// Returns the page size from the header.
    ///
    /// Ported from `PageSize` in litestream@v0.5.11 wal_reader.go:78.
    #[inline]
    pub fn page_size(&self) -> u32 {
        self.page_size
    }

    /// Returns the header salt pair `(salt1, salt2)`.
    #[inline]
    pub fn salt(&self) -> (u32, u32) {
        (self.salt1, self.salt2)
    }

    /// Returns the file offset of the last frame read, or `0` if no frame has
    /// been read yet.
    ///
    /// Ported from `Offset` in litestream@v0.5.11 wal_reader.go:82-87.
    pub fn offset(&self) -> i64 {
        if self.frame_n == 0 {
            return 0;
        }
        WAL_HEADER_SIZE as i64
            + ((self.frame_n - 1) * (WAL_FRAME_HEADER_SIZE as i64 + self.page_size as i64))
    }

    /// Reads `n` bytes at absolute `offset`, returning `None` (the `io.EOF`
    /// case) when fewer than `n` bytes are available — exactly the behavior of
    /// Go's `io.ReaderAt.ReadAt` over a `bytes.Reader` short read, which the
    /// upstream code converts to `io.EOF`.
    fn read_at(&self, offset: i64, n: usize) -> Option<&'a [u8]> {
        if offset < 0 {
            return None;
        }
        let offset = offset as usize;
        let start = if self.tail_base == 0 || offset < WAL_HEADER_SIZE {
            offset
        } else {
            // A tail image holds nothing between the header and the tail;
            // an offset in that gap is a short read, exactly as a whole-file
            // image shorter than the offset would be.
            WAL_HEADER_SIZE + offset.checked_sub(self.tail_base)?
        };
        let end = start.checked_add(n)?;
        if end > self.data.len() {
            return None;
        }
        Some(&self.data[start..end])
    }

    /// A reader positioned at `offset` over a tail image: `data` is the
    /// 32-byte WAL header followed by the file's bytes from `tail_base`
    /// onward, so a sync that resumes at `offset` reads a buffer the size of
    /// the tail rather than of the file. `offset` must lie in the tail, and
    /// the previous frame (which the offset reader re-reads to seed its
    /// checksum) must too — the caller starts the tail one frame early.
    pub fn new_with_offset_over_tail(
        data: &'a [u8],
        tail_base: i64,
        offset: i64,
        salt1: u32,
        salt2: u32,
    ) -> WalResult<Self> {
        if tail_base < WAL_HEADER_SIZE as i64 || offset < tail_base {
            return Err(WalError::OffsetTooSmall {
                offset,
                header_size: WAL_HEADER_SIZE as i64,
            });
        }
        let mut r = Self::new_with_offset_inner(data, tail_base as usize)?;
        r.seek_to_offset(offset, salt1, salt2)?;
        Ok(r)
    }

    /// Reads and validates the WAL header into `self`.
    ///
    /// Ported from `readHeader` in litestream@v0.5.11 wal_reader.go:90-129.
    fn read_header(&mut self) -> WalResult<()> {
        // If we have a partial WAL, mark WAL as done (io.EOF).
        let hdr = match self.read_at(0, WAL_HEADER_SIZE) {
            Some(b) => b,
            None => return Err(WalError::Eof),
        };

        // Determine byte order of checksums from the magic (always read
        // big-endian, like Go's binary.BigEndian.Uint32(hdr[0:])).
        let magic = be_u32(&hdr[0..]);
        self.big_endian = match magic {
            WAL_MAGIC_LITTLE_ENDIAN => false,
            WAL_MAGIC_BIG_ENDIAN => true,
            _ => return Err(WalError::InvalidMagic(magic)),
        };

        // If the header checksum doesn't match then we may have failed with a
        // partial WAL header write during checkpointing => io.EOF.
        let chksum1 = be_u32(&hdr[24..]);
        let chksum2 = be_u32(&hdr[28..]);
        let (v0, v1) = wal_checksum(self.big_endian, 0, 0, &hdr[..24]);
        if v0 != chksum1 || v1 != chksum2 {
            return Err(WalError::Eof);
        }

        // Verify version is correct.
        let version = be_u32(&hdr[4..]);
        if version != WAL_VERSION {
            return Err(WalError::UnsupportedVersion(version));
        }

        self.page_size = be_u32(&hdr[8..]);
        self.salt1 = be_u32(&hdr[16..]);
        self.salt2 = be_u32(&hdr[20..]);
        self.chksum1 = chksum1;
        self.chksum2 = chksum2;

        Ok(())
    }

    /// Reads the next frame into `data` and returns `(pgno, commit)`.
    ///
    /// Returns [`WalError::Eof`] at the end of the valid WAL (including on a
    /// salt or checksum mismatch, which terminate the valid region). `data` must
    /// be exactly `page_size` bytes or [`WalError::BufferSize`] is returned.
    ///
    /// Ported from `ReadFrame` in litestream@v0.5.11 wal_reader.go:131-135.
    pub fn read_frame(&mut self, data: &mut [u8]) -> WalResult<(u32, u32)> {
        self.read_frame_inner(data, true)
    }

    /// Frame-read core shared by [`Self::read_frame`] and the offset constructor.
    ///
    /// When `verify_checksum` is `false`, the running checksum is *set* from the
    /// frame's stored checksum rather than verified against a rolling value —
    /// used when seeking to an offset without checksumming from the beginning.
    ///
    /// Ported from `readFrame` in litestream@v0.5.11 wal_reader.go:137-187.
    fn read_frame_inner(
        &mut self,
        data: &mut [u8],
        verify_checksum: bool,
    ) -> WalResult<(u32, u32)> {
        if data.len() != self.page_size as usize {
            return Err(WalError::BufferSize {
                got: data.len(),
                want: self.page_size,
            });
        }

        let frame_size = self.page_size as i64 + WAL_FRAME_HEADER_SIZE as i64;
        let offset = WAL_HEADER_SIZE as i64 + (self.frame_n * frame_size);

        // Read WAL frame header. A short read is io.EOF.
        let hdr = match self.read_at(offset, WAL_FRAME_HEADER_SIZE) {
            Some(b) => b,
            None => return Err(WalError::Eof),
        };

        // Read WAL page data. A short read is io.EOF.
        let page = match self.read_at(offset + WAL_FRAME_HEADER_SIZE as i64, data.len()) {
            Some(b) => b,
            None => return Err(WalError::Eof),
        };
        data.copy_from_slice(page);

        // Verify salt matches the salt in the header; otherwise end of valid WAL.
        let salt1 = be_u32(&hdr[8..]);
        let salt2 = be_u32(&hdr[12..]);
        if self.salt1 != salt1 || self.salt2 != salt2 {
            return Err(WalError::Eof);
        }

        // Verify the cumulative checksum. If verification is disabled, it is
        // because we are jumping to an offset and not checksumming from the
        // beginning, so we simply adopt the frame's stored checksum.
        let chksum1 = be_u32(&hdr[16..]);
        let chksum2 = be_u32(&hdr[20..]);
        if verify_checksum {
            let (c0, c1) = wal_checksum(self.big_endian, self.chksum1, self.chksum2, &hdr[..8]);
            let (c0, c1) = wal_checksum(self.big_endian, c0, c1, data);
            self.chksum1 = c0;
            self.chksum2 = c1;
            if self.chksum1 != chksum1 || self.chksum2 != chksum2 {
                return Err(WalError::Eof);
            }
        } else {
            self.chksum1 = chksum1;
            self.chksum2 = chksum2;
        }

        let pgno = be_u32(&hdr[0..]);
        let commit = be_u32(&hdr[4..]);

        self.frame_n += 1;

        Ok((pgno, commit))
    }

    /// Reads all committed frames to end-of-file and returns a map of page
    /// number → byte offset of the latest committed version of that page, the
    /// max offset of the WAL segment read, and the final database size in pages.
    ///
    /// Pages above the final commit size are dropped (handles a DB that shrank,
    /// e.g. via `VACUUM`, between transactions).
    ///
    /// Ported from `PageMap` in litestream@v0.5.11 wal_reader.go:189-244.
    pub fn page_map(&mut self) -> WalResult<(HashMap<u32, i64>, i64, u32)> {
        let mut m: HashMap<u32, i64> = HashMap::new();
        let mut tx_map: HashMap<u32, i64> = HashMap::new();
        let mut commit: u32 = 0;
        let mut data = vec![0u8; self.page_size as usize];

        loop {
            let (pgno, fcommit) = match self.read_frame(&mut data) {
                Ok(v) => v,
                Err(e) if e.is_eof() => break,
                Err(e) => return Err(e),
            };

            // Update latest offset for this page within the current transaction.
            // Not promoted to the full map until the txn commits.
            let offset = self.offset();
            tx_map.insert(pgno, offset);

            // On a commit record, transfer the txn offsets into the full map and
            // record the new DB size.
            if fcommit != 0 {
                for (p, o) in tx_map.drain() {
                    m.insert(p, o);
                }
                commit = fcommit;
            }
        }

        // Remove pages that exceed the final commit size (DB shrank mid-WAL).
        m.retain(|&pgno, _| pgno <= commit);

        // No complete transactions => original (zero) offset.
        if m.is_empty() {
            return Ok((m, 0, 0));
        }

        // Highest page offset, extended to the end of that frame.
        let mut end: i64 = 0;
        for &offset in m.values() {
            if end == 0 || offset > end {
                end = offset;
            }
        }
        end += WAL_FRAME_HEADER_SIZE as i64 + self.page_size as i64;

        Ok((m, end, commit))
    }

    /// Returns the set of unique frame salt pairs in the WAL, scanning until the
    /// `until` salt pair is seen or end-of-file is reached.
    ///
    /// Unlike frame reading, this does **not** verify checksums or that frame
    /// salts match the header — it deliberately collects *every* distinct salt,
    /// including those from superseded transactions.
    ///
    /// Ported from `FrameSaltsUntil` in litestream@v0.5.11 wal_reader.go:246-270.
    pub fn frame_salts_until(&self, until: (u32, u32)) -> HashSet<(u32, u32)> {
        let mut m = HashSet::new();
        let step = WAL_FRAME_HEADER_SIZE as i64 + self.page_size as i64;
        let mut offset = WAL_HEADER_SIZE as i64;
        // The loop ends either when a frame-header read runs short (the Go
        // `n != len(hdr)` => break) or when we reach the `until` salt below.
        while let Some(hdr) = self.read_at(offset, WAL_FRAME_HEADER_SIZE) {
            let salt1 = be_u32(&hdr[8..]);
            let salt2 = be_u32(&hdr[12..]);

            // Track unique salts.
            m.insert((salt1, salt2));

            // Stop once we've seen the salt we were asked to read up to.
            if salt1 == until.0 && salt2 == until.1 {
                break;
            }

            offset += step;
        }
        m
    }
}

/// Reads a big-endian `u32` from the first four bytes of `b`.
///
/// All WAL header/frame scalar fields are big-endian regardless of the checksum
/// byte order (Go uses `binary.BigEndian.Uint32`). Panics if `b.len() < 4`,
/// which never happens for the fixed-offset accesses in this module.
#[inline]
fn be_u32(b: &[u8]) -> u32 {
    u32::from_be_bytes([b[0], b[1], b[2], b[3]])
}
