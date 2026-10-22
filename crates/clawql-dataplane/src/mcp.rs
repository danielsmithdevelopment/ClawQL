//! Streamable HTTP MCP surface aligned with Bun/Node host expectations
//! (`src/http/mcp-http-server.ts` + MCP SDK):
//! - `Accept` must include both `application/json` and `text/event-stream`
//! - Sessionful: `initialize` mints `mcp-session-id`; later POSTs require it
//! - JSON response mode (same as `CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE=1`)
//! - `notifications/initialized` → 202 empty
//! - Tool domain failures stay in `result` with `isError` / body JSON (not always top-level RPC error)

use crate::catalog::SharedCatalog;
use crate::execute::{execute_rest, ExecuteRequest};
use crate::risk::{classify_http_operation, governance_enabled, RiskPolicy};
use axum::extract::State;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use parking_lot::Mutex;
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

fn stall_slow_ms() -> f64 {
    std::env::var("CLAWQL_HTTP_SLOW_MS")
        .or_else(|_| std::env::var("CLAWQL_DATAPLANE_SLOW_MS"))
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0.0)
}

fn timing_on() -> bool {
    stall_slow_ms() > 0.0
        || matches!(
            std::env::var("CLAWQL_HTTP_TIMING")
                .unwrap_or_default()
                .trim()
                .to_ascii_lowercase()
                .as_str(),
            "1" | "true" | "yes" | "on"
        )
}

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
    let timing = timing_on();
    let t0 = Instant::now();
    let t0_iso = if timing {
        humantime_iso_now()
    } else {
        String::new()
    };

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

    let mut upstream_ms: Option<f64> = None;
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
        "tools/call" => {
            let (value, up) = handle_tools_call(&state, body.get("params")).await;
            upstream_ms = up;
            value
        }
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
    if timing {
        let total_ms = t0.elapsed().as_secs_f64() * 1000.0;
        if let Ok(v) = HeaderValue::from_str(&t0_iso) {
            response.headers_mut().insert("x-clawql-server-t0", v);
        }
        if let Ok(v) = HeaderValue::from_str(&format!("{total_ms:.3}")) {
            response.headers_mut().insert("x-clawql-server-ms", v);
        }
        if let Some(up) = upstream_ms {
            if let Ok(v) = HeaderValue::from_str(&format!("{up:.3}")) {
                response.headers_mut().insert("x-clawql-upstream-ms", v);
            }
        }
        let slow = stall_slow_ms();
        if slow > 0.0 && total_ms >= slow {
            let tool = body
                .pointer("/params/name")
                .and_then(|v| v.as_str())
                .unwrap_or("-");
            let up_s = upstream_ms
                .map(|u| format!("{u:.1}"))
                .unwrap_or_else(|| "-".into());
            let non_up = upstream_ms
                .map(|u| format!("{:.1}", (total_ms - u).max(0.0)))
                .unwrap_or_else(|| "-".into());
            eprintln!(
                "[clawql-dataplane-slow] {total_ms:.1}ms phase=handleRequest method={method} tool={tool} \
                 t0={t0_iso} t1={} upstream_ms={up_s} non_upstream_ms={non_up} session={}",
                humantime_iso_now(),
                session_hdr.as_deref().unwrap_or("-")
            );
        }
    }
    response
}

fn humantime_iso_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let millis = dur.subsec_millis();
    // UTC ISO-8601 without chrono dependency (good enough for stall correlation).
    let days = secs / 86400;
    let tod = secs % 86400;
    let h = tod / 3600;
    let m = (tod % 3600) / 60;
    let s = tod % 60;
    // Civil date from Unix days (Howard Hinnant algorithm).
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}.{millis:03}Z"
    )
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

/// Returns (JSON-RPC tool result, optional upstream REST latency ms).
async fn handle_tools_call(
    state: &AppState,
    params: Option<&Value>,
) -> (Result<Value, Value>, Option<f64>) {
    let params = match params {
        Some(p) => p,
        None => return (Err(rpc_error(-32602, "missing params".into())), None),
    };
    let name = match params.get("name").and_then(|n| n.as_str()) {
        Some(n) => n,
        None => return (Err(rpc_error(-32602, "missing tool name".into())), None),
    };
    let args = params.get("arguments").cloned().unwrap_or(json!({}));

    match name {
        "tools_list_ops" => {
            let mut ids: Vec<&str> = state.catalog.list().map(|o| o.id.as_str()).collect();
            ids.sort_unstable();
            (
                Ok(tool_text(json!({ "operationIds": ids, "count": ids.len() }))),
                None,
            )
        }
        "execute" => {
            let operation_id = match args.get("operationId").and_then(|v| v.as_str()) {
                Some(s) => s.to_string(),
                None => {
                    return (
                        Err(rpc_error(-32602, "operationId required".into())),
                        None,
                    )
                }
            };
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

            let op = match state.catalog.get(&operation_id) {
                Some(o) => o,
                None => {
                    return (
                        Err(rpc_error(
                            -32602,
                            format!("unknown operationId {operation_id}"),
                        )),
                        None,
                    )
                }
            };
            let risk = classify_http_operation(op);
            let gov_on = governance_enabled();
            let mandate_token = args
                .get("mandate")
                .or_else(|| args.get("mandateToken"))
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());

            if gov_on {
                match risk.policy {
                    RiskPolicy::Block => {
                        return (
                            Ok(tool_text(json!({
                                "ok": false,
                                "parked": false,
                                "denied": true,
                                "operationId": operation_id,
                                "risk": {
                                    "policy": "block",
                                    "reason": risk.reason,
                                    "source": risk.source
                                },
                                "governance": "phase-b",
                                "comparisonLabel": "governance"
                            }))),
                            None,
                        );
                    }
                    RiskPolicy::Mandate if mandate_token.is_none() => {
                        // Phase B stub: park without Postgres consume yet.
                        return (
                            Ok(tool_text(json!({
                                "ok": false,
                                "parked": true,
                                "denied": false,
                                "operationId": operation_id,
                                "risk": {
                                    "policy": "mandate",
                                    "reason": risk.reason,
                                    "source": risk.source
                                },
                                "governance": "phase-b-park-stub",
                                "comparisonLabel": "governance",
                                "note": "Mandate consume (Postgres UPDATE…WHERE) lands in a later Phase B slice"
                            }))),
                            None,
                        );
                    }
                    RiskPolicy::Allow | RiskPolicy::Mandate => {}
                }
            }

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
                Ok(result) => (
                    Ok(tool_text(json!({
                        "ok": result.ok,
                        "status": result.status,
                        "latencyMs": result.latency_ms,
                        "url": result.url,
                        "body": result.body,
                        "operationId": operation_id,
                        "risk": {
                            "policy": match risk.policy {
                                RiskPolicy::Allow => "allow",
                                RiskPolicy::Mandate => "mandate",
                                RiskPolicy::Block => "block",
                            },
                            "reason": risk.reason,
                            "source": risk.source
                        },
                        "governance": if gov_on { "phase-b" } else { "phase-a-none" },
                        "comparisonLabel": if gov_on { "governance" } else { "fast-path-only" }
                    }))),
                    Some(result.latency_ms),
                ),
                Err(e) => {
                    // Domain execute failure: stay in result with isError (MCP tool convention).
                    (
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
                        })),
                        None,
                    )
                }
            }
        }
        other => (
            Err(rpc_error(-32602, format!("unknown tool {other}"))),
            None,
        ),
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
