// Copyright 2026 Deno Land Inc. Apache-2.0 license.

// The cell CLI times an operator's listing outside the execution boundary.
#![allow(clippy::disallowed_methods)]
// The package macro policy keeps listing data behind `Output`, which is the
// boundary that this module exists to preserve.

//! `celld cell` — the operator's view of the Durable Object instances a
//! fleet holds.
//!
//! A fleet bucket can hold millions of cells, and one `LIST` request
//! returns at most a thousand children. So a listing's cost is set by how
//! many cells exist, not by how many the operator asked to see. The default
//! answer therefore costs one request, `--after` resumes, and `--all` is the
//! explicit request for the whole walk. [`crate::cli_output`] owns those
//! rules; this module supplies the rows.

use anyhow::bail;
use anyhow::Context;
use std::borrow::Cow;

use crate::cli_options::FleetFlags;
use crate::cli_options::FLEET_HELP;
use crate::cli_options::LISTING_HELP;
use crate::cli_output::list;
use crate::cli_output::Bounds;
use crate::cli_output::Format;
use crate::cli_output::Output;
use crate::cli_output::Page;
use crate::cli_output::Record;
use crate::cli_output::Resumable;
use crate::cli_output::Resume;
use crate::note;

/// One Durable Object instance.
struct Cell {
    scope: String,
}

impl Record for Cell {
    fn json(&self) -> serde_json::Value {
        // A scope carries no class when an application named a bare
        // instance. A null reads back as absent rather than as a class
        // named "", and the keys stay present either way so a reader that
        // infers a schema from the first line sees every column.
        let (class, id) = match self.scope.split_once(':') {
            Some((class, id)) => (serde_json::Value::from(class), serde_json::Value::from(id)),
            None => (
                serde_json::Value::Null,
                serde_json::Value::from(self.scope.as_str()),
            ),
        };
        // A fleet holds celld's own cells beside the application's: D1
        // databases, KV namespaces and Workflows are each a reserved class.
        // They are real cells that hold real bytes, so hiding them would
        // understate the bucket -- but an operator asking which Durable
        // Objects their application has does not mean these, so the row
        // says which it is and a reader can filter on it.
        let reserved = class.as_str().is_some_and(crate::deploy::is_reserved_class);
        serde_json::json!({
            "scope": self.scope,
            "class": class,
            "id": id,
            "reserved": reserved,
        })
    }

    fn text(&self) -> Cow<'_, str> {
        Cow::Borrowed(&self.scope)
    }
}

