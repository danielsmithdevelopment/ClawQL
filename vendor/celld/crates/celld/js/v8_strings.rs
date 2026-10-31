// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Property-key strings the host builds from a literal, made once at compile
//! time instead of once per call.
//!
//! `v8::String::new` allocates a string in the isolate's heap and copies the
//! bytes into it. For a key the host reaches for on every request — `__cell`,
//! the nine components of a parsed URL — that allocation buys nothing, because
//! the bytes are fixed at compile time.
//! `v8::String::create_external_onebyte_const` builds the string resource as a
//! `const`, checking at compile time that the literal is ASCII and short
//! enough for V8, and [`key`] hands V8 a pointer to it. `OneByteConst` is
//! `Sync` and rusty_v8 allows several isolates to share one concurrently, so
//! one table serves the whole process.
//!
//! This removes the allocation and the copy, and nothing else. The result is
//! an *external* string, so V8 still hashes it and walks the receiver's shape
//! on every get and set. A function that the harness installs once and the
//! host calls on every event is therefore not solved here: it belongs in a
//! `v8::Global`, which skips the lookup as well. See `EventHooks` in `js.rs`.

/// Declare `&'static v8::OneByteConst` property keys from ASCII literals.
///
/// The literal is checked for ASCII and for length inside a `const fn`, so a
/// non-ASCII key fails the build rather than producing a corrupt string.
macro_rules! v8_static_strings {
    ($($ident:ident = $str:literal),* $(,)?) => {
        $(
            pub(crate) static $ident: v8::OneByteConst =
                v8::String::create_external_onebyte_const($str.as_bytes());
        )*
    };
}

// One table, declared here rather than beside each user: `OneByteConst` is
// `Sync` and isolate-independent, so a key declared twice would be two
// resources for one string with nothing to keep them in step.
v8_static_strings!(
    // The harness's runtime-state object, reached from the global by name in
    // nine places.
    CELL = "__cell",
    ENV = "env",
    // `op_url_parse` writes all nine on every `new URL(...)`.
    URL_PROTOCOL = "protocol",
    URL_USERNAME = "username",
    URL_PASSWORD = "password",
    URL_HOST = "host",
    URL_PORT = "port",
    URL_PATHNAME = "pathname",
    URL_SEARCH = "search",
    URL_HASH = "hash",
    URL_HREF = "href",
);

/// Materialise a constant key in this isolate.
///
/// Infallible in practice: V8 only refuses an external one-byte string when
/// the isolate cannot allocate the (pointer-sized) string object at all, and
/// every caller here is already inside a scope that would have failed first.
pub(crate) fn key<'s>(
    scope: &mut v8::PinScope<'s, '_>,
    constant: &'static v8::OneByteConst,
) -> v8::Local<'s, v8::String> {
    v8::String::new_from_onebyte_const(scope, constant).expect("static key string")
}
