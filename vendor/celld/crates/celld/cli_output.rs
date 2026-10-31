// Copyright 2026 Deno Land Inc. Apache-2.0 license.

// An operator command writes to the terminal and times its own work,
// outside the execution boundary.
#![allow(clippy::disallowed_methods)]

//! What an operator command prints, and how.
//!
//! Three rules hold across every subcommand, and this module exists so that
//! no command can implement them differently:
//!
//! 1. stdout carries data, stderr carries everything a person reads. A
//!    command that mixes them corrupts the first pipe it meets.
//! 2. A listing is bounded by default, and says on stderr what it withheld
//!    and how to continue. Cost follows the fleet's size, not the
//!    operator's question.
//! 3. A closed pipe ends the output; it is not a failure.
//!
//! The enforcement is [`Record`]: a row cannot be printed as text without
//! also declaring its JSON shape, so `--json` cannot be half-implemented.

use std::borrow::Cow;
use std::io::ErrorKind;
use std::io::IsTerminal;
use std::io::Write;

/// One row of a command's output.
///
/// Both methods are required on purpose. A command that could print text
/// without declaring JSON would leave `--json` to each author's discretion,
/// which is the divergence this module exists to prevent.
pub trait Record {
    /// The machine shape. `--json` prints this as one line.
    fn json(&self) -> serde_json::Value;
    /// The line a person reads.
    fn text(&self) -> Cow<'_, str>;
}

/// A record a bounded listing can resume after.
///
/// Separate from [`Record`] so that [`list`] can demand it. A listing that
/// forgets its cursor then fails to compile instead of printing a resume
/// line that does not work.
pub trait Resumable: Record {
    /// The value an operator passes back to continue after this row.
    fn cursor(&self) -> &str;
}

/// How a command renders its rows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Format {
    Text,
    Json,
}

/// A message for a person: progress, a warning, a summary, a resume line.
///
/// Always stderr, whatever the verdict, so that stdout survives a pipe and
/// a redirect keeps failures rather than dropping them. Never panics: a
/// caller with a closed stderr must still finish its work.
#[macro_export]
macro_rules! note {
    ($($arg:tt)*) => {{
        use std::io::Write as _;
        let _ = writeln!(std::io::stderr(), $($arg)*);
    }};
}

struct Sink<W> {
    data: W,
    closed: bool,
}

impl<W: Write> Sink<W> {
    fn new(data: W) -> Self {
        Self {
            data,
            closed: false,
        }
    }

    fn line_and_flush(&mut self, arguments: std::fmt::Arguments<'_>) -> anyhow::Result<()> {
        self.write(|data| writeln!(data, "{arguments}"))?;
        self.write(|data| data.flush())
    }

    /// Run one write, converting a closed reader into a quiet stop.
    ///
    /// `BrokenPipe` is the only write error that means success: the reader
    /// asked for less than we had, which is what `| head` does. Every other
    /// error stays an error, because a blanket "ignore stdout failures"
    /// would turn a truncated redirect — a full disk, a dying device — into
    /// a silent success, which is worse than the defect it fixes.
    fn write(
        &mut self,
        operation: impl FnOnce(&mut W) -> std::io::Result<()>,
    ) -> anyhow::Result<()> {
        if self.closed {
            return Ok(());
        }
        match operation(&mut self.data) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::BrokenPipe => {
                self.closed = true;
                Ok(())
            }
            Err(error) => Err(anyhow::Error::new(error).context("write to stdout")),
        }
    }
}

/// The write side of a command's answer.
///
/// A command never holds a stdout handle, so it cannot address the two
/// streams separately even by accident.
pub struct Output {
    // `Stdout` is a `LineWriter`, so an unbuffered loop flushes once per row
    // and a million-row walk becomes a million write syscalls. One lock and
    // one buffer serve the whole command.
    sink: Sink<std::io::BufWriter<std::io::Stdout>>,
    format: Format,
}

