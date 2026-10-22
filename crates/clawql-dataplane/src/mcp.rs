//! Streamable HTTP MCP surface aligned with Bun/Node host expectations
//! (`src/http/mcp-http-server.ts` + MCP SDK):
//! - `Accept` must include both `application/json` and `text/event-stream`
//! - Sessionful: `initialize` mints `mcp-session-id`; later POSTs require it
//! - JSON response mode (same as `CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE=1`)
//! - `notifications/initialized` → 202 empty
//! - Tool domain failures stay in `result` with `isError` / body JSON (not always top-level RPC error)

use crate::catalog::SharedCatalog;
use crate::execute::{execute_rest, ExecuteRequest};
use axum::extract::State;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use parking_lot::Mutex;
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use uuid::Uuid;

const PROTOCOL_VERSION: &str = "2025-11-25";
const SESSION_HEADER: &str = "mcp-session-id";
const PROTOCOL_HEADER: &str = "mcp-protocol-version";

#[derive(Clone)]
pub struct AppState {
    pub catalog: SharedCatalog,
    pub http: Client,
    pub sessions: Arc<Mutex<HashSet<String>>>,
    /// When true, skip session affinity (MCP 2026-07-28 / CLAWQL_MCP_STATELESS).
    pub stateless: bool,
}

pub async fn mcp_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    if let Some(resp) = reject_accept(&headers) {
        return resp;
    }

    let id = body.get("id").cloned().unwrap_or(Value::Null);
    let method = body
        .get("method")
        .and_then(|m| m.as_str())
        .unwrap_or("");
    let is_notification = id.is_null() && method.starts_with("notifications/");

    let client_protocol = headers
        .get(PROTOCOL_HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let use_stateless = state.stateless
        || client_protocol == "2026-07-28"
        || body
            .pointer("/params/protocolVersion")
            .and_then(|v| v.as_str())
            == Some("2026-07-28");

    let session_hdr = headers
        .get(SESSION_HEADER)
        .or_else(|| headers.get("Mcp-Session-Id"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let mut new_session: Option<String> = None;

    if !use_stateless {
        if method == "initialize" && session_hdr.is_none() {
            let sid = Uuid::new_v4().to_string();
            state.sessions.lock().insert(sid.clone());
            new_session = Some(sid);
        } else if let Some(ref sid) = session_hdr {
            if !state.sessions.lock().contains(sid) {
                return json_rpc_http_error(
                    StatusCode::BAD_REQUEST,
                    -32000,
                    "Bad Request: missing/invalid mcp-session-id, or initialize request required",
                );
            }
        } else if method != "initialize" {
            return json_rpc_http_error(
                StatusCode::BAD_REQUEST,
                -32000,
                "Bad Request: missing/invalid mcp-session-id, or initialize request required. For MCP 2026-07-28 send mcp-protocol-version: 2026-07-28.",
            );
        }
    }

    if is_notification || method == "notifications/initialized" {
        let mut res = StatusCode::ACCEPTED.into_response();
        attach_session_headers(
            &mut res,
            new_session.as_deref().or(session_hdr.as_deref()),
            client_protocol,
        );
        return res;
    }

    let result = match method {
        "initialize" => {
            let requested = body
                .pointer("/params/protocolVersion")
                .and_then(|v| v.as_str())
                .unwrap_or(PROTOCOL_VERSION);
            Ok(json!({
                "protocolVersion": requested,
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "clawql-dataplane", "version": "0.1.0-spike" }
            }))
        }
        "ping" => Ok(json!({})),
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

    let mut response = match result {
        Ok(value) => {
            let resp = json!({ "jsonrpc": "2.0", "id": id, "result": value });
            (StatusCode::OK, Json(resp)).into_response()
        }
        Err(err) => {
            // Protocol-level JSON-RPC errors (unknown method/params) — HTTP 200 with error object,
            // matching common MCP client expectations for RPC errors on established sessions.
            let resp = json!({ "jsonrpc": "2.0", "id": id, "error": err });
            (StatusCode::OK, Json(resp)).into_response()
        }
    };
    attach_session_headers(
        &mut response,
        new_session.as_deref().or(session_hdr.as_deref()),
        client_protocol,
    );
    response
}

async fn mcp_get(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if state.stateless {
        return json_rpc_http_error(
            StatusCode::METHOD_NOT_ALLOWED,
            -32000,
            "SSE listen not used in stateless mode",
        );
    }
    let sid = headers
        .get(SESSION_HEADER)
        .or_else(|| headers.get("Mcp-Session-Id"))
        .and_then(|v| v.to_str().ok());
    match sid {
        Some(sid) if state.sessions.lock().contains(sid) => {
            // Minimal SSE open — no server-push events in Phase A.
            let mut res = (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "text/event-stream")],
                ": connected\n\n",
            )
                .into_response();
            attach_session_headers(&mut res, Some(sid), "");
            res
        }
        _ => json_rpc_http_error(
            StatusCode::BAD_REQUEST,
            -32000,
            "Bad Request: missing/invalid mcp-session-id",
        ),
    }
}

