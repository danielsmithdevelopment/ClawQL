// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! OTLP/HTTP protobuf encoding for the telemetry sink, by hand.
//!
//! The export messages celld emits are a small, stable corner of the
//! OTLP proto — flat spans and log records with scalar attributes — and
//! protobuf's wire format is varints and length-delimited fields. Hand
//! encoding keeps prost, tonic, and the generated proto crates out of
//! the binary, the same trade the Parquet sink made by skipping arrow.
//! Field numbers follow opentelemetry-proto v1: trace/v1/trace.proto,
//! logs/v1/logs.proto, common/v1/common.proto, resource/v1/resource.proto.

use crate::telemetry::Log;
use crate::telemetry::Span;

const WIRE_VARINT: u64 = 0;
const WIRE_FIXED64: u64 = 1;
const WIRE_LEN: u64 = 2;

fn varint(out: &mut Vec<u8>, mut value: u64) {
    loop {
        let byte = (value & 0x7f) as u8;
        value >>= 7;
        if value == 0 {
            out.push(byte);
            return;
        }
        out.push(byte | 0x80);
    }
}

fn key(out: &mut Vec<u8>, field: u64, wire: u64) {
    varint(out, (field << 3) | wire);
}

fn field_bytes(out: &mut Vec<u8>, field: u64, bytes: &[u8]) {
    key(out, field, WIRE_LEN);
    varint(out, bytes.len() as u64);
    out.extend_from_slice(bytes);
}

fn field_str(out: &mut Vec<u8>, field: u64, value: &str) {
    field_bytes(out, field, value.as_bytes());
}

fn field_varint(out: &mut Vec<u8>, field: u64, value: u64) {
    key(out, field, WIRE_VARINT);
    varint(out, value);
}

fn field_fixed64(out: &mut Vec<u8>, field: u64, value: u64) {
    key(out, field, WIRE_FIXED64);
    out.extend_from_slice(&value.to_le_bytes());
}

/// common.v1.AnyValue: string_value=1, bool_value=2, int_value=3.
fn any_string(value: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(value.len() + 4);
    field_str(&mut out, 1, value);
    out
}

fn any_bool(value: bool) -> Vec<u8> {
    let mut out = Vec::new();
    field_varint(&mut out, 2, value as u64);
    out
}

fn any_int(value: i64) -> Vec<u8> {
    let mut out = Vec::new();
    field_varint(&mut out, 3, value as u64);
    out
}

/// common.v1.KeyValue: key=1, value=2 (AnyValue).
fn key_value(out: &mut Vec<u8>, field: u64, name: &str, value: Vec<u8>) {
    let mut kv = Vec::with_capacity(name.len() + value.len() + 8);
    field_str(&mut kv, 1, name);
    field_bytes(&mut kv, 2, &value);
    field_bytes(out, field, &kv);
}

/// resource.v1.Resource: attributes=1.
fn resource(node: &str, region: &str, service: &str) -> Vec<u8> {
    let mut out = Vec::new();
    key_value(&mut out, 1, "service.name", any_string(service));
    key_value(
        &mut out,
        1,
        "service.version",
        any_string(env!("CARGO_PKG_VERSION")),
    );
    key_value(&mut out, 1, "service.instance.id", any_string(node));
    key_value(&mut out, 1, "celld.region", any_string(region));
    out
}

/// common.v1.InstrumentationScope: name=1, version=2.
fn scope() -> Vec<u8> {
    let mut out = Vec::new();
    field_str(&mut out, 1, "celld");
    field_str(&mut out, 2, env!("CARGO_PKG_VERSION"));
    out
}