impl Output {
    pub fn new(format: Format) -> Self {
        Self {
            sink: Sink::new(std::io::BufWriter::new(std::io::stdout())),
            format,
        }
    }

    /// Whether the reader has gone away. A caller that drives an expensive
    /// walk must check this and stop: continuing costs storage requests for
    /// output nobody will read.
    pub fn closed(&self) -> bool {
        self.sink.closed
    }

    /// Print one row, in whichever format the operator asked for.
    pub fn row(&mut self, record: &dyn Record) -> anyhow::Result<()> {
        if self.sink.closed {
            return Ok(());
        }
        let line = match self.format {
            Format::Text => record.text().into_owned(),
            Format::Json => serde_json::to_string(&record.json())?,
        };
        self.sink.write(|data| writeln!(data, "{line}"))
    }

    /// One opaque payload, byte for byte.
    ///
    /// Takes `self`, so nothing can be appended afterwards. That is what
    /// makes the `d1 execute` defect — rows, then a prose summary, on one
    /// stream — unrepresentable rather than merely discouraged.
    pub fn bytes(mut self, payload: &[u8]) -> anyhow::Result<()> {
        self.sink.write(|data| data.write_all(payload))?;
        self.finish()
    }

    /// Write one formatted line and flush it before returning.
    ///
    /// The method takes `fmt::Arguments`, so a protocol caller can format the
    /// line directly into stdout without an intermediate `String`.
    pub fn line(mut self, arguments: std::fmt::Arguments<'_>) -> anyhow::Result<()> {
        self.sink.line_and_flush(arguments)
    }

    /// Help text: the one place a command legitimately writes prose to
    /// stdout, because an operator redirects `--help` on purpose.
    pub fn help(mut self, text: &str) -> anyhow::Result<()> {
        self.sink.write(|data| writeln!(data, "{text}"))?;
        self.finish()
    }

    /// A table's header, in text mode only.
    ///
    /// JSON rows carry their own keys, so this is a no-op there. Narrow on
    /// purpose: it cannot put prose in front of a machine-readable stream,
    /// which is the failure it would otherwise reintroduce.
    pub fn header(&mut self, line: &str) -> anyhow::Result<()> {
        if self.format == Format::Json {
            return Ok(());
        }
        self.sink.write(|data| writeln!(data, "{line}"))
    }

    /// Flush what is buffered and report anything that is a real failure.
    pub fn finish(mut self) -> anyhow::Result<()> {
        self.sink.write(|data| data.flush())
    }
}

/// Lay out a table: the header line, its rule, and one padded line per row.
///
/// A column's width has to be known before any of its rows print, so a
/// caller renders the whole result set and then streams it. That is
/// affordable because a result set already arrived as one response; it is
/// not a pattern for a listing, which is why [`list`] does not use it.
pub fn align(columns: &[String], rows: &[Vec<String>]) -> (String, String, Vec<String>) {
    let widths: Vec<usize> = columns
        .iter()
        .enumerate()
        .map(|(index, column)| {
            rows.iter()
                .filter_map(|row| row.get(index))
                .map(|cell| cell.chars().count())
                .chain(std::iter::once(column.chars().count()))
                .max()
                .unwrap_or_default()
        })
        .collect();
    let pad = |cell: &str, width: usize| {
        let mut padded = cell.to_string();
        // Pad by character count, not by byte length, so a non-ASCII value
        // does not shift every column to its right.
        for _ in cell.chars().count()..width {
            padded.push(' ');
        }
        padded
    };
    let line = |cells: &[String]| {
        cells
            .iter()
            .zip(&widths)
            .map(|(cell, width)| pad(cell, *width))
            .collect::<Vec<_>>()
            .join("  ")
            .trim_end()
            .to_string()
    };
    let rule = widths
        .iter()
        .map(|width| "-".repeat(*width))
        .collect::<Vec<_>>()
        .join("  ");
    (
        line(columns),
        rule.trim_end().to_string(),
        rows.iter().map(|row| line(row)).collect(),
    )
}

