//! RFC 8949 canonical CBOR for `serde_json::Value` — bit-compatible with
//! node `cbor.encodeCanonical` (clawql-audit default hash dialect).

use serde_json::{Map, Value};

/// Encode JSON Value as definite-length canonical CBOR.
pub fn encode_canonical(value: &Value) -> Vec<u8> {
    let mut out = Vec::new();
    encode_into(value, &mut out);
    out
}

fn encode_into(value: &Value, out: &mut Vec<u8>) {
    match value {
        Value::Null => out.push(0xf6),
        Value::Bool(true) => out.push(0xf5),
        Value::Bool(false) => out.push(0xf4),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                encode_int(i, out);
            } else if let Some(u) = n.as_u64() {
                encode_uint(u, out);
            } else if let Some(f) = n.as_f64() {
                // Prefer integer when exact; else float64 (node collapses ints when canonical).
                if f.fract() == 0.0 && f >= i64::MIN as f64 && f <= i64::MAX as f64 {
                    encode_int(f as i64, out);
                } else {
                    encode_f64(f, out);
                }
            } else {
                out.push(0xf6);
            }
        }
        Value::String(s) => encode_text(s, out),
        Value::Array(arr) => {
            encode_len(4, arr.len() as u64, out);
            for item in arr {
                encode_into(item, out);
            }
        }
        Value::Object(obj) => encode_map(obj, out),
    }
}

fn encode_map(obj: &Map<String, Value>, out: &mut Vec<u8>) {
    // Sort by encoded key bytes (length then lexicographic) — RFC 8949 §4.2.1.
    let mut pairs: Vec<(Vec<u8>, &Value)> = obj
        .iter()
        .map(|(k, v)| {
            let mut key_bytes = Vec::new();
            encode_text(k, &mut key_bytes);
            (key_bytes, v)
        })
        .collect();
    pairs.sort_by(|a, b| {
        a.0.len()
            .cmp(&b.0.len())
            .then_with(|| a.0.cmp(&b.0))
    });
    encode_len(5, pairs.len() as u64, out);
    for (key_bytes, v) in pairs {
        out.extend_from_slice(&key_bytes);
        encode_into(v, out);
    }
}

fn encode_text(s: &str, out: &mut Vec<u8>) {
    let b = s.as_bytes();
    encode_len(3, b.len() as u64, out);
    out.extend_from_slice(b);
}

fn encode_int(v: i64, out: &mut Vec<u8>) {
    if v >= 0 {
        encode_uint(v as u64, out);
    } else {
        // major type 1: -1 - n
        let n = (-1i128 - v as i128) as u64;
        encode_len(1, n, out);
    }
}

fn encode_uint(v: u64, out: &mut Vec<u8>) {
    encode_len(0, v, out);
}

fn encode_len(major: u8, len: u64, out: &mut Vec<u8>) {
    let mt = major << 5;
    if len < 24 {
        out.push(mt | (len as u8));
    } else if len <= u8::MAX as u64 {
        out.push(mt | 24);
        out.push(len as u8);
    } else if len <= u16::MAX as u64 {
        out.push(mt | 25);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else if len <= u32::MAX as u64 {
        out.push(mt | 26);
        out.extend_from_slice(&(len as u32).to_be_bytes());
    } else {
        out.push(mt | 27);
        out.extend_from_slice(&len.to_be_bytes());
    }
}

fn encode_f64(f: f64, out: &mut Vec<u8>) {
    out.push(0xfb);
    out.extend_from_slice(&f.to_bits().to_be_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use sha2::{Digest, Sha256};

    #[test]
    fn matches_node_encode_canonical_session_start() {
        let content = json!({
            "id": "00000000-0000-7000-8000-000000000001",
            "prevHash": "0000000000000000000000000000000000000000000000000000000000000000",
            "chainIndex": 0,
            "writtenAt": "2026-01-01T00:00:00.000Z",
            "type": "SESSION_START",
            "timestamp": "2026-01-01T00:00:00.000Z",
            "sessionId": "s1",
        });
        let bytes = encode_canonical(&content);
        let hash = hex::encode(Sha256::digest(&bytes));
        assert_eq!(
            hash,
            "0dcdaa709efa8ec57898029139bb75773f038ccb8d5d7be7690d850004ee95f9"
        );
    }

    #[test]
    fn matches_node_encode_canonical_with_metadata() {
        let content = json!({
            "id": "00000000-0000-7000-8000-000000000001",
            "prevHash": "0000000000000000000000000000000000000000000000000000000000000000",
            "chainIndex": 0,
            "writtenAt": "2026-01-01T00:00:00.000Z",
            "type": "HUMAN_DECISION_REQUESTED",
            "timestamp": "2026-01-01T00:00:00.000Z",
            "sessionId": "s1",
            "metadata": {
                "executionId": "pex_abc",
                "operationId": "op.create",
            },
        });
        let bytes = encode_canonical(&content);
        let hash = hex::encode(Sha256::digest(&bytes));
        assert_eq!(
            hash,
            "23d41c3ca3d0b8d8cf0fde582acf6f8da73e4517767f5c6b1fc31d5d44ec8837"
        );
    }
}
