// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Strict runtime environment parsing.
//!
//! An unset variable selects its caller's documented default. A supplied
//! variable must contain a valid value, so a typo cannot silently change the
//! configuration of a running node.

use anyhow::{anyhow, bail};

pub const DEFAULT_SHUTDOWN_TOTAL_MS: u64 = 40_000;

/// Shared by deployment assembly, managed deployment validation and serving
/// nodes. Operators must configure the same policy on all three paths.
pub fn max_asset_file_bytes() -> anyhow::Result<u64> {
    // A manifest can contain thousands of entries. Cache the policy so each
    // entry neither allocates an environment string nor observes a new limit.
    // Keep parse failures fallible for library callers that skip startup validation.
    static LIMIT: std::sync::OnceLock<Result<u64, String>> = std::sync::OnceLock::new();
    LIMIT
        .get_or_init(|| {
            positive_or("CELLD_MAX_ASSET_FILE_BYTES", 25 * 1024 * 1024)
                .map_err(|error| error.to_string())
        })
        .as_ref()
        .copied()
        .map_err(|message| anyhow!("{message}"))
}

/// One process stop budget and the internal waits derived from it.
/// The absolute deadline also bounds progress extensions, so neither wait
/// grants time beyond the supervisor-facing process budget.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ShutdownTiming {
    pub total_ms: u64,
    pub drain_token_wait_ms: u64,
    pub drain_no_progress_ms: u64,
}

impl ShutdownTiming {
    fn from_total_ms(total_ms: u64) -> Self {
        // Preserve the 30-second token wait and 25-second no-progress window
        // at the default 40-second bound. Derive both when that bound changes:
        // independent defaults made a shorter supervisor grace fail startup.
        // Split the arithmetic so even the largest accepted u64 cannot wrap.
        let drain_token_wait_ms = (total_ms / 4) * 3 + (total_ms % 4) * 3 / 4;
        let drain_no_progress_ms = ((total_ms / 8) * 5 + (total_ms % 8) * 5 / 8).max(1);
        Self {
            total_ms,
            drain_token_wait_ms,
            drain_no_progress_ms,
        }
    }
}

/// A variable celld no longer reads, and the sentence that names what an
/// operator must write instead.
///
/// The lists below enumerate the names celld knows, so a name that is not on
/// one of them is never looked at and never reported. That is correct for a
/// name celld never had, but wrong for one it removed: the operator set the
/// removed name on purpose, and the behaviour it bought is gone. A node whose
/// unit file still carries the name would boot clean, log nothing, and serve a
/// deployment that no longer has the binding, so the defect would surface as a
/// `TypeError` in a request handler on a node the operator believes they just
/// configured. Refusing the boot moves that failure to the moment the operator
/// can still read the unit file.
struct Removed {
    name: &'static str,
    /// What the operator must write in place of the line they delete.
    replacement: &'static str,
    /// Whether the removed reader ignored an empty value. Only a value that
    /// once changed the node is stale, so this decides whether `NAME=` is a
    /// line to delete or a line that never did anything. It is a property of
    /// the reader that went away, so each entry must state it for itself: a
    /// removed variable whose reader treated `NAME=` as meaningful sets
    /// `false`, and an operator who templated it to an empty string then still
    /// gets the refusal they need.
    empty_was_inert: bool,
}

const REMOVED: &[Removed] = &[
    Removed {
        name: "CELLD_TEST_OTEL_SWEEP_MS",
        replacement: "remove this setting; celld manages the telemetry retention cadence",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_OTEL_SINK",
        replacement: "set CELLD_OTEL=1 for the fleet bucket or CELLD_OTEL=<collector URL> for OTLP",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_AI_BINDING",
        replacement: "remove this setting; call the AI provider from application code",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_AI_URL",
        replacement: "remove this setting; call the AI provider from application code",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_PACED_HANDOFF",
        replacement:
            "remove this setting; celld hands off ownership within CELLD_SHUTDOWN_TOTAL_MS",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_LOG_GROUP_COMMIT_MS",
        replacement: "remove this setting; celld uses its built-in Queue batching policy",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_QUEUE_PRODUCER_GROUP_MS",
        replacement: "remove this setting; celld uses its built-in Queue batching policy",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_LOG_BUNDLE",
        replacement: "remove this setting; fleet durability uses bundled tiering",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_PRESENCE_SHADOW",
        replacement:
            "remove this setting; managed presence no longer compares a shadow lease report",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_STORAGE_PROBE",
        replacement: "remove this setting; celld checks the storage contract before serving",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_EVICTIONS",
        replacement: "remove this setting; celld uses its built-in scheduling limits",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_LOG_CAPTURE_WORKERS",
        replacement: "remove this setting; celld uses its built-in scheduling limits",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_REBALANCE_BATCH_CELLS",
        replacement: "remove this setting; celld uses its built-in scheduling limits",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_CLOUD_RESTART_ON_DEPLOY",
        replacement: "remove this setting; managed deployments are adopted in place",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_OUTPUT_GATE",
        replacement: "remove this setting; celld always waits for durability proof",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_DRAIN_TOKEN_WAIT_MS",
        replacement: "set only CELLD_SHUTDOWN_TOTAL_MS; celld derives the drain-token wait",
        // Zero disabled the token wait, and an empty value failed parsing.
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_SHUTDOWN_DRAIN_MS",
        replacement:
            "set only CELLD_SHUTDOWN_TOTAL_MS; celld derives the handoff no-progress interval",
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_MAX_LOADED_WORKERS",
        replacement: "remove this setting; celld manages Dynamic Worker admission",
        // Even an empty value failed in the old typed reader. Refuse it rather
        // than silently changing the operator's configured admission policy.
        empty_was_inert: false,
    },
    Removed {
        name: "CELLD_WORKER_LOADER",
        replacement: "declare `worker_loaders` in the project config",
        // The reader this replaced was
        // `var("CELLD_WORKER_LOADER").ok().filter(|name| !name.is_empty())`, so
        // an empty value never bound a loader. A deployment system that
        // templates every known name to an empty string must not lose an
        // upgrade on a node that never used the feature.
        empty_was_inert: true,
    },
    Removed {
        name: "CELLD_VARS_FILE",
        replacement: "set `vars` in the Wrangler config, or `.dev.vars` for `celld dev`",
        // The former reader used the path verbatim, so `CELLD_VARS_FILE=`
        // selected an empty path and failed instead of doing nothing. An
        // operator must therefore delete the empty setting.
        empty_was_inert: false,
    },
];