/// Where a listing picks up.
///
/// The distinction is not cosmetic. A row cursor is meaningful to an
/// operator and survives between processes, but not every store can resume
/// from a key — Azure rejects listing offsets outright. A store token can
/// always continue the walk it came from, and never outlives it. So an
/// operator's `--after` starts the walk and the store's token carries it,
/// and a listing that used the cursor for every page would work on S3 and
/// GCS and stop after one page on Azure.
pub enum Resume {
    /// Begin, optionally after a cursor the operator supplied.
    From(Option<String>),
    /// Continue this walk with the store's own token.
    Token(String),
}

impl Resume {
    /// The operator cursor this page resumes from, if any.
    ///
    /// A store resumes from a key and every key below a listed child sorts
    /// after that child's own prefix, so the page that resumes a walk
    /// repeats the row it resumed from. A caller drops that row by name.
    /// Continuing with a token repeats nothing, so there is nothing to drop.
    pub fn boundary(&self) -> Option<&str> {
        match self {
            Self::From(after) => after.as_deref(),
            Self::Token(_) => None,
        }
    }
}

/// One page of a bounded listing.
pub struct Page<R> {
    pub rows: Vec<R>,
    /// The store's continuation for this walk, or `None` when the listing
    /// is exhausted. It must come from the store's own truncation signal,
    /// never from a row count: a page filled exactly to its bound is not
    /// evidence that another row exists.
    pub next: Option<String>,
}

/// How much of a listing the operator asked for.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Bounds {
    pub limit: usize,
    pub after: Option<String>,
    pub all: bool,
    /// Set when `--limit` was given, so `--all` can refuse the combination
    /// rather than silently pick one.
    limit_set: bool,
}

impl Default for Bounds {
    fn default() -> Self {
        Self {
            limit: Self::DEFAULT_LIMIT,
            after: None,
            all: false,
            limit_set: false,
        }
    }
}

impl Bounds {
    /// The default bound, and the largest page every supported store
    /// serves, so an unqualified listing costs exactly one request.
    pub const DEFAULT_LIMIT: usize = 1_000;

    /// The largest page a store will serve. A larger `--limit` costs more
    /// requests, so the page size stays pinned and the driver loops.
    pub const MAX_PAGE: usize = 1_000;

    /// Consume one listing flag, or report that it is not one.
    ///
    /// Commands share this so that `--limit`, `--after` and `--all` cannot
    /// drift in spelling or in meaning between listings.
    pub fn consume(
        &mut self,
        argument: &str,
        value: &mut impl FnMut(&str) -> anyhow::Result<String>,
    ) -> anyhow::Result<bool> {
        match argument {
            "--limit" => {
                let raw = value("--limit")?;
                self.limit = raw
                    .parse::<usize>()
                    .ok()
                    .filter(|limit| *limit > 0)
                    .ok_or_else(|| {
                        anyhow::anyhow!("--limit takes a positive whole number, not {raw:?}")
                    })?;
                self.limit_set = true;
            }
            "--after" => self.after = Some(value("--after")?),
            "--all" => self.all = true,
            _ => return Ok(false),
        }
        Ok(true)
    }

    /// Reject a bound and a full walk together. Guessing which one an
    /// operator meant either truncates the walk or makes a bounded request
    /// cost the whole store.
    pub fn validate(&self) -> anyhow::Result<()> {
        if self.all && self.limit_set {
            anyhow::bail!("--all and --limit contradict each other; pass one of them");
        }
        Ok(())
    }

    /// How many rows to request next, given how many are already printed.
    fn want(&self, printed: usize) -> usize {
        if self.all {
            return Self::MAX_PAGE;
        }
        match self.limit.checked_sub(printed) {
            // The bound is met, so this page only has to find one more row
            // to prove the answer was partial. A full page keeps that proof
            // to one request even when a long run of filtered rows follows.
            None | Some(0) => Self::MAX_PAGE,
            // One past the bound, so the proof usually arrives with the rows
            // themselves rather than costing a second request.
            Some(remaining) => remaining.saturating_add(1).min(Self::MAX_PAGE),
        }
    }
}

