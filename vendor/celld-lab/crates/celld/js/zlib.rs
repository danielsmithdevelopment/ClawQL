// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! zlib: the one-shot `__zlib` op and the streaming compression backend.
//!
//! `CompressionStream` and `DecompressionStream` need output chunk by chunk,
//! so a stream keeps a live flate2 writer whose `Vec` sink is drained after
//! every push. The one-shot op has no such state and runs to completion.
use super::*;

pub(super) fn op_zlib(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    rv: v8::ReturnValue<v8::Value>,
) {
    use std::io::{Read, Write};
    let mode = args.get(0).to_rust_string_lossy(scope);
    let bytes = view_bytes(args.get(1)).unwrap_or_default();
    let result = (|| -> Result<Vec<u8>> {
        match mode.as_str() {
            "gzip" => {
                let mut encoder =
                    flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
                encoder.write_all(&bytes)?;
                Ok(encoder.finish()?)
            }
            "gunzip" => {
                let mut decoder = flate2::read::GzDecoder::new(bytes.as_slice());
                let mut out = Vec::new();
                decoder.read_to_end(&mut out)?;
                Ok(out)
            }
            "deflate" => {
                let mut encoder =
                    flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
                encoder.write_all(&bytes)?;
                Ok(encoder.finish()?)
            }
            "inflate" => {
                let mut decoder = flate2::read::ZlibDecoder::new(bytes.as_slice());
                let mut out = Vec::new();
                decoder.read_to_end(&mut out)?;
                Ok(out)
            }
            "deflateRaw" => {
                let mut encoder =
                    flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
                encoder.write_all(&bytes)?;
                Ok(encoder.finish()?)
            }
            "inflateRaw" => {
                let mut decoder = flate2::read::DeflateDecoder::new(bytes.as_slice());
                let mut out = Vec::new();
                decoder.read_to_end(&mut out)?;
                Ok(out)
            }
            _ => Err(anyhow!("unsupported zlib operation")),
        }
    })();
    match result {
        Ok(bytes) => webcrypto_return_bytes(scope, rv, &bytes),
        Err(error) => {
            let message = v8::String::new(scope, &format!("zlib: {error}")).unwrap();
            let exception = v8::Exception::error(scope, message);
            scope.throw_exception(exception);
        }
    }
}

/// One live `CompressionStream`/`DecompressionStream`: a stateful flate2
/// writer whose `Vec` sink is drained after every push, so output streams
/// chunk by chunk instead of arriving once at close.
enum ZlibStream {
    GzipEncode(flate2::write::GzEncoder<Vec<u8>>),
    GzipDecode(flate2::write::GzDecoder<Vec<u8>>),
    ZlibEncode(flate2::write::ZlibEncoder<Vec<u8>>),
    ZlibDecode(flate2::write::ZlibDecoder<Vec<u8>>),
    RawEncode(flate2::write::DeflateEncoder<Vec<u8>>),
    RawDecode(flate2::write::DeflateDecoder<Vec<u8>>),
}

/// The six writer types share `write`/`flush`/`get_mut`/`finish` but no
/// trait, so dispatch once here.
macro_rules! zlib_each {
    ($stream:expr, $w:ident => $body:expr) => {
        match $stream {
            ZlibStream::GzipEncode($w) => $body,
            ZlibStream::GzipDecode($w) => $body,
            ZlibStream::ZlibEncode($w) => $body,
            ZlibStream::ZlibDecode($w) => $body,
            ZlibStream::RawEncode($w) => $body,
            ZlibStream::RawDecode($w) => $body,
        }
    };
}

impl ZlibStream {
    fn new(format: &str, decompress: bool) -> Option<ZlibStream> {
        use flate2::write as z;
        let level = flate2::Compression::default();
        let sink = Vec::new;
        Some(match (format, decompress) {
            ("gzip", false) => Self::GzipEncode(z::GzEncoder::new(sink(), level)),
            ("gzip", true) => Self::GzipDecode(z::GzDecoder::new(sink())),
            ("deflate", false) => Self::ZlibEncode(z::ZlibEncoder::new(sink(), level)),
            ("deflate", true) => Self::ZlibDecode(z::ZlibDecoder::new(sink())),
            ("deflate-raw", false) => Self::RawEncode(z::DeflateEncoder::new(sink(), level)),
            ("deflate-raw", true) => Self::RawDecode(z::DeflateDecoder::new(sink())),
            _ => return None,
        })
    }

    fn decompress(&self) -> bool {
        matches!(
            self,
            Self::GzipDecode(_) | Self::ZlibDecode(_) | Self::RawDecode(_)
        )
    }