/// The removed `CELLD_VAR_<NAME>` family. It is a prefix and not a name, so
/// the table above cannot hold it: celld never knew which names an operator
/// used. A node started with any of them would run with no override at all,
/// which reads inside a Worker as a missing secret with nothing in the log.
const REMOVED_PREFIX: (&str, &str) = (
    "CELLD_VAR_",
    "set `vars` in the Wrangler config, or `.dev.vars` for `celld dev`",
);

/// Validate every typed production variable before the runtime starts.
///
/// Some consumers cache a value or read it from a synchronous callback, so
/// they cannot return a configuration error at the point of use. This pass
/// makes those reads infallible without giving malformed values a default.
pub fn validate() -> anyhow::Result<()> {
    // Each entry carries its own empty-value rule, because whether `NAME=` was
    // inert is a property of the reader that went away and not of removal.
    for removed in REMOVED {
        let Some(value) = std::env::var_os(removed.name) else {
            continue;
        };
        if removed.empty_was_inert && value.is_empty() {
            continue;
        }
        bail!("{} is removed; {}", removed.name, removed.replacement);
    }
    let (prefix, replacement) = REMOVED_PREFIX;
    if let Some(name) = std::env::vars_os().find_map(|(name, _)| {
        let name = name.to_string_lossy().into_owned();
        name.starts_with(prefix).then_some(name)
    }) {
        bail!("{name} is removed; {replacement}");
    }

    for name in [
        "CELLD_CLOUD",
        "CELLD_LTX_COMPACTION",
        "CELLD_LTX_PAGED",
        "CELLD_TRUST_FORWARDED_HEADERS",
        "CELLD_UNSAFE_PUBLIC_ADVERTISE",
    ] {
        flag(name, false)?;
    }

    for name in [
        "CELLD_ACTIVATIONS",
        "CELLD_DEPLOY_POLL_S",
        "CELLD_FETCH_TIMEOUT_S",
        "CELLD_HANDLER_BUDGET_S",
        "CELLD_IDLE_EVICT_S",
        "CELLD_LOG_PIPELINE",
        "CELLD_LTX_COMPACTIONS",
        "CELLD_LTX_COMPACTION_MIN_TXIDS",
        "CELLD_LTX_DURABILITY_TIMEOUT_SECS",
        "CELLD_MAX_CELL_REQUESTS",
        "CELLD_MAX_ASSET_FILE_BYTES",
        "CELLD_MAX_OUTBOUND_WEBSOCKETS",
        "CELLD_MAX_REQUEST_BODY_BYTES",
        "CELLD_MAX_REQUESTS",
        "CELLD_RECOVERY_RETRY_MS",
        "CELLD_RECOVERY_RETRIES",
        "CELLD_MAX_STATELESS_ISOLATES",
        "CELLD_OPERATION_DEADLINE_MS",
        "CELLD_PLACEMENT_WEIGHT",
        "CELLD_RELEASES",
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
        "CELLD_LOCAL_CACHE_MAX_BYTES",
        "CELLD_LTX_TRUNCATE_PAGES",
        "CELLD_LTX_RETENTION_SECS",
        "CELLD_LOG_HEDGE_MS",
        "CELLD_LOG_WINDOW",
        "CELLD_LOG_WINDOW_BYTES",
        "CELLD_MAX_RESIDENT_CELLS",
        "CELLD_MAX_RSS_MB",
        "CELLD_READY_FLEET_GATE_MS",
        "CELLD_REBALANCE_INTERVAL_MS",
    ] {
        optional::<u64>(name)?;
    }

    shutdown_timing()?;

    positive::<usize>("CELLD_MAX_DYNAMIC_WORKER_CODE_BYTES")?;

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
    if let Some(node) = value("CELLD_NODE")? {
        crate::machine::validate_node_name(&node).map_err(|error| anyhow!("CELLD_NODE {error}"))?;
    }
    Ok(())
}

/// Resolve all shutdown timing from the operator's complete process bound.
/// Token acquisition consumes at most three quarters of that bound. The
/// no-progress interval is five eighths, with a one-millisecond minimum.
/// The process deadline still caps every shutdown phase and progress reset.
pub fn shutdown_timing() -> anyhow::Result<ShutdownTiming> {
    let total_ms = positive("CELLD_SHUTDOWN_TOTAL_MS")?.unwrap_or(DEFAULT_SHUTDOWN_TOTAL_MS);
    Ok(ShutdownTiming::from_total_ms(total_ms))
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
