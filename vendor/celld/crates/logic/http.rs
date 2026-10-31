// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! HTTP predicates, reified sans-IO.
//!
//! A Worker reads `request.url`, and celld builds that URL from a request
//! header. The header is client-controlled whenever no proxy sits in front, so
//! the shape of the authority is a SECURITY fence, exactly as
//! `cell::valid_cell_scope`'s is. celld interpolates the authority into
//! `<scheme>://<authority><path_and_query>`, so a character that is structural
//! in a URL moves the boundary between the parts.
//!
//! The gate checks the structure as well as the charset. celld carries the URL
//! to the Worker as a string and never parses it, so an authority a URL parser
//! refuses reaches the application intact. `new URL(request.url)` is how a
//! Worker reads its own path and query, and that call then throws: a `Host` of
//! `a]b` gives `TypeError: Invalid URL`. A client therefore turns every request
//! into an application error, so a shape like `a]b` or `999.1.1.1` has to fail
//! here rather than inside the isolate.

use std::net::Ipv6Addr;

/// The longest authority celld accepts. A hostname is at most 253 bytes and can
/// carry the root dot, and a port adds at most 6 more — a `:` and five digits —
/// so this admits every legal value and bounds what one request can make the
/// URL parser allocate.
pub const MAX_AUTHORITY: usize = 260;

/// The largest port a URL parser accepts.
const MAX_PORT: u32 = 65535;

/// The complete sans-IO decision for an authority in `request.url`.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[must_use]
pub enum AuthorityDecision<'a> {
    /// The authority cannot be installed in `request.url`.
    Reject,
    /// The authority is safe to install without another check.
    Use(&'a str),
    /// The authority has valid syntax, but a URL parser must validate its IDN.
    NeedsUrlParser(&'a str),
}

/// Classify an authority before celld installs it in `request.url`.
///
/// The result carries the authority with the decision, so a caller cannot use
/// a partial syntax result as a validated value.
pub fn authority_decision(authority: &str) -> AuthorityDecision<'_> {
    if !valid_authority(authority) {
        AuthorityDecision::Reject
    } else if has_idn_label(authority) {
        AuthorityDecision::NeedsUrlParser(authority)
    } else {
        AuthorityDecision::Use(authority)
    }
}

/// Does a URL authority have valid syntax? An optional port after either a
/// bracketed IPv6 address or a registered name, and at most `MAX_AUTHORITY`
/// bytes.
///
/// The charset of the name is the first fence, and it excludes every character
/// that is structural in a URL. `/` starts a path, `?` starts a query, `#`
/// starts a fragment, and `@` ends userinfo — so each one lets a client move
/// the rest of the URL into a different component. A `Host: evil.example#`
/// header on a request for `/admin` makes `request.url` read
/// `http://evil.example#/admin`, where the real path becomes a fragment. celld
/// dispatches on the request target, so the Worker then reads a path celld did
/// not route, inside one process.
///
/// Whitespace and control bytes are excluded because they make the URL
/// unparseable rather than merely wrong. Non-ASCII is excluded because a
/// hostname reaches celld in its A-label form.
///
/// The structure is the second fence, because a charset alone admits shapes a
/// URL parser refuses: `a]b`, `::1` and `999.1.1.1` carry no character that
/// reshapes a URL, and each one makes `new URL(request.url)` throw in the
/// Worker. So `[` and `]` are admitted only as a matched pair that wraps a whole
/// IPv6 address, `:` only once outside that pair, where it separates a port that
/// must be a number in range, and a name that ends in a number must be an IPv4
/// address. `_` is admitted in a name because it occurs in practice in internal
/// hostnames.
///
/// This predicate does not check that the authority is a hostname celld serves.
/// `authority_decision` combines this syntax result with the IDN decision, so
/// callers cannot install the partial result by itself.
fn valid_authority(authority: &str) -> bool {
    if authority.is_empty() || authority.len() > MAX_AUTHORITY {
        return false;
    }
    // An IPv6 address is the one shape where a `:` is not the port separator,
    // so the brackets are matched first and a port can only follow the closing
    // one.
    let after_host = if let Some(tail) = authority.strip_prefix('[') {
        let Some((literal, after_host)) = tail.split_once(']') else {
            return false;
        };
        if literal.parse::<Ipv6Addr>().is_err() {
            return false;
        }
        after_host
    } else {
        let (name, after_host) = authority.split_at(authority.find(':').unwrap_or(authority.len()));
        if !valid_reg_name(name) {
            return false;
        }
        after_host
    };
    match after_host.strip_prefix(':') {
        Some(port) => valid_port(port),
        None => after_host.is_empty(),
    }
}