impl Resumable for Cell {
    fn cursor(&self) -> &str {
        &self.scope
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct ListOptions {
    pub(crate) fleet: FleetFlags,
    pub(crate) bounds: Bounds,
    pub(crate) class: Option<String>,
    pub(crate) json: bool,
}

pub(crate) fn list_options_from_arguments(
    arguments: Vec<String>,
) -> anyhow::Result<Option<ListOptions>> {
    parse_listing(arguments, "list")
}

/// The listing flags shared by `celld cell list` and `celld cell gc`;
/// `command` names the subcommand in an error.
fn parse_listing(arguments: Vec<String>, command: &str) -> anyhow::Result<Option<ListOptions>> {
    let mut options = ListOptions::default();
    let mut arguments = arguments.into_iter();
    while let Some(argument) = arguments.next() {
        // Rebuilt per iteration so the loop and the flag helpers can share
        // the iterator without holding two borrows at once.
        let mut value = |option: &str| {
            arguments
                .next()
                .ok_or_else(|| anyhow::anyhow!("{option} requires a value"))
        };
        match argument.as_str() {
            "-h" | "--help" => return Ok(None),
            "--json" => options.json = true,
            other => {
                if options.fleet.consume(other, &mut value)? {
                    continue;
                }
                if options.bounds.consume(other, &mut value)? {
                    continue;
                }
                // A class is the only positional, so a leading dash is a
                // mistyped option rather than a class named "--clas".
                if other.starts_with('-') {
                    bail!(
                        "unknown cell {command} option: {other}; run `celld cell {command} --help` for usage"
                    );
                }
                if let Some(existing) = options.class.as_deref() {
                    bail!("celld cell {command} takes one class, and already has {existing:?}");
                }
                options.class = Some(other.to_string());
            }
        }
    }
    options.bounds.validate()?;
    if let Some(class) = options.class.as_deref() {
        if class.contains(':') || !celld_logic::cell::valid_cell_scope(class) {
            bail!("a cell class must use ASCII letters, digits, and `_ - . $`, not {class:?}");
        }
    }
    if let Some(after) = options.bounds.after.as_deref() {
        if !celld_logic::cell::valid_cell_scope(after) {
            bail!("--after takes a cell scope this command printed, not {after:?}");
        }
    }
    Ok(Some(options))
}

pub(crate) fn help_text() -> String {
    format!(
        r#"List the Durable Object instances in the fleet bucket.

USAGE:
  celld cell list [CLASS] --bucket [s3://|gs://|az://]NAME[/PREFIX] [OPTIONS]

Run `celld cell gc --help` for the report of superseded epochs.

The listing is bounded by default, because a fleet can hold far more cells
than an operator wants to read and each request returns at most {page}
children. A bounded answer reports on stderr that more cells exist.

OPTIONS:
{FLEET_HELP}
{LISTING_HELP}
  -h, --help          Show this help

Output is in the store's key order, which is what makes --after resume
exactly where the previous answer stopped."#,
        page = Bounds::MAX_PAGE,
    )
}

/// The cell scopes in one page of children, in the order the store listed
/// them. `after` is dropped when it repeats: the store resumes from a key,
/// and every key below `cells/<after>/` sorts after that prefix, so the
/// resumed page lists the boundary child again.
pub(crate) fn cell_scopes_from_prefixes<'a>(
    prefixes: impl IntoIterator<Item = String> + 'a,
    class: Option<&'a str>,
    after: Option<&'a str>,
) -> impl Iterator<Item = String> + 'a {
    prefixes
        .into_iter()
        .filter_map(|prefix| prefix.strip_prefix("cells/").map(str::to_string))
        // The scope charset is the engine's storage fence. A prefix that
        // fails it was not written by a celld node, so listing it would
        // present foreign bucket content as a Durable Object instance.
        .filter(|cell| celld_logic::cell::valid_cell_scope(cell))
        .filter(move |cell| after != Some(cell.as_str()))
        .filter(move |cell| {
            class.is_none_or(|class| {
                cell.split_once(':')
                    .is_some_and(|(cell_class, _)| cell_class == class)
            })
        })
}

pub async fn run(arguments: Vec<String>) -> anyhow::Result<()> {
    let mut arguments = arguments.into_iter();
    match arguments.next().as_deref() {
        Some("list") => run_list(arguments.collect()).await,
        Some("gc") => run_gc(arguments.collect()).await,
        None | Some("-h") | Some("--help") | Some("help") => {
            Output::new(Format::Text).help(&help_text())
        }
        Some(other) => bail!("unknown cell command: {other}; use celld cell list or celld cell gc"),
    }
}

async fn run_list(arguments: Vec<String>) -> anyhow::Result<()> {
    let Some(options) = list_options_from_arguments(arguments)? else {
        return Output::new(Format::Text).help(&help_text());
    };
    let storage = options.fleet.resolve("celld cell list")?;
    let store = storage.open().await?;

    let mut out = Output::new(if options.json {
        Format::Json
    } else {
        Format::Text
    });
    let started = std::time::Instant::now();
    let class = options.class.clone();
    let prefix = class
        .as_deref()
        .map_or_else(|| "cells/".to_string(), |class| format!("cells/{class}:"));

    let listed = list(&mut out, &options.bounds, |resume, want| {
        let store = &store;
        let class = class.clone();
        let prefix = prefix.clone();
        // The store resumes from a child of `cells/`, while the cursor an
        // operator sees is the scope. The two differ by the prefix, and
        // passing the scope raw silently matches nothing, which reads as a
        // cursor that works.
        let boundary = resume.boundary().map(str::to_string);
        let start_after = boundary.as_deref().map(|scope| format!("cells/{scope}"));
        let token = match resume {
            Resume::Token(token) => Some(token),
            Resume::From(_) => None,
        };
        async move {
            let page = store
                .common_prefixes_page(&prefix, start_after.as_deref(), token, want)
                .await
                .context("enumerate Durable Object instances")?;
            Ok(Page {
                rows: cell_scopes_from_prefixes(
                    page.prefixes,
                    class.as_deref(),
                    boundary.as_deref(),
                )
                .map(|scope| Cell { scope })
                .collect(),
                next: page.page_token,
            })
        }
    })
    .await?;

    out.finish()?;
    if listed.printed == 0 && !listed.abandoned {
        match options.class.as_deref() {
            Some(class) => note!("no cells of class {class}"),
            None => note!("no cells"),
        }
    } else if options.bounds.all {
        listed.report_all("cell", started.elapsed());
    } else {
        listed.report("cell", "--after");
    }
    Ok(())
}

/// One cell's epoch prefixes that the owner's epoch GC would delete. A row
/// is a whole cell, so `--after` resumes at a cell boundary and never skips
/// the rest of a cell's epochs.
struct CellEpochs {
    scope: String,
    epochs: Vec<u64>,
    base: u64,
    bytes: u64,
}

impl Record for CellEpochs {
    fn json(&self) -> serde_json::Value {
        serde_json::json!({
            "scope": self.scope,
            "epochs": self.epochs,
            "base": self.base,
            "bytes": self.bytes,
        })
    }