/// How often a full walk reports that it is still going.
const PROGRESS_EVERY: usize = 100_000;

/// What a finished listing did, for the caller's own summary line.
pub struct Listed {
    pub printed: usize,
    pub requests: usize,
    /// A row exists past the bound. Not the same as the store truncating a
    /// page: a filter can drop every row after the last one printed.
    pub more: bool,
    /// The cursor that continues the listing, when one was withheld.
    pub resume: Option<String>,
    /// The reader closed the pipe, so nothing was withheld from anyone.
    pub abandoned: bool,
}

/// Drive a bounded listing to the operator's bound.
///
/// `fetch` takes the resume cursor and the number of rows to ask for, and
/// returns one page. The driver owns everything else — the probe past the
/// bound, the progress line, the stop when a reader leaves — so that every
/// listing in the CLI answers those the same way.
pub async fn list<R, F, Fut>(
    out: &mut Output,
    bounds: &Bounds,
    mut fetch: F,
) -> anyhow::Result<Listed>
where
    R: Resumable,
    F: FnMut(Resume, usize) -> Fut,
    Fut: std::future::Future<Output = anyhow::Result<Page<R>>>,
{
    let mut after = bounds.after.clone();
    let mut resume = Resume::From(after.clone());
    let mut printed = 0usize;
    let mut requests = 0usize;
    let mut reported = 0usize;
    let mut more = false;

    'walk: loop {
        let page = fetch(resume, bounds.want(printed)).await?;
        requests += 1;
        for row in &page.rows {
            if !bounds.all && printed >= bounds.limit {
                more = true;
                break 'walk;
            }
            out.row(row)?;
            // A reader that closed the pipe wants nothing further, and the
            // next page would cost a storage request to satisfy nobody.
            if out.closed() {
                break 'walk;
            }
            after = Some(row.cursor().to_string());
            printed += 1;
        }
        if bounds.all && printed >= reported + PROGRESS_EVERY {
            reported = printed - printed % PROGRESS_EVERY;
            note!("listed {reported}…");
        }
        match page.next {
            Some(token) => resume = Resume::Token(token),
            None => break,
        }
    }

    Ok(Listed {
        printed,
        requests,
        more,
        resume: more.then(|| after.clone()).flatten(),
        abandoned: out.closed(),
    })
}

impl Listed {
    /// Say on stderr what the listing withheld, and how to continue it.
    ///
    /// Nothing is reported to a reader who left: a closed pipe means the
    /// operator asked for less than existed on purpose.
    pub fn report(&self, noun: &str, resume_flag: &str) {
        if self.abandoned {
            return;
        }
        let plural = if self.printed == 1 { "" } else { "s" };
        if let (true, Some(resume)) = (self.more, self.resume.as_deref()) {
            note!(
                "{} {noun}{plural} shown; more exist. Continue with {resume_flag} {resume}",
                self.printed
            );
            if std::io::stderr().is_terminal() {
                note!("Pass --all to list every {noun}.");
            }
        }
    }

    /// The closing line of a full walk: how much, how long, how many
    /// requests it cost.
    pub fn report_all(&self, noun: &str, elapsed: std::time::Duration) {
        if self.abandoned {
            return;
        }
        let plural = |count: usize| if count == 1 { "" } else { "s" };
        // Seconds to one decimal reads as "0.0s" for anything under 50ms,
        // which looks like a missing measurement rather than a fast walk.
        let took = if elapsed.as_secs_f64() < 1.0 {
            format!("{}ms", elapsed.as_millis())
        } else {
            format!("{:.1}s", elapsed.as_secs_f64())
        };
        note!(
            "{} {noun}{} in {took} ({} list request{})",
            self.printed,
            plural(self.printed),
            self.requests,
            plural(self.requests),
        );
    }
}

#[cfg(all(test, celld_internal_tests))]
mod cli_output_contract {
    include!(env!("CELLD_INTERNAL_CLI_OUTPUT_TESTS"));
}
