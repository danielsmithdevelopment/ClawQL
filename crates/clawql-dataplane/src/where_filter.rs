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

pub fn apply_where(body: &serde_json::Value, expression: &str) -> Result<serde_json::Value, WhereFilterError> {
    validate_where(expression)?;
    let expr = jmespath::compile(expression.trim())
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
    fn rejects_empty() {
        assert_eq!(validate_where("  "), Err(WhereFilterError::Empty));
    }
}
