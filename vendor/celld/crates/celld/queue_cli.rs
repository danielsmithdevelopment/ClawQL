// Copyright 2026 Deno Land Inc. Apache-2.0 license.

// Operator commands read the process environment for their fleet settings.
#![allow(clippy::disallowed_methods)]

//! `celld queue` — inspect and operate a deployed Queue broker.
//!
//! The command reaches the reserved Queue cell through the authenticated fleet
//! operator route. It does not read SQLite or implement a queue transition.
//! The cell validates each bound and owns each mutation, so the Worker binding
//! and the CLI cannot disagree about the stored state.

use std::borrow::Cow;
use std::time::Duration;

use anyhow::{anyhow, bail, Context};
use serde_json::{json, Value};

use crate::cli_options::{FleetFlags, FLEET_HELP};
use crate::cli_output::{Format, Output, Record};
use crate::operator_cell::{Fleet, Reachable, Subject};

struct QueueReply(Value);

impl Record for QueueReply {
    fn json(&self) -> Value {
        self.0.clone()
    }

    fn text(&self) -> Cow<'_, str> {
        Cow::Owned(
            serde_json::to_string_pretty(&self.0)
                .expect("a serde_json::Value always serializes as JSON"),
        )
    }
}

pub async fn run(arguments: Vec<String>) -> anyhow::Result<()> {
    let Some(command) = Command::parse(arguments)? else {
        print_help();
        return Ok(());
    };
    let storage = command.fleet.resolve("celld queue")?;
    let queue = Reachable::open(
        Fleet {
            bucket: &storage.bucket,
            endpoint: storage.endpoint.as_deref(),
            region: &storage.region,
            unsafe_public_advertise: command.unsafe_public_advertise,
        },
        Subject {
            noun: "queue",
            source: "queue",
            timeout: Duration::from_secs(60),
        },
        crate::js::queue_cell_scope(&command.queue),
        Some(&command.queue),
    )
    .await?;

    let result = match command.action {
        Action::Info => queue.call(json!({ "op": "info" })).await?,
        Action::Purge => queue.call(json!({ "op": "purge" })).await?,
        Action::Pause => queue.call(json!({ "op": "pause" })).await?,
        Action::Resume => queue.call(json!({ "op": "resume" })).await?,
        Action::Peek { limit } => queue.call(json!({ "op": "peek", "limit": limit })).await?,
        Action::Redrive { limit } => {
            queue
                .call(json!({ "op": "redrive", "limit": limit }))
                .await?
        }
    };
    let mut output = Output::new(if command.json {
        Format::Json
    } else {
        Format::Text
    });
    output.row(&QueueReply(result))?;
    output.finish()
}

enum Action {
    Info,
    Purge,
    Pause,
    Resume,
    Peek { limit: Option<i64> },
    Redrive { limit: Option<i64> },
}

struct Command {
    action: Action,
    queue: String,
    fleet: FleetFlags,
    json: bool,
    unsafe_public_advertise: bool,
}

impl Command {
    fn parse(arguments: Vec<String>) -> anyhow::Result<Option<Self>> {
        let mut arguments = arguments.into_iter();
        let Some(verb) = arguments.next() else {
            return Ok(None);
        };
        let verb = match verb.as_str() {
            "--help" | "-h" | "help" => return Ok(None),
            verb @ ("info" | "purge" | "pause" | "resume" | "peek" | "redrive") => verb,
            other => bail!("unknown `celld queue` subcommand: {other}"),
        };
        let queue = arguments
            .next()
            .filter(|value| !value.starts_with('-'))
            .ok_or_else(|| anyhow!("celld queue {verb} needs a queue name"))?;
        if !celld_logic::cell::valid_cell_scope(&queue) {
            bail!(
                "queue name {queue:?} cannot name a cell; use ASCII letters, digits, and `_ - . : $`"
            );
        }

        let mut fleet = FleetFlags::default();
        let mut json = false;
        let mut unsafe_public_advertise = false;
        let mut force = false;
        let mut limit = None;
        while let Some(argument) = arguments.next() {
            let mut value = |flag: &str| {
                arguments
                    .next()
                    .ok_or_else(|| anyhow!("{flag} requires a value"))
            };
            match argument.as_str() {
                "--json" => json = true,
                "--unsafe-public-advertise" => unsafe_public_advertise = true,
                "--force" => force = true,
                "--limit" => {
                    let raw = value("--limit")?;
                    limit = Some(
                        raw.parse::<i64>()
                            .with_context(|| format!("--limit takes an integer, got {raw:?}"))?,
                    );
                }
                // These flags select a Cloudflare account API or a Miniflare
                // store. A celld queue belongs to exactly one named fleet.
                flag @ ("--local" | "--remote") => bail!(
                    "celld queue does not take {flag}; a queue name addresses one queue in one fleet"
                ),
                "--help" | "-h" => return Ok(None),
                other => {
                    if fleet.consume(other, &mut value)? {
                        continue;
                    }
                    if other.starts_with('-') {
                        bail!("unknown option: {other}; run `celld queue --help` for usage")
                    }
                    bail!(
                        "celld queue {verb} takes no positional argument after the queue name: \
                         {other:?}"
                    )
                }
            }
        }
        if verb != "purge" && force {
            bail!("`celld queue {verb}` takes no --force");
        }
        if verb == "purge" && !force {
            bail!("celld queue purge permanently removes messages; repeat with --force");
        }
        if !matches!(verb, "peek" | "redrive") && limit.is_some() {
            bail!("`celld queue {verb}` takes no --limit");
        }
        let action = match verb {
            "info" => Action::Info,
            "purge" => Action::Purge,
            "pause" => Action::Pause,
            "resume" => Action::Resume,
            "peek" => Action::Peek { limit },
            "redrive" => Action::Redrive { limit },
            _ => unreachable!("the verb was matched above"),
        };
        Ok(Some(Self {
            action,
            queue,
            fleet: fleet.with_environment(),
            json,
            unsafe_public_advertise,
        }))
    }
}

pub fn print_help() {
    let text = format!(
        "celld queue — inspect and operate a deployed Queue

USAGE
  celld queue info    QUEUE                  [fleet options]
  celld queue peek    QUEUE [--limit N]      [fleet options]
  celld queue purge   QUEUE --force          [fleet options]
  celld queue pause   QUEUE                  [fleet options]
  celld queue resume  QUEUE                  [fleet options]
  celld queue redrive QUEUE [--limit N]      [fleet options]

QUEUE OPERATIONS
  info       report the backlog, stored rows, and delivery state
  peek       read up to 10 head messages without consuming them
  purge      delete visible and delayed messages, and mark live leases
  pause      stop new delivery while producers continue to send
  resume     restart delivery from the retained backlog
  redrive    return up to 100 dead-lettered messages to their recorded sources

`peek` and `redrive` accept a limit from 1 through 100. The Queue cell checks
the limit. `peek` encodes each body as base64 and reports its content type.
`redrive` skips a message with a live consumer lease and safely replays an
interrupted cross-queue move.

FLEET OPTIONS
{FLEET_HELP}
  --json                Print one JSON object instead of formatted JSON
  --unsafe-public-advertise  trust a node advertising a public address"
    );
    let _ = Output::new(Format::Text).help(&text);
}
