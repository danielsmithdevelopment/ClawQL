// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Shared bounds for cell-owned reclamation work.
//!
//! A sweep reclaims space after a read path has already hidden expired state.
//! The work must therefore be bounded per cell turn, and a full batch asks the
//! alarm to return promptly. KV and Queues use the same bound and the same
//! harness executor, so a new cell-backed feature cannot quietly choose an
//! unbounded cleanup loop.

/// The maximum rows one cell sweep examines in one turn.
pub const BATCH_ROWS: usize = 256;
