//! clawql-dataplane — ADR 0016 Phase A bare execute path.

mod catalog;
mod execute;
mod mcp;
mod mock_upstream;
mod policy;
mod where_filter;

use anyhow::Context;
use catalog::Catalog;
use clap::Parser;
use mcp::{router, upstream_client, AppState};
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

    /// JSON catalog path (Phase A stand-in for SQLite).
    #[arg(long, env = "CLAWQL_DATAPLANE_CATALOG")]
    catalog: Option<PathBuf>,

    /// Upstream API base URL. Ignored when `--self-mock` is set.
    #[arg(long, env = "CLAWQL_DATAPLANE_BASE_URL")]
    base_url: Option<String>,

    /// Spawn in-process mock REST upstream and point the catalog at it.
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

    let catalog_path = args.catalog.unwrap_or_else(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/catalog.json")
    });
    let mut catalog = Catalog::load_path(&catalog_path)?;

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
    } else if let Some(base) = args.base_url {
        catalog = catalog.with_base_url(base);
    } else if catalog.base_url.is_empty() || catalog.base_url.contains("127.0.0.1:0") {
        anyhow::bail!("set --base-url or --self-mock (catalog baseUrl is unset)");
    }

    let state = AppState {
        catalog: Arc::new(catalog),
        http: upstream_client(),
    };
    let app = router(state);

    let listener = tokio::net::TcpListener::bind(args.bind)
        .await
        .with_context(|| format!("bind {}", args.bind))?;
    let addr = listener.local_addr()?;
    tracing::info!(%addr, "clawql-dataplane listening (Phase A — no governance)");
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