/// A registered name: non-empty ASCII alphanumerics plus `_ - .`, and an IPv4
/// address whenever it reads as one.
///
/// A URL parser stops treating a name as a name as soon as the last label is a
/// number, and reads the whole name as an IPv4 address instead. So a name that
/// merely looks numeric at the end is not a name that parses: `999.1.1.1`,
/// `1.2.3.4.5` and `foo.1` each fail the address parse, and the URL therefore
/// fails with them. Every such name is refused here.
///
/// The check on an address is stricter than the parser is, and deliberately so.
/// A parser reads `010.1.1.1` as octal and `0x7f.1` as hex, so both name a
/// different host than the text does, and `1234567890` names a fourth host
/// again. celld refuses all three rather than hand a Worker a URL whose host is
/// not the host the string shows. An address must therefore be four decimal
/// labels, each at most 255 and none carrying a leading zero.
fn valid_reg_name(name: &str) -> bool {
    if name.is_empty()
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
    {
        return false;
    }
    // A single root dot ends a fully-qualified name, and the parser reads the
    // label before it as the last one.
    let labels = name.strip_suffix('.').unwrap_or(name);
    match labels.rsplit('.').next() {
        Some(last) if reads_as_number(last) => {
            let mut octets = labels.split('.');
            let address = [octets.next(), octets.next(), octets.next(), octets.next()];
            octets.next().is_none() && address.iter().all(|octet| octet.is_some_and(valid_octet))
        }
        _ => true,
    }
}

/// Does this label make a URL parser read the whole name as an IPv4 address? It
/// does when the label is decimal, and when it is hexadecimal with the `0x`
/// prefix the parser accepts.
fn reads_as_number(label: &str) -> bool {
    let hex = label
        .strip_prefix("0x")
        .or_else(|| label.strip_prefix("0X"));
    match hex {
        Some(digits) => digits.bytes().all(|b| b.is_ascii_hexdigit()),
        None => !label.is_empty() && label.bytes().all(|b| b.is_ascii_digit()),
    }
}

/// One decimal octet of an IPv4 address: at most 255, and no leading zero,
/// which a parser would read as octal.
fn valid_octet(octet: &str) -> bool {
    !octet.is_empty()
        && octet.bytes().all(|b| b.is_ascii_digit())
        && (octet == "0" || !octet.starts_with('0'))
        && octet.parse::<u32>().is_ok_and(|octet| octet <= 255)
}

/// A port: decimal digits, and a number at most `MAX_PORT`. Leading zeros pass
/// because a parser reads the number and not the text, and both name the same
/// port. An empty port is refused, though a parser reads `host:` as `host`,
/// because a header that carries a bare `:` is malformed at the source.
fn valid_port(port: &str) -> bool {
    !port.is_empty()
        && port.bytes().all(|b| b.is_ascii_digit())
        && port.parse::<u32>().is_ok_and(|port| port <= MAX_PORT)
}

/// Does this authority carry a label a URL parser decodes as Punycode?
///
/// A parser reads every label that starts with `xn--` as an internationalized
/// name, and it fails the whole parse when the decode fails. `xn--a` passes
/// `valid_authority` — it carries no character that reshapes a URL and no label
/// that reads as a number — and `new URL(request.url)` still throws on it. A
/// charset cannot see this, because Punycode is an encoding and not a charset,
/// and the rules that decide a decoded label are the whole of IDNA. So the
/// decision is reified here and the check itself belongs with a parser.
///
/// The predicate exists to keep that parser off the request path. A hostname
/// carries no such label in almost every deployment, so celld scans for the
/// prefix and parses only when it is present. Refusing every `xn--` label
/// instead would cost every internationalized deployment its hostname, and
/// admitting every one of them hands a client an error it can aim at any
/// request.
fn has_idn_label(authority: &str) -> bool {
    authority.split('.').any(|label| {
        label
            .as_bytes()
            .get(..4)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case(b"xn--"))
    })
}

/// The scheme celld serves for this value, or `None` for a value it cannot
/// serve. Only `http` and `https`.
///
/// The scheme is interpolated into `request.url`, and a Worker builds a
/// redirect or a link from it. An arbitrary scheme therefore becomes an
/// arbitrary URL in an application's output: `X-Forwarded-Proto: javascript:`
/// makes `new URL(request.url).protocol` read `javascript:`. celld speaks only
/// HTTP, so no other scheme can be correct.
///
/// The header casing is not fixed, so the match ignores case. The return is the
/// canonical spelling rather than the text that arrived, because celld puts the
/// result in a URL it logs and hands on, and a scheme is lowercase there.
pub fn canonical_scheme(scheme: &str) -> Option<&'static str> {
    if scheme.eq_ignore_ascii_case("http") {
        Some("http")
    } else if scheme.eq_ignore_ascii_case("https") {
        Some("https")
    } else {
        None
    }
}
