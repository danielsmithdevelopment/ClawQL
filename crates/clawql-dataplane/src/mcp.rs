//! Minimal Streamable-HTTP JSON-RPC surface for `initialize`, `tools/list`, `tools/call` (execute).
//! Phase A: not full `rmcp` — swap later if SDK overhead is acceptable.

use crate::catalog::SharedCatalog;
use crate::execute::{execute_rest, ExecuteRequest};
use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::HashMap;
#[derive(Clone)]
pub struct AppState {
    pub catalog: SharedCatalog,
    pub http: Client,
}

pub async fn mcp_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    // JSON-RPC batch not supported in Phase A.
    let id = body.get("id").cloned().unwrap_or(Value::Null);
    let method = body
        .get("method")
        .and_then(|m| m.as_str())
        .unwrap_or("");

    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "clawql-dataplane", "version": "0.1.0-spike" }
        })),
        "notifications/initialized" | "ping" => {
            // notifications have no response id sometimes — still return ok for simplicity
            Ok(json!({}))
        }
        "tools/list" => Ok(json!({
            "tools": [
                {
                    "name": "execute",
                    "description": "Execute a known OpenAPI operation (Phase A bare path — no governance)",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "operationId": { "type": "string" },
                            "args": { "type": "object" },
                            "where": { "type": "string" },
                            "fields": { "type": "array", "items": { "type": "string" } }
                        },
                        "required": ["operationId"]
                    }
                },
                {
                    "name": "tools_list_ops",
                    "description": "List operationIds from the loaded catalog (spike helper)",
                    "inputSchema": { "type": "object", "properties": {} }
                }
            ]
        })),
        "tools/call" => handle_tools_call(&state, body.get("params")).await,
        _ => Err(rpc_error(-32601, format!("Method not found: {method}"))),
    };

    let accept = headers
        .get(header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let _wants_sse = accept.contains("text/event-stream");

    match result {
        Ok(value) => {
            let resp = json!({ "jsonrpc": "2.0", "id": id, "result": value });
            (StatusCode::OK, Json(resp)).into_response()
        }
        Err(err) => {
            let resp = json!({ "jsonrpc": "2.0", "id": id, "error": err });
            (StatusCode::OK, Json(resp)).into_response()
        }
    }
}

fn rpc_error(code: i64, message: String) -> Value {
    json!({ "code": code, "message": message })
}

async fn handle_tools_call(state: &AppState, params: Option<&Value>) -> Result<Value, Value> {
    let params = params.ok_or_else(|| rpc_error(-32602, "missing params".into()))?;
    let name = params
        .get("name")
        .and_then(|n| n.as_str())
        .ok_or_else(|| rpc_error(-32602, "missing tool name".into()))?;
    let args = params.get("arguments").cloned().unwrap_or(json!({}));

    match name {
        "tools_list_ops" => {
            let ids: Vec<&str> = state.catalog.list().map(|o| o.id.as_str()).collect();
            Ok(tool_text(json!({ "operationIds": ids })))
        }
        "execute" => {
            let operation_id = args
                .get("operationId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| rpc_error(-32602, "operationId required".into()))?
                .to_string();
            let mut map = HashMap::new();
            if let Some(Value::Object(obj)) = args.get("args") {
                for (k, v) in obj {
                    map.insert(k.clone(), v.clone());
                }
            }
            let where_expr = args
                .get("where")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let fields = args.get("fields").and_then(|v| {
                v.as_array().map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
            });

            let result = execute_rest(
                &state.http,
                &state.catalog,
                ExecuteRequest {
                    operation_id,
                    args: map,
                    where_expr,
                    fields,
                },
            )
            .await
            .map_err(|e| rpc_error(-32000, e.to_string()))?;

            Ok(tool_text(json!({
                "ok": result.ok,
                "status": result.status,
                "latencyMs": result.latency_ms,
                "url": result.url,
                "body": result.body,
                "governance": "phase-a-none"
            })))
        }
        other => Err(rpc_error(-32602, format!("unknown tool {other}"))),
    }
}

fn tool_text(value: Value) -> Value {
    json!({
        "content": [{ "type": "text", "text": value.to_string() }],
        "isError": false
    })
}

pub fn router(state: AppState) -> axum::Router {
    use axum::routing::{get, post};
    axum::Router::new()
        .route("/mcp", post(mcp_post))
        .route("/healthz", get(|| async { "ok" }))
        .with_state(state)
}

/// Shared HTTP client for upstream keep-alive.
pub fn upstream_client() -> Client {
    Client::builder()
        .pool_max_idle_per_host(32)
        .tcp_nodelay(true)
        .build()
        .expect("reqwest client")
}
