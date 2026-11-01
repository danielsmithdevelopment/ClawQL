// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Workers KV, reified sans-IO.
//!
//! A KV namespace is a cell, and this module holds the parts of it that decide
//! an *address* or publish a *bound*. It is deliberately smaller than it first
//! was, and the reason is worth recording.
//!
//! The first version also carried the key, value, metadata and expiry checks,
//! on [`cron`](crate::cron)'s rule that a second implementation is a second set
//! of answers. That rule still holds — but the second caller here is JavaScript,
//! and reaching Rust from the harness costs a host op, which D1 set the bar at
//! one and Workflows came in under. So the bounds ship as *data*
//! (`__cell.kvLimits`) and the harness compares against them, which leaves one
//! source of truth and one implementation. The Rust checks became a copy
//! nothing called, and `twin_gate` found them: "tested by the DST, run by
//! nobody — production has its own copy".
//!
//! What stays is what production genuinely reads: the bounds themselves, the
//! shard function, the cell name, and the large-value reference. Those decide
//! where data lives and what celld will accept, and every runtime path must
//! agree about them exactly.
//!
//! Deliberately absent: the SQL, the object-store I/O for a large value, and
//! the HMAC that turns a cell name into a cell scope. The first two are the
//! cell's, and the third needs crypto, which this crate does not have.

/// The Durable Object class every KV namespace runs as.
///
/// One fleet-wide name, not one per script, and that is a decision rather than
/// an omission. A namespace is a resource several Workers can bind, the same
/// way a D1 database is, so two scripts naming one namespace mean to reach one
/// set of cells. A workflow class carries its script because a workflow
/// instance is script-scoped; a namespace is not.
pub const RESERVED_CLASS: &str = "__KvNamespace";

/// Upstream's limits, which this crate refuses rather than truncates.
pub const MAX_KEY_BYTES: usize = 512;
pub const MAX_VALUE_BYTES: usize = 25 * 1024 * 1024;

/// The largest value celld stores inside the namespace cell.
///
/// A cell's writes replicate as LTX, so an inline value is paid for twice: once
/// in SQLite and once on the wire, on every write. Upstream permits 25 MiB, and
/// 25 MiB inline would make a single `put` the most expensive operation in the
/// runtime.
///
/// Above this bound the bytes go to the fleet bucket and the row names them,
/// which is the split Cloudflare's own KV rearchitecture made for the same
/// reason — small values in the database, large ones in object storage.
///
/// A repeated equal-size fleet A/B found that the inline path is faster at
/// 1 MiB and the bucket path is faster at 2 MiB. Thus, 1 MiB is the largest
/// measured size before the latency crossover. This limit also keeps the same
/// 1 MiB cap that a workflow step return uses.
pub const MAX_INLINE_VALUE_BYTES: usize = 1024 * 1024;
pub const MAX_METADATA_BYTES: usize = 1024;
/// Upstream refuses a shorter expiry outright, so a caller learns at the call
/// and not sixty seconds later.
pub const MIN_EXPIRATION_TTL_MS: i64 = 60_000;
/// One `get`/`getWithMetadata` bulk call. A CLI chunks beneath this rather
/// than inheriting it; the binding is where the ceiling belongs.
pub const MAX_BULK_KEYS: usize = 100;
/// One `list` page.
pub const MAX_LIST_LIMIT: usize = 1000;

/// The row format and object layout for a large value written with an epoch.
///
/// A bare digest is the legacy format. The reader accepts it, but the writer
/// never creates it and the collector never sweeps its object subtree. A v2
/// reference includes the ownership epoch that wrote the object, so an older
/// collector cannot address an object from a later owner.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BlobRef<'a> {
    Legacy { digest: &'a str },
    V2 { epoch: u64, digest: &'a str },
}

/// Why a persisted or listed large-value reference is not safe to use.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BlobRefError {
    Shape,
    Version,
    Epoch,
    Digest,
}

impl std::fmt::Display for BlobRefError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            BlobRefError::Shape => "the KV blob reference has an invalid shape",
            BlobRefError::Version => "the KV blob reference has an unknown version",
            BlobRefError::Epoch => "the KV blob reference has an invalid epoch",
            BlobRefError::Digest => "the KV blob reference has an invalid digest",
        })
    }
}

impl std::error::Error for BlobRefError {}

impl<'a> BlobRef<'a> {
    /// Read a SQLite `blob_id`. Bare SHA-256 digests remain readable for the
    /// shipped-layout migration, and every structured reference is strict.
    pub fn parse(reference: &'a str) -> Result<Self, BlobRefError> {
        if !reference.contains(':') {
            validate_blob_digest(reference)?;
            return Ok(Self::Legacy { digest: reference });
        }
        let mut parts = reference.split(':');
        let version = parts.next();
        let epoch = parts.next();
        let digest = parts.next();
        if parts.next().is_some() {
            return Err(BlobRefError::Shape);
        }
        if version != Some("v2") {
            return Err(BlobRefError::Version);
        }
        let (Some(epoch), Some(digest)) = (epoch, digest) else {
            return Err(BlobRefError::Shape);
        };
        Ok(Self::V2 {
            epoch: parse_blob_epoch(epoch)?,
            digest: validate_blob_digest(digest)?,
        })
    }