    fn text(&self) -> Cow<'_, str> {
        let epochs: Vec<String> = self.epochs.iter().map(|e| format!("e{e}")).collect();
        Cow::Owned(format!(
            "{} {} {} bytes (below base e{})",
            self.scope,
            epochs.join(" "),
            self.bytes,
            self.base
        ))
    }
}

impl Resumable for CellEpochs {
    fn cursor(&self) -> &str {
        &self.scope
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct GcOptions {
    pub(crate) list: ListOptions,
    pub(crate) grace_secs: u64,
}

/// The dry run's grace when the operator passes no `--grace-secs`. The
/// owner has no default: epoch GC is off until `CELLD_LTX_RETENTION_SECS`
/// sets one.
const DEFAULT_GC_GRACE_SECS: u64 = 3600;

pub(crate) fn gc_options_from_arguments(
    arguments: Vec<String>,
) -> anyhow::Result<Option<GcOptions>> {
    let mut dry_run = false;
    let mut grace_secs = DEFAULT_GC_GRACE_SECS;
    let mut rest = Vec::new();
    let mut arguments = arguments.into_iter();
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "-h" | "--help" => return Ok(None),
            "--dry-run" => dry_run = true,
            "--grace-secs" => {
                let value = arguments
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("--grace-secs requires a value"))?;
                grace_secs = value
                    .parse()
                    .with_context(|| format!("--grace-secs takes seconds, not {value:?}"))?;
            }
            _ => rest.push(argument),
        }
    }
    // Deletion without an owner has no fence: the owner deletes under the
    // order that makes a late delete safe, and a separate process cannot
    // follow it. Report only.
    if !dry_run {
        bail!(
            "celld cell gc deletes nothing itself; pass --dry-run to report what the owners \
             would delete, and give CELLD_LTX_RETENTION_SECS a positive value on the nodes to \
             let them"
        );
    }
    let Some(list) = parse_listing(rest, "gc")? else {
        return Ok(None);
    };
    Ok(Some(GcOptions { list, grace_secs }))
}

