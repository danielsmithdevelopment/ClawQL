// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Strict runtime environment parsing.
//!
//! An unset variable selects its caller's documented default. A supplied
//! variable must contain a valid value, so a typo cannot silently change the
//! configuration of a running node.

use anyhow::{anyhow, bail};

/// Validate every typed production variable before the runtime starts.
///
/// Some consumers cache a value or read it from a synchronous callback, so
/// they cannot return a configuration error at the point of use. This pass
/// makes those reads infallible without giving malformed values a default.
pub fn validate() -> anyhow::Result<()> {
    for name in [
        "CELLD_CLOUD",
        "CELLD_CLOUD_RESTART_ON_DEPLOY",
        "CELLD_LTX_COMPACTION",
        "CELLD_OUTPUT_GATE",
        "CELLD_PRESENCE_SHADOW",
        "CELLD_TRUST_FORWARDED_HEADERS",
        "CELLD_UNSAFE_PUBLIC_ADVERTISE",
    ] {
        flag(name, false)?;
    }

    for name in [
        "CELLD_ACTIVATIONS",
        "CELLD_DEPLOY_POLL_S",
        "CELLD_EVICTIONS",
        "CELLD_FETCH_TIMEOUT_S",
        "CELLD_HANDLER_BUDGET_S",
        "CELLD_IDLE_EVICT_S",
        "CELLD_LOG_CAPTURE_WORKERS",
        "CELLD_LOG_PIPELINE",
        "CELLD_LTX_COMPACTIONS",
        "CELLD_LTX_COMPACTION_MIN_TXIDS",
        "CELLD_LTX_DURABILITY_TIMEOUT_SECS",
        "CELLD_MAX_LOADED_WORKERS",
        "CELLD_MAX_CELL_REQUESTS",
        "CELLD_MAX_OUTBOUND_WEBSOCKETS",
        "CELLD_MAX_REQUEST_BODY_BYTES",
        "CELLD_MAX_REQUESTS",
        "CELLD_MAX_STATELESS_ISOLATES",
        "CELLD_OPERATION_DEADLINE_MS",
        "CELLD_RELEASES",
        "CELLD_SHUTDOWN_DRAIN_MS",
        "CELLD_SHUTDOWN_TOTAL_MS",
        "CELLD_TOKIO_THREADS",
        "CELLD_TTL_MS",
        "CELLD_WAKER_TICK_MS",
    ] {
        positive::<u64>(name)?;
    }

    for name in [
        "CELLD_ADMISSION_WAIT_MS",
        "CELLD_ALARM_RESIDENT_MS",
        "CELLD_ASSET_CACHE_BYTES",
        "CELLD_DEPLOY_MAX_AGE_S",
        "CELLD_DRAIN_TOKEN_WAIT_MS",
        "CELLD_LOCAL_CACHE_MAX_BYTES",
        "CELLD_LTX_TRUNCATE_PAGES",
        "CELLD_LOG_HEDGE_MS",
        "CELLD_LOG_WINDOW",
        "CELLD_LOG_WINDOW_BYTES",
        "CELLD_MAX_RESIDENT_CELLS",
        "CELLD_MAX_RSS_MB",
        "CELLD_READY_FLEET_GATE_MS",
    ] {
        optional::<u64>(name)?;
    }

    if let Some(value) = optional::<u64>("CELLD_PRESENCE_HEARTBEAT_MS")? {
        if !(50..=30_000).contains(&value) {
            bail!("CELLD_PRESENCE_HEARTBEAT_MS must be between 50 and 30000, not {value}");
        }
    }

    if let Some(megabytes) = positive::<usize>("CELLD_V8_HEAP_LIMIT_MB")? {
        if megabytes.checked_mul(1024 * 1024).is_none() {
            bail!("CELLD_V8_HEAP_LIMIT_MB is too large: {megabytes}");
        }
    }

    if let Some(value) = value("CELLD_LOG_TRANSPORT")? {
        if !matches!(value.as_str(), "http" | "stream") {
            bail!("CELLD_LOG_TRANSPORT must be http or stream, not {value:?}");
        }
    }

    if let Some(value) = value("CELLD_PRESSURE_OWNERSHIP")? {
        if !matches!(value.as_str(), "release" | "sticky") {
            bail!("CELLD_PRESSURE_OWNERSHIP must be release or sticky, not {value:?}");
        }
    }
    Ok(())
}

pub fn value(name: &str) -> anyhow::Result<Option<String>> {
    match std::env::var(name) {
        Ok(value) => Ok(Some(value)),
        Err(std::env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(anyhow!("read {name}: {error}")),
    }
}

pub fn flag(name: &str, default: bool) -> anyhow::Result<bool> {
    let value = value(name)?;
    parse_flag(name, value.as_deref(), default)
}

pub fn parse_flag(name: &str, value: Option<&str>, default: bool) -> anyhow::Result<bool> {
    match value {
        None => Ok(default),
        Some("0") => Ok(false),
        Some("1") => Ok(true),
        Some(other) => bail!("{name} must be 0 or 1, not {other:?}"),
    }
}

pub fn optional<T>(name: &str) -> anyhow::Result<Option<T>>
where
    T: std::str::FromStr,
    T::Err: std::fmt::Display,
{
    parse_optional(name, value(name)?)
}

pub fn parse_optional<T>(name: &str, value: Option<String>) -> anyhow::Result<Option<T>>
where
    T: std::str::FromStr,
    T::Err: std::fmt::Display,
{
    value
        .map(|value| {
            value
                .parse::<T>()
                .map_err(|error| anyhow!("{name} has invalid value {value:?}: {error}"))
        })
        .transpose()
}

pub fn with_default<T>(name: &str, default: T) -> anyhow::Result<T>
where
    T: std::str::FromStr,
    T::Err: std::fmt::Display,
{
    Ok(optional(name)?.unwrap_or(default))
}

pub fn positive<T>(name: &str) -> anyhow::Result<Option<T>>
where
    T: std::str::FromStr + Default + PartialOrd + std::fmt::Display,
    T::Err: std::fmt::Display,
{
    parse_positive(name, value(name)?)
}

pub fn parse_positive<T>(name: &str, value: Option<String>) -> anyhow::Result<Option<T>>
where
    T: std::str::FromStr + Default + PartialOrd + std::fmt::Display,
    T::Err: std::fmt::Display,
{
    let Some(value) = parse_optional::<T>(name, value)? else {
        return Ok(None);
    };
    if value <= T::default() {
        bail!("{name} must be greater than zero, not {value}");
    }
    Ok(Some(value))
}

pub fn positive_or<T>(name: &str, default: T) -> anyhow::Result<T>
where
    T: std::str::FromStr + Default + PartialOrd + std::fmt::Display,
    T::Err: std::fmt::Display,
{
    Ok(positive(name)?.unwrap_or(default))
}
