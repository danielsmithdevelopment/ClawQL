//! Operation risk classification — Phase B (mirror `classify-operation-risk.ts` HTTP defaults).
//!
//! Policies:
//! - `allow` — proceed to upstream
//! - `mandate` — park for approval unless a mandate token is supplied (Phase B stub parks)
//! - `block` — deny without upstream call

use crate::catalog::Operation;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskPolicy {
    Allow,
    Mandate,
    Block,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationRisk {
    pub policy: RiskPolicy,
    pub reason: String,
    pub source: &'static str,
}

/// Classify OpenAPI/REST ops by HTTP method (same defaults as TypeScript).
pub fn classify_http_operation(op: &Operation) -> OperationRisk {
    let m = op.method.trim().to_uppercase();
    match m.as_str() {
        "GET" | "HEAD" => OperationRisk {
            policy: RiskPolicy::Allow,
            reason: format!("HTTP {m} is read-only by default"),
            source: "spec-default",
        },
        "POST" | "PUT" | "PATCH" => OperationRisk {
            policy: RiskPolicy::Mandate,
            reason: format!("HTTP {m} is a write by default (override if read-only)"),
            source: "spec-default",
        },
        "DELETE" => OperationRisk {
            policy: RiskPolicy::Block,
            reason: "HTTP DELETE is destructive unless allowlisted".into(),
            source: "spec-default",
        },
        _ => OperationRisk {
            policy: RiskPolicy::Mandate,
            reason: format!("Unclassifiable HTTP method \"{m}\" → mandate"),
            source: "unknown-default",
        },
    }
}

/// Whether governance checks are enabled (`CLAWQL_DATAPLANE_GOVERNANCE=1`).
pub fn governance_enabled() -> bool {
    matches!(
        std::env::var("CLAWQL_DATAPLANE_GOVERNANCE")
            .unwrap_or_default()
            .trim()
            .to_lowercase()
            .as_str(),
        "1" | "true" | "yes"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::Operation;
    use std::collections::HashMap;

    fn op(method: &str) -> Operation {
        Operation {
            id: "x".into(),
            method: method.into(),
            path: "/x".into(),
            flat_path: String::new(),
            description: String::new(),
            parameters: HashMap::new(),
            spec_index: 0,
            spec_label: None,
        }
    }

    #[test]
    fn get_is_allow() {
        assert_eq!(classify_http_operation(&op("GET")).policy, RiskPolicy::Allow);
    }

    #[test]
    fn post_is_mandate() {
        assert_eq!(
            classify_http_operation(&op("POST")).policy,
            RiskPolicy::Mandate
        );
    }

    #[test]
    fn delete_is_block() {
        assert_eq!(
            classify_http_operation(&op("DELETE")).policy,
            RiskPolicy::Block
        );
    }
}