/// trace.v1.Span.
fn span_message(span: &Span) -> Vec<u8> {
    let mut out = Vec::new();
    field_bytes(&mut out, 1, &span.ids.trace_id);
    field_bytes(&mut out, 2, &span.ids.span_id);
    if let Some(parent) = span.parent_span_id {
        field_bytes(&mut out, 4, &parent);
    }
    field_str(&mut out, 5, span.name);
    field_varint(&mut out, 6, span.kind as u64);
    let start_ns = span.start_unix_us.max(0) as u64 * 1_000;
    let end_ns = start_ns + span.duration_us.max(0) as u64 * 1_000;
    field_fixed64(&mut out, 7, start_ns);
    field_fixed64(&mut out, 8, end_ns);
    // Attributes (9): the same promoted columns the Parquet schema has,
    // under otel semantic-convention names where one exists.
    if let Some(url) = &span.url {
        key_value(&mut out, 9, "url.full", any_string(url));
    }
    if let Some(status) = span.http_status {
        key_value(
            &mut out,
            9,
            "http.response.status_code",
            any_int(status as i64),
        );
    }
    if let Some(request_id) = &span.request_id {
        key_value(&mut out, 9, "celld.request_id", any_string(request_id));
    }
    if let Some(cell) = &span.cell {
        key_value(&mut out, 9, "celld.cell", any_string(cell));
    }
    if let Some(epoch) = span.epoch {
        key_value(&mut out, 9, "celld.epoch", any_int(epoch as i64));
    }
    if let Some(isolate) = span.isolate {
        key_value(&mut out, 9, "celld.isolate", any_int(isolate as i64));
    }
    if let Some(queue_wait_us) = span.queue_wait_us {
        key_value(&mut out, 9, "celld.queue_wait_us", any_int(queue_wait_us));
    }
    if let Some(remote) = span.parent_remote {
        key_value(&mut out, 9, "celld.parent_remote", any_bool(remote));
    }
    // Status (15): unset when ok, per the spec; ERROR (code=3 value 2)
    // with the message when not.
    if !span.ok {
        let mut status = Vec::new();
        if let Some(error) = &span.error {
            field_str(&mut status, 2, error);
        }
        field_varint(&mut status, 3, 2);
        field_bytes(&mut out, 15, &status);
    }
    out
}

/// collector.v1.ExportTraceServiceRequest: resource_spans=1, holding one
/// ResourceSpans{resource=1, scope_spans=2{scope=1, spans=2}}.
pub fn traces_request(spans: &[Span], node: &str, region: &str, service: &str) -> Vec<u8> {
    let mut scope_spans = Vec::new();
    field_bytes(&mut scope_spans, 1, &scope());
    for span in spans {
        field_bytes(&mut scope_spans, 2, &span_message(span));
    }
    let mut resource_spans = Vec::new();
    field_bytes(&mut resource_spans, 1, &resource(node, region, service));
    field_bytes(&mut resource_spans, 2, &scope_spans);
    let mut out = Vec::new();
    field_bytes(&mut out, 1, &resource_spans);
    out
}

/// logs.v1.LogRecord: time=1, severity_number=2, body=5, trace_id=9,
/// span_id=10, observed_time=11.
fn log_message(log: &Log) -> Vec<u8> {
    let mut out = Vec::new();
    let time_ns = log.time_unix_us.max(0) as u64 * 1_000;
    field_fixed64(&mut out, 1, time_ns);
    field_varint(&mut out, 2, 9); // SEVERITY_NUMBER_INFO
    field_bytes(&mut out, 5, &any_string(&log.body));
    if let Some(trace_id) = log.trace_id {
        field_bytes(&mut out, 9, &trace_id);
    }
    if let Some(span_id) = log.span_id {
        field_bytes(&mut out, 10, &span_id);
    }
    field_fixed64(&mut out, 11, time_ns);
    out
}

/// collector.v1.ExportLogsServiceRequest: resource_logs=1, holding one
/// ResourceLogs{resource=1, scope_logs=2{scope=1, log_records=2}}.
pub fn logs_request(logs: &[Log], node: &str, region: &str, service: &str) -> Vec<u8> {
    let mut scope_logs = Vec::new();
    field_bytes(&mut scope_logs, 1, &scope());
    for log in logs {
        field_bytes(&mut scope_logs, 2, &log_message(log));
    }
    let mut resource_logs = Vec::new();
    field_bytes(&mut resource_logs, 1, &resource(node, region, service));
    field_bytes(&mut resource_logs, 2, &scope_logs);
    let mut out = Vec::new();
    field_bytes(&mut out, 1, &resource_logs);
    out
}
