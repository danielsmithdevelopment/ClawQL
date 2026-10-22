//! JMESPath `where` — same caps as TypeScript `where-filter.ts` (ADR 0015).

use jmespath::ToJmespath;
use thiserror::Error;

pub const WHERE_MAX_LENGTH: usize = 512;
pub const WHERE_MAX_PIPES: usize = 6;
pub const WHERE_MAX_NEST_DEPTH: usize = 8;
pub const WHERE_MAX_FUNCTION_CALLS: usize = 8;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum WhereFilterError {
    #[error("where expression is empty")]
    Empty,
    #[error("where expression exceeds {WHERE_MAX_LENGTH} characters")]
    TooLong,
    #[error("where expression too complex")]
    TooComplex,
    #[error("invalid where expression: {0}")]
    Invalid(String),
}

fn count_pipes(expression: &str) -> usize {
    let mut count = 0;
    let mut in_single = false;
    let mut in_backtick = false;
    for ch in expression.chars() {
        match ch {
            '\'' if !in_backtick => in_single = !in_single,
            '`' if !in_single => in_backtick = !in_backtick,
            '|' if !in_single && !in_backtick => count += 1,
            _ => {}
        }
    }
    count
}

fn max_nest_depth(expression: &str) -> usize {
    let mut depth = 0usize;
    let mut max = 0usize;
    let mut in_single = false;
    let mut in_backtick = false;
    for ch in expression.chars() {
        match ch {
            '\'' if !in_backtick => in_single = !in_single,
            '`' if !in_single => in_backtick = !in_backtick,
            '[' | '(' if !in_single && !in_backtick => {
                depth += 1;
                max = max.max(depth);
            }
            ']' | ')' if !in_single && !in_backtick => {
                depth = depth.saturating_sub(1);
            }
            _ => {}
        }
    }
    max
}

fn count_function_calls(expression: &str) -> usize {
    let bytes = expression.as_bytes();
    let mut count = 0;
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i].is_ascii_alphabetic() {
            let start = i;
            i += 1;
            while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
                i += 1;
            }
            let mut j = i;
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < bytes.len() && bytes[j] == b'(' && start < i {
                count += 1;
            }
            continue;
        }
        i += 1;
    }
    count
}

pub fn validate_where(expression: &str) -> Result<(), WhereFilterError> {
    let trimmed = expression.trim();
    if trimmed.is_empty() {
        return Err(WhereFilterError::Empty);
    }
    if trimmed.len() > WHERE_MAX_LENGTH {
        return Err(WhereFilterError::TooLong);
    }
    if count_pipes(trimmed) > WHERE_MAX_PIPES
        || max_nest_depth(trimmed) > WHERE_MAX_NEST_DEPTH
        || count_function_calls(trimmed) > WHERE_MAX_FUNCTION_CALLS
    {
        return Err(WhereFilterError::TooComplex);
    }
    Ok(())
}

/// jmespath.js accepts unquoted backtick tokens (`A`, `audit-target.example`) as
/// string literals. The Rust `jmespath` crate requires valid JSON inside backticks
/// (`"A"`, `1`, `true`). Rewrite non-JSON backtick bodies to JSON strings so CF
/// known-op shapes match the TypeScript host.
fn normalize_jmespath_js_literals(expression: &str) -> String {
    let mut out = String::with_capacity(expression.len());
    let mut chars = expression.chars().peekable();
    let mut in_single = false;
    while let Some(ch) = chars.next() {
        if ch == '\'' && !in_single {
            // entering/leaving handled below — track only outside backticks
        }
        if ch == '\'' {
            in_single = !in_single;
            out.push(ch);
            continue;
        }
        if ch == '`' && !in_single {
            let mut body = String::new();
            for c in chars.by_ref() {
                if c == '`' {
                    break;
                }
                body.push(c);
            }
            let trimmed = body.trim();
            let is_json = serde_json::from_str::<serde_json::Value>(trimmed).is_ok();
            if is_json {
                out.push('`');
                out.push_str(trimmed);
                out.push('`');
            } else {
                out.push('`');
                out.push_str(&serde_json::to_string(trimmed).unwrap_or_else(|_| {
                    format!("\"{}\"", trimmed.replace('\\', "\\\\").replace('"', "\\\""))
                }));
                out.push('`');
            }
            continue;
        }
        out.push(ch);
    }
    out
}

pub fn apply_where(body: &serde_json::Value, expression: &str) -> Result<serde_json::Value, WhereFilterError> {
    validate_where(expression)?;
    let normalized = normalize_jmespath_js_literals(expression.trim());
    let expr = jmespath::compile(&normalized)
        .map_err(|e| WhereFilterError::Invalid(e.to_string()))?;
    let data = body
        .to_jmespath()
        .map_err(|e| WhereFilterError::Invalid(e.to_string()))?;
    let result = expr
        .search(data)
        .map_err(|e| WhereFilterError::Invalid(e.to_string()))?;
    serde_json::to_value(&*result).map_err(|e| WhereFilterError::Invalid(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn filters_array() {
        let body = json!({"pets":[{"id":1,"name":"a"},{"id":2,"name":"b"}]});
        let out = apply_where(&body, "pets[?id==`1`]").unwrap();
        assert_eq!(out, json!([{"id":1,"name":"a"}]));
    }

    #[test]
    fn accepts_js_style_backtick_strings() {
        let body = json!({"result":[{"type":"A","name":"x"},{"type":"AAAA","name":"y"}]});
        let out = apply_where(&body, "result[?type==`A`].name").unwrap();
        assert_eq!(out, json!(["x"]));
    }

    #[test]
    fn rejects_empty() {
        assert_eq!(validate_where("  "), Err(WhereFilterError::Empty));
    }
}
