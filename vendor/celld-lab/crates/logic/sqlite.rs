// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! SQLite failure handling, reified sans-IO. Production reads SQLite's
//! autocommit flag over FFI and uses this predicate to decide whether the actor
//! must fail closed after SQLite destroys an active transaction.

/// SQLite primary result codes that mean the ENGINE failed (not just one
/// statement) — stable values from the SQLite C API. Production asserts these
/// match `rusqlite::ffi::*`, so debug builds catch any drift.
pub const SQLITE_NOMEM: i32 = 7;
pub const SQLITE_INTERRUPT: i32 = 9;
pub const SQLITE_IOERR: i32 = 10;
pub const SQLITE_FULL: i32 = 13;

/// Does a failed SQLite operation poison the actor? Poison only when a critical engine error
/// (`FULL`/`IOERR`/`NOMEM`/`INTERRUPT`) coincides with a destroyed transaction —
/// SQLite rolled an active transaction back, observable as autocommit being
/// re-enabled. Extended result codes carry the primary code in the low byte, so
/// mask before comparing. Anything else — a statement error, a critical error
/// that spared the transaction, or a failure outside a transaction — recovers.
pub fn poisons_actor(result_code: i32, started_in_transaction: bool, now_autocommit: bool) -> bool {
    let primary = result_code & 0xff;
    started_in_transaction
        && now_autocommit
        && matches!(
            primary,
            SQLITE_FULL | SQLITE_IOERR | SQLITE_NOMEM | SQLITE_INTERRUPT
        )
}