async fn mcp_delete(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Some(sid) = headers
        .get(SESSION_HEADER)
        .or_else(|| headers.get("Mcp-Session-Id"))
        .and_then(|v| v.to_str().ok())
    {
        state.sessions.lock().remove(sid);
    }
    StatusCode::OK.into_response()
}

fn reject_accept(headers: &HeaderMap) -> Option<Response> {
    let accept = headers
        .get(header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    // Allow empty Accept for curl smoke; require both when Accept is present (SDK clients).
    if accept.is_empty() {
        return None;
    }
    if !accept.contains("application/json") || !accept.contains("text/event-stream") {
        return Some(json_rpc_http_error(
            StatusCode::NOT_ACCEPTABLE,
            -32000,
            "Not Acceptable: Client must accept both application/json and text/event-stream",
        ));
    }
    None
}

fn attach_session_headers(res: &mut Response, session: Option<&str>, client_protocol: &str) {
    let headers = res.headers_mut();
    if let Some(sid) = session {
        if let Ok(v) = HeaderValue::from_str(sid) {
            headers.insert(SESSION_HEADER, v);
        }
    }
    let proto = if client_protocol.is_empty() {
        PROTOCOL_VERSION
    } else {
        client_protocol
    };
    if let Ok(v) = HeaderValue::from_str(proto) {
        headers.insert(PROTOCOL_HEADER, v);
    }
}

fn json_rpc_http_error(status: StatusCode, code: i64, message: &str) -> Response {
    let body = json!({
        "jsonrpc": "2.0",
        "error": { "code": code, "message": message },
        "id": null
    });
    (status, Json(body)).into_response()
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
            let mut ids: Vec<&str> = state.catalog.list().map(|o| o.id.as_str()).collect();
            ids.sort_unstable();
            Ok(tool_text(json!({ "operationIds": ids, "count": ids.len() })))
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

            match execute_rest(
                &state.http,
                &state.catalog,
                ExecuteRequest {
                    operation_id: operation_id.clone(),
                    args: map,
                    where_expr,
                    fields,
                },
            )
            .await
            {
                Ok(result) => Ok(tool_text(json!({
                    "ok": result.ok,
                    "status": result.status,
                    "latencyMs": result.latency_ms,
                    "url": result.url,
                    "body": result.body,
                    "operationId": operation_id,
                    "governance": "phase-a-none",
                    "comparisonLabel": "fast-path-only"
                }))),
                Err(e) => {
                    // Domain execute failure: stay in result with isError (MCP tool convention).
                    Ok(json!({
                        "content": [{
                            "type": "text",
                            "text": json!({
                                "ok": false,
                                "error": e.to_string(),
                                "operationId": operation_id,
                                "governance": "phase-a-none",
                                "comparisonLabel": "fast-path-only"
                            }).to_string()
                        }],
                        "isError": true
                    }))
                }
            }
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
        .route("/mcp", post(mcp_post).get(mcp_get).delete(mcp_delete))
        .route(
            "/healthz",
            get(|| async {
                Json(json!({
                    "ok": true,
                    "transport": "streamable-http",
                    "governance": "phase-a-none",
                    "comparisonLabel": "fast-path-only"
                }))
            }),
        )
        .with_state(state)
}

pub fn upstream_client() -> Client {
    Client::builder()
        .pool_max_idle_per_host(32)
        .tcp_nodelay(true)
        .build()
        .expect("reqwest client")
}

pub fn env_stateless() -> bool {
    matches!(
        std::env::var("CLAWQL_MCP_STATELESS")
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "1" | "true" | "yes"
    )
}