pub(crate) fn gc_help_text() -> String {
    format!(
        r#"Report the superseded LTX epochs that epoch GC can delete.

USAGE:
  celld cell gc --dry-run [CLASS] --bucket [s3://|gs://|az://]NAME[/PREFIX] [OPTIONS]

For each cell, the report builds the restore chain the way a restore does
and prints the candidates: the epochs below the chain's base, except the
newest epoch, the epoch before it, and each epoch whose newest object is
younger than the grace. This command reads the bucket and writes nothing.

The owners delete fewer, later, or none: only a node with a positive
CELLD_LTX_RETENTION_SECS deletes, in either CELLD_DURABILITY mode, with
that grace instead of --grace-secs; a paged cell waits until its local
file is complete; an inactive cell waits until it is active again; a cell
that is not paged waits until its activation has a write, so a cell that
is only read deletes nothing; and one pass deletes at most 64 epochs of a
cell.

OPTIONS:
  --dry-run           Required; report without deleting
  --grace-secs N      Grace in seconds (default: {DEFAULT_GC_GRACE_SECS})
{FLEET_HELP}
{LISTING_HELP}
  -h, --help          Show this help"#
    )
}

async fn run_gc(arguments: Vec<String>) -> anyhow::Result<()> {
    let Some(options) = gc_options_from_arguments(arguments)? else {
        return Output::new(Format::Text).help(&gc_help_text());
    };
    let storage = options.list.fleet.resolve("celld cell gc")?;
    let store = storage.open().await?;
    let mut out = Output::new(if options.list.json {
        Format::Json
    } else {
        Format::Text
    });
    let started = std::time::Instant::now();
    let now_ms = u64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
    )
    .unwrap_or(u64::MAX);
    let grace_ms = options.grace_secs.saturating_mul(1000);
    let class = options.list.class.clone();
    let prefix = class
        .as_deref()
        .map_or_else(|| "cells/".to_string(), |class| format!("cells/{class}:"));

    let skipped = std::sync::atomic::AtomicUsize::new(0);
    let listed = list(&mut out, &options.list.bounds, |resume, want| {
        let store = &store;
        let skipped = &skipped;
        let class = class.clone();
        let prefix = prefix.clone();
        let boundary = resume.boundary().map(str::to_string);
        let start_after = boundary.as_deref().map(|scope| format!("cells/{scope}"));
        let token = match resume {
            Resume::Token(token) => Some(token),
            Resume::From(_) => None,
        };
        async move {
            let page = store
                .common_prefixes_page(&prefix, start_after.as_deref(), token, want)
                .await
                .context("enumerate Durable Object instances")?;
            let mut rows = Vec::new();
            for scope in
                cell_scopes_from_prefixes(page.prefixes, class.as_deref(), boundary.as_deref())
            {
                // One unreadable cell must not hide the report for the rest,
                // and a report with skipped cells must not read as clean.
                match cell_epochs(store, &scope, now_ms, grace_ms).await {
                    Ok(row) => rows.extend(row),
                    Err(error) => {
                        skipped.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        note!("skipped {scope}: {error:#}");
                    }
                }
            }
            Ok(Page {
                rows,
                next: page.page_token,
            })
        }
    })
    .await?;

    out.finish()?;
    let skipped = skipped.into_inner();
    if listed.printed == 0 && !listed.abandoned && skipped == 0 {
        note!("no superseded epochs to delete");
    } else if options.list.bounds.all {
        listed.report_all("cell", started.elapsed());
    } else {
        // A bounded run with a skipped cell still prints where to resume.
        listed.report("cell", "--after");
    }
    if skipped > 0 {
        bail!("celld cell gc could not read {skipped} cell(s); the report is incomplete");
    }
    Ok(())
}

/// The epochs of one cell that the owner of its newest epoch would delete.
async fn cell_epochs(
    store: &crate::bucket::Bucket,
    scope: &str,
    now_ms: u64,
    grace_ms: u64,
) -> anyhow::Result<Option<CellEpochs>> {
    let client_for = |epoch: u64| {
        celld_ltx::ObjectStoreClient::with_store(
            celld_ltx::client::object_store::ObjectStoreConfig {
                bucket: store.name.clone(),
                path: format!("{}cells/{scope}/ltx/e{epoch}", store.prefix),
                ..Default::default()
            },
            store.store.clone(),
        )
    };
    let Some(scan) = crate::ltx_repl::scan_epochs(
        store.store.as_ref(),
        &store.prefix,
        scope,
        usize::MAX,
        client_for,
    )
    .await
    .with_context(|| format!("scan the epochs of {scope}"))?
    else {
        return Ok(None);
    };
    let below: Vec<_> = scan.below.iter().map(|b| b.listed).collect();
    // The owner refuses to plan under a mark above its base, so the report
    // reads the same mark.
    let recorded = crate::ltx_repl::read_retired_mark(store.store.as_ref(), &store.prefix, scope)
        .await
        .with_context(|| format!("read the retired mark of {scope}"))?;
    let Some(plan) = celld_logic::epoch_gc::plan(
        scan.newest,
        &scan.chain,
        &below,
        recorded,
        false,
        now_ms,
        grace_ms,
    ) else {
        return Ok(None);
    };
    if plan.delete.is_empty() {
        return Ok(None);
    }
    let bytes = scan
        .below
        .iter()
        .filter(|b| plan.delete.contains(&b.listed.epoch))
        .map(|b| b.bytes)
        .sum();
    Ok(Some(CellEpochs {
        scope: scope.to_string(),
        epochs: plan.delete,
        base: plan.retired_below,
        bytes,
    }))
}