    /// Workerd's canonical message, matched by its conformance suite.
    fn failure(&self) -> &'static str {
        if self.decompress() {
            "Decompression failed."
        } else {
            "Compression failed."
        }
    }

    /// Write one chunk and return whatever output it produced. Decoded
    /// output flows per chunk; encoders hold theirs until a full buffer
    /// accumulates (matching Workerd, whose suite reads a small message
    /// back as one chunk), with the rest arriving from `finish`. A
    /// decoder that stops consuming input has hit the end of the
    /// compressed stream, so leftover bytes are trailing garbage —
    /// Workerd's strict_compression_checks.
    fn push(&mut self, mut input: &[u8]) -> Result<Vec<u8>> {
        use std::io::Write;
        const ENCODER_CHUNK: usize = 32 * 1024;
        let failure = self.failure();
        let held = if self.decompress() { 0 } else { ENCODER_CHUNK };
        zlib_each!(self, w => {
            while !input.is_empty() {
                let n = w.write(input).map_err(|_| anyhow!(failure))?;
                if n == 0 { return Err(anyhow!(failure)); }
                input = &input[n..];
            }
            if w.get_ref().len() < held { return Ok(Vec::new()); }
            Ok(std::mem::take(w.get_mut()))
        })
    }

    /// Terminate the stream and return the final output. For gzip this
    /// also validates the trailer, so a truncated stream errors here.
    fn finish(self) -> Result<Vec<u8>> {
        let failure = self.failure();
        zlib_each!(self, w => w.finish().map_err(|_| anyhow!(failure)))
    }
}

/// Live compression streams, keyed by an id JS holds across awaits.
///
/// **Process-wide, not per thread.** A `CompressionStream` outlives the turn
/// that created it, and under D1 the next turn of that request runs on
/// whichever tokio worker takes it — a thread-local table loses the stream,
/// and a per-thread counter is worse than that: two workers hand out the same
/// id, so one request's stream answers another's push. The ids are what JS
/// holds, so they have to be unique across the process.
static ZLIB_STREAMS: OnceLock<Mutex<HashMap<u64, ZlibStream>>> = OnceLock::new();
static ZLIB_STREAM_NEXT: AtomicU64 = AtomicU64::new(1);

fn zlib_streams() -> &'static Mutex<HashMap<u64, ZlibStream>> {
    ZLIB_STREAMS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn zlib_stream_return(
    scope: &mut v8::PinScope,
    rv: v8::ReturnValue<v8::Value>,
    result: Result<Vec<u8>>,
) {
    match result {
        Ok(bytes) => webcrypto_return_bytes(scope, rv, &bytes),
        Err(error) => {
            let message = v8::String::new(scope, &error.to_string()).unwrap();
            let exception = v8::Exception::type_error(scope, message);
            scope.throw_exception(exception);
        }
    }
}

/// `__zlib_stream_new(format, decompress)` -> id. JS validates the format
/// and throws the spec TypeError, so an unknown one here is a bug.
pub(super) fn op_zlib_stream_new(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue<v8::Value>,
) {
    let format = args.get(0).to_rust_string_lossy(scope);
    let decompress = args.get(1).boolean_value(scope);
    let stream = ZlibStream::new(&format, decompress).expect("JS validated the compression format");
    let id = ZLIB_STREAM_NEXT.fetch_add(1, Ordering::Relaxed);
    zlib_streams().lock().unwrap().insert(id, stream);
    rv.set(v8::Number::new(scope, id as f64).into());
}

/// `__zlib_stream_push(id, view)` -> Uint8Array (possibly empty). An
/// error poisons the stream: its native state is dropped and the
/// TypeError errors both sides of the transform.
pub(super) fn op_zlib_stream_push(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    rv: v8::ReturnValue<v8::Value>,
) {
    let id = args.get(0).integer_value(scope).unwrap_or(0) as u64;
    let bytes = view_bytes(args.get(1)).unwrap_or_default();
    let result = {
        let mut streams = zlib_streams().lock().unwrap();
        let stream = streams
            .get_mut(&id)
            .ok_or_else(|| anyhow!("zlib stream already closed"));
        match stream {
            Ok(stream) => {
                let out = stream.push(&bytes);
                if out.is_err() {
                    streams.remove(&id);
                }
                out
            }
            Err(error) => Err(error),
        }
    };
    zlib_stream_return(scope, rv, result);
}

/// `__zlib_stream_end(id)` -> the final Uint8Array. Consumes the stream.
pub(super) fn op_zlib_stream_end(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    rv: v8::ReturnValue<v8::Value>,
) {
    let id = args.get(0).integer_value(scope).unwrap_or(0) as u64;
    let result = zlib_streams()
        .lock()
        .unwrap()
        .remove(&id)
        .ok_or_else(|| anyhow!("zlib stream already closed"));
    zlib_stream_return(scope, rv, result.and_then(ZlibStream::finish));
}

/// `__zlib_stream_drop(id)` — cancelled/aborted transform cleanup.
pub(super) fn op_zlib_stream_drop(
    scope: &mut v8::PinScope,
    args: v8::FunctionCallbackArguments,
    _rv: v8::ReturnValue<v8::Value>,
) {
    let id = args.get(0).integer_value(scope).unwrap_or(0) as u64;
    zlib_streams().lock().unwrap().remove(&id);
}
