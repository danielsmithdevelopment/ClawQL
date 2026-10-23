//! clawql-dataplane — ADR 0016 Phase A bare execute path (SQLite catalog + Streamable HTTP).

mod args_hash;
mod catalog;
mod cbor_canon;
mod execute;
mod ifc;
mod mcp;
mod mock_upstream;
mod pending;
mod pending_pg;
mod policy;
mod risk;
mod where_filter;
mod worm;

use anyhow::Context;
use catalog::Catalog;
use clap::Parser;
use mcp::{env_stateless, router, upstream_client, AppState};
use parking_lot::Mutex;
use std::collections::HashSet;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

#[derive(Parser, Debug)]
#[command(name = "clawql-dataplane", about = "ADR 0016 Rust execute data-plane spike")]
struct Args {
    /// Listen address for MCP Streamable HTTP (`/mcp`).
    #[arg(long, env = "CLAWQL_DATAPLANE_BIND", default_value = "127.0.0.1:8787")]
    bind: SocketAddr,

    /// Production `catalog.sqlite` path (same file Bun `CLAWQL_CATALOG_SQLITE_PATH` uses).
    #[arg(long, env = "CLAWQL_DATAPLANE_CATALOG")]
    catalog: Option<PathBuf>,

    /// Alias for Bun-compatible env (`CLAWQL_CATALOG_SQLITE_PATH`).
    #[arg(long, env = "CLAWQL_CATALOG_SQLITE_PATH")]
    catalog_sqlite_path: Option<PathBuf>,

    /// Upstream API base URL override (`CLAWQL_API_BASE_URL`). Ignored when `--self-mock`.
    #[arg(long, env = "CLAWQL_DATAPLANE_BASE_URL")]
    base_url: Option<String>,

    /// Spawn in-process mock REST upstream and override catalog base URL.
    #[arg(long, default_value_t = false)]
    self_mock: bool,

    /// Bind for mock upstream (default: ephemeral).
    #[arg(long, env = "CLAWQL_DATAPLANE_MOCK_BIND", default_value = "127.0.0.1:0")]
    mock_bind: SocketAddr,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse()?))
        .init();

    let args = Args::parse();

    let catalog_path = args
        .catalog
        .or(args.catalog_sqlite_path)
        .or_else(|| {
            std::env::var_os("CLAWQL_CATALOG_SQLITE_PATH").map(PathBuf::from)
        })
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/catalog.sqlite")
        });

    let mut catalog = Catalog::load_path(&catalog_path)?;
    tracing::info!(
        path = %catalog.path().display(),
        ops = catalog.len(),
        "loaded SQLite catalog"
    );

    if args.self_mock {
        let mock_listener = tokio::net::TcpListener::bind(args.mock_bind)
            .await
            .context("bind mock upstream")?;
        let mock_addr = mock_listener.local_addr()?;
        tokio::spawn(async move {
            let app = mock_upstream::router();
            if let Err(e) = axum::serve(mock_listener, app).await {
                tracing::error!(error = %e, "mock upstream exited");
            }
        });
        let base = format!("http://{mock_addr}");
        tracing::info!(%base, "self-mock upstream listening");
        catalog = catalog.with_base_url(base);
    } else if let Some(base) = args
        .base_url
        .or_else(|| std::env::var("CLAWQL_API_BASE_URL").ok())
    {
        catalog = catalog.with_base_url(base);
    }

    // Ensure base URL is resolvable before listen (fail fast).
    if let Some(op) = catalog.list().next() {
        let _ = catalog.base_url_for(op).context("resolve catalog base URL")?;
    }

    let pending = match crate::pending::PendingBackend::open_from_env() {
        Ok(s) => {
            tracing::info!(kind = s.name(), backend = %s.describe(), "pending store ready");
            Some(s)
        }
        Err(e) => {
            tracing::warn!(error = %e, "pending store unavailable — mandate park/consume disabled");
            None
        }
    };
    let worm = crate::worm::ProcessWorm::boot_from_env();

    let state = AppState {
        catalog: Arc::new(catalog),
        http: upstream_client(),
        sessions: Arc::new(Mutex::new(HashSet::new())),
        session_labels: crate::ifc::SessionLabelStore::new(),
        pending,
        worm,
        stateless: env_stateless(),
    };
    let app = router(state);

    let listener = tokio::net::TcpListener::bind(args.bind)
        .await
        .with_context(|| format!("bind {}", args.bind))?;
    let addr = listener.local_addr()?;
    let gov = crate::risk::governance_enabled();
    let session_ifc = crate::ifc::session_ifc_enabled();
    let worm_on = crate::worm::worm_enabled();
    tracing::info!(
        %addr,
        governance = gov,
        session_ifc,
        worm = worm_on,
        "clawql-dataplane listening"
    );
    tracing::info!("MCP POST http://{addr}/mcp  healthz http://{addr}/healthz");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutdown");
}
