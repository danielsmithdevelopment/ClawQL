// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Fleet initialization and resumable wake-index migration during startup.
use crate::bucket::Bucket;
use anyhow::{ensure, Context as _};

const KEY: &str = "wake/format.json";

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct FormatRecord {
    format: u8,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    migrating: bool,
}

fn decode(bytes: &[u8]) -> anyhow::Result<FormatRecord> {
    let record: FormatRecord = serde_json::from_slice(bytes)?;
    ensure!(
        record.format == 2,
        "unsupported wake format; this binary requires format 2"
    );
    Ok(record)
}

/// Complete initialization before a deployment or node can write fleet data.
/// Every concurrent starter can finish an interrupted inventory. The first
/// complete inventory permits serving; lagging starters can only add obsolete
/// discovery seeds, whose retirement order is below every writer identity.
pub async fn ensure_ready(bucket: &Bucket) -> anyhow::Result<()> {
    let result = initialize(bucket).await;
    if result.is_err() {
        // Another starter can finish and acquire its node lease while this
        // starter is checking leases or publishing readiness. Its complete
        // inventory is sufficient; rejecting that new lease strands an
        // otherwise successful concurrent restart.
        if let Some((bytes, _)) = bucket.get(KEY).await? {
            if !decode(&bytes)?.migrating {
                return Ok(());
            }
        }
    }
    result
}

const PAGE_SIZE: usize = 128;

/// Expired leases are a useful refusal check, not proof that an old process
/// cannot restart. The upgrade requires a coordinated stop of old writers;
/// v0.4.1 does not read the format marker and cannot honor a migration lock.
async fn ensure_stopped(bucket: &Bucket) -> anyhow::Result<()> {
    #[derive(serde::Deserialize)]
    struct Lease {
        expires_ms: u64,
    }
    let mut cursor = None;
    loop {
        let page = bucket.objects_page("nodes/", cursor, PAGE_SIZE).await?;
        for object in page.objects {
            let key = object.location.as_ref();
            if let Some((bytes, _)) = bucket.get(key).await? {
                let lease: Lease = serde_json::from_slice(&bytes)
                    .with_context(|| format!("cannot verify stopped node {key}"))?;
                ensure!(lease.expires_ms <= crate::asyncrt::wall_ms().max(0) as u64,
                    "node lease {key} is still live; stop every old node and wait for its lease to expire");
            }
        }
        cursor = page.page_token;
        if cursor.is_none() {
            return Ok(());
        }
    }
}

/// Seed the cell inventory in place. No SQLite image, log, ownership record,
/// deployment, or application object is rewritten. Repeating a seed PUT after
/// a lost response is harmless, even after serving starts: a positive-epoch
/// retirement proof can only classify it as obsolete, never as a new alarm.
async fn initialize(bucket: &Bucket) -> anyhow::Result<()> {
    if let Some((bytes, _)) = bucket.get(KEY).await? {
        if !decode(&bytes)?.migrating {
            return Ok(());
        }
    }
    ensure_stopped(bucket).await?;
    if bucket.get(KEY).await?.is_none() {
        let supported = ensure_legacy_layout(bucket).await;
        // A concurrent initializer can publish its marker and seeds during
        // the compatibility scan. Recheck the marker before rejecting those
        // seeds as unmarked data or attempting to create a new marker.
        if bucket.get(KEY).await?.is_none() {
            supported?;
            bucket
                .put_cas(
                    KEY,
                    serde_json::to_vec(&FormatRecord {
                        format: 2,
                        migrating: true,
                    })?,
                    None,
                )
                .await?;
        }
    }
    let (bytes, token) = bucket
        .get(KEY)
        .await?
        .context("migration marker was not confirmed")?;
    if !decode(&bytes)?.migrating {
        return Ok(());
    }
    // Inventory cells, not legacy wake entries: the old delayed-DELETE bug
    // can have removed the only hint for a still-armed SQLite alarm. A cell
    // owner exists before its first write, including writes still in logs.
    let mut cursor = None;
    let mut seeds = 0;
    loop {
        let page = bucket
            .common_prefixes_page("cells/", None, cursor, PAGE_SIZE)
            .await?;
        for prefix in page.prefixes {
            let cell = prefix
                .strip_prefix("cells/")
                .context("invalid cell inventory prefix")?
                .trim_end_matches('/');
            ensure!(
                celld_logic::cell::valid_cell_scope(cell),
                "invalid cell identity: {cell}"
            );
            bucket
                .put(
                    &celld_logic::wake::migration_seed_key(cell),
                    serde_json::to_vec(
                        &serde_json::json!({"format": 2, "cell": cell, "migration_seed": true}),
                    )?,
                )
                .await?;
            seeds += 1;
        }
        cursor = page.page_token;
        if cursor.is_none() {
            break;
        }
    }
    ensure_stopped(bucket).await?;
    bucket
        .put_cas(
            KEY,
            serde_json::to_vec(&FormatRecord {
                format: 2,
                migrating: false,
            })?,
            Some(&token),
        )
        .await?;
    let (bytes, _) = bucket
        .get(KEY)
        .await?
        .context("completed migration marker is missing")?;
    ensure!(
        !decode(&bytes)?.migrating,
        "wake migration readiness was not confirmed; restart the node to resume"
    );
    if seeds > 0 {
        tracing::info!(seeds, "existing fleet wake index upgraded during startup");
    }
    Ok(())
}

// Only the released legacy layout is an import source. An unmarked immutable
// index can contain retired identities and cannot be reinterpreted as a fleet
// with no installation history.
async fn ensure_legacy_layout(bucket: &Bucket) -> anyhow::Result<()> {
    ensure!(
        bucket.get("wake-format.json").await?.is_none(),
        "unsupported experimental wake format"
    );
    for prefix in [
        "wake-v2/",
        "wake-retired-v2/",
        "wake/entries/",
        "wake/retired/",
    ] {
        ensure!(
            bucket
                .objects_page(prefix, None, 1)
                .await?
                .objects
                .is_empty(),
            "unmarked immutable wake data under {prefix}"
        );
    }
    Ok(())
}
