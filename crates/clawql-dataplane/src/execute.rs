//! Bare REST execute (Phase A — no governance).

use crate::catalog::{Catalog, Operation};
use crate::where_filter::{apply_where, WhereFilterError};
use anyhow::{bail, Context, Result};
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Instant;

#[derive(Debug)]
pub struct ExecuteRequest {
    pub operation_id: String,
    pub args: HashMap<String, Value>,
    pub where_expr: Option<String>,
    pub fields: Option<Vec<String>>,
}

#[derive(Debug)]
pub struct ExecuteResponse {
    pub ok: bool,
    pub status: u16,
    pub body: Value,
    pub latency_ms: f64,
    pub url: String,
}

fn substitute_path(template: &str, args: &HashMap<String, Value>) -> Result<(String, Vec<String>)> {
    let mut used = Vec::new();
    let mut out = String::new();
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        let (name_part, close_idx) = if let Some(i) = after.find('}') {
            (&after[..i], i)
        } else {
            bail!("unclosed path param in {template}");
        };
        let name = name_part.trim_start_matches('+');
        let val = args
            .get(name)
            .and_then(|v| match v {
                Value::String(s) => Some(s.clone()),
                Value::Number(n) => Some(n.to_string()),
                Value::Bool(b) => Some(b.to_string()),
                _ => None,
            })
            .with_context(|| format!("missing path arg {name}"))?;
        used.push(name.to_string());
        out.push_str(&urlencoding_simple(&val));
        rest = &after[close_idx + 1..];
    }
    out.push_str(rest);
    Ok((out, used))
}

fn urlencoding_simple(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn project_fields(body: Value, fields: &[String]) -> Value {
    match body {
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for f in fields {
                if let Some(v) = map.get(f) {
                    out.insert(f.clone(), v.clone());
                }
            }
            Value::Object(out)
        }
        other => other,
    }
}

pub async fn execute_rest(
    client: &Client,
    catalog: &Catalog,
    req: ExecuteRequest,
) -> Result<ExecuteResponse> {
    let op: &Operation = catalog
        .get(&req.operation_id)
        .with_context(|| format!("unknown operationId {}", req.operation_id))?;

    let path_template = if op.path.contains("{+") {
        op.path.as_str()
    } else if !op.flat_path.is_empty() {
        op.flat_path.as_str()
    } else {
        op.path.as_str()
    };
    let (path, used_path) = substitute_path(path_template, &req.args)?;

    let mut url = format!(
        "{}{}",
        catalog.base_url.trim_end_matches('/'),
        if path.starts_with('/') {
            path
        } else {
            format!("/{path}")
        }
    );

    let method = op.method.to_uppercase();
    let mut query: Vec<(String, String)> = Vec::new();
    let mut body_obj = serde_json::Map::new();

    for (k, v) in &req.args {
        if used_path.iter().any(|p| p == k) {
            continue;
        }
        let param = op.parameters.get(k);
        let location = param.map(|p| p.location.as_str()).unwrap_or("body");
        match location {
            "query" => {
                let s = match v {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                query.push((k.clone(), s));
            }
            "path" => {}
            _ => {
                body_obj.insert(k.clone(), v.clone());
            }
        }
    }

    if !query.is_empty() {
        let q: String = query
            .iter()
            .map(|(k, v)| format!("{}={}", urlencoding_simple(k), urlencoding_simple(v)))
            .collect::<Vec<_>>()
            .join("&");
        url.push('?');
        url.push_str(&q);
    }

    let start = Instant::now();
    let builder = match method.as_str() {
        "GET" => client.get(&url),
        "DELETE" => client.delete(&url),
        "POST" => client.post(&url).json(&Value::Object(body_obj)),
        "PUT" => client.put(&url).json(&Value::Object(body_obj)),
        "PATCH" => client.patch(&url).json(&Value::Object(body_obj)),
        other => bail!("unsupported method {other}"),
    };

    let resp = builder.send().await.context("upstream request")?;
    let status = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();
    let latency_ms = start.elapsed().as_secs_f64() * 1000.0;

    let mut body: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({ "raw": text }));

    if let Some(ref w) = req.where_expr {
        body = apply_where(&body, w).map_err(|e: WhereFilterError| anyhow::anyhow!(e))?;
    }
    if let Some(ref fields) = req.fields {
        if !fields.is_empty() {
            body = project_fields(body, fields);
        }
    }

    Ok(ExecuteResponse {
        ok: (200..300).contains(&status),
        status,
        body,
        latency_ms,
        url,
    })
}
