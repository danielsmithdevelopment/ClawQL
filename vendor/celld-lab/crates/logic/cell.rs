//! Cell-scope predicates, reified sans-IO.
//!
//! A cell scope names one Durable Object: `Class:instance`, or a bare instance
//! that the runtime prefixes with the single configured class. The scope is
//! then used as a path component and as an object-store key — `db_path` joins
//! it under the data directory, and the replication client builds
//! `cells/<scope>/ltx/e<epoch>` from it — so its charset is a SECURITY fence,
//! exactly as `peer::valid_identity`'s is. Admit `/` and a scope carries its
//! own path segments: it escapes the data directory through `..` and escapes
//! the bucket prefix the same way.
//!
//! The gate lives here, and the callers that accept a scope from the network
//! apply it before the scope reaches storage.

/// The fleet-wide storage limit for one cell scope. Every data filesystem must
/// support a path component of this size, so scope validity is the same on
/// every node that can own the cell.
pub const MAX_CELL_SCOPE: usize = 255;

/// Is a cell scope well-formed? Non-empty, at most `MAX_CELL_SCOPE` bytes, not
/// `.` or `..`, and only ASCII alphanumerics plus `_ - . : $`.
///
/// The charset is the fence. `/` and `\` are excluded so the scope can never be
/// more than one path component, which is what makes an embedded `..` inert:
/// `Class:..` is a literal directory name, while `Class:../..` would traverse.
/// Control bytes and NUL are excluded with everything else outside the set.
///
/// One path component is not sufficient on its own, because `.` and `..` are
/// themselves single components that the filesystem resolves. A bare `..`
/// clears the charset, and the callers that take a scope without a class prefix
/// — `/cell/`, `/evict/`, the peer routes, and the wake index — hand it to
/// `db_path` unchanged, so `data_dir.join("..")` lands above the data
/// directory. Both names are therefore rejected.
///
/// `:` is admitted because it is the class/instance separator and an instance
/// may itself contain one. `$` is admitted because it is a legal JavaScript
/// identifier character, so it is a legal exported class name. Both are inert
/// in a path component.
///
/// The bound is also the minimum `NAME_MAX` that celld accepts for a data
/// filesystem. The runtime checks that capability at startup. Therefore, a
/// scope that passes this gate fits every node in the fleet.
pub fn valid_cell_scope(scope: &str) -> bool {
    !scope.is_empty()
        && scope.len() <= MAX_CELL_SCOPE
        && scope != "."
        && scope != ".."
        && scope
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.' | b':' | b'$'))
}