    /// Mint the only reference a new write can commit.
    pub fn v2(epoch: u64, digest: &'a str) -> Result<Self, BlobRefError> {
        if epoch == 0 {
            return Err(BlobRefError::Epoch);
        }
        Ok(Self::V2 {
            epoch,
            digest: validate_blob_digest(digest)?,
        })
    }

    /// Parse the suffix below `kv/blobs-v2/<cell>/`.
    pub fn parse_object_suffix(suffix: &'a str) -> Result<Self, BlobRefError> {
        let mut parts = suffix.split('/');
        let epoch = parts.next();
        let digest = parts.next();
        if parts.next().is_some() {
            return Err(BlobRefError::Shape);
        }
        let (Some(epoch), Some(digest)) = (epoch, digest) else {
            return Err(BlobRefError::Shape);
        };
        Ok(Self::V2 {
            epoch: parse_blob_epoch(epoch)?,
            digest: validate_blob_digest(digest)?,
        })
    }

    pub fn digest(self) -> &'a str {
        match self {
            Self::Legacy { digest } | Self::V2 { digest, .. } => digest,
        }
    }

    pub fn epoch(self) -> Option<u64> {
        match self {
            Self::Legacy { .. } => None,
            Self::V2 { epoch, .. } => Some(epoch),
        }
    }

    pub fn encode(self) -> String {
        match self {
            Self::Legacy { digest } => digest.to_string(),
            Self::V2 { epoch, digest } => format!("v2:e{epoch}:{digest}"),
        }
    }

    /// Map a persisted reference to its fleet-bucket object key.
    pub fn object_key(self, cell: &str) -> String {
        match self {
            Self::Legacy { digest } => format!("kv/blobs/{cell}/{digest}"),
            Self::V2 { epoch, digest } => {
                format!("kv/blobs-v2/{cell}/e{epoch}/{digest}")
            }
        }
    }

    /// The only subtree that a v2 collector can list.
    pub fn v2_object_prefix(cell: &str) -> String {
        format!("kv/blobs-v2/{cell}/")
    }

    /// A cell can read a legacy reference or a v2 reference from its current
    /// epoch or an older epoch. A later epoch is outside this activation's
    /// authority and indicates invalid restored state.
    pub fn readable_by(self, activation_epoch: u64) -> bool {
        self.epoch().is_none_or(|epoch| epoch <= activation_epoch)
    }

    /// A new write must use exactly the epoch that authorized this activation.
    pub fn writable_by(self, activation_epoch: u64) -> bool {
        self.epoch() == Some(activation_epoch)
    }

    /// A collector can remove only the v2 objects from its epoch or an older
    /// epoch. Legacy objects remain outside this collector by migration policy.
    pub fn collectable_by(self, collector_epoch: u64) -> bool {
        self.epoch().is_some_and(|epoch| epoch <= collector_epoch)
    }
}

fn validate_blob_digest(digest: &str) -> Result<&str, BlobRefError> {
    (digest.len() == 64
        && digest
            .as_bytes()
            .iter()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()))
    .then_some(digest)
    .ok_or(BlobRefError::Digest)
}

fn parse_blob_epoch(epoch: &str) -> Result<u64, BlobRefError> {
    let digits = epoch.strip_prefix('e').ok_or(BlobRefError::Epoch)?;
    if digits.is_empty() || digits.starts_with('0') {
        return Err(BlobRefError::Epoch);
    }
    digits
        .parse::<u64>()
        .ok()
        .filter(|epoch| *epoch > 0)
        .ok_or(BlobRefError::Epoch)
}

/// The number of shards a namespace has in v1.
///
/// One. The shard still travels in every cell name (see [`cell_name`]) so that
/// raising this number stays a rehash of some keys rather than a rename of
/// every cell in every fleet.
pub const SHARDS: u32 = 1;

/// Which shard owns a key.
///
/// FNV-1a over the key's bytes. The algorithm is written out rather than
/// depended upon because this crate has no dependencies, and it is pinned
/// forever for a harder reason: changing it moves keys between cells, so a
/// namespace written by one release becomes unreadable by the next. Test
/// `kv_units::shard_of_is_pinned` holds the vectors that say so.
pub fn shard_of(key: &str, shards: u32) -> u32 {
    debug_assert!(shards > 0, "a namespace has at least one shard");
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0000_0100_0000_01b3;
    let mut hash = OFFSET;
    for byte in key.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(PRIME);
    }
    (hash % u64::from(shards.max(1))) as u32
}

/// The Durable Object name a namespace's shard lives at.
///
/// The shard travels in the name from the first release, when there is only
/// shard zero and nothing reads it. That is not tidiness: the name is hashed
/// into the cell scope, so adding the shard later would change every existing
/// cell's address, and a rename of every cell in every fleet is not a
/// migration anyone can write. Paying one character now keeps the later change
/// to what it should be — a rehash that moves some keys.
pub fn cell_name(namespace_id: &str, shard: u32) -> String {
    format!("{namespace_id}/{shard}")
}

/// How many keys a `list` page may return.
///
/// Upstream caps the page at 1000 and defaults to it. A caller asking for zero
/// or a negative count gets the default rather than an empty page, because an
/// empty page with `list_complete: false` is a scan that never ends.
pub fn list_limit(requested: Option<i64>) -> usize {
    match requested {
        Some(limit) if limit > 0 => (limit as usize).min(MAX_LIST_LIMIT),
        _ => MAX_LIST_LIMIT,
    }
}
